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

const DIFFICULTY_CFG: Record<BotDifficulty, { lookAhead: number; speedScale: number; kickBias: number }> = {
  easy: { lookAhead: 5, speedScale: 0.68, kickBias: 14 },
  medium: { lookAhead: 9, speedScale: 0.88, kickBias: 6 },
  hard: { lookAhead: 13, speedScale: 1.0, kickBias: 0 }
};

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

  const predX = Math.max(minX, Math.min(maxX, ball.x + ball.vx * cfg.lookAhead));
  const predY = Math.max(minY, Math.min(maxY, ball.y + ball.vy * cfg.lookAhead));

  // If a team has multiple bots, let secondary bots act as defenders/wingers so they don't stack
  let desiredX: number;
  let desiredY: number;

  if (botTeamCount > 1 && botTeamIndex > 0) {
    // Support / Defender position: stay closer to own goal & track ball Y
    const ownGoalX = bot.team === 'blue' ? stadium.pitchX + stadium.pitchWidth : stadium.pitchX;
    const guardX = bot.team === 'blue' ? ownGoalX - 95 - (botTeamIndex - 1) * 45 : ownGoalX + 95 + (botTeamIndex - 1) * 45;
    const laneOffset = (botTeamIndex % 2 === 1 ? -1 : 1) * 38;
    desiredX = Math.max(minX, Math.min(maxX, (guardX * 0.65 + predX * 0.35)));
    desiredY = Math.max(minY, Math.min(maxY, predY * 0.7 + centerY * 0.3 + laneOffset));
  } else {
    const targetGoalX = bot.team === 'blue' ? stadium.pitchX : stadium.pitchX + stadium.pitchWidth;
    const gx = predX - targetGoalX;
    const gy = predY - centerY;
    const gDist = Math.hypot(gx, gy) || 1;
    const dirX = gx / gDist;
    const dirY = gy / gDist;

    desiredX = predX + dirX * 24;
    desiredY = predY + dirY * 24;

    const wrongSide = bot.team === 'blue' ? bot.x < predX + 2 : bot.x > predX - 2;
    if (wrongSide && Math.abs(bot.y - predY) < 34) {
      let side = avoidMemory.get(bot.id) ?? 1;
      if (Math.abs(bot.y - predY) > 6) {
        side = bot.y < predY ? -1 : 1;
        avoidMemory.set(bot.id, side);
      }
      desiredX = predX + (bot.team === 'blue' ? 46 : -46);
      desiredY = predY + side * 52;
    }
  }

  desiredX = Math.max(minX, Math.min(maxX, desiredX));
  desiredY = Math.max(minY, Math.min(maxY, desiredY));

  const dx = desiredX - bot.x;
  const dy = desiredY - bot.y;
  const dist = Math.hypot(dx, dy);

  let bits = 0;
  if (dist > 4) {
    const threshold = Math.max(3, dist * 0.25);
    if (dx < -threshold) bits |= INPUT_LEFT;
    else if (dx > threshold) bits |= INPUT_RIGHT;
    if (dy < -threshold) bits |= INPUT_UP;
    else if (dy > threshold) bits |= INPUT_DOWN;
  }

  const ballDx = ball.x - bot.x;
  const ballDy = ball.y - bot.y;
  const ballDist = Math.hypot(ballDx, ballDy);
  const aimedForward = bot.team === 'blue' ? ballDx < -2 : ballDx > 2;
  if (
    ballDist <= bot.radius + ball.radius + 7 &&
    aimedForward &&
    currentTick >= bot.nextKickTick + cfg.kickBias
  ) {
    bits |= INPUT_KICK;
  }

  return { bits, speedScale: cfg.speedScale };
}
