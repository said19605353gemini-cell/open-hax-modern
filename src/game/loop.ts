import { GameSettings, PerfTelemetry } from '../types';

const FIXED_STEP_MS = 1000 / 60;

export class GameLoop {
  private rafId: number | null = null;
  private highResTimer: number | null = null;
  private msgChannel: MessageChannel | null = null;
  private bgTimer: number | null = null;
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
    this.scheduleNext(0);
    if (this.bgTimer !== null) clearInterval(this.bgTimer);
    this.bgTimer = window.setInterval(() => {
      if (this.running && document.hidden) {
        const hz = Math.max(30, Math.min(500, Number(this.getSettings().physicsHz) || 60));
        const steps = Math.max(1, Math.min(8, Math.round(hz / 60)));
        for (let i = 0; i < steps; i++) this.onStep();
      }
    }, FIXED_STEP_MS);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.highResTimer !== null) {
      window.clearTimeout(this.highResTimer);
      this.highResTimer = null;
    }
    if (this.msgChannel) {
      this.msgChannel.port1.onmessage = null;
      this.msgChannel.port1.close();
      this.msgChannel.port2.close();
      this.msgChannel = null;
    }
    if (this.bgTimer !== null) {
      clearInterval(this.bgTimer);
      this.bgTimer = null;
    }
  }

  private scheduleNext(fpsLimit: number): void {
    if (!this.running) return;
    if (document.hidden) {
      this.rafId = window.requestAnimationFrame(this.frame);
      return;
    }
    const target = fpsLimit === 0 ? 240 : Math.min(500, fpsLimit);
    const interval = 1000 / target;
    const remaining = this.nextFrameTime > 0 ? this.nextFrameTime - performance.now() : 0;
    if (remaining > 3) {
      this.highResTimer = window.setTimeout(() => {
        this.highResTimer = null;
        if (this.running) this.frame(performance.now());
      }, Math.max(1, Math.floor(remaining - 2)));
      return;
    }
    if (!this.msgChannel) {
      this.msgChannel = new MessageChannel();
      this.msgChannel.port1.onmessage = () => {
        if (this.running) this.frame(performance.now());
      };
    }
    if (this.nextFrameTime === 0) {
      this.nextFrameTime = performance.now() + interval;
    }
    this.msgChannel.port2.postMessage(null);
  }

  private frame = (rafTime: number): void => {
    if (!this.running) return;

    const settings = this.getSettings();
    const userFps = Number(settings.fpsLimit) || 0;
    const roomFps = Number(settings.roomMaxFps) || 0;
    const fpsLimit = userFps > 0 && roomFps > 0 ? Math.min(userFps, roomFps) : userFps || roomFps;
    const physicsHz = Math.max(30, Math.min(500, Number(settings.physicsHz) || 60));
    const stepMs = 1000 / physicsHz;
    const maxSteps = Math.max(3, Math.ceil(physicsHz / 20));

    if (fpsLimit !== this.lastFpsLimit) {
      this.nextFrameTime = 0;
      this.accumulator = 0;
      this.lastFpsLimit = fpsLimit;
    }

    if (this.telemetryStart === 0) {
      this.telemetryStart = rafTime;
    }

    // 1. Frame rate gate (VSync <=65 via rAF, >65 or Unlimited via high-res scheduler)
    const effectiveCap = fpsLimit === 0 ? 240 : fpsLimit;
    if (effectiveCap > 0) {
      const frameInterval = 1000 / effectiveCap;
      const tolerance = Math.min(1.2, frameInterval * 0.12);

      if (this.nextFrameTime === 0) {
        this.nextFrameTime = rafTime + frameInterval;
      } else if (rafTime + tolerance < this.nextFrameTime) {
        this.scheduleNext(fpsLimit);
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
    if (fpsLimit === physicsHz) {
      // Exact 1:1 deterministic step per frame when display FPS matches physics Hz
      this.onStep();
      alpha = 1;
    } else {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= stepMs && steps < maxSteps) {
        this.onStep();
        this.accumulator -= stepMs;
        steps++;
      }
      if (steps >= maxSteps && this.accumulator > stepMs) {
        this.accumulator = 0;
      }
      alpha = fpsLimit === 0 ? Math.max(0, Math.min(1, this.accumulator / stepMs)) : 1;
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
      this.scheduleNext(fpsLimit);
    }
  };
}
