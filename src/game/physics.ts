import {
  BallEntity,
  BotDifficulty,
  GameSettings,
  INPUT_DOWN,
  INPUT_KICK,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_UP,
  PhysicsFeelMode,
  PhysicsProfile,
  PlayerEntity,
  PowerupType,
  StadiumConfig,
  StadiumSegment,
  Team
} from '../types';
import { computeBotInput } from './bot';

export interface StepResult {
  kicked: boolean;
  goalTeam: Team | null;
  touchedById?: string;
  savedById?: string;
  powerKickType?: PowerupType | null;
}

interface PhysicsParams {
  playerInvMass: number;
  ballInvMass: number;
  playerDamping: number;
  ballDamping: number;
  playerPlayerRestitution: number;
  playerBallRestitution: number;
  playerWorldRestitution: number;
  ballWorldRestitution: number;
  accel: number;
  kickAccel: number;
  kickImpulse: number;
  maxPlayerSpeed: number;
  maxBallSpeed: number;
}

/**
 * Exact physical parameters ported from open-hax-master (1) (Phaser P2 -> 60Hz px/tick):
 * - Player: radius 15, mass 1.0, P2 damping 0.8 -> 0.2^(1/60) = 0.973535/tick, maxVel 10 m/s -> 3.333 px/tick
 * - Ball: radius 10, mass 0.8 (invMass 1.25), P2 damping 0.4 -> 0.6^(1/60) = 0.991523/tick
 * - Contacts: player-player restitution 1.0, player-ball restitution 0.1, player-world 0.0, ball-world 0.78
 */
function getProfileParams(profile: PhysicsProfile): PhysicsParams {
  if (profile === 'pro_control') {
    return {
      playerInvMass: 0.8,
      ballInvMass: 1.25,
      playerDamping: 0.96,
      ballDamping: 0.986,
      playerPlayerRestitution: 0.6,
      playerBallRestitution: 0.04,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.72,
      accel: 0.16,
      kickAccel: 0.12,
      kickImpulse: 5.8,
      maxPlayerSpeed: 3.8,
      maxBallSpeed: 11.0
    };
  }
  if (profile === 'futsal') {
    return {
      playerInvMass: 0.9,
      ballInvMass: 1.2,
      playerDamping: 0.955,
      ballDamping: 0.982,
      playerPlayerRestitution: 0.75,
      playerBallRestitution: 0.08,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.76,
      accel: 0.19,
      kickAccel: 0.14,
      kickImpulse: 6.4,
      maxPlayerSpeed: 4.1,
      maxBallSpeed: 11.8
    };
  }
  if (profile === 'big_arena') {
    return {
      playerInvMass: 0.7,
      ballInvMass: 1.25,
      playerDamping: 0.962,
      ballDamping: 0.993,
      playerPlayerRestitution: 0.8,
      playerBallRestitution: 0.2,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.82,
      accel: 0.21,
      kickAccel: 0.15,
      kickImpulse: 7.2,
      maxPlayerSpeed: 4.6,
      maxBallSpeed: 13.0
    };
  }
  if (profile === 'low_gravity') {
    return {
      playerInvMass: 1.0,
      ballInvMass: 1.25,
      playerDamping: 0.985,
      ballDamping: 0.996,
      playerPlayerRestitution: 1.0,
      playerBallRestitution: 0.45,
      playerWorldRestitution: 0.1,
      ballWorldRestitution: 0.92,
      accel: 0.11,
      kickAccel: 0.09,
      kickImpulse: 6.2,
      maxPlayerSpeed: 4.4,
      maxBallSpeed: 12.5
    };
  }
  if (profile === 'turbo') {
    return {
      playerInvMass: 1.0,
      ballInvMass: 1.25,
      playerDamping: 0.955,
      ballDamping: 0.991523,
      playerPlayerRestitution: 0.9,
      playerBallRestitution: 0.2,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.82,
      accel: 0.23,
      kickAccel: 0.17,
      kickImpulse: 6.8,
      maxPlayerSpeed: 5.0,
      maxBallSpeed: 13.0
    };
  }
  if (profile === 'pro_control_v2') {
    return {
      playerInvMass: 0.55,
      ballInvMass: 1.05,
      playerDamping: 0.962,
      ballDamping: 0.985,
      playerPlayerRestitution: 0.55,
      playerBallRestitution: 0.14,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.72,
      accel: 0.195,
      kickAccel: 0.135,
      kickImpulse: 5.9,
      maxPlayerSpeed: 4.0,
      maxBallSpeed: 11.4
    };
  }
  if (profile === 'pro_control_v3') {
    return {
      playerInvMass: 0.5,
      ballInvMass: 1.1,
      playerDamping: 0.966,
      ballDamping: 0.982,
      playerPlayerRestitution: 0.5,
      playerBallRestitution: 0.08,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.68,
      accel: 0.21,
      kickAccel: 0.15,
      kickImpulse: 6.2,
      maxPlayerSpeed: 4.15,
      maxBallSpeed: 11.8
    };
  }
  if (profile === 'classic_hax_v2') {
    return {
      playerInvMass: 0.5,
      ballInvMass: 1.0,
      playerDamping: 0.964,
      ballDamping: 0.991,
      playerPlayerRestitution: 0.5,
      playerBallRestitution: 0.32,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.82,
      accel: 0.185,
      kickAccel: 0.128,
      kickImpulse: 6.05,
      maxPlayerSpeed: 4.25,
      maxBallSpeed: 11.6
    };
  }
  if (profile === 'turbo_v2') {
    return {
      playerInvMass: 0.45,
      ballInvMass: 1.25,
      playerDamping: 0.972,
      ballDamping: 0.994,
      playerPlayerRestitution: 0.95,
      playerBallRestitution: 0.28,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.88,
      accel: 0.26,
      kickAccel: 0.19,
      kickImpulse: 7.4,
      maxPlayerSpeed: 5.5,
      maxBallSpeed: 14.2
    };
  }
  if (profile === 'real_soccer_v2') {
    return {
      playerInvMass: 0.65,
      ballInvMass: 0.8,
      playerDamping: 0.965,
      ballDamping: 0.988,
      playerPlayerRestitution: 0.42,
      playerBallRestitution: 0.24,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.65,
      accel: 0.155,
      kickAccel: 0.11,
      kickImpulse: 6.45,
      maxPlayerSpeed: 3.8,
      maxBallSpeed: 12.2
    };
  }
  if (profile === 'real_soccer') {
    return {
      playerInvMass: 0.7,
      ballInvMass: 0.85,
      playerDamping: 0.962,
      ballDamping: 0.986,
      playerPlayerRestitution: 0.45,
      playerBallRestitution: 0.28,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.68,
      accel: 0.145,
      kickAccel: 0.1,
      kickImpulse: 6.1,
      maxPlayerSpeed: 3.65,
      maxBallSpeed: 11.8
    };
  }
  if (profile === 'ice_hockey') {
    return {
      playerInvMass: 0.65,
      ballInvMass: 1.3,
      playerDamping: 0.992,
      ballDamping: 0.997,
      playerPlayerRestitution: 0.85,
      playerBallRestitution: 0.45,
      playerWorldRestitution: 0.25,
      ballWorldRestitution: 0.9,
      accel: 0.11,
      kickAccel: 0.08,
      kickImpulse: 7.0,
      maxPlayerSpeed: 4.9,
      maxBallSpeed: 13.8
    };
  }
  if (profile === 'pinball') {
    return {
      playerInvMass: 0.8,
      ballInvMass: 1.5,
      playerDamping: 0.97,
      ballDamping: 0.996,
      playerPlayerRestitution: 1.15,
      playerBallRestitution: 0.75,
      playerWorldRestitution: 0.4,
      ballWorldRestitution: 1.05,
      accel: 0.19,
      kickAccel: 0.14,
      kickImpulse: 6.6,
      maxPlayerSpeed: 4.3,
      maxBallSpeed: 13.5
    };
  }
  if (profile === 'heavy_tank') {
    return {
      playerInvMass: 0.35,
      ballInvMass: 0.75,
      playerDamping: 0.945,
      ballDamping: 0.984,
      playerPlayerRestitution: 1.05,
      playerBallRestitution: 0.22,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.72,
      accel: 0.115,
      kickAccel: 0.075,
      kickImpulse: 6.9,
      maxPlayerSpeed: 2.85,
      maxBallSpeed: 11.5
    };
  }
  if (profile === 'classic_hax') {
    return {
      playerInvMass: 0.5,
      ballInvMass: 1.0,
      playerDamping: 0.96,
      ballDamping: 0.99,
      playerPlayerRestitution: 0.5,
      playerBallRestitution: 0.35,
      playerWorldRestitution: 0.0,
      ballWorldRestitution: 0.8,
      accel: 0.175,
      kickAccel: 0.12,
      kickImpulse: 5.8,
      maxPlayerSpeed: 4.1,
      maxBallSpeed: 11.2
    };
  }
  // 'openhax' (default): faithfully matches open-hax-master (1) mass, damping, restitution & max speed
  return {
    playerInvMass: 1.0,
    ballInvMass: 1.25, // 1 / 0.8 (Ball mass = 0.8 in Ball/index.jsx)
    playerDamping: Math.pow(1 - 0.8, 1 / 60), // 0.973535
    ballDamping: Math.pow(1 - 0.4, 1 / 60),   // 0.991523
    playerPlayerRestitution: 1.0,             // materials.jsx playersContact.restitution = 1
    playerBallRestitution: 0.1,               // materials.jsx playerBallContact.restitution = 0.1
    playerWorldRestitution: 0.0,              // materials.jsx playerWorldContact.restitution = 0
    ballWorldRestitution: 0.78,               // game.jsx p2.restitution = 0.75..0.9
    accel: 0.125,                             // crisp 60Hz response up to P2 maxVelocity=10 (3.333 px/tick)
    kickAccel: 0.095,
    kickImpulse: 5.4,                         // matches open-hax kick shot strength without 60Hz audio spam
    maxPlayerSpeed: 10 * 20 / 60,             // 3.3333 px/tick = 200 px/s (exact constrainVelocity 10)
    maxBallSpeed: 10.8
  };
}

function resolveCircleCircle(
  a: { x: number; y: number; vx: number; vy: number; radius: number },
  b: { x: number; y: number; vx: number; vy: number; radius: number },
  invMassA: number,
  invMassB: number,
  bCoef: number
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = a.radius + b.radius;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) {
    return;
  }

  const dist = Math.sqrt(distSq);
  const nx = dist > 1e-6 ? dx / dist : 1;
  const ny = dist > 1e-6 ? dy / dist : 0;
  const overlap = minDist - dist;
  const invMassSum = invMassA + invMassB;
  if (invMassSum <= 0) {
    return;
  }

  const pushA = (overlap * invMassA) / invMassSum;
  const pushB = (overlap * invMassB) / invMassSum;
  a.x -= nx * pushA;
  a.y -= ny * pushA;
  b.x += nx * pushB;
  b.y += ny * pushB;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) {
    return;
  }

  const j = (-(1 + bCoef) * vn) / invMassSum;
  a.vx -= j * invMassA * nx;
  a.vy -= j * invMassA * ny;
  b.vx += j * invMassB * nx;
  b.vy += j * invMassB * ny;
}

function resolveCircleStaticDisc(
  c: { x: number; y: number; vx: number; vy: number; radius: number },
  px: number,
  py: number,
  pRadius: number,
  bCoef: number
): void {
  const dx = c.x - px;
  const dy = c.y - py;
  const minDist = c.radius + pRadius;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) {
    return;
  }

  const dist = Math.sqrt(distSq);
  const nx = dist > 1e-6 ? dx / dist : 1;
  const ny = dist > 1e-6 ? dy / dist : 0;
  const overlap = minDist - dist;

  c.x += nx * overlap;
  c.y += ny * overlap;

  const vn = c.vx * nx + c.vy * ny;
  if (vn < 0) {
    c.vx -= (1 + bCoef) * vn * nx;
    c.vy -= (1 + bCoef) * vn * ny;
  }
}

function resolveCircleSegment(
  c: { x: number; y: number; vx: number; vy: number; radius: number },
  seg: StadiumSegment
): void {
  const sx = seg.x2 - seg.x1;
  const sy = seg.y2 - seg.y1;
  const lenSq = sx * sx + sy * sy;
  if (lenSq <= 1e-8) {
    return;
  }

  let t = ((c.x - seg.x1) * sx + (c.y - seg.y1) * sy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  const closestX = seg.x1 + t * sx;
  const closestY = seg.y1 + t * sy;
  const dx = c.x - closestX;
  const dy = c.y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= c.radius * c.radius) {
    return;
  }

  const dist = Math.sqrt(distSq);
  let nx = 0;
  let ny = 0;
  if (dist > 1e-6) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    const segLen = Math.sqrt(lenSq);
    nx = -sy / segLen;
    ny = sx / segLen;
  }

  const overlap = c.radius - dist;
  c.x += nx * overlap;
  c.y += ny * overlap;

  const vn = c.vx * nx + c.vy * ny;
  if (vn < 0) {
    c.vx -= (1 + seg.bCoef) * vn * nx;
    c.vy -= (1 + seg.bCoef) * vn * ny;
  }
}

function clampArenaBounds(
  c: { x: number; y: number; vx: number; vy: number; radius: number },
  w: number,
  h: number,
  bCoef: number
): void {
  const r = c.radius;
  if (c.x < r) {
    c.x = r;
    if (c.vx < 0) c.vx = -c.vx * bCoef;
  } else if (c.x > w - r) {
    c.x = w - r;
    if (c.vx > 0) c.vx = -c.vx * bCoef;
  }

  if (c.y < r) {
    c.y = r;
    if (c.vy < 0) c.vy = -c.vy * bCoef;
  } else if (c.y > h - r) {
    c.y = h - r;
    if (c.vy > 0) c.vy = -c.vy * bCoef;
  }
}

interface FeelParams {
  startBoostMul: number;
  moveAccelMul: number;
  brakeMul: number;
  noKickSlowdown: boolean;
  directArrow?: boolean;
  movingDampingOverride?: number;
  stopDampingOverride?: number;
}

function getFeelParams(
  mode?: PhysicsFeelMode,
  cfg?: { startAccelMul?: number; stopFriction?: number; surfaceFriction?: number }
): FeelParams {
  switch (mode) {
    case 'direct_arrow':
      return {
        startBoostMul: 1.0,
        moveAccelMul: 1.0,
        brakeMul: 1.0,
        noKickSlowdown: true,
        directArrow: true,
        movingDampingOverride: 1.0,
        stopDampingOverride: 0.45
      };
    case 'snappy':
      return {
        startBoostMul: 2.2,
        moveAccelMul: 1.45,
        brakeMul: 2.1,
        noKickSlowdown: true,
        stopDampingOverride: 0.78
      };
    case 'instant_stop':
      return {
        startBoostMul: 2.6,
        moveAccelMul: 1.75,
        brakeMul: 2.6,
        noKickSlowdown: true,
        stopDampingOverride: 0.62
      };
    case 'drift_ice':
      return {
        startBoostMul: 1.0,
        moveAccelMul: 0.95,
        brakeMul: 1.15,
        noKickSlowdown: true,
        movingDampingOverride: 0.992,
        stopDampingOverride: 0.993
      };
    case 'smooth_glide':
      return {
        startBoostMul: 1.35,
        moveAccelMul: 1.18,
        brakeMul: 1.5,
        noKickSlowdown: true,
        movingDampingOverride: 0.978,
        stopDampingOverride: 0.94
      };
    case 'custom': {
      const startMul = Math.max(0.6, Math.min(3.0, Number(cfg?.startAccelMul) || 1.4));
      const stopFric = Math.max(0.55, Math.min(0.995, Number(cfg?.stopFriction) || 0.82));
      const surfFric = Math.max(0.88, Math.min(0.995, Number(cfg?.surfaceFriction) || 0.974));
      return {
        startBoostMul: startMul,
        moveAccelMul: Math.max(0.85, Math.min(2.2, 0.75 + startMul * 0.4)),
        brakeMul: Math.max(1.2, startMul * 1.1),
        noKickSlowdown: true,
        movingDampingOverride: surfFric,
        stopDampingOverride: stopFric
      };
    }
    case 'standard':
    default:
      return {
        startBoostMul: 1.0,
        moveAccelMul: 1.0,
        brakeMul: 1.25,
        noKickSlowdown: false
      };
  }
}

export function stepPhysicsTick(
  players: PlayerEntity[],
  ball: BallEntity,
  stadium: StadiumConfig,
  profile: PhysicsProfile,
  botDifficulty: BotDifficulty,
  currentTick: number,
  goalPending: boolean,
  botAvoidMemory: Map<string, number>,
  tuning?: Pick<GameSettings, 'ballControl' | 'ballDamping' | 'kickPower' | 'playerSpeed' | 'wallBounce'>,
  physicsHz = 60,
  feelConfig?: {
    physicsFeel?: PhysicsFeelMode;
    startAccelMul?: number;
    stopFriction?: number;
    surfaceFriction?: number;
  }
): StepResult {
  const hz = Math.max(30, Math.min(500, physicsHz || 60));
  const dtScale = 60 / hz;
  const cfg = getProfileParams(profile);
  const feel = getFeelParams(feelConfig?.physicsFeel, feelConfig);
  if (tuning) {
    // ballControl 0..100 maps to playerBallRestitution 0.65..0.02 (higher control = tighter dribble)
    cfg.playerBallRestitution = Math.max(0.02, Math.min(0.7, 0.65 - (tuning.ballControl / 100) * 0.63));
    cfg.ballDamping = Math.max(0.97, Math.min(0.997, tuning.ballDamping));
    cfg.kickImpulse = Math.max(3.0, Math.min(9.0, tuning.kickPower));
    cfg.maxPlayerSpeed = Math.max(2.5, Math.min(6.0, tuning.playerSpeed));
    cfg.accel = cfg.maxPlayerSpeed * 0.038;
    cfg.kickAccel = cfg.accel * 0.76;
    cfg.ballWorldRestitution = Math.max(0.35, Math.min(0.95, tuning.wallBounce));
  }

  ball.prevX = ball.x;
  ball.prevY = ball.y;

  const activePlayers: PlayerEntity[] = [];
  const redBots: PlayerEntity[] = [];
  const blueBots: PlayerEntity[] = [];

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.team === 'spec') continue;
    p.prevX = p.x;
    p.prevY = p.y;
    activePlayers.push(p);
    if (p.isBot) {
      if (p.team === 'red') redBots.push(p);
      else blueBots.push(p);
    }
  }
  const playerMoving = new Uint8Array(activePlayers.length);

  let kicked = false;
  let powerKickType: PowerupType | null = null;
  let touchedById: string | undefined;
  let savedById: string | undefined;
  const prevBallVx = ball.vx;
  const centerYGoal = stadium.pitchY + stadium.pitchHeight / 2;
  const inDangerZoneY = Math.abs(ball.y - centerYGoal) <= stadium.goalHalfHeight + 48;
  const redDanger = prevBallVx < -2.1 && ball.x < stadium.pitchX + stadium.pitchWidth * 0.25 && inDangerZoneY;
  const blueDanger = prevBallVx > 2.1 && ball.x > stadium.pitchX + stadium.pitchWidth * 0.75 && inDangerZoneY;

  for (let i = 0; i < activePlayers.length; i++) {
    const p = activePlayers[i];
    let bits = p.inputBits;
    let botSpeedScale = 1.0;

    if (p.isBot) {
      const teamList = p.team === 'red' ? redBots : blueBots;
      const botIndex = teamList.indexOf(p);
      const botDecision = computeBotInput(
        p,
        Math.max(0, botIndex),
        teamList.length,
        activePlayers,
        ball,
        stadium,
        botDifficulty,
        currentTick,
        botAvoidMemory
      );
      bits = botDecision.bits;
      botSpeedScale = botDecision.speedScale;
    }

    let dx = 0;
    let dy = 0;
    if (bits & INPUT_LEFT) dx -= 1;
    if (bits & INPUT_RIGHT) dx += 1;
    if (bits & INPUT_UP) dy -= 1;
    if (bits & INPUT_DOWN) dy += 1;

    const kickDown = (bits & INPUT_KICK) !== 0;
    if (kickDown && !p.prevKick) {
      // Rate-limit rapid kick toggling (blocks AutoHotkey / macro spam)
      if (currentTick >= p.nextKickTick) {
        p.kickArmed = true;
        p.nextKickTick = currentTick + Math.round(hz * 0.13);
      }
    } else if (!kickDown) {
      p.kickArmed = false;
    }
    p.prevKick = kickDown;

    if (p.kickFlashTicks > 0) {
      p.kickFlashTicks--;
    }

    // Diagonal normalization matching open-hax-master (1) Math.sqrt(thrust^2 / 2)
    if (dx !== 0 || dy !== 0) {
      playerMoving[i] = 1;
      const invLen = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
      dx *= invLen;
      dy *= invLen;

      const spdMul = p.powerup === 'speed' ? 1.55 : 1.0;
      if (feel.directArrow) {
        const targetSpd = cfg.maxPlayerSpeed * botSpeedScale * spdMul;
        p.vx = dx * targetSpd;
        p.vy = dy * targetSpd;
      } else {
        const dot = dx * p.vx + dy * p.vy;
        const accelPhaseMul =
          dot < -0.35
            ? feel.brakeMul
            : dot < cfg.maxPlayerSpeed * 0.45
              ? feel.startBoostMul
              : 1.0;
        const baseAccel = p.kickArmed && !feel.noKickSlowdown ? cfg.kickAccel : cfg.accel;
        const accel = baseAccel * feel.moveAccelMul * botSpeedScale * accelPhaseMul * dtScale * spdMul;
        p.vx += dx * accel;
        p.vy += dy * accel;
      }
    }

    if (p.powerup === 'magnet') {
      const mdx = p.x - ball.x;
      const mdy = p.y - ball.y;
      const mDistSq = mdx * mdx + mdy * mdy;
      if (mDistSq > 100 && mDistSq < 110 * 110) {
        const mDist = Math.sqrt(mDistSq);
        ball.vx += (mdx / mDist) * 0.14 * dtScale;
        ball.vy += (mdy / mDist) * 0.14 * dtScale;
      }
    }

    // Kick direction from player center to ball center (equivalent to open-hax alpha quadrant math)
    if (p.kickArmed && currentTick >= p.nextKickTick) {
      const kdx = ball.x - p.x;
      const kdy = ball.y - p.y;
      const reach = p.radius + ball.radius + 7;
      const distSq = kdx * kdx + kdy * kdy;
      if (distSq <= reach * reach) {
        const dist = Math.sqrt(distSq);
        const nx = dist > 1e-5 ? kdx / dist : p.team === 'red' ? 1 : -1;
        const ny = dist > 1e-5 ? kdy / dist : 0;

        const powerMul = p.powerup === 'hawk' ? 1.95 : p.powerup === 'fire' ? 1.55 : 1.0;
        ball.vx += nx * cfg.kickImpulse * powerMul;
        ball.vy += ny * cfg.kickImpulse * powerMul;
        if (p.powerup) powerKickType = p.powerup;
        p.kickArmed = false;
        p.nextKickTick = currentTick + Math.max(4, Math.round(8 / dtScale));
        p.kickFlashTicks = Math.max(4, Math.round(8 / dtScale));
        kicked = true;
        touchedById = p.id;
        if ((p.team === 'red' && redDanger && ball.vx > prevBallVx + 1.5) ||
          (p.team === 'blue' && blueDanger && ball.vx < prevBallVx - 1.5)) {
          savedById = p.id;
        }
      }
    }
  }

  for (let i = 0; i < activePlayers.length; i++) {
    const p = activePlayers[i];
    p.radius = p.powerup === 'giant' ? 20 : 15;
    const pMax = p.powerup === 'speed' ? cfg.maxPlayerSpeed * 1.55 : cfg.maxPlayerSpeed;
    const spdSq = p.vx * p.vx + p.vy * p.vy;
    if (spdSq > pMax * pMax) {
      const scale = pMax / Math.sqrt(spdSq);
      p.vx *= scale;
      p.vy *= scale;
    }
  }

  const hardMaxBall = cfg.maxBallSpeed * 1.65;
  const ballSpdSq = ball.vx * ball.vx + ball.vy * ball.vy;
  if (ballSpdSq > hardMaxBall * hardMaxBall) {
    const scale = hardMaxBall / Math.sqrt(ballSpdSq);
    ball.vx *= scale;
    ball.vy *= scale;
  } else if (!powerKickType && ballSpdSq > cfg.maxBallSpeed * cfg.maxBallSpeed) {
    // Allow power-shot velocity to decay smoothly instead of snapping down on the next tick.
    const decay = Math.pow(0.95, dtScale);
    ball.vx *= decay;
    ball.vy *= decay;
  }

  const SUBSTEPS = 2;
  const subDt = 1 / SUBSTEPS;

  for (let s = 0; s < SUBSTEPS; s++) {
    for (let i = 0; i < activePlayers.length; i++) {
      const p = activePlayers[i];
      p.x += p.vx * subDt * dtScale;
      p.y += p.vy * subDt * dtScale;
    }
    ball.x += ball.vx * subDt * dtScale;
    ball.y += ball.vy * subDt * dtScale;

    for (let i = 0; i < activePlayers.length; i++) {
      for (let j = i + 1; j < activePlayers.length; j++) {
        resolveCircleCircle(
          activePlayers[i],
          activePlayers[j],
          cfg.playerInvMass,
          cfg.playerInvMass,
          cfg.playerPlayerRestitution
        );
      }
    }

    for (let i = 0; i < activePlayers.length; i++) {
      const ap = activePlayers[i];
      const ddx = ball.x - ap.x;
      const ddy = ball.y - ap.y;
      const minD = ap.radius + ball.radius;
      const hit = ddx * ddx + ddy * ddy < minD * minD;
      resolveCircleCircle(
        ap,
        ball,
        cfg.playerInvMass,
        cfg.ballInvMass,
        cfg.playerBallRestitution
      );
      if (hit) {
        touchedById = ap.id;
        if ((ap.team === 'red' && redDanger && ball.vx > prevBallVx + 1.2) ||
          (ap.team === 'blue' && blueDanger && ball.vx < prevBallVx - 1.2)) {
          savedById = ap.id;
        }
      }
    }

    for (let k = 0; k < stadium.posts.length; k++) {
      const post = stadium.posts[k];
      for (let i = 0; i < activePlayers.length; i++) {
        resolveCircleStaticDisc(activePlayers[i], post.x, post.y, post.radius, post.bCoef);
      }
      resolveCircleStaticDisc(ball, post.x, post.y, post.radius, post.bCoef);
    }

    for (let k = 0; k < stadium.segments.length; k++) {
      const seg = stadium.segments[k];
      if (seg.mask === 'none') continue;
      if (seg.mask === 'ball' || seg.mask === 'both') {
        resolveCircleSegment(ball, seg);
      }
      if (seg.mask === 'player' || seg.mask === 'both') {
        for (let i = 0; i < activePlayers.length; i++) {
          resolveCircleSegment(activePlayers[i], seg);
        }
      }
    }

    for (let i = 0; i < activePlayers.length; i++) {
      clampArenaBounds(activePlayers[i], stadium.canvasWidth, stadium.canvasHeight, cfg.playerWorldRestitution);
    }
    clampArenaBounds(ball, stadium.canvasWidth, stadium.canvasHeight, cfg.ballWorldRestitution);
  }

  const pMoveDamp = Math.pow(feel.movingDampingOverride ?? cfg.playerDamping, dtScale);
  const pStopDamp = Math.pow(feel.stopDampingOverride ?? cfg.playerDamping, dtScale);
  const bDamp = Math.pow(cfg.ballDamping, dtScale);
  for (let i = 0; i < activePlayers.length; i++) {
    const damp = playerMoving[i] ? pMoveDamp : pStopDamp;
    activePlayers[i].vx *= damp;
    activePlayers[i].vy *= damp;
  }
  ball.vx *= bDamp;
  ball.vy *= bDamp;

  let goalTeam: Team | null = null;
  if (!goalPending) {
    const centerY = stadium.pitchY + stadium.pitchHeight / 2;
    const inGoalY =
      ball.y >= centerY - stadium.goalHalfHeight &&
      ball.y <= centerY + stadium.goalHalfHeight;

    if (inGoalY) {
      if (ball.x < stadium.pitchX - ball.radius * 0.65) {
        goalTeam = 'blue';
      } else if (ball.x > stadium.pitchX + stadium.pitchWidth + ball.radius * 0.65) {
        goalTeam = 'red';
      }
    }
  }

  return { kicked, goalTeam, touchedById, savedById, powerKickType };
}

export function resetPositionsForKickoff(
  players: PlayerEntity[],
  ball: BallEntity,
  stadium: StadiumConfig
): void {
  const cx = stadium.pitchX + stadium.pitchWidth / 2;
  const cy = stadium.pitchY + stadium.pitchHeight / 2;

  ball.x = cx;
  ball.y = cy;
  ball.prevX = cx;
  ball.prevY = cy;
  ball.vx = 0;
  ball.vy = 0;

  let redIdx = 0;
  let blueIdx = 0;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    p.vx = 0;
    p.vy = 0;
    p.kickArmed = false;
    p.prevKick = false;
    p.kickFlashTicks = 0;

    if (p.team === 'red') {
      const offsetY = (redIdx % 2 === 0 ? 1 : -1) * Math.ceil(redIdx / 2) * 44;
      const offsetX = Math.floor(redIdx / 3) * 44;
      p.x = cx - 140 - offsetX;
      p.y = cy + offsetY;
      redIdx++;
    } else if (p.team === 'blue') {
      const offsetY = (blueIdx % 2 === 0 ? 1 : -1) * Math.ceil(blueIdx / 2) * 44;
      const offsetX = Math.floor(blueIdx / 3) * 44;
      p.x = cx + 140 + offsetX;
      p.y = cy + offsetY;
      blueIdx++;
    }

    p.prevX = p.x;
    p.prevY = p.y;
  }
}
