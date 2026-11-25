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
  long: buildStadium('long', 'Uzun Koridor (1080x420)', 1080, 420, 36, 28, 68, 24, 70)
};

export function getStadium(id: StadiumId): StadiumConfig {
  return STADIUMS[id] || STADIUMS.classic;
}
