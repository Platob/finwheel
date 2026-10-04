// Synthesized sounds of Mystery Gifts (short and soft; the overlay adds its own ticks and win bells).
import type { SoundBoard } from '../audio';

/** White noise, made once per audio context. */
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: AudioContext): AudioBuffer {
  let buffer = noises.get(ctx);
  if (!buffer) {
    const length = Math.floor(ctx.sampleRate * 0.5);
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(ctx, buffer);
  }
  return buffer;
}

/** Gain node with a quick attack and an exponential release, silent again at `t + length`. */
function envelope(ctx: AudioContext, t: number, level: number, attack: number, length: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  return gain;
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  from: number,
  to: number,
  level: number,
  length: number,
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + length * 0.8);
  osc.connect(envelope(ctx, t, level, 0.005, length)).connect(out);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** Little "boing" as a box hops. */
export function hopSound(sound: SoundBoard, pitch = 1): void {
  sound.voice((ctx, out, t) => {
    tone(ctx, out, t, 'sine', 260 * pitch, 520 * pitch, 0.1, 0.16);
    tone(ctx, out, t + 0.02, 'triangle', 520 * pitch, 900 * pitch, 0.02, 0.12);
  });
}

/** Airy whoosh of a box flying over another (`seconds` long, `speed` 0–1). */
export function whooshSound(sound: SoundBoard, seconds: number, speed: number): void {
  sound.voice((ctx, out, t) => {
    const length = Math.max(0.12, Math.min(0.45, seconds));
    const source = ctx.createBufferSource();
    source.buffer = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    const top = 1600 + speed * 1400;
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(top, t + length * 0.5);
    filter.frequency.exponentialRampToValueAtTime(700, t + length);
    source
      .connect(filter)
      .connect(envelope(ctx, t, 0.22 + speed * 0.1, length * 0.4, length))
      .connect(out);
    source.start(t);
    source.stop(t + length + 0.05);
  });
}

/** Snare drumroll building up for `seconds`, ending on a soft cymbal-less hit. */
export function drumrollSound(sound: SoundBoard, seconds: number): void {
  sound.voice((ctx, out, t) => {
    const buffer = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 900;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.25, t);
    bus.gain.linearRampToValueAtTime(1, t + seconds);
    filter.connect(bus).connect(out);
    const length = Math.max(0.2, seconds);
    // Strokes get closer together and louder.
    let at = 0;
    let i = 0;
    while (at < length && i < 120) {
      const k = at / length;
      const level = 0.08 + 0.1 * k + (i % 2 ? 0 : 0.02);
      const hit = ctx.createBufferSource();
      hit.buffer = buffer;
      hit.connect(envelope(ctx, t + at, level, 0.002, 0.05)).connect(filter);
      hit.start(t + at, Math.random() * 0.3);
      hit.stop(t + at + 0.06);
      at += 0.07 - 0.032 * k;
      i++;
    }
  });
}

/** Cork-like pop of a lid, with a sparkle of chimes (`strength` 0–1; the won box pops loudest). */
export function popSound(sound: SoundBoard, strength = 1): void {
  sound.voice((ctx, out, t) => {
    tone(ctx, out, t, 'sine', 900, 140, 0.22 * strength, 0.12);
    const source = ctx.createBufferSource();
    source.buffer = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2200;
    filter.Q.value = 0.9;
    source
      .connect(filter)
      .connect(envelope(ctx, t, 0.16 * strength, 0.002, 0.06))
      .connect(out);
    source.start(t);
    source.stop(t + 0.08);
    const notes = strength >= 1 ? [2093, 2637, 3136, 4186, 3520] : [1568, 2093];
    notes.forEach((frequency, i) => {
      const at = t + 0.05 + i * 0.045;
      tone(ctx, out, at, 'sine', frequency, frequency, 0.045 * strength, 0.35);
      tone(ctx, out, at, 'sine', frequency * 2.76, frequency * 2.76, 0.012 * strength, 0.2);
    });
  });
}

/** Deflated little "womp" as a missed prize peeks out. */
export function peekSound(sound: SoundBoard): void {
  sound.voice((ctx, out, t) => {
    tone(ctx, out, t, 'sine', 700, 200, 0.08, 0.1);
    tone(ctx, out, t + 0.06, 'triangle', 330, 250, 0.03, 0.22);
  });
}
