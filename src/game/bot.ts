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

function reflectY(y: number, minY: number, maxY: number): number {
  const span = maxY - minY;
  if (span <= 0) return y;
  let rel = y - minY;
  while (rel < 0 || rel > span) {
    if (rel < 0) rel = -rel;
    if (rel > span) rel = 2 * span - rel;
  }
  return minY + rel;
}

export function computeBotInput(
  bot: PlayerEntity,
  botTeamIndex: number,
  botTeamCount: number,
  ball: BallEntity,
  stadium: StadiumConfig,
  difficulty: BotDifficulty,
  currentTick: number,
  avoidMemory: Map<string, number>
): { bits: number; speedScale: number } {
  const cfg = DIFFICULTY_CFG[difficulty] || DIFFICULTY_CFG.medium;

  const minX = stadium.pitchX + 10;
  const maxX = stadium.pitchX + stadium.pitchWidth - 10;
  const minY = stadium.pitchY + 10;
  const maxY = stadium.pitchY + stadium.pitchHeight - 10;
  const centerY = stadium.pitchY + stadium.pitchHeight / 2;
  const ownGoalX = bot.team === 'blue' ? stadium.pitchX + stadium.pitchWidth : stadium.pitchX;
  const targetGoalX = bot.team === 'blue' ? stadium.pitchX : stadium.pitchX + stadium.pitchWidth;

  // Dynamic look-ahead based on distance to ball + wall-bounce prediction
  const rawDist = Math.hypot(ball.x - bot.x, ball.y - bot.y);
  const dynLook = Math.min(cfg.lookAhead, Math.max(2, Math.round(rawDist / 18)));
  const predX = Math.max(minX, Math.min(maxX, ball.x + ball.vx * dynLook));
  const predY = reflectY(ball.y + ball.vy * dynLook, minY, maxY);

  // Pick smart corner target in opponent goal (away from center / ball side)
  const cornerSign = predY >= centerY ? -1 : 1;
  const cornerOffset = (stadium.goalHalfHeight * 0.55) * cfg.aimPrecision;
  const aimGoalY = centerY + cornerSign * cornerOffset;

  // Check if ball is threatening own goal
  const ballHeadingToOwnGoal = bot.team === 'blue' ? ball.vx > 0.7 : ball.vx < -0.7;
  const ballNearOwnGoal = Math.abs(ball.x - ownGoalX) < stadium.pitchWidth * 0.34;
  const emergencyDefend = (ballHeadingToOwnGoal && ballNearOwnGoal) || Math.abs(ball.x - ownGoalX) < 110;

  let desiredX: number;
  let desiredY: number;

  if (botTeamCount > 1 && botTeamIndex > 0) {
    // Support / Defender / Goalkeeper role with natural human-like positioning
    const guardX =
      bot.team === 'blue'
        ? ownGoalX - 85 - (botTeamIndex - 1) * 55
        : ownGoalX + 85 + (botTeamIndex - 1) * 55;
    const laneOffset = (botTeamIndex % 2 === 1 ? -1 : 1) * 34;
    const sway = Math.sin(currentTick * 0.04 + botTeamIndex * 2.1) * 10;
    if (emergencyDefend && botTeamIndex === 1) {
      // Sprint to goal line intercept
      desiredX = bot.team === 'blue' ? Math.max(predX + 16, ownGoalX - 38) : Math.min(predX - 16, ownGoalX + 38);
      desiredY = Math.max(centerY - stadium.goalHalfHeight + 8, Math.min(centerY + stadium.goalHalfHeight - 8, predY));
    } else {
      desiredX = Math.max(minX, Math.min(maxX, guardX * 0.62 + predX * 0.38));
      desiredY = Math.max(minY, Math.min(maxY, predY * 0.72 + centerY * 0.28 + laneOffset + sway));
    }
  } else if (emergencyDefend && (bot.team === 'blue' ? bot.x < ball.x + 8 : bot.x > ball.x - 8)) {
    // Sweeper recovery: get between ball and own goal cleanly without touching ball toward own net
    const side = bot.y < predY ? -1 : 1;
    desiredX = bot.team === 'blue' ? Math.min(maxX, predX + 36) : Math.max(minX, predX - 36);
    desiredY = Math.max(minY, Math.min(maxY, predY + side * 42));
  } else {
    // Attack / Dribble / Shot alignment toward corner
    const gx = predX - targetGoalX;
    const gy = predY - aimGoalY;
    const gDist = Math.hypot(gx, gy) || 1;
    const dirX = gx / gDist;
    const dirY = gy / gDist;

    // Stand slightly behind the ball along the shot line
    const approachDist = rawDist > 90 ? 28 : 20;
    desiredX = predX + dirX * approachDist;
    desiredY = predY + dirY * approachDist;

    const wrongSide = bot.team === 'blue' ? bot.x < predX + 2 : bot.x > predX - 2;
    if (wrongSide && Math.abs(bot.y - predY) < 36) {
      let side = avoidMemory.get(bot.id) ?? 1;
      if (Math.abs(bot.y - predY) > 6) {
        side = bot.y < predY ? -1 : 1;
        avoidMemory.set(bot.id, side);
      }
      desiredX = predX + (bot.team === 'blue' ? 48 : -48);
      desiredY = predY + side * 50;
    }
  }

  // Slight human-like micro-jitter on lower difficulties
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

  // Smart kick decision: only kick when shot vector actually goes toward opponent's half (no own goals!)
  const ballDx = ball.x - bot.x;
  const ballDy = ball.y - bot.y;
  const ballDist = Math.hypot(ballDx, ballDy) || 1;
  const shotDirX = ballDx / ballDist;
  const shotDirY = ballDy / ballDist;
  const toGoalX = targetGoalX - ball.x;
  const toGoalY = aimGoalY - ball.y;
  const toGoalDist = Math.hypot(toGoalX, toGoalY) || 1;
  const alignment = shotDirX * (toGoalX / toGoalDist) + shotDirY * (toGoalY / toGoalDist);
  const aimedForward = bot.team === 'blue' ? ballDx < -2 : ballDx > 2;
  const clearShot = alignment > (difficulty === 'pro' ? 0.55 : 0.35);

  if (
    ballDist <= bot.radius + ball.radius + 7 &&
    aimedForward &&
    (clearShot || emergencyDefend) &&
    currentTick >= bot.nextKickTick + cfg.kickBias
  ) {
    bits |= INPUT_KICK;
  }

  return { bits, speedScale: cfg.speedScale };
}
