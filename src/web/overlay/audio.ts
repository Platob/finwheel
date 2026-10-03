import type { Tier } from '../../shared/schema';

const NOTE = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);
// C major-seventh flourish, climbing higher for rarer tiers.
const ARPEGGIOS: Record<Tier, number[]> = {
  common: [3, 7, 10, 15],
  rare: [3, 7, 10, 14, 15],
  epic: [3, 7, 10, 14, 15, 19, 22],
  legendary: [-2, 3, 7, 10, 14, 15, 19, 22, 27],
  jackpot: [-9, -2, 3, 7, 10, 14, 15, 19, 22, 27, 31, 34],
};

/** Synthesized casino sounds (no audio files needed). */
export class SoundBoard {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  private volume = 0.6;
  private lastTick = 0;

  constructor() {
    // Regular browsers need a user gesture before audio can start; OBS does not.
    const unlock = () => void this.context()?.resume();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = volume;
    if (this.master) this.master.gain.value = volume;
  }

  /** Short mechanical click as a peg hits the pointer. */
  tick(speed: number): void {
    const ctx = this.context();
    if (!ctx || !this.master || !this.noise) return;
    const now = ctx.currentTime;
    if (now - this.lastTick < 0.035) return;
    this.lastTick = now;

    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400 + speed * 1200;
    filter.Q.value = 3;
    const gain = ctx.createGain();
    const level = 0.35 + (1 - speed) * 0.35;
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 0.04);

    const knock = ctx.createOscillator();
    knock.type = 'triangle';
    knock.frequency.setValueAtTime(900, now);
    knock.frequency.exponentialRampToValueAtTime(300, now + 0.03);
    const knockGain = ctx.createGain();
    knockGain.gain.setValueAtTime(level * 0.35, now);
    knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    knock.connect(knockGain).connect(this.master);
    knock.start(now);
    knock.stop(now + 0.05);
  }

  /** Airy whoosh when the wheel is released. */
  whoosh(): void {
    const ctx = this.context();
    if (!ctx || !this.master || !this.noise) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.35);
    filter.frequency.exponentialRampToValueAtTime(500, now + 0.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 1);
  }

  /** Bell arpeggio; longer and brighter for rarer tiers. */
  win(tier: Tier): void {
    const ctx = this.context();
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + 0.02;
    const notes = ARPEGGIOS[tier];
    const step = tier === 'jackpot' ? 0.07 : 0.085;

    const echo = ctx.createDelay();
    echo.delayTime.value = 0.19;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    echo.connect(feedback).connect(echo);
    echo.connect(this.master);

    notes.forEach((semitone, i) => {
      const t = start + i * step;
      const frequency = NOTE(semitone + 12);
      for (const [type, ratio, level] of [
        ['sine', 1, 0.22],
        ['triangle', 2, 0.06],
        ['sine', 3.01, 0.03],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = frequency * ratio;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(level, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        osc.connect(gain);
        gain.connect(this.master!);
        gain.connect(echo);
        osc.start(t);
        osc.stop(t + 1.5);
      }
    });
  }

  /** Descending "wah-wah" for a bankrupt slice. */
  bust(): void {
    const ctx = this.context();
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + 0.02;
    [0, -1, -2, -3.5].forEach((semitone, i) => {
      const t = start + i * 0.32;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(NOTE(semitone - 5), t);
      if (i === 3) osc.frequency.linearRampToValueAtTime(NOTE(semitone - 7), t + 0.8);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 0.9 : 0.3));
      osc.connect(filter).connect(gain).connect(this.master!);
      osc.start(t);
      osc.stop(t + 1);
    });
  }

  private context(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 0.05);
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }
}
