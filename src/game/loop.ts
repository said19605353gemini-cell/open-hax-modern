import { GameSettings, PerfTelemetry } from '../types';

const FIXED_STEP_MS = 1000 / 60;

export class GameLoop {
  private rafId: number | null = null;
  private running = false;
  private lastTickTime = 0;
  private nextFrameTime = 0;
  private accumulator = 0;
  private lastFpsLimit = -1;

  private renderedFrames = 0;
  private workMsAccum = 0;
  private telemetryStart = 0;

  private getSettings: () => GameSettings;
  private onStep: () => void;
  private onRender: (alpha: number) => void;
  private onTelemetry: (telemetry: PerfTelemetry) => void;

  constructor(
    getSettings: () => GameSettings,
    onStep: () => void,
    onRender: (alpha: number) => void,
    onTelemetry: (telemetry: PerfTelemetry) => void
  ) {
    this.getSettings = getSettings;
    this.onStep = onStep;
    this.onRender = onRender;
    this.onTelemetry = onTelemetry;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTickTime = 0;
    this.nextFrameTime = 0;
    this.accumulator = 0;
    this.renderedFrames = 0;
    this.workMsAccum = 0;
    this.telemetryStart = 0;
    this.rafId = window.requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private frame = (rafTime: number): void => {
    if (!this.running) return;

    const settings = this.getSettings();
    const fpsLimit = Number(settings.fpsLimit) || 0;

    if (fpsLimit !== this.lastFpsLimit) {
      this.nextFrameTime = 0;
      this.accumulator = 0;
      this.lastFpsLimit = fpsLimit;
    }

    if (this.telemetryStart === 0) {
      this.telemetryStart = rafTime;
    }

    // 1. Frame rate gate when FPS is capped (default 60 FPS)
    if (fpsLimit > 0) {
      const frameInterval = 1000 / fpsLimit;
      const tolerance = Math.min(2.0, frameInterval * 0.12);

      if (this.nextFrameTime === 0) {
        this.nextFrameTime = rafTime + frameInterval;
      } else if (rafTime + tolerance < this.nextFrameTime) {
        this.rafId = window.requestAnimationFrame(this.frame);
        return;
      } else {
        this.nextFrameTime += frameInterval;
        if (this.nextFrameTime <= rafTime) {
          this.nextFrameTime = rafTime + frameInterval;
        }
      }
    }

    const workStart = performance.now();

    if (this.lastTickTime === 0) {
      this.lastTickTime = rafTime;
    }

    const elapsed = Math.min(50, Math.max(0, rafTime - this.lastTickTime));
    this.lastTickTime = rafTime;

    let alpha = 1;
    if (fpsLimit === 60) {
      // Exact 1:1 60Hz deterministic step per frame when locked to 60 FPS
      this.onStep();
      alpha = 1;
    } else {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP_MS && steps < 3) {
        this.onStep();
        this.accumulator -= FIXED_STEP_MS;
        steps++;
      }
      if (steps >= 3 && this.accumulator > FIXED_STEP_MS) {
        this.accumulator = 0;
      }
      alpha = fpsLimit === 0 ? Math.max(0, Math.min(1, this.accumulator / FIXED_STEP_MS)) : 1;
    }

    this.onRender(alpha);

    const workMs = performance.now() - workStart;
    this.renderedFrames++;
    this.workMsAccum += workMs;

    const span = rafTime - this.telemetryStart;
    if (span >= 500) {
      this.onTelemetry({
        fps: Math.round((this.renderedFrames * 1000) / span),
        frameMs: Number((span / this.renderedFrames).toFixed(1)),
        workMs: Number((this.workMsAccum / this.renderedFrames).toFixed(2)),
        pingMs: null,
        targetFps: fpsLimit
      });
      this.renderedFrames = 0;
      this.workMsAccum = 0;
      this.telemetryStart = rafTime;
    }

    if (this.running) {
      this.rafId = window.requestAnimationFrame(this.frame);
    }
  };
}
