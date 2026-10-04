import type { SoundBoard } from '../audio';
import type { ClawEvent } from './claw-math';

/** White noise, made once per audio context. */
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: BaseAudioContext): AudioBuffer {
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

/** Gain node with a quick attack and an exponential release, ending at `t + length`. */
function envelope(ctx: AudioContext, t: number, level: number, attack: number, length: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  return gain;
}

function noiseBurst(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  {
    type,
    frequency,
    q = 1,
    level,
    length,
  }: { type: BiquadFilterType; frequency: number; q?: number; level: number; length: number },
) {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  source
    .connect(filter)
    .connect(envelope(ctx, t, level, 0.004, length))
    .connect(out);
  source.start(t);
  source.stop(t + length + 0.02);
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  {
    type = 'sine',
    from,
    to = from,
    level,
    length,
    attack = 0.005,
  }: {
    type?: OscillatorType;
    from: number;
    to?: number;
    level: number;
    length: number;
    attack?: number;
  },
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + length * 0.8);
  osc.connect(envelope(ctx, t, level, attack, length)).connect(out);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** Electric gantry motor: a buzzy hum that spins up, holds and winds down (`length` in seconds). */
function whirr(ctx: AudioContext, out: AudioNode, t: number, length: number, pitch: number) {
  const len = Math.max(0.12, Math.min(length, 4));
  const base = 92 * pitch;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900 * pitch;
  filter.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.045, t + 0.06);
  gain.gain.setValueAtTime(0.045, t + len - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  filter.connect(gain).connect(out);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 9;
  const depth = ctx.createGain();
  depth.gain.value = base * 0.025;
  wobble.connect(depth);
  for (const [type, ratio] of [
    ['sawtooth', 1],
    ['square', 2.01],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(base * ratio * 0.7, t);
    osc.frequency.linearRampToValueAtTime(base * ratio, t + Math.min(0.15, len / 3));
    osc.frequency.setValueAtTime(base * ratio, t + len - 0.1);
    osc.frequency.linearRampToValueAtTime(base * ratio * 0.75, t + len);
    depth.connect(osc.frequency);
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }
  wobble.start(t);
  wobble.stop(t + len + 0.02);
}

/** Plays the claw machine's sound for `event` (does nothing while sound is off). */
export function playClawSound(sound: SoundBoard, event: ClawEvent): void {
  sound.voice((ctx, out, t) => {
    switch (event.sound) {
      case 'whirr':
        whirr(ctx, out, t, (event.duration ?? 500) / 1000, event.pitch ?? 1);
        break;
      case 'button':
        tone(ctx, out, t, { type: 'square', from: 1600, to: 900, level: 0.05, length: 0.05 });
        noiseBurst(ctx, out, t, { type: 'highpass', frequency: 3000, level: 0.12, length: 0.03 });
        break;
      case 'clank':
        // Metal prongs biting shut: a click and a few inharmonic partials ringing out.
        noiseBurst(ctx, out, t, { type: 'bandpass', frequency: 2600, q: 2, level: 0.3, length: 0.05 });
        for (const [frequency, level, length] of [
          [523, 0.07, 0.35],
          [1187, 0.05, 0.25],
          [1811, 0.035, 0.2],
          [2693, 0.02, 0.15],
        ] as const) {
          tone(ctx, out, t, { type: 'triangle', from: frequency, level, length, attack: 0.002 });
        }
        break;
      case 'slip':
        // A squeaky slide down, then a nervous rattle.
        tone(ctx, out, t, { type: 'triangle', from: 1500, to: 620, level: 0.06, length: 0.2 });
        noiseBurst(ctx, out, t + 0.04, {
          type: 'bandpass',
          frequency: 1800,
          q: 4,
          level: 0.08,
          length: 0.12,
        });
        break;
      case 'release':
        tone(ctx, out, t, { type: 'square', from: 700, to: 1400, level: 0.035, length: 0.06 });
        noiseBurst(ctx, out, t, { type: 'bandpass', frequency: 3200, q: 3, level: 0.12, length: 0.04 });
        break;
      case 'thud':
        tone(ctx, out, t, { from: 150, to: 55, level: 0.3, length: 0.22, attack: 0.003 });
        noiseBurst(ctx, out, t, { type: 'lowpass', frequency: 500, level: 0.22, length: 0.14 });
        break;
      case 'door':
        tone(ctx, out, t, { from: 260, to: 140, level: 0.12, length: 0.12, attack: 0.003 });
        noiseBurst(ctx, out, t, { type: 'bandpass', frequency: 1200, q: 2, level: 0.1, length: 0.06 });
        break;
      case 'pop':
        // Capsule popping open: a bright pop and a little sparkle.
        tone(ctx, out, t, { from: 340, to: 1300, level: 0.16, length: 0.09, attack: 0.002 });
        noiseBurst(ctx, out, t, { type: 'highpass', frequency: 2500, level: 0.16, length: 0.06 });
        [2093, 2637, 3136].forEach((frequency, i) =>
          tone(ctx, out, t + 0.05 + i * 0.045, {
            from: frequency,
            level: 0.035,
            length: 0.25,
            attack: 0.003,
          }),
        );
        break;
    }
  });
}
