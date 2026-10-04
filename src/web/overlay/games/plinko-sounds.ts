import type { SoundBoard } from '../audio';

/** C-major pentatonic ladder (semitones from A4), climbed as the coin goes down. */
const LADDER = [3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29];
const NOTE = (semitones: number) => 440 * 2 ** (semitones / 12);

/** Gain node with a quick attack and an exponential release, ending at `t + length`. */
function envelope(ctx: AudioContext, t: number, level: number, attack: number, length: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  return gain;
}

function bell(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  frequency: number,
  level: number,
  length: number,
) {
  for (const [ratio, share, type] of [
    [1, 1, 'sine'],
    [2.76, 0.18, 'sine'],
    [5.4, 0.06, 'triangle'],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency * ratio;
    osc.connect(envelope(ctx, t, level * share, 0.003, length / ratio ** 0.4)).connect(out);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
}

/** Soft glassy "ping" of a peg hit; higher as the coin goes down (`depth` 0 … 1). */
export function pegPing(sound: SoundBoard, depth: number): void {
  sound.voice((ctx, out, t) => {
    const step = LADDER[Math.min(LADDER.length - 1, Math.round(depth * (LADDER.length - 1)))]!;
    bell(ctx, out, t, NOTE(step), 0.08, 0.22);
  });
}

/** The carriage lets go: a little latch click and a short airy drop. */
export function releaseClick(sound: SoundBoard): void {
  sound.voice((ctx, out, t) => {
    const click = ctx.createOscillator();
    click.type = 'square';
    click.frequency.setValueAtTime(1800, t);
    click.frequency.exponentialRampToValueAtTime(600, t + 0.03);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    click
      .connect(filter)
      .connect(envelope(ctx, t, 0.05, 0.002, 0.05))
      .connect(out);
    click.start(t);
    click.stop(t + 0.07);
    const drop = ctx.createOscillator();
    drop.type = 'sine';
    drop.frequency.setValueAtTime(900, t + 0.02);
    drop.frequency.exponentialRampToValueAtTime(420, t + 0.22);
    drop.connect(envelope(ctx, t + 0.02, 0.05, 0.02, 0.24)).connect(out);
    drop.start(t + 0.02);
    drop.stop(t + 0.3);
  });
}

/** The coin drops into its bin: a soft thud and a bright two-note chime. */
export function landChime(sound: SoundBoard): void {
  sound.voice((ctx, out, t) => {
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(190, t);
    thud.frequency.exponentialRampToValueAtTime(80, t + 0.14);
    thud.connect(envelope(ctx, t, 0.16, 0.004, 0.18)).connect(out);
    thud.start(t);
    thud.stop(t + 0.22);
    bell(ctx, out, t + 0.01, NOTE(15), 0.07, 0.5);
    bell(ctx, out, t + 0.09, NOTE(22), 0.06, 0.65);
  });
}
