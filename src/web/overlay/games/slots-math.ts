// DOM-free maths of Loser Slots: reel motion, reel strips, the lever, the cabinet layout, bulbs,
// coin spills, label fitting and colour helpers (unit-tested under node).
import { computeArcs, mod1, segmentAt } from '../../../shared/geometry.js';
import type { WheelView } from '../../../shared/types.js';
import { seededRandom } from './random.js';

export const REELS = 3;
/** When each reel stops (its overshoot peak, the "clunk"), as a share of the play. */
export const STOP_AT = [0.45, 0.65, 0.88] as const;
/** Share of plays where the last reel teases: it almost stops one symbol early, then crawls in. */
export const TEASE_ODDS = 0.4;
/** Cells kept before the start and after the stop of every strip (rows visible around the payline). */
export const STRIP_MARGIN = 2;
/** Share of filler cells that show the streamer's photo instead of a prize (when there is one). */
export const PHOTO_ODDS = 0.07;

/** How far a reel kicks back (in symbols) when the lever drops, before it spins. */
const WIND = 0.25;
/** How far a reel runs past its stop before it springs back (symbols). */
const OVERSHOOT = 0.22;
/** Same after the slow near-miss crawl. */
const CRAWL_OVERSHOOT = 0.12;
/** Cruising speed of a reel, in symbols per second. */
const SPEED = 14;
/** Fewest symbols a reel travels, whatever the play length. */
const MIN_TRAVEL = 6;
/** How far the lever swings down (radians; 0 = up). Past 90° the knob passes in front of its pivot. */
export const LEVER_SWING = 2.3;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Smooth 0 → 1 ramp with flat ends. */
export function smoothstep(u: number): number {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
}

/** `share` of the play length, kept between `min` and `max` milliseconds. */
const span = (durationMs: number, share: number, min: number, max: number) =>
  clamp(durationMs * share, min, max);

// ── Motion ───────────────────────────────────────────────────────────────

/** Timing of one reel, in ms after the start of the play. Positions are in symbols travelled. */
export interface ReelMotion {
  /** Kicks back from here until `windEnd`, then speeds up until `accelEnd`. */
  start: number;
  windEnd: number;
  accelEnd: number;
  /** Cruises until `decelStart`, then slows down to a halt at `decelEnd`. */
  decelStart: number;
  decelEnd: number;
  /** Strip cell that ends on the payline. */
  stop: number;
  /** Cruising speed, in symbols per ms. */
  speed: number;
  /** Near miss: halted one symbol short until `holdEnd`, then crawls in until `peak`. */
  tease: { holdEnd: number } | null;
  /** Furthest point past the stop (the reel clunks), then springs back to rest at `rest`. */
  peak: number;
  rest: number;
  overshoot: number;
}

export interface LeverMotion {
  /** Pulled down until `pullEnd`, held until `holdEnd`, springs back until `returnEnd`. */
  pullEnd: number;
  holdEnd: number;
  returnEnd: number;
}

export interface SlotsPlay {
  reels: ReelMotion[];
  /** Segment index of each cell: `strips[reel][cell + STRIP_MARGIN]`, cells −STRIP_MARGIN … stop + STRIP_MARGIN. */
  strips: number[][];
  /** Cells that show the streamer's photo when one is loaded (same layout as `strips`). */
  photos: boolean[][];
  lever: LeverMotion;
  tease: boolean;
  /** When the last reel comes to rest (ms after the start); never after the end of the play. */
  landedAt: number;
}

export function leverMotion(durationMs: number): LeverMotion {
  const pullEnd = span(durationMs, 0.07, 110, 240);
  const holdEnd = pullEnd + span(durationMs, 0.025, 30, 90);
  return { pullEnd, holdEnd, returnEnd: holdEnd + span(durationMs, 0.16, 260, 600) };
}

/** Lever angle at `t` ms into a play: 0 = up at rest, LEVER_SWING = pulled all the way down. */
export function leverAngle(lever: LeverMotion, t: number): number {
  if (t <= 0 || t >= lever.returnEnd) return 0;
  if (t < lever.pullEnd) {
    const u = t / lever.pullEnd;
    return LEVER_SWING * u * u;
  }
  if (t < lever.holdEnd) return LEVER_SWING;
  // Springs back up, wobbling once past the top.
  const u = (t - lever.holdEnd) / (lever.returnEnd - lever.holdEnd);
  return LEVER_SWING * (1 - u) ** 2 * Math.cos(u * Math.PI * 1.5);
}

/** Decides how the three reels move: timings, travel and the optional near miss. */
function reelMotions(durationMs: number, lever: LeverMotion, tease: boolean, jitter: readonly number[]) {
  const d = durationMs;
  const stagger = span(d, 0.02, 25, 70);
  const wind = span(d, 0.05, 70, 160);
  const accel = span(d, 0.08, 110, 380);
  // The last reel always rests before the end of the play.
  const bounce = Math.min(span(d, 0.06, 110, 260), d * (0.98 - STOP_AT[2]));
  const hold = span(d, 0.04, 60, 280);
  const crawl = span(d, 0.11, 180, 800);
  return STOP_AT.map((share, reel): ReelMotion => {
    const start = lever.pullEnd + reel * stagger;
    const windEnd = start + wind;
    const accelEnd = windEnd + accel;
    const peak = d * share;
    const teasing = tease && reel === REELS - 1;
    const decelEnd = teasing ? peak - crawl - hold : peak;
    const decel = Math.min(span(d, reel === REELS - 1 ? 0.2 : 0.15, 200, 1400), decelEnd - accelEnd);
    const decelStart = decelEnd - decel;
    // Distance covered from the end of the kick-back, per unit of cruising speed.
    const reach = accel / 2 + (decelStart - accelEnd) + decel / 3;
    const overshoot = teasing ? CRAWL_OVERSHOOT : OVERSHOOT;
    const wanted = (SPEED / 1000) * (jitter[reel] ?? 1) * reach - WIND - (teasing ? -1 : overshoot);
    const stop = Math.max(MIN_TRAVEL + reel, Math.round(wanted));
    const target = teasing ? stop - 1 : stop + overshoot;
    return {
      start,
      windEnd,
      accelEnd,
      decelStart,
      decelEnd,
      stop,
      speed: (target + WIND) / reach,
      tease: teasing ? { holdEnd: decelEnd + hold } : null,
      peak,
      rest: peak + bounce,
      overshoot,
    };
  });
}

/** Position of a reel (symbols travelled) at `t` ms into the play. */
export function reelPosition(m: ReelMotion, t: number): number {
  if (t <= m.start) return 0;
  if (t < m.windEnd) return -WIND * Math.sin(((t - m.start) / (m.windEnd - m.start)) * (Math.PI / 2));
  const accel = m.accelEnd - m.windEnd;
  if (t < m.accelEnd) {
    const dt = t - m.windEnd;
    return -WIND + (m.speed * dt * dt) / (2 * accel);
  }
  const cruiseFrom = -WIND + (m.speed * accel) / 2;
  if (t < m.decelStart) return cruiseFrom + m.speed * (t - m.accelEnd);
  const decel = m.decelEnd - m.decelStart;
  const decelFrom = cruiseFrom + m.speed * (m.decelStart - m.accelEnd);
  if (t < m.decelEnd) {
    const u = (t - m.decelStart) / decel;
    return decelFrom + (m.speed * decel * (1 - (1 - u) ** 3)) / 3;
  }
  if (m.tease && t < m.peak) {
    if (t < m.tease.holdEnd) return m.stop - 1;
    const u = (t - m.tease.holdEnd) / (m.peak - m.tease.holdEnd);
    return m.stop - 1 + (1 + m.overshoot) * smoothstep(u);
  }
  if (t < m.rest) return m.stop + m.overshoot * (1 - smoothstep((t - m.peak) / (m.rest - m.peak)));
  return m.stop;
}

/** Speed of a reel at `t`, in symbols per second (positive = symbols moving down). */
export function reelSpeed(m: ReelMotion, t: number): number {
  return ((reelPosition(m, t + 4) - reelPosition(m, t - 4)) / 8) * 1000;
}

/**
 * How much a reel's payline symbol pops (0 → 1 → 0) while the reel settles after its clunk; when
 * the last reel settles, the whole triple pops with it.
 */
export function settlePop(reels: readonly ReelMotion[], reel: number, t: number): number {
  const pop = (m: ReelMotion | undefined) =>
    m && t >= m.peak && t < m.rest ? Math.sin(((t - m.peak) / (m.rest - m.peak)) * Math.PI) : 0;
  return Math.max(pop(reels[reel]), pop(reels[reels.length - 1]));
}

/** Whether the reel is in its near-miss pause or crawl at `t`. */
export function teasing(m: ReelMotion, t: number): boolean {
  return m.tease !== null && t >= m.decelEnd && t < m.peak;
}

// ── Strips ───────────────────────────────────────────────────────────────

/** 32-bit FNV-1a hash of a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed of the resting reels of a wheel at a resting angle (turns), shared by every overlay. */
export function restingSeed(key: string, rotation: number): number {
  return (hashString(key) ^ Math.floor(mod1(rotation) * 2 ** 32)) >>> 0;
}

/** A prize (seeded) outside `avoid`, or null when every prize is excluded. */
function pickExcept(
  avoid: readonly (number | undefined)[],
  count: number,
  next: () => number,
): number | null {
  const from = Math.floor(next() * count);
  for (let j = 0; j < count; j++) {
    const pick = (from + j) % count;
    if (!avoid.includes(pick)) return pick;
  }
  return null;
}

/**
 * Cells −STRIP_MARGIN … +STRIP_MARGIN of each reel at rest, from a seed. With a `payline` prize
 * the three reels show it as a triple; without one the payline never reads as a win. The cells
 * next to the payline differ from it and the other rows avoid triples (as far as the prizes allow).
 */
export function restingCells(count: number, seed: number, payline: number | null): number[][] {
  const next = seededRandom(seed);
  const n = Math.max(1, count);
  const mid = STRIP_MARGIN;
  const cells = Array.from({ length: REELS }, () =>
    Array.from({ length: STRIP_MARGIN * 2 + 1 }, () => Math.floor(next() * n)),
  );
  const last = cells[REELS - 1]!;
  const triple = (i: number) => cells.every((reel) => reel[i] === cells[0]![i]);
  if (payline !== null) {
    for (const reel of cells) reel[mid] = payline;
  } else if (triple(mid)) {
    last[mid] = pickExcept([last[mid]], n, next) ?? last[mid]!;
  }
  for (const reel of cells) {
    for (const i of [mid - 1, mid + 1]) {
      if (reel[i] === reel[mid]) reel[i] = pickExcept([reel[mid]], n, next) ?? reel[i]!;
    }
  }
  for (let i = 0; i < STRIP_MARGIN * 2 + 1; i++) {
    if (i === mid || !triple(i)) continue;
    const avoid = Math.abs(i - mid) === 1 ? [last[i], last[mid]] : [last[i]];
    last[i] = pickExcept(avoid, n, next) ?? last[i]!;
  }
  return cells;
}

/** What a play needs from the server's spin (the `PlayPlan` fields this module uses). */
export interface SlotsSpin {
  wheel: Pick<WheelView, 'key' | 'sizing' | 'segments'>;
  segmentIndex: number;
  fromRotation: number;
  toRotation: number;
  durationMs: number;
  seed: number;
}

/** Prize under the wheel's pointer at a resting angle: the previous result (none before the first play). */
function lastWinner(wheel: SlotsSpin['wheel'], rotation: number): number | null {
  const turn = mod1(rotation);
  if (wheel.segments.length === 0 || turn === 0) return null;
  return segmentAt(
    computeArcs(
      wheel.segments.map((s) => s.weight),
      wheel.sizing,
    ),
    turn,
  );
}

/**
 * The reels at rest for a wheel at a resting angle: the previous result as a triple on the
 * payline (a play lands on exactly this), or a mix before the first play.
 */
export function restingReels(wheel: SlotsSpin['wheel'], rotation: number): number[][] {
  return restingCells(wheel.segments.length, restingSeed(wheel.key, rotation), lastWinner(wheel, rotation));
}

/**
 * Plans a whole play from the spin alone: the reels start from the resting reels at `fromRotation`,
 * all land on the winner (a triple) amid the resting reels at `toRotation`, and everything in
 * between comes from the seed.
 */
export function planSlots(spin: SlotsSpin): SlotsPlay {
  const { wheel, segmentIndex: winner, durationMs, seed } = spin;
  const n = Math.max(1, wheel.segments.length);
  const next = seededRandom(seed);
  const tease = next() < TEASE_ODDS;
  const jitter = Array.from({ length: REELS }, () => 0.9 + next() * 0.2);
  const lever = leverMotion(durationMs);
  const reels = reelMotions(durationMs, lever, tease, jitter);
  const start = restingReels(wheel, spin.fromRotation);
  const end = restingCells(n, restingSeed(wheel.key, spin.toRotation), winner);

  const strips: number[][] = [];
  const photos: boolean[][] = [];
  reels.forEach((motion, r) => {
    const length = motion.stop + STRIP_MARGIN * 2 + 1;
    const strip: number[] = [];
    const photo: boolean[] = [];
    for (let i = 0; i < length; i++) {
      const cell = i - STRIP_MARGIN;
      // Every cell draws the same numbers, so the seed alone decides the strip.
      const roll = next();
      const pick = Math.floor(next() * n);
      const fixed =
        cell <= STRIP_MARGIN
          ? start[r]![i]
          : cell >= motion.stop - STRIP_MARGIN
            ? end[r]![cell - motion.stop + STRIP_MARGIN]
            : undefined;
      strip.push(fixed ?? pick);
      photo.push(fixed === undefined && roll < PHOTO_ODDS);
    }
    strips.push(strip);
    photos.push(photo);
  });

  return {
    reels,
    strips,
    photos,
    lever,
    tease,
    landedAt: Math.min(durationMs, Math.max(...reels.map((m) => m.rest))),
  };
}

/** Segment index of a cell (cells outside the strip repeat its ends). */
export function cellAt(strip: readonly number[], cell: number): number {
  const i = clamp(cell + STRIP_MARGIN, 0, strip.length - 1);
  return strip[i] ?? 0;
}

// ── Layout ───────────────────────────────────────────────────────────────

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The machine, in units of the play area's half side, relative to its centre (y down). The
 * payline sits high so the winning triple stays in view above the result card.
 */
export const LAYOUT = {
  cabinet: { left: -0.99, top: -0.98, right: 0.7, bottom: 0.99 },
  cabinetRadius: 0.13,
  /** Gold trim around the cabinet; the bulbs sit on it. */
  trim: 0.04,
  bulbSpacing: 0.082,
  bulb: 0.017,
  header: { left: -0.53, top: -1.05, right: 0.24, bottom: -0.89 },
  /** Glass over the reels (outer edge of its gold frame) and the frame width. */
  window: { left: -0.88, top: -0.94, right: 0.59, bottom: -0.15 },
  frame: 0.04,
  reelGap: 0.024,
  /** Distance between two symbols on a strip, symbol radius and drum radius. */
  pitch: 0.37,
  symbol: 0.158,
  drum: 0.52,
  display: { left: -0.74, top: -0.07, right: 0.45, bottom: 0.17 },
  deck: { left: -0.9, top: 0.22, right: 0.61, bottom: 0.41 },
  /** Candy buttons (centres) and the SPIN button (centre and width) on the deck. */
  buttons: [-0.72, -0.52, -0.32],
  spinButton: { x: 0.2, width: 0.6 },
  tray: { left: -0.75, top: 0.56, right: 0.46, bottom: 0.9 },
  lever: { x: 0.845, pivot: -0.2, length: 0.6, knob: 0.105 },
  mount: { left: 0.65, top: -0.27, right: 0.91, bottom: -0.13 },
} as const;

/** Inner glass area of the reel window. */
export function reelScreen(): Box {
  const { window: w, frame } = LAYOUT;
  return { left: w.left + frame, top: w.top + frame, right: w.right - frame, bottom: w.bottom - frame };
}

/** The three reel strips, side by side inside the screen. */
export function reelBoxes(): Box[] {
  const screen = reelScreen();
  const gap = LAYOUT.reelGap;
  const width = (screen.right - screen.left - gap * (REELS + 1)) / REELS;
  return Array.from({ length: REELS }, (_, i) => {
    const left = screen.left + gap + i * (width + gap);
    return { left, top: screen.top, right: left + width, bottom: screen.bottom };
  });
}

/** Height of the payline. */
export function paylineY(): number {
  const screen = reelScreen();
  return (screen.top + screen.bottom) / 2;
}

/**
 * Where a symbol `offset` cells from the payline appears on the reel drum: its height relative to
 * the payline and its vertical squash (null once it has turned out of view).
 */
export function drumPlace(offset: number): { y: number; scale: number } | null {
  const angle = (offset * LAYOUT.pitch) / LAYOUT.drum;
  if (Math.abs(angle) >= Math.PI / 2) return null;
  return { y: Math.sin(angle) * LAYOUT.drum, scale: Math.cos(angle) };
}

/** Evenly spaced points (`spacing` apart) along a rounded rectangle, clockwise from the top-left. */
export function marqueePoints(box: Box, radius: number, spacing: number): { x: number; y: number }[] {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const r = Math.min(radius, w / 2, h / 2);
  const straightX = w - 2 * r;
  const straightY = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  const perimeter = 2 * (straightX + straightY) + 4 * arc;
  const count = Math.max(4, Math.round(perimeter / spacing));
  // Sides and corners, clockwise from the end of the top-left corner.
  const corners = [
    { cx: box.right - r, cy: box.top + r, from: -Math.PI / 2 },
    { cx: box.right - r, cy: box.bottom - r, from: 0 },
    { cx: box.left + r, cy: box.bottom - r, from: Math.PI / 2 },
    { cx: box.left + r, cy: box.top + r, from: Math.PI },
  ];
  const sides = [
    { x: box.left + r, y: box.top, dx: 1, dy: 0, length: straightX },
    { x: box.right, y: box.top + r, dx: 0, dy: 1, length: straightY },
    { x: box.right - r, y: box.bottom, dx: -1, dy: 0, length: straightX },
    { x: box.left, y: box.bottom - r, dx: 0, dy: -1, length: straightY },
  ];
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    let d = ((i + 0.5) / count) * perimeter;
    for (let k = 0; k < 4; k++) {
      const side = sides[k]!;
      if (d <= side.length) {
        points.push({ x: side.x + side.dx * d, y: side.y + side.dy * d });
        break;
      }
      d -= side.length;
      if (d <= arc) {
        const corner = corners[k]!;
        const a = corner.from + d / r;
        points.push({ x: corner.cx + Math.cos(a) * r, y: corner.cy + Math.sin(a) * r });
        break;
      }
      d -= arc;
    }
  }
  return points;
}

/**
 * Brightness (0–1) of bulb `i` of `count` in the marquee chase. `phase` counts bulbs travelled;
 * lit bulbs come every four, each with a short fading tail.
 */
export function chaseLevel(i: number, phase: number): number {
  const d = (((phase - i) % 4) + 4) % 4;
  return d < 1 ? 1 : Math.max(0.12, 1 - (d - 1) * 0.55);
}

// ── Coin spill ───────────────────────────────────────────────────────────

export interface Coin {
  /** Start delay (ms), landing spot in the tray (−1 … 1 across, 0 … 1 deep), size factor and spin. */
  delay: number;
  x: number;
  depth: number;
  size: number;
  spin: number;
}

/** Coins that pour into the tray after a win, from a seed. */
export function coinSpill(seed: number, count: number): Coin[] {
  const next = seededRandom(seed ^ 0x5bd1e995);
  return Array.from({ length: count }, (_, i) => ({
    delay: i * 55 + next() * 40,
    x: (next() * 2 - 1) * 0.85,
    depth: next(),
    size: 0.85 + next() * 0.3,
    spin: (next() * 2 - 1) * 9,
  }));
}

/**
 * Where a spilled coin is `t` ms after the spill began: `fall` goes from 0 (in the chute) to 1
 * (landed), with one small bounce at the end; null before it drops.
 */
export function coinFall(coin: Coin, t: number): { fall: number; hop: number } | null {
  const u = (t - coin.delay) / 520;
  if (u < 0) return null;
  if (u < 1) return { fall: u * u, hop: 0 };
  const b = (u - 1) / 0.45;
  return { fall: 1, hop: b < 1 ? Math.sin(b * Math.PI) * 0.18 * (1 - b) : 0 };
}

// ── Labels ───────────────────────────────────────────────────────────────

/** Width of a text at font size 1. */
export type Measure = (text: string) => number;

/** Splits words into `lines` lines with the narrowest widest line. */
function splitLines(words: readonly string[], lines: number, measure: Measure): string[] {
  if (lines <= 1 || words.length <= 1) return [words.join(' ')];
  let best: { parts: string[]; width: number } | null = null;
  for (let k = 1; k <= words.length - lines + 1; k++) {
    const head = words.slice(0, k).join(' ');
    const rest = splitLines(words.slice(k), lines - 1, measure);
    const parts = [head, ...rest];
    const width = Math.max(...parts.map(measure));
    if (!best || width < best.width) best = { parts, width };
  }
  return best?.parts ?? [words.join(' ')];
}

/**
 * Fits a label into a box (`width` × `height`, in the same unit as `maxSize`) on up to three lines,
 * choosing the line count that gives the biggest letters.
 */
export function fitLabel(
  text: string,
  measure: Measure,
  width: number,
  height: number,
  maxSize: number,
  lineHeight = 1.05,
): { lines: string[]; size: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [], size: 0 };
  let best = { lines: [words.join(' ')], size: 0 };
  for (let count = 1; count <= Math.min(3, words.length); count++) {
    const lines = splitLines(words, count, measure);
    const widest = Math.max(...lines.map(measure), 1e-6);
    const size = Math.min(maxSize, width / widest, height / (count * lineHeight));
    if (size > best.size * 1.08) best = { lines, size };
  }
  return best;
}

// ── Colours ──────────────────────────────────────────────────────────────

/** Parses `#rgb`, `#rrggbb`, `rgb()` and `rgba()` colours into [r, g, b, a] (black if unknown). */
export function parseColor(color: string): [number, number, number, number] {
  const text = color.trim();
  if (text.startsWith('#')) {
    const hex = text.length === 4 ? [...text.slice(1)].map((c) => c + c).join('') : text.slice(1, 7);
    const n = Number.parseInt(hex, 16);
    if (Number.isFinite(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const match = /rgba?\(([^)]+)\)/i.exec(text);
  if (match) {
    const parts = match[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
  }
  return [0, 0, 0, 1];
}

/** Mixes two colours (`t` = 0 → a, 1 → b) into an `rgb()` string. */
export function mixColor(a: string, b: string, t: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  const k = clamp(t, 0, 1);
  const c = (i: number) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

/** The colour with another opacity, as `rgba()`. */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

/** Perceived brightness of a colour, 0..1. */
export function brightness(color: string): number {
  const [r, g, b] = parseColor(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
