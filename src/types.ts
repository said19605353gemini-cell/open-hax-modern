import { Lang } from './i18n';

export type Team = 'red' | 'blue' | 'spec';
export type StadiumId = 'classic' | 'big' | 'huge' | 'futsal' | 'tiny' | 'long' | 'arena_3v3' | 'mini_fast' | 'wide_wing' | 'penalty_box' | 'hbs_classic' | 'hbs_easy' | 'hbs_small' | 'hbs_rounded' | 'hbs_big' | 'hbs_big_easy' | 'hbs_huge' | 'custom_hbs';
export type BotDifficulty = 'very_easy' | 'easy' | 'medium' | 'hard' | 'pro';
export type PhysicsProfile = 'openhax' | 'classic_hax' | 'classic_hax_v2' | 'pro_control' | 'pro_control_v2' | 'pro_control_v3' | 'futsal' | 'big_arena' | 'turbo' | 'turbo_v2' | 'low_gravity' | 'real_soccer' | 'real_soccer_v2' | 'ice_hockey' | 'pinball' | 'heavy_tank';
export type PhysicsFeelMode = 'standard' | 'snappy' | 'instant_stop' | 'direct_arrow' | 'drift_ice' | 'smooth_glide' | 'custom';
export type GrassDetail = 'standard' | 'hd_stadium' | 'night_neon' | 'arena_pro' | 'retro_arcade' | 'flat';
export type BallStyle = 'classic' | 'soccer' | 'champions' | 'fire' | 'neon' | 'gold' | 'beach' | 'tennis';
export type GoalNetStyle = 'classic' | 'diamond' | 'team' | 'neon' | 'gold';
export type GoalPostStyle = 'classic' | 'white' | 'team' | 'neon' | 'gold' | 'carbon';
export type PowerupMode = 'none' | 'hawk' | 'fire' | 'speed' | 'magnet' | 'giant' | 'all';
export type PowerupType = 'hawk' | 'fire' | 'speed' | 'magnet' | 'giant';

export interface FieldPowerup {
  x: number;
  y: number;
  type: PowerupType;
}

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
  viewportMode?: 'dynamic' | 'restricted' | 'full' | 'fullscreen';
  lowLatencyCanvas?: boolean;
  customTeamColors?: boolean;
  showChatIndicators?: boolean;
  showPlayerAvatars?: boolean;
  chatOpacity?: number;
  chatFocusHeight?: number;
  chatWidth?: 'compact' | 'full';
  youtubeClientId?: string;
  youtubePrivacy?: 'public' | 'unlisted' | 'private';
  perfBoost?: boolean;
  showGoalNets?: boolean;
  goalNetStyle?: GoalNetStyle;
  goalPostStyle?: GoalPostStyle;
  crowdEnabled?: boolean;
  stadium: StadiumId;
  physicsProfile: PhysicsProfile;
  physicsFeel?: PhysicsFeelMode;
  startAccelMul?: number;
  stopFriction?: number;
  surfaceFriction?: number;
  physicsHz?: number;
  roomMaxFps?: number;
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
  country: string;
  lang: Lang;
  goalGifUrl: string;
  concedeGifUrl: string;
  chantGifUrl: string;
}

export interface PlayerEntity {
  id: string;
  name: string;
  avatar: string;
  team: Team;
  isBot: boolean;
  isAdmin?: boolean;
  country?: string;
  ping?: number;
  customColor?: string;
  powerup?: PowerupType | null;
  powerupUntilTick?: number;
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
  ct?: string;
  pg?: number;
  cc?: string;
  pw?: PowerupType | null;
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
  pfeel?: PhysicsFeelMode;
  hz?: number;
  mf?: number;
  sc: [number, number];
  sl: number; // scoreLimit (0 = unlimited)
  tl: number; // timeLimitSeconds (0 = unlimited)
  sec: number;
  p: boolean;
  lk?: boolean;
  rl?: boolean;
  gt: Team | null;
  pu?: FieldPowerup | null;
  bf?: PowerupType | null;
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
