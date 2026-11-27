import {
  BallEntity,
  FieldPowerup,
  GameSettings,
  GoalParticle,
  PlayerEntity,
  PowerupType,
  StadiumConfig
} from '../types';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bgCanvas: HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D;
  private grassImage: HTMLImageElement | null = null;
  private grassLoaded = false;
  private cachedBgKey = '';
  private currentScale = 1;
  private trailPoints: Array<{ x: number; y: number }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('2D Canvas context olusturulamadi.');
    }
    this.ctx = context;

    this.bgCanvas = document.createElement('canvas');
    const bgCtx = this.bgCanvas.getContext('2d', { alpha: false });
    if (!bgCtx) {
      throw new Error('Offscreen Canvas context olusturulamadi.');
    }
    this.bgCtx = bgCtx;

    this.preloadGrass();
  }

  private preloadGrass(): void {
    const img = new Image();
    img.onload = () => {
      this.grassImage = img;
      this.grassLoaded = true;
      this.cachedBgKey = ''; // Force cache rebuild with texture
    };
    img.src = './img/grass.png';
  }

  private ensureConfig(stadium: StadiumConfig, settings: GameSettings): void {
    const dpr = Math.max(1, Number(settings.resolution) || 1);
    const key = [
      stadium.id,
      settings.grassDetail,
      dpr,
      settings.antialias ? 1 : 0,
      settings.perfBoost ? 1 : 0,
      settings.showGoalNets !== false ? 1 : 0,
      settings.goalNetStyle || 'classic',
      settings.goalPostStyle || 'classic',
      settings.crowdEnabled !== false ? 1 : 0,
      this.grassLoaded ? 1 : 0
    ].join('|');

    if (key === this.cachedBgKey) {
      return;
    }

    this.cachedBgKey = key;
    this.currentScale = dpr;

    const pw = Math.round(stadium.canvasWidth * dpr);
    const ph = Math.round(stadium.canvasHeight * dpr);

    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.canvas.style.setProperty('--canvas-w', stadium.canvasWidth + 'px');
    this.canvas.style.setProperty('--canvas-ar', String(stadium.canvasWidth / stadium.canvasHeight));
    this.canvas.style.aspectRatio = `${stadium.canvasWidth} / ${stadium.canvasHeight}`;

    this.bgCanvas.width = pw;
    this.bgCanvas.height = ph;

    this.ctx.imageSmoothingEnabled = settings.antialias;
    this.bgCtx.imageSmoothingEnabled = settings.antialias;

    this.drawStaticStadium(stadium, settings, dpr);
  }

  private drawStaticStadium(stadium: StadiumConfig, settings: GameSettings, scale: number): void {
    const ctx = this.bgCtx;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Outer stadium apron matching haxball.com/play olive green (#6a8553)
    ctx.fillStyle = '#6a8553';
    ctx.fillRect(0, 0, stadium.canvasWidth, stadium.canvasHeight);

    const { pitchX, pitchY, pitchWidth, pitchHeight, goalHalfHeight, goalDepth } = stadium;
    const cx = pitchX + pitchWidth / 2;
    const cy = pitchY + pitchHeight / 2;
    const isNight = settings.grassDetail === 'night_neon';
    const isArena = settings.grassDetail === 'arena_pro';
    const isRetro = settings.grassDetail === 'retro_arcade';
    const isHd = !settings.perfBoost && (settings.grassDetail === 'hd_stadium' || isNight || isArena);

    // Pitch surface
    if (isNight) {
      this.drawDiagonalStripes(ctx, pitchX, pitchY, pitchWidth, pitchHeight, '#1b3b2b', '#204533');
    } else if (isArena) {
      this.drawDiagonalStripes(ctx, pitchX, pitchY, pitchWidth, pitchHeight, '#2d6a4f', '#255c44');
    } else if (isRetro) {
      this.drawDiagonalStripes(ctx, pitchX, pitchY, pitchWidth, pitchHeight, '#578a34', '#4d7d2c');
    } else if (settings.grassDetail === 'hd_stadium') {
      this.drawDiagonalStripes(ctx, pitchX, pitchY, pitchWidth, pitchHeight, '#718c5a', '#688251');
    } else if (settings.grassDetail === 'standard' && this.grassImage) {
      const pattern = ctx.createPattern(this.grassImage, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(pitchX, pitchY, pitchWidth, pitchHeight);
      } else {
        this.drawDiagonalStripes(ctx, pitchX, pitchY, pitchWidth, pitchHeight, '#718c5a', '#688251');
      }
    } else {
      ctx.fillStyle = '#718c5a';
      ctx.fillRect(pitchX, pitchY, pitchWidth, pitchHeight);
    }

    // HD Stadium extras: penalty boxes, corner arcs, net mesh, and floodlight vignette (cached once!)
    if (isHd) {
      const boxW = Math.round(pitchWidth * 0.14);
      const boxH = Math.round(goalHalfHeight * 2.15);
      ctx.strokeStyle = isNight || isArena ? 'rgba(167, 243, 208, 0.58)' : 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = 2;
      ctx.strokeRect(pitchX, cy - boxH / 2, boxW, boxH);
      ctx.strokeRect(pitchX + pitchWidth - boxW, cy - boxH / 2, boxW, boxH);

      // Corner arcs
      const cr = 14;
      ctx.beginPath();
      ctx.arc(pitchX, pitchY, cr, 0, Math.PI / 2);
      ctx.moveTo(pitchX + pitchWidth - cr, pitchY);
      ctx.arc(pitchX + pitchWidth, pitchY, cr, Math.PI / 2, Math.PI);
      ctx.moveTo(pitchX, pitchY + pitchHeight - cr);
      ctx.arc(pitchX, pitchY + pitchHeight, cr, -Math.PI / 2, 0);
      ctx.moveTo(pitchX + pitchWidth, pitchY + pitchHeight - cr);
      ctx.arc(pitchX + pitchWidth, pitchY + pitchHeight, cr, Math.PI, Math.PI * 1.5);
      ctx.stroke();

      if (settings.showGoalNets !== false) {
        // Goal net crosshatch mesh (style-aware)
        ctx.save();
        const netStyle = settings.goalNetStyle || 'classic';
        const leftColor =
          netStyle === 'team' ? 'rgba(239, 68, 68, 0.36)' :
          netStyle === 'neon' ? 'rgba(34, 211, 238, 0.42)' :
          netStyle === 'gold' ? 'rgba(250, 204, 21, 0.38)' :
          'rgba(255, 255, 255, 0.24)';
        const rightColor =
          netStyle === 'team' ? 'rgba(59, 130, 246, 0.36)' :
          netStyle === 'neon' ? 'rgba(232, 121, 249, 0.42)' :
          netStyle === 'gold' ? 'rgba(250, 204, 21, 0.38)' :
          'rgba(255, 255, 255, 0.24)';
        ctx.lineWidth = netStyle === 'neon' ? 1.4 : 1;

        const drawNetSide = (x0: number, x1: number, color: string) => {
          ctx.strokeStyle = color;
          if (netStyle === 'diamond') {
            for (let y = cy - goalHalfHeight; y < cy + goalHalfHeight; y += 12) {
              ctx.beginPath();
              ctx.moveTo(x0, y);
              ctx.lineTo(x1, Math.min(cy + goalHalfHeight, y + 12));
              ctx.moveTo(x1, y);
              ctx.lineTo(x0, Math.min(cy + goalHalfHeight, y + 12));
              ctx.stroke();
            }
          } else {
            for (let y = cy - goalHalfHeight + 8; y < cy + goalHalfHeight; y += 10) {
              ctx.beginPath();
              ctx.moveTo(x0, y);
              ctx.lineTo(x1, y);
              ctx.stroke();
            }
            for (let x = x0 + 8; x < x1; x += 10) {
              ctx.beginPath();
              ctx.moveTo(x, cy - goalHalfHeight);
              ctx.lineTo(x, cy + goalHalfHeight);
              ctx.stroke();
            }
          }
        };
        drawNetSide(pitchX - goalDepth, pitchX, leftColor);
        drawNetSide(pitchX + pitchWidth, pitchX + pitchWidth + goalDepth, rightColor);
        ctx.restore();
      }

      if (settings.crowdEnabled !== false) {
        // Stadium stands & spectators along top and bottom sidelines
        ctx.save();
        const standTopY = Math.max(8, pitchY - 24);
        const standBotY = Math.min(stadium.canvasHeight - 8, pitchY + pitchHeight + 24);
        const fanPalette = ['#ef4444', '#3b82f6', '#f8fafc', '#facc15', '#22c55e', '#e11d48'];
        const now = performance.now() * 0.004;
        const step = 18;
        for (let x = pitchX + 16, idx = 0; x <= pitchX + pitchWidth - 16; x += step, idx++) {
          const colorTop = fanPalette[idx % fanPalette.length];
          const colorBot = fanPalette[(idx + 3) % fanPalette.length];
          const bobTop = Math.sin(now + idx * 0.9) * 1.4;
          const bobBot = Math.cos(now + idx * 1.1) * 1.4;

          ctx.fillStyle = colorTop;
          ctx.beginPath();
          ctx.arc(x, standTopY + bobTop, 4.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = colorBot;
          ctx.beginPath();
          ctx.arc(x, standBotY + bobBot, 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Subtle stadium floodlight radial vignette
      const grad = ctx.createRadialGradient(cx, cy, pitchHeight * 0.25, cx, cy, pitchWidth * 0.68);
      grad.addColorStop(0, isNight || isArena ? 'rgba(110, 231, 183, 0.09)' : 'rgba(255, 255, 240, 0.08)');
      grad.addColorStop(1, isNight || isArena ? 'rgba(0, 0, 0, 0.42)' : 'rgba(0, 0, 0, 0.18)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, stadium.canvasWidth, stadium.canvasHeight);
    }

    // Subtle shaded goal interiors
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(pitchX - goalDepth, cy - goalHalfHeight, goalDepth, goalHalfHeight * 2);
    ctx.fillRect(pitchX + pitchWidth, cy - goalHalfHeight, goalDepth, goalHalfHeight * 2);

    // Center circle and kickoff spot
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, stadium.centerCircleRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Goal mouth dashed trigger line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(pitchX, cy - goalHalfHeight);
    ctx.lineTo(pitchX, cy + goalHalfHeight);
    ctx.moveTo(pitchX + pitchWidth, cy - goalHalfHeight);
    ctx.lineTo(pitchX + pitchWidth, cy + goalHalfHeight);
    ctx.stroke();
    ctx.restore();

    // Field boundary & center lines (haxball clean white) + rounded goal nets
    for (let i = 0; i < stadium.segments.length; i++) {
      const seg = stadium.segments[i];
      // Skip rectangular goal net segments so we draw HaxBall curved nets cleanly
      if (seg.mask === 'both' && seg.color === '#000000') continue;
      ctx.save();
      ctx.globalAlpha = seg.alpha * 0.72;
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = seg.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
      ctx.restore();
    }

    // Smooth HaxBall rounded goal nets
    const rNet = Math.min(12, goalDepth * 0.65);
    const netStyle = settings.goalNetStyle || 'classic';
    const drawGoalNet = (gx: number, isRight: boolean) => {
      const dir = isRight ? 1 : -1;
      const backX = gx + dir * goalDepth;
      const yTop = cy - goalHalfHeight;
      const yBot = cy + goalHalfHeight;
      ctx.save();
      ctx.strokeStyle =
        netStyle === 'team' ? (isRight ? '#3b82f6' : '#ef4444') :
        netStyle === 'neon' ? (isRight ? '#e879f9' : '#22d3ee') :
        netStyle === 'gold' ? '#facc15' :
        '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(gx, yTop);
      ctx.lineTo(backX - dir * rNet, yTop);
      ctx.quadraticCurveTo(backX, yTop, backX, yTop + rNet);
      ctx.lineTo(backX, yBot - rNet);
      ctx.quadraticCurveTo(backX, yBot, backX - dir * rNet, yBot);
      ctx.lineTo(gx, yBot);
      ctx.stroke();
      ctx.restore();
    };
    drawGoalNet(pitchX, false);
    drawGoalNet(pitchX + pitchWidth, true);

    // Goalposts (independent goalPostStyle)
    const postStyle = settings.goalPostStyle || 'classic';
    for (let i = 0; i < stadium.posts.length; i++) {
      const post = stadium.posts[i];
      const isHome = post.x <= cx;
      ctx.beginPath();
      ctx.arc(post.x, post.y, post.radius, 0, Math.PI * 2);
      ctx.fillStyle =
        postStyle === 'white' ? '#f8fafc' :
        postStyle === 'team' ? (isHome ? '#fca5a5' : '#93c5fd') :
        postStyle === 'neon' ? (isHome ? '#22d3ee' : '#e879f9') :
        postStyle === 'gold' ? '#facc15' :
        postStyle === 'carbon' ? '#1e293b' :
        (isHome ? '#ffcccc' : '#ccccff');
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle =
        postStyle === 'gold' ? '#b45309' :
        postStyle === 'carbon' ? '#94a3b8' :
        '#000000';
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawDiagonalStripes(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    c1: string,
    c2: string
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = c1;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = c2;
    const stripeW = 46;
    const span = w + h + stripeW * 2;
    for (let d = -h; d < span; d += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d + stripeW, y);
      ctx.lineTo(x + d + stripeW - h, y + h);
      ctx.lineTo(x + d - h, y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  render(
    stadium: StadiumConfig,
    players: PlayerEntity[],
    ball: BallEntity,
    particles: GoalParticle[],
    localPlayerIds: Set<string>,
    settings: GameSettings,
    alpha: number,
    fieldPowerup?: FieldPowerup | null,
    ballFire?: PowerupType | null
  ): void {
    this.ensureConfig(stadium, settings);

    const ctx = this.ctx;
    const scale = this.currentScale;

    // 1. Blit pre-rendered static pitch in one operation
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bgCanvas, 0, 0);

    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // 2. Render particles (if enabled)
    if (settings.particles && !settings.perfBoost && particles.length > 0) {
      for (let i = 0; i < particles.length; i++) {
        const pt = particles[i];
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 2.5 Render Field Powerup Orb
    if (fieldPowerup) {
      const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.14;
      const colorMap: Record<PowerupType, { bg: string; ring: string; icon: string }> = {
        hawk: { bg: 'rgba(250, 204, 21, 0.28)', ring: '#facc15', icon: '🦅' },
        fire: { bg: 'rgba(249, 115, 22, 0.32)', ring: '#f97316', icon: '🔥' },
        speed: { bg: 'rgba(56, 189, 248, 0.30)', ring: '#38bdf8', icon: '⚡' },
        magnet: { bg: 'rgba(192, 132, 252, 0.30)', ring: '#c084fc', icon: '🧲' },
        giant: { bg: 'rgba(74, 222, 128, 0.30)', ring: '#4ade80', icon: '🛡️' }
      };
      const st = colorMap[fieldPowerup.type];
      ctx.save();
      ctx.fillStyle = st.bg;
      ctx.beginPath();
      ctx.arc(fieldPowerup.x, fieldPowerup.y, 20 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = st.ring;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fieldPowerup.x, fieldPowerup.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '16px "Segoe UI Emoji", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.icon, fieldPowerup.x, fieldPowerup.y + 1);
      ctx.restore();
    }

    // 3. Render players
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.team === 'spec') continue;

      const rx = p.prevX + (p.x - p.prevX) * alpha;
      const ry = p.prevY + (p.y - p.prevY) * alpha;
      const isLocal = localPlayerIds.has(p.id);
      const kickActive = settings.kickFlash && (p.kickArmed || p.kickFlashTicks > 0);

      if (settings.shadows) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.arc(rx + 2, ry + 3, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (p.powerup) {
        const auraColors: Record<PowerupType, string> = {
          hawk: '#facc15',
          fire: '#f97316',
          speed: '#38bdf8',
          magnet: '#c084fc',
          giant: '#4ade80'
        };
        ctx.save();
        ctx.strokeStyle = auraColors[p.powerup];
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(rx, ry, p.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (isLocal) {
        ctx.strokeStyle = kickActive ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(rx, ry, p.radius + 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = p.customColor || (p.team === 'red' ? '#ea4141' : '#2d7eff');
      ctx.beginPath();
      ctx.arc(rx, ry, p.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 2.2;
      ctx.strokeStyle = kickActive ? '#ffffff' : '#111111';
      ctx.stroke();

      // Upright avatar
      if (settings.showPlayerAvatars !== false) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.avatar, rx, ry + 0.5);
      }

      // Nickname below players (with [BOT] indicator if AI)
      if (!isLocal || players.length > 2 || p.isBot) {
        const label = p.isBot ? '[BOT] ' + p.name : p.name;
        ctx.font = '600 12px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillText(label, rx + 1, ry + p.radius + 11);
        ctx.fillStyle = p.isBot ? '#fde68a' : '#ffffff';
        ctx.fillText(label, rx, ry + p.radius + 10);
      }
    }

    // 4. Render ball (+ optional motion trail & 3D soccer ball style)
    const bx = ball.prevX + (ball.x - ball.prevX) * alpha;
    const by = ball.prevY + (ball.y - ball.prevY) * alpha;

    if (settings.ballTrail && !settings.perfBoost) {
      const spd = Math.hypot(ball.vx, ball.vy);
      if (spd > 2.4) {
        this.trailPoints.push({ x: bx, y: by });
        if (this.trailPoints.length > 10) this.trailPoints.shift();
      } else if (this.trailPoints.length > 0) {
        this.trailPoints.shift();
      }
      const trailRgb =
        settings.ballStyle === 'fire' ? '249, 115, 22' :
        settings.ballStyle === 'neon' ? '34, 211, 238' :
        settings.ballStyle === 'gold' ? '250, 204, 21' :
        settings.ballStyle === 'champions' ? '96, 165, 250' :
        settings.ballStyle === 'tennis' ? '163, 230, 53' :
        settings.ballStyle === 'beach' ? '244, 114, 182' :
        '255, 255, 255';
      for (let i = 0; i < this.trailPoints.length; i++) {
        const tp = this.trailPoints[i];
        const ratio = (i + 1) / (this.trailPoints.length + 1);
        ctx.fillStyle = `rgba(${trailRgb}, ${(ratio * 0.34).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, ball.radius * (0.45 + ratio * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.trailPoints.length > 0) {
      this.trailPoints = [];
    }

    if (settings.shadows) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.arc(bx + 2, by + 3, ball.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (ballFire) {
      ctx.save();
      ctx.fillStyle = ballFire === 'hawk' ? 'rgba(250, 204, 21, 0.42)' : 'rgba(239, 68, 68, 0.45)';
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius + 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const spinAngle = (bx + by) * 0.08;
    const style = settings.ballStyle;

    if (style === 'soccer') {
      const bGrad = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, ball.radius);
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius, 0, Math.PI * 2);
      ctx.fill();

      // Rotating classic soccer patches
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(bx, by, 2.8, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 5; k++) {
        const a = spinAngle + (k * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(bx + Math.cos(a) * (ball.radius * 0.62), by + Math.sin(a) * (ball.radius * 0.62), 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === 'champions') {
      const bGrad = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, ball.radius);
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(1, '#dbeafe');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1d4ed8';
      for (let k = 0; k < 5; k++) {
        const a = spinAngle + (k * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(bx + Math.cos(a) * (ball.radius * 0.54), by + Math.sin(a) * (ball.radius * 0.54), 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === 'fire') {
      const fGrad = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, ball.radius);
      fGrad.addColorStop(0, '#fef08a');
      fGrad.addColorStop(0.55, '#f97316');
      fGrad.addColorStop(1, '#dc2626');
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 'neon') {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius * 0.58, spinAngle, spinAngle + Math.PI * 1.3);
      ctx.stroke();
    } else if (style === 'gold') {
      const gGrad = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, ball.radius);
      gGrad.addColorStop(0, '#fef9c3');
      gGrad.addColorStop(0.5, '#facc15');
      gGrad.addColorStop(1, '#b45309');
      ctx.fillStyle = gGrad;
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 'beach') {
      const colors = ['#ef4444', '#facc15', '#3b82f6', '#ffffff', '#22c55e', '#f97316'];
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = colors[k];
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.arc(bx, by, ball.radius, spinAngle + (k * Math.PI) / 3, spinAngle + ((k + 1) * Math.PI) / 3);
        ctx.closePath();
        ctx.fill();
      }
    } else if (style === 'tennis') {
      ctx.fillStyle = '#bef264';
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius * 0.65, spinAngle, spinAngle + Math.PI * 0.9);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111111';
    ctx.stroke();
  }
}
