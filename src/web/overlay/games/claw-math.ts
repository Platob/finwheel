// DOM-free maths for Loser Claw (unit-tested under node): the cabinet's geometry, the capsule pile
// and the claw's choreography, a pure function of the play's duration, seed and elapsed time.
//
// Coordinates are in play-area units: the play area is the square [-1, 1] × [-1, 1] centred on the
// theme's play-area centre (1 unit = `half` canvas pixels), y pointing down.
import { seededRandom } from './random.js';

/** Where the parts of the claw machine sit, in play-area units. */
export const CABINET = {
  left: -0.84,
  right: 0.84,
  top: -0.98,
  bottom: 0.97,
  /** The glass chamber (between the side pillars, above the control deck). */
  glassLeft: -0.74,
  glassRight: 0.74,
  glassTop: -0.8,
  glassBottom: 0.44,
  /** The rail the gantry runs on, and where the carriage can go. */
  railY: -0.735,
  railLeft: -0.62,
  railRight: 0.62,
  /** Prize chute in the front-left corner of the glass: a box open at the top. */
  chuteLeft: -0.72,
  chuteRight: -0.4,
  chuteTop: 0.1,
  /** Capsules lie on the floor right of the chute. */
  pileLeft: -0.36,
  pileRight: 0.71,
  floor: 0.435,
  pileHeight: 0.7,
  /** Control deck (joystick and button) and the front panel with the prize door. */
  deckBottom: 0.56,
  doorLeft: -0.71,
  doorRight: -0.41,
  doorTop: 0.63,
  doorBottom: 0.87,
  /** The claw rests here, swaying over the pile. */
  homeX: 0.44,
  homeDepth: 0.55,
  /** Cable length at rest (from the rail to the claw's hub). */
  restCable: 0.17,
  /** The opened capsule, in front of the glass: high enough to stay clear of the result card. */
  revealX: 0,
  revealY: -0.54,
  revealR: 0.27,
} as const;

/** Largest and smallest capsule diameter (front row), and how many capsules make a full pile. */
export const PILE = {
  maxDiameter: 0.25,
  minDiameter: 0.06,
  minCapsules: 14,
  maxRows: 9,
  /** Vertical offset between two depth rows, relative to the diameter. */
  rowStep: 0.55,
  /** Distance between capsule centres in a row, relative to their diameter. */
  spacing: 1.02,
} as const;

export type Rng = () => number;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const unit = (value: number): number => clamp(value, 0, 1);

export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
/** Gentle ease in and out (motors): peak speed only ~1.6× the average. */
export const easeInOutSine = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;
/** Eases to a 6 % overshoot, then settles back (both with zero speed at the turns). */
export const easeSettle = (t: number): number =>
  t < 0.7 ? 1.06 * easeInOutSine(t / 0.7) : 1 + 0.03 * (1 + Math.cos((Math.PI * (t - 0.7)) / 0.3));
export const easeIn = (t: number): number => t * t;
/** Ease out that overshoots by roughly `overshoot / 10` before settling. */
export const easeOutBack = (t: number, overshoot = 1.70158): number =>
  1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
/** 0 → 1 → 0 over [0, 1]. */
const bump = (t: number): number => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));

/** FNV-1a hash of a string (stable 32-bit seed for a wheel's pile). */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Perspective scale of something at `depth` (0 = back of the cabinet, 1 = front). */
export const depthScale = (depth: number): number => 0.84 + 0.16 * depth;

// ── Colours ──────────────────────────────────────────────────────────────

/** Parses `#rgb`, `#rrggbb`, `rgb()` and `rgba()` colours into [r, g, b] (black when unknown). */
export function parseColor(color: string): [number, number, number] {
  const text = color.trim();
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex.slice(0, 6);
    const n = Number.parseInt(full, 16);
    if (Number.isNaN(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = /rgba?\(([^)]+)\)/i.exec(text)?.[1]?.split(',') ?? [];
  const [r = 0, g = 0, b = 0] = parts.map((p) => Number.parseFloat(p) || 0);
  return [r, g, b];
}

/** Mixes two colours (`t` = 0 → a, 1 → b) into an `rgb()` string. */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const k = unit(t);
  const channel = (i: number) => Math.round(ca[i]! + (cb[i]! - ca[i]!) * k);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/** The colour with an alpha, as `rgba()`. */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${unit(alpha)})`;
}

// ── Labels ───────────────────────────────────────────────────────────────

/** Width of `text` at font size 1. */
export type Measure = (text: string) => number;

/**
 * Breaks `text` into at most `maxLines` lines (at spaces) and picks the largest font size that fits
 * a `width × height` box, each line `lineHeight` × the size tall. Fewer lines win near-ties.
 */
export function fitLines(
  text: string,
  maxLines: number,
  measure: Measure,
  width: number,
  height: number,
  lineHeight = 1.1,
): { lines: string[]; size: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [], size: 0 };
  let best = { lines: [words.join(' ')], size: 0 };
  for (let count = 1; count <= Math.min(maxLines, words.length); count++) {
    const lines = balancedSplit(words, count, measure);
    const widest = Math.max(...lines.map((line) => measure(line)), 1e-6);
    const size = Math.min(width / widest, height / (count * lineHeight));
    if (size > best.size * 1.08) best = { lines, size };
  }
  return best;
}

/** Splits words into `count` lines so that the widest line is as narrow as possible. */
function balancedSplit(words: readonly string[], count: number, measure: Measure): string[] {
  let best: string[] = [words.join(' ')];
  let bestWidth = Infinity;
  const visit = (start: number, left: number, lines: string[]) => {
    if (left === 1) {
      const all = [...lines, words.slice(start).join(' ')];
      const widest = Math.max(...all.map((line) => measure(line)));
      if (widest < bestWidth) {
        bestWidth = widest;
        best = all;
      }
      return;
    }
    for (let end = start + 1; end <= words.length - left + 1; end++) {
      visit(end, left - 1, [...lines, words.slice(start, end).join(' ')]);
    }
  };
  visit(0, count, []);
  return best;
}

// ── The capsule pile ─────────────────────────────────────────────────────

export interface PileCapsule {
  x: number;
  y: number;
  /** Radius, already scaled for its depth. */
  r: number;
  /** Depth row, 0 = back. */
  row: number;
  /** 0 = back of the cabinet, 1 = front. */
  depth: number;
  /** Index of the prize (wheel segment) inside. */
  prize: number;
  /** Small tilt of the capsule (radians). */
  tilt: number;
}

export interface Pile {
  /** Diameter of a front-row capsule. */
  diameter: number;
  rows: number;
  /** Back row first, left to right within a row (the drawing order). */
  capsules: PileCapsule[];
}

interface Slot {
  x: number;
  y: number;
  r: number;
  row: number;
  depth: number;
}

/** Capsule slots for `rows` depth rows of front diameter `d`, without jitter. */
function pileSlots(d: number, rows: number): Slot[] {
  const width = CABINET.pileRight - CABINET.pileLeft;
  const slots: Slot[] = [];
  for (let row = 0; row < rows; row++) {
    const fromFront = rows - 1 - row;
    const depth = rows === 1 ? 1 : row / (rows - 1);
    const dr = d * depthScale(depth);
    const step = dr * PILE.spacing;
    const room = width - dr;
    let count = Math.floor(room / step + 1e-9) + 1;
    // Every other row sits in the gaps of the row in front of it.
    if (fromFront % 2 === 1 && count > 1) count -= 1;
    const span = (count - 1) * step;
    const y = CABINET.floor - dr / 2 - fromFront * PILE.rowStep * d;
    for (let i = 0; i < count; i++) {
      slots.push({ x: CABINET.pileLeft + dr / 2 + (room - span) / 2 + i * step, y, r: dr / 2, row, depth });
    }
  }
  return slots;
}

/**
 * How many capsules each prize gets out of `total`: one each at least (when there is room), the
 * rest following the weights (largest remainder) or, with equal sizing, one more each in turn.
 */
export function capsuleCounts(weights: readonly number[], total: number, byWeight: boolean): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const counts: number[] = weights.map(() => (total >= n ? 1 : 0));
  let extra = total - counts.reduce((a, b) => a + b, 0);
  if (extra <= 0) return counts;
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (!byWeight || sum <= 0) {
    for (let i = 0; extra > 0; i = (i + 1) % n, extra--) counts[i]! += 1;
    return counts;
  }
  const exact = weights.map((w) => (Math.max(0, w) / sum) * extra);
  const floors = exact.map(Math.floor);
  floors.forEach((f, i) => (counts[i]! += f));
  extra -= floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rest: e - floors[i]! }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; k < extra; k++) counts[order[k % n]!.i]! += 1;
  return counts;
}

/**
 * Lays out the capsule pile for prizes with these weights: depth rows (the back ones higher and
 * smaller) filled with capsules, every prize in at least one, and big capsules when few prizes.
 * Deterministic for a given `seed`.
 */
export function layoutPile(weights: readonly number[], byWeight: boolean, seed: number): Pile {
  const n = weights.length;
  if (n === 0) return { diameter: PILE.maxDiameter, rows: 0, capsules: [] };
  const needed = Math.max(n, PILE.minCapsules);
  let chosen: { d: number; slots: Slot[]; rows: number } | null = null;
  for (let d = PILE.maxDiameter; d >= PILE.minDiameter - 1e-9 && !chosen; d -= 0.0025) {
    const maxRows = clamp(Math.floor((CABINET.pileHeight - d) / (PILE.rowStep * d)) + 1, 1, PILE.maxRows);
    for (let rows = 1; rows <= maxRows; rows++) {
      const slots = pileSlots(d, rows);
      if (slots.length >= needed) {
        chosen = { d, slots, rows };
        break;
      }
    }
  }
  if (!chosen) {
    const d = PILE.minDiameter;
    chosen = { d, slots: pileSlots(d, PILE.maxRows), rows: PILE.maxRows };
  }

  const rng = seededRandom(seed);
  const counts = capsuleCounts(weights, chosen.slots.length, byWeight);
  const prizes = counts.flatMap((count, prize) => Array.from({ length: count }, () => prize));
  shuffle(prizes, rng);
  const capsules = chosen.slots.slice(0, prizes.length).map((slot, i) => ({
    x: slot.x + (rng() - 0.5) * 0.08 * slot.r * 2,
    y: slot.y + (rng() - 0.5) * 0.05 * slot.r * 2,
    r: slot.r,
    row: slot.row,
    depth: slot.depth,
    prize: prizes[i]!,
    tilt: (rng() - 0.5) * 0.45,
  }));
  return { diameter: chosen.d, rows: chosen.rows, capsules };
}

function shuffle<T>(items: T[], rng: Rng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

/** Index (in `pile.capsules`) of the capsule the claw grabs for `prize`, picked with the play's seed. */
export function pickTarget(pile: Pile, prize: number, seed: number): number {
  const candidates = pile.capsules.flatMap((c, i) => (c.prize === prize ? [i] : []));
  if (candidates.length === 0) return -1;
  const rng = seededRandom((seed ^ 0x5bd1e995) >>> 0);
  return candidates[Math.floor(rng() * candidates.length)]!;
}

// ── The claw's choreography ──────────────────────────────────────────────

export type ClawPhase = 'roam' | 'drop' | 'grab' | 'lift' | 'carry' | 'release' | 'reveal';

export interface ClawSetup {
  durationMs: number;
  seed: number;
  /** Capsule to grab: carriage x and depth over it, and the cable length that reaches it. */
  targetX: number;
  targetDepth: number;
  grabCable: number;
}

/** One horizontal move of the carriage (roaming legs, the carry to the chute, the way home). */
interface Move {
  t0: number;
  t1: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Ends with a small overshoot (settling over the target). */
  settle: boolean;
  /** Pendulum swing it causes (radians). */
  swing: number;
}

/** A pause after a roaming leg where the claw teases a grab (dips and flexes its prongs). */
interface Tease {
  t0: number;
  t1: number;
  dip: number;
}

export type ClawSound = 'whirr' | 'button' | 'clank' | 'slip' | 'release' | 'thud' | 'door' | 'pop';

export interface ClawEvent {
  at: number;
  sound: ClawSound;
  /** Length of a motor whirr (ms) and its pitch (1 = normal). */
  duration?: number;
  pitch?: number;
}

export interface ClawScript {
  setup: ClawSetup;
  durationMs: number;
  /** Start time and length of each phase (ms). */
  phases: Record<ClawPhase, { start: number; duration: number }>;
  moves: Move[];
  teases: Tease[];
  /** When the prongs bite shut on the capsule. */
  closeAt: number;
  /** When the capsule slips during the lift, and by how much (in capsule radii). */
  slipAt: number;
  slipSize: number;
  /** When the claw lets go and when the capsule lands in the chute. */
  fallAt: number;
  landAt: number;
  events: ClawEvent[];
}

/** Phase lengths at the nominal 8 s play; the roaming gets whatever time is left. */
const NOMINAL = { drop: 800, grab: 600, lift: 1050, carry: 1100, release: 450, reveal: 1500 } as const;
const FIXED_PHASES = ['drop', 'grab', 'lift', 'carry', 'release', 'reveal'] as const;
const NOMINAL_FIXED = FIXED_PHASES.reduce((sum, phase) => sum + NOMINAL[phase], 0);
/** Share of the grab phase spent closing the prongs (the clank comes at the end of it). */
const CLOSE_SHARE = 0.55;
/** Release: the prongs open (the capsule slides out partway through), then it lands in the chute. */
const OPEN_SHARE = 0.3;
const FALL_SHARE = 0.18;
const LAND_SHARE = 0.78;
/** Reveal timeline (shares of the reveal phase). */
const REVEAL = {
  door: 0.12,
  emerge: [0.04, 0.22],
  fly: [0.2, 0.6],
  burst: [0.6, 0.82],
  prize: [0.6, 0.88],
} as const;
/** Part of the reveal during which the claw goes home. */
const RETURN_SHARE = 0.65;
/** Roaming range of the carriage (over the pile). */
const ROAM_LEFT = CABINET.pileLeft + 0.06;
const ROAM_RIGHT = CABINET.railRight - 0.02;
export const CHUTE_X = (CABINET.chuteLeft + CABINET.chuteRight) / 2;
/** Prong opening at rest (0 = closed on a capsule, 1 = wide open). */
export const REST_OPEN = 0.35;

/** Plans a play: the phase timeline, the roaming legs with their fake-outs, the slip and the sounds. */
export function planClaw(setup: ClawSetup): ClawScript {
  const total = Math.max(1, setup.durationMs);
  const rng = seededRandom(setup.seed);

  // Fixed phases scale with the duration (within limits); the reveal keeps time to be read.
  const scale = clamp((total * 0.69) / NOMINAL_FIXED, 0.25, 1.5);
  const lengths: Record<ClawPhase, number> = { roam: 0, ...NOMINAL };
  for (const phase of FIXED_PHASES) lengths[phase] = NOMINAL[phase] * scale;
  lengths.reveal = Math.max(lengths.reveal, Math.min(NOMINAL.reveal, total * 0.32));
  let fixed = FIXED_PHASES.reduce((sum, phase) => sum + lengths[phase], 0);
  if (total - fixed < total * 0.12) {
    const k = (total * 0.88) / fixed;
    for (const phase of FIXED_PHASES) lengths[phase] *= k;
    fixed = total * 0.88;
  }
  lengths.roam = total - fixed;
  const phases = {} as ClawScript['phases'];
  let start = 0;
  for (const phase of ['roam', ...FIXED_PHASES] as const) {
    phases[phase] = { start, duration: lengths[phase] };
    start += lengths[phase];
  }

  // Roaming legs: wander over the pile, tease a few grabs, then settle over the target.
  const moves: Move[] = [];
  const teases: Tease[] = [];
  const legs = clamp(Math.round(lengths.roam / 650), 1, 48);
  const weights = Array.from({ length: legs }, (_, i) => (0.75 + rng() * 0.5) * (i === legs - 1 ? 1.3 : 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let x: number = CABINET.homeX;
  let z: number = CABINET.homeDepth;
  let t = 0;
  for (let i = 0; i < legs; i++) {
    const last = i === legs - 1;
    const length = (weights[i]! / weightSum) * lengths.roam;
    let nx = setup.targetX;
    let nz = setup.targetDepth;
    if (!last) {
      nx = lerp(ROAM_LEFT, ROAM_RIGHT, rng());
      for (let tries = 0; tries < 6 && Math.abs(nx - x) < 0.24; tries++)
        nx = lerp(ROAM_LEFT, ROAM_RIGHT, rng());
      nz = rng();
    }
    const moving = length * (last ? 0.78 : 0.62 + rng() * 0.18);
    moves.push(move(t, t + moving, x, nx, z, nz, last, false));
    const tease = !last && rng() < 0.55;
    if (tease) teases.push({ t0: t + moving, t1: t + length, dip: 0.05 + rng() * 0.06 });
    x = nx;
    z = nz;
    t += length;
  }
  const carry = phases.carry;
  moves.push(move(carry.start, carry.start + carry.duration, x, CHUTE_X, z, 1, false, true));
  const reveal = phases.reveal;
  moves.push(
    move(
      reveal.start,
      reveal.start + reveal.duration * RETURN_SHARE,
      CHUTE_X,
      CABINET.homeX,
      1,
      CABINET.homeDepth,
      false,
      false,
    ),
  );

  const lift = phases.lift;
  const slipAt = lift.start + lift.duration * (0.32 + rng() * 0.25);
  const slipSize = 0.22 + rng() * 0.2;

  const events: ClawEvent[] = [];
  for (const m of moves) events.push({ at: m.t0, sound: 'whirr', duration: m.t1 - m.t0, pitch: 1 });
  const { drop, grab, release } = phases;
  events.push({ at: Math.max(0, drop.start - 60), sound: 'button' });
  events.push({ at: drop.start, sound: 'whirr', duration: drop.duration, pitch: 0.8 });
  events.push({ at: grab.start + grab.duration * CLOSE_SHARE, sound: 'clank' });
  events.push({ at: lift.start, sound: 'whirr', duration: lift.duration, pitch: 1.2 });
  events.push({ at: slipAt, sound: 'slip' });
  events.push({ at: release.start, sound: 'release' });
  events.push({ at: release.start + release.duration * LAND_SHARE, sound: 'thud' });
  events.push({ at: reveal.start, sound: 'door' });
  events.push({ at: reveal.start + reveal.duration * REVEAL.burst[0], sound: 'pop' });
  events.sort((a, b) => a.at - b.at);

  const closeAt = grab.start + grab.duration * CLOSE_SHARE;
  const fallAt = release.start + release.duration * FALL_SHARE;
  const landAt = release.start + release.duration * LAND_SHARE;
  return {
    setup,
    durationMs: total,
    phases,
    moves,
    teases,
    closeAt,
    slipAt,
    slipSize,
    fallAt,
    landAt,
    events,
  };
}

function move(
  t0: number,
  t1: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  settle: boolean,
  loaded: boolean,
): Move {
  const swing = clamp(Math.abs(x1 - x0) * 0.32, 0.02, 0.15) * (loaded ? 1.25 : 1) * Math.sign(x1 - x0 || 1);
  return { t0, t1: Math.max(t0 + 1, t1), x0, x1, z0, z1, settle, swing };
}

export type CapsulePlace = 'pile' | 'held' | 'falling' | 'chute' | 'reveal';

/** Everything the claw machine shows at one moment of a play. */
export interface ClawFrame {
  phase: ClawPhase;
  /** Carriage position along the rail and depth of the claw (0 = back, 1 = front). */
  x: number;
  depth: number;
  /** Cable length from the rail to the hub. */
  cable: number;
  /** Pendulum angle of the cable (radians, positive = claw swung left). */
  swing: number;
  /** Prong opening: 0 = closed on a capsule, 1 = wide open. */
  open: number;
  /** Quick sideways shake of the claw head (units). */
  shake: number;
  /** Where the grabbed capsule is. */
  capsule: CapsulePlace;
  /** How far it has slipped in the claw (in capsule radii). */
  slip: number;
  /** How well it has settled in the claw, 0 (just grabbed) to 1 (hanging straight). */
  grip: number;
  /** Fall into the chute, 0..1. */
  fall: number;
  /** Prize door flap, 0 = closed, 1 = open. */
  door: number;
  /** Capsule coming out of the door, 0..1 (eased, may overshoot). */
  emerge: number;
  /** Flight from the door to the reveal spot, 0..1. */
  fly: number;
  /** Shell opening, 0..1. */
  burst: number;
  /** Scale of the revealed prize (overshoots a little before settling at 1). */
  prize: number;
  /** White ring of the opening, 0..1 (1 = just opened). */
  flash: number;
  /** Grab button pressed, 0..1, and joystick tilt, -1..1. */
  button: number;
  stick: number;
}

function carriageAt(script: ClawScript, t: number): { x: number; z: number } {
  const { moves } = script;
  let x: number = CABINET.homeX;
  let z: number = CABINET.homeDepth;
  for (const m of moves) {
    if (t < m.t0) break;
    const p = unit((t - m.t0) / (m.t1 - m.t0));
    x = lerp(m.x0, m.x1, m.settle ? easeSettle(p) : easeInOutSine(p));
    z = lerp(m.z0, m.z1, easeInOutSine(p));
  }
  return { x, z };
}

function swingAt(script: ClawScript, t: number): number {
  let swing = 0;
  for (const m of script.moves) {
    if (t < m.t0) break;
    if (t <= m.t1) {
      // Lags behind while speeding up, swings ahead while braking.
      swing += m.swing * Math.sin(2 * Math.PI * ((t - m.t0) / (m.t1 - m.t0)));
    } else {
      const after = t - m.t1;
      if (after < 2500)
        swing -= m.swing * 0.5 * Math.exp(-after / 420) * Math.sin((2 * Math.PI * after) / 620);
    }
  }
  return swing;
}

/** The machine at `t` ms into the play (clamped to the play); pure, so late joiners see the same. */
export function clawFrame(script: ClawScript, t: number): ClawFrame {
  const { phases: P, setup } = script;
  const time = clamp(t, 0, script.durationMs);
  const { x, z } = carriageAt(script, time);
  const frame: ClawFrame = {
    phase: 'roam',
    x,
    depth: z,
    cable: CABINET.restCable,
    swing: swingAt(script, time),
    open: REST_OPEN,
    shake: 0,
    capsule: 'pile',
    slip: 0,
    grip: 0,
    fall: 0,
    door: 0,
    emerge: 0,
    fly: 0,
    burst: 0,
    prize: 0,
    flash: 0,
    button: 0,
    stick: 0,
  };
  const dx = carriageAt(script, Math.min(script.durationMs, time + 30)).x - carriageAt(script, time - 30).x;
  frame.stick = clamp(dx / 0.035, -1, 1);
  const pressed = time - (P.drop.start - 80);
  frame.button = pressed > 0 && pressed < 420 ? bump(pressed / 420) : 0;

  const progress = (phase: ClawPhase) => unit((time - P[phase].start) / P[phase].duration);
  const phase = (['reveal', 'release', 'carry', 'lift', 'grab', 'drop'] as const).find(
    (name) => time >= P[name].start,
  );
  frame.phase = phase ?? 'roam';

  switch (frame.phase) {
    case 'roam': {
      const tease = script.teases.find((s) => time >= s.t0 && time < s.t1);
      if (tease) {
        const q = bump((time - tease.t0) / (tease.t1 - tease.t0));
        frame.cable += tease.dip * q;
        frame.open = REST_OPEN + 0.45 * q;
      }
      break;
    }
    case 'drop': {
      const p = progress('drop');
      frame.cable = lerp(CABINET.restCable, setup.grabCable, easeInOutSine(p));
      frame.open = lerp(REST_OPEN, 1, easeOut(unit(p / 0.45)));
      break;
    }
    case 'grab': {
      const p = progress('grab');
      frame.cable = setup.grabCable + 0.012 * bump(p);
      if (p < CLOSE_SHARE) {
        frame.open = 1 - easeIn(p / CLOSE_SHARE);
      } else {
        // Prongs bite: a small wobble as they clamp shut.
        const q = (p - CLOSE_SHARE) / (1 - CLOSE_SHARE);
        frame.open = -0.06 * Math.exp(-q * 3) * Math.cos(q * Math.PI * 3);
        frame.capsule = 'held';
      }
      break;
    }
    case 'lift': {
      const p = progress('lift');
      const since = time - script.slipAt;
      // The lift hitches when the capsule slips, then carries on.
      const hitch = since > 0 && since < 260 ? 0.02 * bump(since / 260) : 0;
      frame.cable = lerp(setup.grabCable, CABINET.restCable, easeInOut(p)) + hitch;
      frame.capsule = 'held';
      frame.grip = easeInOut(p);
      if (since > 0) {
        frame.slip = script.slipSize * easeOutBack(unit(since / 160), 2.4);
        frame.open = 0.14 * bump(unit(since / 320)) + 0.04 * unit(since / 160);
        if (since < 600) frame.shake = 0.007 * Math.exp(-since / 180) * Math.sin((2 * Math.PI * since) / 75);
      }
      break;
    }
    case 'carry': {
      frame.capsule = 'held';
      frame.grip = 1;
      frame.slip = script.slipSize;
      frame.open = 0.04;
      break;
    }
    case 'release': {
      const p = progress('release');
      frame.open = lerp(0.04, 1, easeOut(unit(p / OPEN_SHARE)));
      frame.slip = script.slipSize;
      frame.grip = 1;
      if (p < FALL_SHARE) {
        frame.capsule = 'held';
      } else if (p < LAND_SHARE) {
        frame.capsule = 'falling';
        frame.fall = easeIn(unit((p - FALL_SHARE) / (LAND_SHARE - FALL_SHARE)));
      } else {
        frame.capsule = 'chute';
        frame.fall = 1;
      }
      break;
    }
    case 'reveal': {
      const p = progress('reveal');
      frame.open = lerp(1, REST_OPEN, easeInOut(unit(p / RETURN_SHARE)));
      frame.capsule = 'reveal';
      frame.fall = 1;
      frame.grip = 1;
      frame.door = p < 0.32 ? easeOut(unit(p / REVEAL.door)) : 1 - easeInOut(unit((p - 0.32) / 0.14));
      frame.emerge = easeOutBack(unit((p - REVEAL.emerge[0]) / (REVEAL.emerge[1] - REVEAL.emerge[0])), 2);
      frame.fly = easeInOut(unit((p - REVEAL.fly[0]) / (REVEAL.fly[1] - REVEAL.fly[0])));
      frame.burst = easeOut(unit((p - REVEAL.burst[0]) / (REVEAL.burst[1] - REVEAL.burst[0])));
      const pp = unit((p - REVEAL.prize[0]) / (REVEAL.prize[1] - REVEAL.prize[0]));
      frame.prize = pp > 0 ? easeOutBack(pp, 2.2) : 0;
      frame.flash = p >= REVEAL.burst[0] ? 1 - unit((p - REVEAL.burst[0]) / 0.22) : 0;
      if (time >= script.durationMs) {
        frame.door = 0;
        frame.emerge = 1;
        frame.fly = 1;
        frame.burst = 1;
        frame.prize = 1;
        frame.flash = 0;
      }
      break;
    }
  }
  return frame;
}

/** The claw at rest, swaying gently over the pile (ambient; `now` in ms). */
export function idleFrame(now: number): ClawFrame {
  const s = now / 1000;
  return {
    phase: 'roam',
    x: CABINET.homeX + 0.022 * Math.sin(s * 0.55),
    depth: CABINET.homeDepth,
    cable: CABINET.restCable + 0.008 * Math.sin(s * 0.9),
    swing: 0.045 * Math.sin(s * 1.35) + 0.015 * Math.sin(s * 0.55 + 1),
    open: REST_OPEN + 0.06 * Math.sin(s * 1.1),
    shake: 0,
    capsule: 'pile',
    slip: 0,
    grip: 0,
    fall: 0,
    door: 0,
    emerge: 0,
    fly: 0,
    burst: 0,
    prize: 0,
    flash: 0,
    button: 0,
    stick: 0,
  };
}
