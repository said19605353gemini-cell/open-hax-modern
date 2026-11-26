import { StadiumConfig, StadiumId, StadiumSegment } from '../types';

function buildStadium(
  id: StadiumId,
  label: string,
  canvasWidth: number,
  canvasHeight: number,
  marginX: number,
  marginY: number,
  goalHalfHeight: number,
  goalDepth: number,
  centerCircleRadius: number
): StadiumConfig {
  const x0 = marginX;
  const y0 = marginY;
  const pw = canvasWidth - marginX * 2;
  const ph = canvasHeight - marginY * 2;
  const x1 = x0 + pw;
  const y1 = y0 + ph;
  const cy = y0 + ph / 2;
  const gyTop = cy - goalHalfHeight;
  const gyBot = cy + goalHalfHeight;

  const lineStyle = { color: '#ffffff', width: 2, alpha: 1 };
  const netStyle = { color: '#000000', width: 3, alpha: 0.95 };

  const segments: StadiumSegment[] = [
    // Exact open-hax boundary lines (collidesWithBall=true, collidesWithPlayer=false)
    { x1: x0, y1: y0, x2: x1, y2: y0, bCoef: 0.8, mask: 'ball', ...lineStyle },
    { x1: x0, y1: y1, x2: x1, y2: y1, bCoef: 0.8, mask: 'ball', ...lineStyle },
    { x1: x0, y1: y0, x2: x0, y2: gyTop, bCoef: 0.8, mask: 'ball', ...lineStyle },
    { x1: x0, y1: gyBot, x2: x0, y2: y1, bCoef: 0.8, mask: 'ball', ...lineStyle },
    { x1: x1, y1: y0, x2: x1, y2: gyTop, bCoef: 0.8, mask: 'ball', ...lineStyle },
    { x1: x1, y1: gyBot, x2: x1, y2: y1, bCoef: 0.8, mask: 'ball', ...lineStyle },
    // Center field line (visual only)
    { x1: x0 + pw / 2 - 1, y1: y0, x2: x0 + pw / 2 - 1, y2: y1, bCoef: 0, mask: 'none', ...lineStyle },
    // Goal nets behind x0 and x1 (stop ball & players)
    { x1: x0 - goalDepth, y1: gyTop, x2: x0, y2: gyTop, bCoef: 0.25, mask: 'both', ...netStyle },
    { x1: x0 - goalDepth, y1: gyBot, x2: x0, y2: gyBot, bCoef: 0.25, mask: 'both', ...netStyle },
    { x1: x0 - goalDepth, y1: gyTop, x2: x0 - goalDepth, y2: gyBot, bCoef: 0.2, mask: 'both', ...netStyle },
    { x1: x1, y1: gyTop, x2: x1 + goalDepth, y2: gyTop, bCoef: 0.25, mask: 'both', ...netStyle },
    { x1: x1, y1: gyBot, x2: x1 + goalDepth, y2: gyBot, bCoef: 0.25, mask: 'both', ...netStyle },
    { x1: x1 + goalDepth, y1: gyTop, x2: x1 + goalDepth, y2: gyBot, bCoef: 0.2, mask: 'both', ...netStyle }
  ];

  // Exact open-hax goalposts: diameter 15 (radius 7.5), home #ff0000, away #0000ff
  const posts = [
    { x: x0, y: gyTop, radius: 7.5, bCoef: 0.75, color: '#ff0000' },
    { x: x0, y: gyBot, radius: 7.5, bCoef: 0.75, color: '#ff0000' },
    { x: x1, y: gyTop, radius: 7.5, bCoef: 0.75, color: '#0000ff' },
    { x: x1, y: gyBot, radius: 7.5, bCoef: 0.75, color: '#0000ff' }
  ];

  return {
    id,
    label,
    canvasWidth,
    canvasHeight,
    pitchX: x0,
    pitchY: y0,
    pitchWidth: pw,
    pitchHeight: ph,
    goalHalfHeight,
    goalDepth,
    centerCircleRadius,
    segments,
    posts
  };
}

// Default 'classic' matches open-hax-master (1) exact geometry:
// 860x460 world, 800x400 pitch at (30,30), 150px center circle (r=75), 160..300 goals (half=70)
export const STADIUMS: Record<StadiumId, StadiumConfig> = {
  classic: buildStadium('classic', 'OpenHax Klasik (860x460)', 860, 460, 30, 30, 70, 22, 75),
  big: buildStadium('big', 'Büyük Saha (1040x540)', 1040, 540, 40, 34, 84, 26, 86),
  huge: buildStadium('huge', 'Dev Stadyum 4v4 (1160x600)', 1160, 600, 44, 36, 94, 28, 96),
  futsal: buildStadium('futsal', 'Futsal (760x400)', 760, 400, 30, 28, 62, 22, 62),
  tiny: buildStadium('tiny', 'Mini 1v1 (660x350)', 660, 350, 28, 26, 54, 20, 52),
  long: buildStadium('long', 'Uzun Koridor (1080x420)', 1080, 420, 36, 28, 68, 24, 70),
  arena_3v3: buildStadium('arena_3v3', '3v3 Orta Arena (960x500)', 960, 500, 36, 32, 78, 24, 80),
  mini_fast: buildStadium('mini_fast', 'Hızlı 2v2 (720x380)', 720, 380, 28, 26, 60, 20, 58),
  wide_wing: buildStadium('wide_wing', 'Geniş Kanat (980x580)', 980, 580, 38, 34, 88, 26, 84),
  penalty_box: buildStadium('penalty_box', 'Ceza Sahası / Şut (640x440)', 640, 440, 28, 28, 86, 22, 56),
  hbs_classic: buildStadium('hbs_classic', 'HBS: Classic (740x400)', 800, 460, 30, 30, 64, 22, 70),
  hbs_easy: buildStadium('hbs_easy', 'HBS: Easy (740x400)', 800, 460, 30, 30, 90, 22, 70),
  hbs_small: buildStadium('hbs_small', 'HBS: Small (640x400)', 700, 460, 30, 30, 55, 20, 62),
  hbs_rounded: buildStadium('hbs_rounded', 'HBS: Rounded (740x400)', 800, 460, 30, 30, 64, 22, 70),
  hbs_big: buildStadium('hbs_big', 'HBS: Big (1100x540)', 1180, 600, 40, 30, 80, 26, 88),
  hbs_big_easy: buildStadium('hbs_big_easy', 'HBS: Big Easy (1100x540)', 1180, 600, 40, 30, 95, 26, 88),
  hbs_huge: buildStadium('hbs_huge', 'HBS: Huge (1400x700)', 1480, 760, 40, 30, 100, 28, 105),
  custom_hbs: buildStadium('custom_hbs', 'Özel .hbs Haritası', 860, 460, 30, 30, 70, 22, 75)
};

export function setCustomHbsStadium(cfg: StadiumConfig): void {
  STADIUMS.custom_hbs = { ...cfg, id: 'custom_hbs' };
}

function mapHbsMask(cMask?: string[]): StadiumSegment['mask'] {
  if (!cMask || cMask.length === 0) return 'both';
  const hasBall = cMask.includes('ball') || cMask.includes('all');
  const hasPlayer =
    cMask.includes('red') ||
    cMask.includes('blue') ||
    cMask.includes('player') ||
    cMask.includes('all');
  if (hasBall && hasPlayer) return 'both';
  if (hasBall) return 'ball';
  if (hasPlayer) return 'player';
  return 'none';
}

function normalizeHbsColor(col?: string, fallback = '#ffffff'): string {
  if (!col || typeof col !== 'string') return fallback;
  const c = col.trim();
  if (c.startsWith('#')) return c;
  if (/^[0-9a-fA-F]{6}$/.test(c)) return '#' + c;
  return fallback;
}

/** Parses standard HaxBall .hbs / .hbys JSON into an OpenHax StadiumConfig. */
export function parseHbsToStadium(jsonText: string, fileName?: string): StadiumConfig {
  const raw = JSON.parse(jsonText) as {
    name?: string;
    width?: number;
    height?: number;
    bg?: { width?: number; height?: number; kickOffRadius?: number };
    vertexes?: Array<{ x: number; y: number }>;
    segments?: Array<{
      v0: number;
      v1: number;
      bCoef?: number;
      cMask?: string[];
      color?: string;
      vis?: boolean;
    }>;
    goals?: Array<{ p0: [number, number]; p1: [number, number]; team?: string }>;
    discs?: Array<{ pos: [number, number]; radius?: number; bCoef?: number; color?: string }>;
  };

  const bgW = Number(raw.bg?.width) || Number(raw.width) * 1.85 || 740;
  const bgH = Number(raw.bg?.height) || Number(raw.height) * 1.85 || 400;
  const pitchWidth = Math.max(420, Math.min(1800, Math.round(bgW * 2 > 1800 ? bgW : bgW)));
  const pitchHeight = Math.max(260, Math.min(1000, Math.round(bgH * 2 > 1000 ? bgH : bgH)));
  const marginX = 40;
  const marginY = 34;
  const canvasWidth = pitchWidth + marginX * 2;
  const canvasHeight = pitchHeight + marginY * 2;
  const cx = marginX + pitchWidth / 2;
  const cy = marginY + pitchHeight / 2;

  let goalHalfHeight = 64;
  if (Array.isArray(raw.goals) && raw.goals.length > 0) {
    const g = raw.goals[0];
    if (Array.isArray(g.p0) && Array.isArray(g.p1)) {
      const span = Math.abs(Number(g.p1[1]) - Number(g.p0[1]));
      if (span > 20) goalHalfHeight = Math.round(span / 2);
    }
  }

  const base = buildStadium(
    'custom_hbs',
    (raw.name || fileName?.replace(/\.(hbs|hbys|json)$/i, '') || 'Özel .hbs Haritası').slice(0, 36),
    canvasWidth,
    canvasHeight,
    marginX,
    marginY,
    goalHalfHeight,
    24,
    Number(raw.bg?.kickOffRadius) || 70
  );

  const verts = Array.isArray(raw.vertexes) ? raw.vertexes : [];
  const parsedSegs: StadiumSegment[] = [];
  if (Array.isArray(raw.segments)) {
    for (const s of raw.segments) {
      const v0 = verts[s.v0];
      const v1 = verts[s.v1];
      if (!v0 || !v1) continue;
      parsedSegs.push({
        x1: cx + Number(v0.x || 0),
        y1: cy + Number(v0.y || 0),
        x2: cx + Number(v1.x || 0),
        y2: cy + Number(v1.y || 0),
        bCoef: typeof s.bCoef === 'number' ? s.bCoef : 0.75,
        mask: mapHbsMask(s.cMask),
        color: normalizeHbsColor(s.color, '#ffffff'),
        width: 2.5,
        alpha: s.vis === false ? 0 : 0.95
      });
    }
  }

  const parsedPosts = Array.isArray(raw.discs) && raw.discs.length > 0
    ? raw.discs
        .filter((d) => Array.isArray(d.pos))
        .map((d) => ({
          x: cx + Number(d.pos[0] || 0),
          y: cy + Number(d.pos[1] || 0),
          radius: Math.max(4, Number(d.radius) || 8),
          bCoef: typeof d.bCoef === 'number' ? d.bCoef : 0.7,
          color: normalizeHbsColor(d.color, '#ffffff')
        }))
    : base.posts;

  return {
    ...base,
    segments: parsedSegs.length > 0 ? [...base.segments, ...parsedSegs] : base.segments,
    posts: parsedPosts
  };
}

/** Exports an OpenHax StadiumConfig as a downloadable HaxBall .hbs JSON string. */
export function stadiumToHbsJson(stadium: StadiumConfig): string {
  const cx = stadium.pitchX + stadium.pitchWidth / 2;
  const cy = stadium.pitchY + stadium.pitchHeight / 2;
  const hw = stadium.pitchWidth / 2;
  const hh = stadium.pitchHeight / 2;
  const ghh = stadium.goalHalfHeight;

  const vertexes = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: -ghh },
    { x: hw, y: ghh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
    { x: -hw, y: ghh },
    { x: -hw, y: -ghh }
  ];

  const segments = [
    { v0: 0, v1: 1, bCoef: 0.8, cMask: ['ball'], color: 'FFFFFF' },
    { v0: 4, v1: 5, bCoef: 0.8, cMask: ['ball'], color: 'FFFFFF' },
    { v0: 0, v1: 7, bCoef: 0.8, cMask: ['ball'], color: 'FFFFFF' },
    { v0: 6, v1: 5, bCoef: 0.8, cMask: ['ball'], color: 'FFFFFF' },
    { v0: 1, v1: 2, bCoef: 0.8, cMask: ['ball'], color: 'FFFFFF' },
    { v0: 3, v1: 4, bCoef: 0.8, cMask: ['ball'], color: 'FFFFFF' }
  ];

  const discs = stadium.posts.map((p) => ({
    pos: [Math.round(p.x - cx), Math.round(p.y - cy)],
    radius: p.radius,
    bCoef: p.bCoef,
    invMass: 0,
    color: p.color.replace('#', '')
  }));

  const hbs = {
    name: stadium.label,
    width: Math.round(hw + 40),
    height: Math.round(hh + 34),
    spawnDistance: Math.round(hw * 0.55),
    bg: {
      type: 'grass',
      width: Math.round(hw),
      height: Math.round(hh),
      kickOffRadius: stadium.centerCircleRadius,
      cornerRadius: 0
    },
    vertexes,
    segments,
    goals: [
      { p0: [-hw, -ghh], p1: [-hw, ghh], team: 'red' },
      { p0: [hw, -ghh], p1: [hw, ghh], team: 'blue' }
    ],
    discs
  };

  return JSON.stringify(hbs, null, 2);
}

export function getStadium(id: StadiumId): StadiumConfig {
  return STADIUMS[id] || STADIUMS.classic;
}
