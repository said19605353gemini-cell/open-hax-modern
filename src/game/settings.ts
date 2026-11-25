import { GameSettings } from '../types';

const STORAGE_KEY = 'openhax_modern_settings_v2';

export const DEFAULT_SETTINGS: GameSettings = {
  fpsLimit: 0,
  grassDetail: 'hd_stadium',
  ballStyle: 'soccer',
  ballTrail: true,
  resolution: 1,
  antialias: true,
  shadows: true,
  particles: true,
  kickFlash: true,
  showHud: true,
  pauseOnBlur: true,
  stadium: 'classic',
  physicsProfile: 'openhax',
  ballControl: 90,
  ballDamping: 0.9915,
  kickPower: 5.4,
  playerSpeed: 3.33,
  wallBounce: 0.78,
  botDifficulty: 'medium',
  masterSound: true,
  soundVolume: 0.6,
  nickname: '',
  avatar: ':)',
  lang: 'tr'
};

export const PERFORMANCE_PRESETS: Record<string, Partial<GameSettings>> = {
  balanced: {
    fpsLimit: 0,
    grassDetail: 'hd_stadium',
    ballStyle: 'soccer',
    ballTrail: true,
    resolution: 1,
    antialias: true,
    shadows: true,
    particles: true,
    kickFlash: true,
    pauseOnBlur: true
  },
  ultraPerformance: {
    fpsLimit: 0,
    grassDetail: 'flat',
    ballStyle: 'classic',
    ballTrail: false,
    resolution: 1,
    antialias: false,
    shadows: false,
    particles: false,
    kickFlash: false,
    pauseOnBlur: true
  },
  powerSaver: {
    fpsLimit: 30,
    grassDetail: 'flat',
    resolution: 1,
    antialias: false,
    shadows: false,
    particles: false,
    kickFlash: false,
    pauseOnBlur: true
  },
  proControl: {
    physicsProfile: 'openhax',
    ballControl: 96,
    ballDamping: 0.986,
    kickPower: 5.8,
    playerSpeed: 3.8,
    wallBounce: 0.7
  }
};

export function loadSettings(): GameSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}
