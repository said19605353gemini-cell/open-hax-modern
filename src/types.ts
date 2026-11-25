import { Lang } from './i18n';

export type Team = 'red' | 'blue' | 'spec';
export type StadiumId = 'classic' | 'big' | 'huge' | 'futsal' | 'tiny' | 'long' | 'arena_3v3' | 'mini_fast' | 'wide_wing' | 'penalty_box';
export type BotDifficulty = 'easy' | 'medium' | 'hard';
export type PhysicsProfile = 'openhax' | 'classic_hax' | 'pro_control' | 'futsal' | 'big_arena' | 'turbo' | 'low_gravity' | 'real_soccer' | 'ice_hockey' | 'pinball' | 'heavy_tank';
export type GrassDetail = 'standard' | 'hd_stadium' | 'night_neon' | 'flat';
export type BallStyle = 'classic' | 'soccer';

export const INPUT_UP = 1;
export const INPUT_DOWN = 2;
export const INPUT_LEFT = 4;
export const INPUT_RIGHT = 8;
export const INPUT_KICK = 16;

export interface GameSettings {
  fpsLimit: number;          // 0 (Unlimited), 500, 240, 144, 120, 75, 60, 30
  grassDetail: GrassDetail;
  ballStyle: BallStyle;
  ballTrail: boolean;
  resolution: number;        // 1 | 2
  antialias: boolean;
  shadows: boolean;
  particles: boolean;
  kickFlash: boolean;
  showHud: boolean;
  pauseOnBlur: boolean;
  stadium: StadiumId;
  physicsProfile: PhysicsProfile;
  ballControl: number;       // 0..100 (higher = lower player-ball bounce = tighter dribble)
  ballDamping: number;       // 0.975..0.996 per 60Hz tick
  kickPower: number;         // 3.5..8.5 px/tick impulse
  playerSpeed: number;       // 2.8..5.5 max px/tick
  wallBounce: number;        // 0.40..0.95 wall restitution
  botDifficulty: BotDifficulty;
  masterSound: boolean;
  soundVolume: number;
  nickname: string;
  avatar: string;
  lang: Lang;
  goalGifUrl: string;
}

export interface PlayerEntity {
  id: string;
  name: string;
  avatar: string;
  team: Team;
  isBot: boolean;
  isAdmin?: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  inputBits: number;
  kickArmed: boolean;
  prevKick: boolean;
  kickFlashTicks: number;
  nextKickTick: number;
}

export interface BallEntity {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface GoalParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface StadiumSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bCoef: number;
  mask: 'ball' | 'player' | 'both' | 'none';
  color: string;
  width: number;
  alpha: number;
}

export interface StadiumPost {
  x: number;
  y: number;
  radius: number;
  bCoef: number;
  color: string;
}

export interface StadiumConfig {
  id: StadiumId;
  label: string;
  canvasWidth: number;
  canvasHeight: number;
  pitchX: number;
  pitchY: number;
  pitchWidth: number;
  pitchHeight: number;
  goalHalfHeight: number;
  goalDepth: number;
  centerCircleRadius: number;
  segments: StadiumSegment[];
  posts: StadiumPost[];
}

export interface SnapshotPlayer {
  id: string;
  name: string;
  avatar: string;
  team: Team;
  isBot: boolean;
  adm?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kf: number;
}

export interface MatchSnapshot {
  t: number;
  rn: string; // roomName
  st: StadiumId;
  pf: PhysicsProfile;
  sc: [number, number];
  sl: number; // scoreLimit (0 = unlimited)
  tl: number; // timeLimitSeconds (0 = unlimited)
  sec: number;
  p: boolean;
  gt: Team | null;
  b: [number, number, number, number];
  pl: SnapshotPlayer[];
  ev: number; // 1=kick, 2=goal, 4=start
}

export interface ChatMessage {
  id: number;
  author: string;
  text: string;
  system?: boolean;
  team?: Team;
}

export interface PerfTelemetry {
  fps: number;
  frameMs: number;
  workMs: number;
  pingMs: number | null;
  targetFps: number;
}
