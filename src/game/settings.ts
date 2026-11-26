import { GameSettings } from '../types';
import { Lang } from '../i18n';

const STORAGE_KEY = 'openhax_modern_settings_v2';

// Site-wide Google OAuth Web Client ID for YouTube Data API v3 (public identifier, each player signs into their own YouTube account)
export const DEFAULT_YOUTUBE_CLIENT_ID = '';

export const LANG_TO_FLAG: Record<Lang, string> = {
  tr: 'TR', en: 'GB', az: 'AZ', de: 'DE', fr: 'FR', es: 'ES', pt: 'BR', it: 'IT', nl: 'NL', pl: 'PL', ru: 'RU', ar: 'SA',
  uk: 'UA', ro: 'RO', el: 'GR', cs: 'CZ', hu: 'HU', sv: 'SE', no: 'NO', da: 'DK', fi: 'FI', bg: 'BG', sr: 'RS', hr: 'HR',
  ka: 'GE', kk: 'KZ', uz: 'UZ', fa: 'IR', he: 'IL', hi: 'IN', id: 'ID', vi: 'VN', th: 'TH', ja: 'JP', ko: 'KR', zh: 'CN'
};

export const ALL_COUNTRY_CODES: string[] = [
  'TR', 'AZ', 'DE', 'NL', 'GB', 'FR', 'ES', 'IT', 'PL', 'PT', 'US', 'BR', 'RU', 'SA',
  'AD', 'AE', 'AF', 'AG', 'AL', 'AM', 'AO', 'AR', 'AT', 'AU', 'BA', 'BB', 'BD', 'BE',
  'BF', 'BG', 'BH', 'BI', 'BJ', 'BN', 'BO', 'BS', 'BT', 'BW', 'BY', 'BZ', 'CA', 'CD',
  'CF', 'CG', 'CH', 'CI', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CY', 'CZ', 'DJ',
  'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'ER', 'ET', 'FI', 'FJ', 'FM', 'GA', 'GD',
  'GE', 'GH', 'GM', 'GN', 'GQ', 'GR', 'GT', 'GW', 'GY', 'HN', 'HR', 'HT', 'HU', 'ID',
  'IE', 'IL', 'IN', 'IQ', 'IR', 'IS', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM',
  'KN', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU',
  'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MR', 'MT',
  'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NE', 'NG', 'NI', 'NO', 'NP', 'NR', 'NZ',
  'OM', 'PA', 'PE', 'PG', 'PH', 'PK', 'PS', 'PW', 'PY', 'QA', 'RO', 'RS', 'RW', 'SB',
  'SC', 'SD', 'SE', 'SG', 'SI', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV',
  'SY', 'SZ', 'TD', 'TG', 'TH', 'TJ', 'TL', 'TM', 'TN', 'TO', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VN', 'VU', 'WS', 'YE', 'ZA', 'ZM', 'ZW',
  'GL'
];

export const COUNTRY_FLAGS: Record<string, string> = {
  TR: '🇹🇷',
  AZ: '🇦🇿',
  DE: '🇩🇪',
  NL: '🇳🇱',
  GB: '🇬🇧',
  FR: '🇫🇷',
  ES: '🇪🇸',
  IT: '🇮🇹',
  PL: '🇵🇱',
  RU: '🇷🇺',
  BR: '🇧🇷',
  US: '🇺🇸',
  GL: '🌍'
};

export function countryFlagCode(code?: string): string {
  const key = (code || '').trim().toLowerCase();
  if (!key || key === 'gl' || !/^[a-z]{2}$/.test(key)) return '';
  return key;
}

export function createFlagEl(code?: string): HTMLElement {
  const iso = countryFlagCode(code);
  const span = document.createElement('span');
  if (iso) {
    span.className = `fi fi-${iso} flag-badge`;
    span.title = iso.toUpperCase();
    span.setAttribute('aria-label', iso.toUpperCase());
  } else {
    span.className = 'flag-globe';
    span.textContent = '🌍';
    span.title = 'GL';
  }
  return span;
}

export function getCountryLabel(code: string, lang: Lang): string {
  const upper = code.toUpperCase();
  if (upper === 'GL') return 'Global (GL)';
  try {
    const dn = new Intl.DisplayNames([lang, 'en'], { type: 'region' });
    const name = dn.of(upper);
    if (name && name !== upper) return `${name} (${upper})`;
  } catch { /* ignore */ }
  return upper;
}

export function countryFlag(code?: string): string {
  const key = (code || '').trim().toUpperCase();
  if (key === 'GL' || !/^[A-Z]{2}$/.test(key)) return COUNTRY_FLAGS[key] || '🌍';
  return String.fromCodePoint(0x1f1e6 + key.charCodeAt(0) - 65, 0x1f1e6 + key.charCodeAt(1) - 65);
}

export function detectDefaultCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Istanbul')) return 'TR';
    if (tz.includes('Baku')) return 'AZ';
    if (tz.includes('Berlin')) return 'DE';
    if (tz.includes('Amsterdam')) return 'NL';
    if (tz.includes('London')) return 'GB';
    if (tz.includes('Paris')) return 'FR';
    if (tz.includes('Madrid')) return 'ES';
    if (tz.includes('Rome')) return 'IT';
    if (tz.includes('Warsaw')) return 'PL';
    if (tz.includes('Moscow')) return 'RU';
    if (tz.includes('Sao_Paulo')) return 'BR';
    if (tz.includes('America/')) return 'US';
    const lang = (navigator.language || '').toUpperCase();
    const parts = lang.split('-');
    if (parts[1] && /^[A-Z]{2}$/.test(parts[1])) return parts[1];
    if (lang.startsWith('TR')) return 'TR';
  } catch { /* ignore */ }
  return 'TR';
}

export function detectDefaultLang(): Lang {
  try {
    const raw = (navigator.language || 'tr').toLowerCase().split('-')[0];
    const supported = Object.keys(LANG_TO_FLAG) as Lang[];
    if (supported.includes(raw as Lang)) return raw as Lang;
  } catch { /* ignore */ }
  return 'tr';
}

export const DEFAULT_SETTINGS: GameSettings = Object.freeze({
  fpsLimit: 60,
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
  viewportMode: 'dynamic',
  lowLatencyCanvas: true,
  customTeamColors: true,
  showChatIndicators: true,
  showPlayerAvatars: true,
  chatOpacity: 0.8,
  chatFocusHeight: 140,
  chatWidth: 'compact',
  youtubeClientId: '',
  youtubePrivacy: 'unlisted',
  perfBoost: false,
  showGoalNets: true,
  goalNetStyle: 'classic',
  crowdEnabled: true,
  stadium: 'classic',
  physicsProfile: 'openhax',
  physicsFeel: 'standard',
  startAccelMul: 1.4,
  stopFriction: 0.82,
  surfaceFriction: 0.974,
  physicsHz: 60,
  roomMaxFps: 0,
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
  country: detectDefaultCountry(),
  lang: detectDefaultLang(),
  goalGifUrl: '',
  concedeGifUrl: '',
  chantGifUrl: ''
});

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
  ultraHD: {
    grassDetail: 'arena_pro',
    ballStyle: 'soccer',
    ballTrail: true,
    resolution: 2,
    antialias: true,
    shadows: true,
    particles: true,
    kickFlash: true,
    perfBoost: false,
    showGoalNets: true
  },
  ultraPerformance: {
    fpsLimit: 0,
    grassDetail: 'flat',
    ballStyle: 'classic',
    ballTrail: false,
    resolution: 0.75,
    antialias: false,
    shadows: false,
    particles: false,
    kickFlash: false,
    perfBoost: true,
    showGoalNets: false,
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
