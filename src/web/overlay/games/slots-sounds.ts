// Synthesized sounds of Loser Slots (short and soft; the overlay adds its own ticks and win bells).
import type { SoundBoard } from '../audio';

/** Gain node with a quick attack and an exponential release, silent again at `t + length`. */
function envelope(ctx: AudioContext, t: number, level: number, attack: number, length: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  return gain;
}

/** A short band-passed square "click" sweeping down from `from` Hz. */
function click(ctx: AudioContext, out: AudioNode, t: number, from: number, to: number, level: number) {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + 0.025);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400;
  osc
    .connect(filter)
    .connect(envelope(ctx, t, level, 0.002, 0.03))
    .connect(out);
  osc.start(t);
  osc.stop(t + 0.04);
}

/** Ratchet clack as the lever hits the bottom. */
export function leverSound(sound: SoundBoard): void {
  sound.voice((ctx, out, t) => {
    [0, 0.035, 0.07].forEach((delay, i) => click(ctx, out, t + delay, 900 - i * 180, 220, 0.09));
  });
}

/** Heavy "clunk" as a reel locks in place (`strength` 0–1). */
export function clunk(sound: SoundBoard, strength: number): void {
  sound.voice((ctx, out, t) => {
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(170, t);
    thump.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    thump.connect(envelope(ctx, t, 0.42 * strength, 0.006, 0.17)).connect(out);
    thump.start(t);
    thump.stop(t + 0.2);
    click(ctx, out, t, 2000, 500, 0.07 * strength);
  });
}

/** Rising hum while the last reel crawls toward the payline (`seconds` long). */
export function teaseSound(sound: SoundBoard, seconds: number): void {
  sound.voice((ctx, out, t) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + seconds);
    osc.connect(envelope(ctx, t, 0.05, Math.min(0.15, seconds / 2), seconds + 0.05)).connect(out);
    osc.start(t);
    osc.stop(t + seconds + 0.1);
  });
}

/** Short coin jingle once the triple is in. */
export function jingle(sound: SoundBoard): void {
  sound.voice((ctx, out, t) => {
    [2637, 3136, 2794, 3520, 4186].forEach((frequency, i) => {
      const at = t + i * 0.055;
      for (const [ratio, level] of [
        [1, 0.08],
        [2.76, 0.028],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency * ratio;
        osc.connect(envelope(ctx, at, level, 0.004, 0.28)).connect(out);
        osc.start(at);
        osc.stop(at + 0.3);
      }
    });
  });
}
