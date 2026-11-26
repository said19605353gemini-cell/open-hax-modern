import {
  BallEntity,
  BotDifficulty,
  INPUT_DOWN,
  INPUT_KICK,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_UP,
  PlayerEntity,
  StadiumConfig
} from '../types';

const DIFFICULTY_CFG: Record<
  BotDifficulty,
  { lookAhead: number; speedScale: number; kickBias: number; aimPrecision: number; reactionMask: number }
> = {
  very_easy: { lookAhead: 3, speedScale: 0.56, kickBias: 20, aimPrecision: 0.4, reactionMask: 3 },
  easy: { lookAhead: 6, speedScale: 0.72, kickBias: 12, aimPrecision: 0.65, reactionMask: 1 },
  medium: { lookAhead: 10, speedScale: 0.89, kickBias: 5, aimPrecision: 0.82, reactionMask: 0 },
  hard: { lookAhead: 14, speedScale: 1.0, kickBias: 1, aimPrecision: 0.94, reactionMask: 0 },
  pro: { lookAhead: 18, speedScale: 1.0, kickBias: 0, aimPrecision: 1.0, reactionMask: 0 }
};

function reflectCoord(val: number, minVal: number, maxVal: number): number {
  const span = maxVal - minVal;
  if (span <= 0) return val;
  let rel = val - minVal;
  while (rel < 0 || rel > span) {
    if (rel < 0) rel = -rel;
    if (rel > span) rel = 2 * span - rel;
  }
  return minVal + rel;
}

/** Simulates damped ball trajectory with wall reflections to find the earliest reachable point. */
function predictBallInterception(
  bot: PlayerEntity,
  ball: BallEntity,
  stadium: StadiumConfig,
  maxLookAhead: number
): { x: number; y: number } {
  const minX = stadium.pitchX + ball.radius;
  const maxX = stadium.pitchX + stadium.pitchWidth - ball.radius;
  const minY = stadium.pitchY + ball.radius;
  const maxY = stadium.pitchY + stadium.pitchHeight - ball.radius;
  const centerY = stadium.pitchY + stadium.pitchHeight / 2;

  let bx = ball.x;
  let by = ball.y;
  let bvx = ball.vx;
  let bvy = ball.vy;
  const estBotSpeed = 3.4;

  for (let t = 1; t <= maxLookAhead; t++) {
    bx += bvx;
    by += bvy;
    bvx *= 0.99;
    bvy *= 0.99;

    by = reflectCoord(by, minY, maxY);
    if (Math.abs(by - centerY) > stadium.goalHalfHeight) {
      bx = reflectCoord(bx, minX, maxX);
    } else {
      bx = Math.max(minX - 18, Math.min(maxX + 18, bx));
    }

    const dist = Math.hypot(bx - bot.x, by - bot.y);
    if (dist <= estBotSpeed * t + bot.radius + ball.radius) {
      return { x: bx, y: by };
    }
  }
  return {
    x: Math.max(minX, Math.min(maxX, bx)),
    y: Math.max(minY, Math.min(maxY, by))
  };
}

function wouldScoreOwnGoal(
  shotDirX: number,
  shotDirY: number,
  ball: BallEntity,
  ownGoalX: number,
  centerY: number,
  goalHalfHeight: number,
  isBlue: boolean
): boolean {
  const towardOwn = isBlue ? shotDirX > 0.22 : shotDirX < -0.22;
  if (!towardOwn || Math.abs(shotDirX) < 1e-4) return false;
  const stepsToGoal = (ownGoalX - ball.x) / shotDirX;
  if (stepsToGoal < 0 || stepsToGoal > 260) return false;
  const projY = ball.y + shotDirY * stepsToGoal;
  return Math.abs(projY - centerY) <= goalHalfHeight + 22;
}

function getFormationHome(
  botTeamIndex: number,
  botTeamCount: number,
  isBlue: boolean,
  stadium: StadiumConfig,
  ballX: number
): { x: number; y: number; isKeeper: boolean } {
  const px = stadium.pitchX;
  const py = stadium.pitchY;
  const pw = stadium.pitchWidth;
  const ph = stadium.pitchHeight;
  const ballProgress = isBlue ? (px + pw - ballX) / pw : (ballX - px) / pw; // 0 = own goal, 1 = opp goal
  const teamShift = (ballProgress - 0.5) * 0.22; // shift formation smoothly with ball

  if (botTeamCount === 1) {
    return { x: isBlue ? px + pw * 0.72 : px + pw * 0.28, y: py + ph * 0.5, isKeeper: false };
  }

  if (botTeamIndex === 0) {
    // Goalkeeper
    return {
      x: isBlue ? px + pw - 30 : px + 30,
      y: py + ph * 0.5,
      isKeeper: true
    };
  }

  // Outfield bots (1 .. botTeamCount - 1) arranged in realistic football lines (Defense / Midfield / Attack)
  const outfieldIdx = botTeamIndex - 1;
  const outfieldCount = botTeamCount - 1;

  // Determine number of lines based on outfield count
  let lineDepths: number[];
  if (outfieldCount === 1) {
    lineDepths = [0.52];
  } else if (outfieldCount <= 3) {
    lineDepths = [0.28, 0.65];
  } else {
    lineDepths = [0.22, 0.5, 0.76];
  }

  // Distribute outfield players evenly across lines
  const lines: number[][] = lineDepths.map(() => []);
  for (let i = 0; i < outfieldCount; i++) {
    const lineIdx = Math.min(lines.length - 1, Math.floor((i * lines.length) / outfieldCount));
    lines[lineIdx].push(i);
  }

  let myLine = 0;
  let posInLine = 0;
  let lineSize = 1;
  for (let l = 0; l < lines.length; l++) {
    const found = lines[l].indexOf(outfieldIdx);
    if (found !== -1) {
      myLine = l;
      posInLine = found;
      lineSize = lines[l].length;
      break;
    }
  }

  const normDepth = Math.max(0.12, Math.min(0.88, lineDepths[myLine] + teamShift));
  const normY = lineSize === 1 ? 0.5 : 0.16 + (posInLine / (lineSize - 1)) * 0.68;

  return {
    x: isBlue ? px + pw * (1 - normDepth) : px + pw * normDepth,
    y: py + ph * normY,
    isKeeper: false
  };
}

export function computeBotInput(
  bot: PlayerEntity,
  botTeamIndex: number,
  botTeamCount: number,
  allPlayers: PlayerEntity[],
  ball: BallEntity,
  stadium: StadiumConfig,
  difficulty: BotDifficulty,
  currentTick: number,
  avoidMemory: Map<string, number>
): { bits: number; speedScale: number } {
  const cfg = DIFFICULTY_CFG[difficulty] || DIFFICULTY_CFG.medium;
  const isBlue = bot.team === 'blue';

  const minX = stadium.pitchX + 10;
  const maxX = stadium.pitchX + stadium.pitchWidth - 10;
  const minY = stadium.pitchY + 10;
  const maxY = stadium.pitchY + stadium.pitchHeight - 10;
  const centerY = stadium.pitchY + stadium.pitchHeight / 2;
  const ownGoalX = isBlue ? stadium.pitchX + stadium.pitchWidth : stadium.pitchX;
  const targetGoalX = isBlue ? stadium.pitchX : stadium.pitchX + stadium.pitchWidth;

  const rawDist = Math.hypot(ball.x - bot.x, ball.y - bot.y);
  const pred = predictBallInterception(bot, ball, stadium, cfg.lookAhead);
  const predX = pred.x;
  const predY = pred.y;

  const teammates = allPlayers.filter((p) => p.team === bot.team && p.id !== bot.id);
  const opponents = allPlayers.filter((p) => p.team !== bot.team && p.team !== 'spec');

  const home = getFormationHome(botTeamIndex, botTeamCount, isBlue, stadium, ball.x);

  // Determine if THIS bot is the primary ball-chaser (closest outfield teammate to the ball)
  let closestOutfieldDist = rawDist;
  for (const mate of teammates) {
    // Skip teammate if they are likely the keeper when ball is far from own goal
    const mateNearOwnGoal = Math.abs(mate.x - ownGoalX) < 75 && Math.abs(ball.x - ownGoalX) > 150;
    if (mateNearOwnGoal) continue;
    const d = Math.hypot(ball.x - mate.x, ball.y - mate.y);
    if (d < closestOutfieldDist) closestOutfieldDist = d;
  }
  const isPrimaryChaser = !home.isKeeper && rawDist <= closestOutfieldDist + 14;

  // Smart corner target: pick the open corner furthest from the closest opponent near goal
  let nearestOppKeeperY = centerY;
  let minGoalOppDist = Infinity;
  for (const opp of opponents) {
    const d = Math.hypot(opp.x - targetGoalX, opp.y - centerY);
    if (d < minGoalOppDist) {
      minGoalOppDist = d;
      nearestOppKeeperY = opp.y;
    }
  }
  const cornerSign = minGoalOppDist < 150 ? (nearestOppKeeperY >= centerY ? -1 : 1) : (predY >= centerY ? -1 : 1);
  const cornerOffset = stadium.goalHalfHeight * 0.65 * cfg.aimPrecision;
  let aimTargetX = targetGoalX;
  let aimTargetY = centerY + cornerSign * cornerOffset;

  // Check if a teammate is in a great open forward position for a pass!
  const distToOppGoal = Math.hypot(targetGoalX - ball.x, centerY - ball.y);
  let passingToMate = false;
  if (teammates.length > 0 && distToOppGoal > stadium.pitchWidth * 0.34) {
    let bestMate: PlayerEntity | null = null;
    let bestScore = -Infinity;
    for (const mate of teammates) {
      const mateAhead = isBlue ? mate.x < bot.x - 35 : mate.x > bot.x + 35;
      const mateDist = Math.hypot(mate.x - bot.x, mate.y - bot.y);
      if (!mateAhead || mateDist < 65 || mateDist > stadium.pitchWidth * 0.58) continue;
      // Check how open the teammate is from opponents
      let minOppDist = 999;
      for (const opp of opponents) {
        const od = Math.hypot(opp.x - mate.x, opp.y - mate.y);
        if (od < minOppDist) minOppDist = od;
      }
      const score = minOppDist + (isBlue ? bot.x - mate.x : mate.x - bot.x) * 0.45;
      if (minOppDist > 42 && score > bestScore) {
        bestScore = score;
        bestMate = mate;
      }
    }
    if (bestMate) {
      aimTargetX = bestMate.x + bestMate.vx * 10;
      aimTargetY = bestMate.y + bestMate.vy * 10;
      passingToMate = true;
    }
  }

  const ballHeadingToOwnGoal = isBlue ? ball.vx > 0.7 : ball.vx < -0.7;
  const ballNearOwnGoal = Math.abs(ball.x - ownGoalX) < stadium.pitchWidth * 0.32;
  const emergencyDefend = (ballHeadingToOwnGoal && ballNearOwnGoal) || Math.abs(ball.x - ownGoalX) < 115;

  let desiredX: number;
  let desiredY: number;

  if (home.isKeeper) {
    const ballInBox = Math.abs(ball.x - ownGoalX) < 145 && Math.abs(ball.y - centerY) < stadium.goalHalfHeight + 75;
    if (ballInBox && (isBlue ? bot.x >= ball.x - 4 : bot.x <= ball.x + 4)) {
      // Rush out decisively to clear behind the ball
      desiredX = predX + (isBlue ? 20 : -20);
      desiredY = predY;
    } else {
      // Position on the shot-blocking line between ball and goal center
      const guardX = isBlue ? ownGoalX - 24 : ownGoalX + 24;
      const t = Math.min(1, Math.max(0, Math.abs(guardX - ownGoalX) / Math.max(20, Math.abs(predX - ownGoalX))));
      const blockY = centerY + (predY - centerY) * (0.45 + t * 0.55);
      desiredX = guardX;
      desiredY = Math.max(centerY - stadium.goalHalfHeight + 6, Math.min(centerY + stadium.goalHalfHeight - 6, blockY));
    }
  } else if (!isPrimaryChaser) {
    // Hold formation position + make supporting run into open space, never clumping on the ball
    const supportPullX = (predX - home.x) * 0.22;
    const supportPullY = (predY - home.y) * 0.25;
    desiredX = home.x + supportPullX;
    desiredY = home.y + supportPullY;
  } else if (emergencyDefend && (isBlue ? bot.x < ball.x + 8 : bot.x > ball.x - 8)) {
    const side = bot.y < predY ? -1 : 1;
    desiredX = isBlue ? Math.min(maxX, predX + 36) : Math.max(minX, predX - 36);
    desiredY = Math.max(minY, Math.min(maxY, predY + side * 42));
  } else {
    // Primary chaser: align behind ball toward aimTarget (either pass to teammate or shot on goal)
    const gx = predX - aimTargetX;
    const gy = predY - aimTargetY;
    const gDist = Math.hypot(gx, gy) || 1;
    const dirX = gx / gDist;
    const dirY = gy / gDist;

    const approachDist = rawDist > 90 ? 28 : 20;
    desiredX = predX + dirX * approachDist;
    desiredY = predY + dirY * approachDist;

    const wrongSide = isBlue ? bot.x < predX + 2 : bot.x > predX - 2;
    if (wrongSide && Math.abs(bot.y - predY) < 36) {
      let side = avoidMemory.get(bot.id) ?? 1;
      if (Math.abs(bot.y - predY) > 6) {
        side = bot.y < predY ? -1 : 1;
        avoidMemory.set(bot.id, side);
      }
      desiredX = predX + (isBlue ? 48 : -48);
      desiredY = predY + side * 50;
    }
  }

  // Teammate anti-clumping separation force
  for (const mate of teammates) {
    const mdx = desiredX - mate.x;
    const mdy = desiredY - mate.y;
    const mDist = Math.hypot(mdx, mdy);
    if (mDist > 0.1 && mDist < 54) {
      const push = (54 - mDist) * 0.7;
      desiredX += (mdx / mDist) * push;
      desiredY += (mdy / mDist) * push;
    }
  }

  if (cfg.reactionMask > 0 && (currentTick & cfg.reactionMask) !== 0) {
    desiredY += Math.sin(currentTick * 0.13) * 8;
  }

  desiredX = Math.max(minX, Math.min(maxX, desiredX));
  desiredY = Math.max(minY, Math.min(maxY, desiredY));

  const dx = desiredX - bot.x;
  const dy = desiredY - bot.y;
  const dist = Math.hypot(dx, dy);

  let bits = 0;
  if (dist > 3.5) {
    const threshold = Math.max(2.5, dist * 0.22);
    if (dx < -threshold) bits |= INPUT_LEFT;
    else if (dx > threshold) bits |= INPUT_RIGHT;
    if (dy < -threshold) bits |= INPUT_UP;
    else if (dy > threshold) bits |= INPUT_DOWN;
  }

  const ballDx = ball.x - bot.x;
  const ballDy = ball.y - bot.y;
  const ballDist = Math.hypot(ballDx, ballDy) || 1;
  const shotDirX = ballDx / ballDist;
  const shotDirY = ballDy / ballDist;
  const toTargetX = aimTargetX - ball.x;
  const toTargetY = aimTargetY - ball.y;
  const toTargetDist = Math.hypot(toTargetX, toTargetY) || 1;
  const alignment = shotDirX * (toTargetX / toTargetDist) + shotDirY * (toTargetY / toTargetDist);
  const aimedForward = isBlue ? ballDx < -2 : ballDx > 2;
  const clearAction = alignment > (passingToMate ? 0.62 : difficulty === 'pro' ? 0.55 : 0.35);
  const safeFromOwnGoal = !wouldScoreOwnGoal(
    shotDirX,
    shotDirY,
    ball,
    ownGoalX,
    centerY,
    stadium.goalHalfHeight,
    isBlue
  );

  if (
    ballDist <= bot.radius + ball.radius + 7 &&
    aimedForward &&
    safeFromOwnGoal &&
    (clearAction || (home.isKeeper && emergencyDefend)) &&
    currentTick >= bot.nextKickTick + cfg.kickBias
  ) {
    bits |= INPUT_KICK;
  }

  return { bits, speedScale: cfg.speedScale };
}
