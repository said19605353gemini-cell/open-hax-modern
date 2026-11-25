export type SoundKey = 'kick' | 'goal1' | 'goal2' | 'start' | 'end' | 'oh';

const SOUND_URLS: Record<SoundKey, string> = {
  kick: './sounds/kick.mp3',
  goal1: './sounds/goal-1.mp3',
  goal2: './sounds/goal-2.mp3',
  start: './sounds/game-start.mp3',
  end: './sounds/game-end.mp3',
  oh: './sounds/people-oh.mp3'
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundKey, AudioBuffer>();
  private loading = false;
  private enabled = true;
  private volume = 0.6;
  private lastKickMs = 0;

  setConfig(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
  }

  unlockAndPreload(): void {
    if (this.loading) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    this.loading = true;
    try {
      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch {
      return;
    }

    (Object.keys(SOUND_URLS) as SoundKey[]).forEach((key) => {
      fetch(SOUND_URLS[key])
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((buf) => (buf && this.ctx ? this.ctx.decodeAudioData(buf) : null))
        .then((decoded) => {
          if (decoded) {
            this.buffers.set(key, decoded);
          }
        })
        .catch(() => {
          // Ignore individual sound decode failure
        });
    });
  }

  play(key: SoundKey, gainScale = 1): void {
    if (!this.enabled || this.volume <= 0 || !this.ctx) {
      return;
    }
    if (key === 'kick') {
      const now = performance.now();
      if (now - this.lastKickMs < 75) {
        return;
      }
      this.lastKickMs = now;
    }

    const buffer = this.buffers.get(key);
    if (!buffer) {
      return;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    try {
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = buffer;
      gain.gain.value = this.volume * gainScale;
      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(0);
    } catch {
      // Ignore playback error
    }
  }

  playKick(): void {
    this.play('kick', 0.75);
  }

  playGoal(): void {
    this.play(Math.random() > 0.5 ? 'goal2' : 'goal1', 0.85);
  }

  playStart(): void {
    this.play('start', 0.75);
  }
}
