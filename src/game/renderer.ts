import {
  BallEntity,
  GameSettings,
  GoalParticle,
  PlayerEntity,
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
    const dpr = settings.resolution === 2 ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const key = [
      stadium.id,
      settings.grassDetail,
      dpr,
      settings.antialias ? 1 : 0,
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
    this.canvas.style.width = stadium.canvasWidth + 'px';
    this.canvas.style.height = stadium.canvasHeight + 'px';

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

    // Outer stadium apron matching open-hax-master (1) #5F7B48
    ctx.fillStyle = '#5F7B48';
    ctx.fillRect(0, 0, stadium.canvasWidth, stadium.canvasHeight);

    const { pitchX, pitchY, pitchWidth, pitchHeight, goalHalfHeight, goalDepth } = stadium;
    const cx = pitchX + pitchWidth / 2;
    const cy = pitchY + pitchHeight / 2;
    const isNight = settings.grassDetail === 'night_neon';
    const isHd = settings.grassDetail === 'hd_stadium' || isNight;

    // Pitch surface
    if (isNight) {
      this.drawStripes(ctx, pitchX, pitchY, pitchWidth, pitchHeight, '#1b3b2b', '#204533');
    } else if (settings.grassDetail === 'hd_stadium') {
      this.drawStripes(ctx, pitchX, pitchY, pitchWidth, pitchHeight, '#4d7c3f', '#578a47');
    } else if (settings.grassDetail === 'standard' && this.grassImage) {
      const pattern = ctx.createPattern(this.grassImage, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(pitchX, pitchY, pitchWidth, pitchHeight);
      } else {
        this.drawStripes(ctx, pitchX, pitchY, pitchWidth, pitchHeight, '#5c8044', '#658a4b');
      }
    } else {
      this.drawStripes(ctx, pitchX, pitchY, pitchWidth, pitchHeight, '#5c8044', '#658a4b');
    }

    // HD Stadium extras: penalty boxes, corner arcs, net mesh, and floodlight vignette (cached once!)
    if (isHd) {
      const boxW = Math.round(pitchWidth * 0.14);
      const boxH = Math.round(goalHalfHeight * 2.15);
      ctx.strokeStyle = isNight ? 'rgba(167, 243, 208, 0.55)' : 'rgba(255, 255, 255, 0.52)';
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

      // Goal net crosshatch mesh
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      for (let y = cy - goalHalfHeight + 8; y < cy + goalHalfHeight; y += 10) {
        ctx.beginPath();
        ctx.moveTo(pitchX - goalDepth, y);
        ctx.lineTo(pitchX, y);
        ctx.moveTo(pitchX + pitchWidth, y);
        ctx.lineTo(pitchX + pitchWidth + goalDepth, y);
        ctx.stroke();
      }
      ctx.restore();

      // Subtle stadium floodlight radial vignette
      const grad = ctx.createRadialGradient(cx, cy, pitchHeight * 0.25, cx, cy, pitchWidth * 0.68);
      grad.addColorStop(0, isNight ? 'rgba(110, 231, 183, 0.08)' : 'rgba(255, 255, 240, 0.08)');
      grad.addColorStop(1, isNight ? 'rgba(0, 0, 0, 0.42)' : 'rgba(0, 0, 0, 0.18)');
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

    // Field lines and goal nets
    for (let i = 0; i < stadium.segments.length; i++) {
      const seg = stadium.segments[i];
      ctx.save();
      ctx.globalAlpha = seg.alpha;
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = seg.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
      ctx.restore();
    }

    // Goalposts
    for (let i = 0; i < stadium.posts.length; i++) {
      const post = stadium.posts[i];
      ctx.beginPath();
      ctx.arc(post.x, post.y, post.radius, 0, Math.PI * 2);
      ctx.fillStyle = post.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#111111';
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawStripes(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    c1: string,
    c2: string
  ): void {
    const count = 12;
    const sw = w / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      ctx.fillRect(x + i * sw, y, sw + 0.5, h);
    }
  }

  render(
    stadium: StadiumConfig,
    players: PlayerEntity[],
    ball: BallEntity,
    particles: GoalParticle[],
    localPlayerIds: Set<string>,
    settings: GameSettings,
    alpha: number
  ): void {
    this.ensureConfig(stadium, settings);

    const ctx = this.ctx;
    const scale = this.currentScale;

    // 1. Blit pre-rendered static pitch in one operation
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bgCanvas, 0, 0);

    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // 2. Render particles (if enabled)
    if (settings.particles && particles.length > 0) {
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

      if (isLocal) {
        ctx.strokeStyle = kickActive ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(rx, ry, p.radius + 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = p.team === 'red' ? '#ea4141' : '#2d7eff';
      ctx.beginPath();
      ctx.arc(rx, ry, p.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 2.2;
      ctx.strokeStyle = kickActive ? '#ffffff' : '#111111';
      ctx.stroke();

      // Upright avatar
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.avatar, rx, ry + 0.5);

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

    if (settings.ballTrail) {
      const spd = Math.hypot(ball.vx, ball.vy);
      if (spd > 2.4) {
        this.trailPoints.push({ x: bx, y: by });
        if (this.trailPoints.length > 10) this.trailPoints.shift();
      } else if (this.trailPoints.length > 0) {
        this.trailPoints.shift();
      }
      for (let i = 0; i < this.trailPoints.length; i++) {
        const tp = this.trailPoints[i];
        const ratio = (i + 1) / (this.trailPoints.length + 1);
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (ratio * 0.28).toFixed(2) + ')';
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

    if (settings.ballStyle === 'soccer') {
      const bGrad = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, ball.radius);
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bx, by, ball.radius, 0, Math.PI * 2);
      ctx.fill();

      // Classic soccer pentagon patches
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
      ctx.fill();
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
