// DOM-free maths of Mystery Gifts: the row of boxes, the seeded play (hops, shell-game swaps,
// wiggle, lid pop, prize reveal, the other boxes opening afterwards) and every pose as a pure
// function of the elapsed time (unit-tested under node).
import { seededRandom } from './random.js';

export const MIN_BOXES = 3;
export const MAX_BOXES = 5;

/** Where the boxes stand (bottom of the middle box) and where the won prize floats, in play-area units. */
export const FLOOR_Y = 0.83;
export const REVEAL = { x: 0, y: -0.67 } as const;

/** Proportions of a box, relative to its width. */
export const BOX = {
  /** Height of the body (below the lid). */
  body: 0.84,
  /** Lid: height and width (it overhangs the body). */
  lid: 0.24,
  lidWidth: 1.12,
  /** Bow height above the lid. */
  bow: 0.36,
} as const;

/** Lengths of the post-landing reveals (the other boxes open one after the other). */
export const MISSED_DELAY = 500;
export const MISSED_GAP = 430;
/** How long a lid takes to fly off, and a missed prize to peek out. */
export const LID_MS = 720;
export const PEEK_MS = 420;
/** Fewest milliseconds between two ticks (≤ 25 per second). */
export const TICK_GAP = 40;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 0 → 1 between `a` and `b`, with flat ends. */
export function smooth(a: number, b: number, x: number): number {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
}

export const easeOutCubic = (u: number): number => 1 - (1 - clamp(u, 0, 1)) ** 3;

export function easeInOutCubic(u: number): number {
  const x = clamp(u, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Overshoots a little past 1 before settling (a springy arrival). */
export function easeOutBack(u: number, overshoot = 1.6): number {
  const x = clamp(u, 0, 1) - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
}

/** Number of boxes on stage for a wheel of `segments` prizes (none when it is empty). */
export function boxCount(segments: number): number {
  return segments <= 0 ? 0 : clamp(Math.round(segments), MIN_BOXES, MAX_BOXES);
}

// ── Layout ───────────────────────────────────────────────────────────────

export interface Slot {
  x: number;
  /** Floor height under the box (its bottom edge). */
  y: number;
  scale: number;
}

export interface GiftsLayout {
  count: number;
  /** Box width at scale 1. */
  width: number;
  /** x of the outermost slots (the arc spans −reach … reach). */
  reach: number;
  slots: Slot[];
}

const SPACING: Record<number, { pitch: number; width: number }> = {
  3: { pitch: 0.64, width: 0.47 },
  4: { pitch: 0.5, width: 0.39 },
  5: { pitch: 0.41, width: 0.345 },
};

/** How much higher (further back) and smaller the outermost boxes are than the middle one. */
const ARC_RISE = 0.075;
const ARC_SHRINK = 0.1;

/** Boxes in a gentle arc: the middle stands in front, the outer ones a little further back. */
export function giftsLayout(count: number): GiftsLayout {
  const n = clamp(count, 1, MAX_BOXES);
  const { pitch, width } = SPACING[clamp(n, MIN_BOXES, MAX_BOXES)]!;
  const reach = (pitch * (n - 1)) / 2;
  const layout: GiftsLayout = { count: n, width, reach, slots: [] };
  for (let i = 0; i < n; i++) {
    const x = -reach + i * pitch;
    layout.slots.push({ x, ...arcAt(layout, x) });
  }
  return layout;
}

/** Floor height and scale anywhere along the arc (used while boxes travel between slots). */
export function arcAt(layout: Pick<GiftsLayout, 'reach'>, x: number): { y: number; scale: number } {
  const k = layout.reach > 0 ? clamp(x / layout.reach, -1.3, 1.3) : 0;
  return { y: FLOOR_Y - ARC_RISE * k * k, scale: 1 - ARC_SHRINK * k * k };
}

// ── Play ─────────────────────────────────────────────────────────────────

export interface GiftsInput {
  /** Prizes on the wheel. */
  segments: number;
  /** Winning prize (the server's result). */
  segmentIndex: number;
  durationMs: number;
  seed: number;
}

/** Two slots whose boxes trade places; `hopper` (0 → the box from `a`) jumps over the other one. */
export interface SwapPair {
  a: number;
  b: number;
  hopper: 0 | 1;
  /** Height of the jump, in play-area units. */
  lift: number;
  /** The hopping box does a full somersault. */
  flip: boolean;
}

/** One step of the shuffle: one swap, or two at once on a wide row. */
export interface SwapGroup {
  start: number;
  end: number;
  /** 0 (slowest) to 1 (fastest swap of the play). */
  speed: number;
  pairs: SwapPair[];
  /** Box in each slot when the step starts. */
  before: number[];
}

export type GiftsEventKind = 'hop' | 'swap' | 'drum' | 'pop' | 'peek';

/** A moment that makes a sound (and maybe a tick). */
export interface GiftsEvent {
  at: number;
  kind: GiftsEventKind;
  /** 0 (slow) to 1 (fast) for swaps; loudness hint otherwise. */
  speed: number;
  /** Length of the sound (drumroll, whoosh), ms. */
  length: number;
}

export interface MissedReveal {
  box: number;
  /** When its lid pops (after landing). */
  at: number;
}

export interface GiftsPlay {
  count: number;
  layout: GiftsLayout;
  /** Intro: box `i` (in slot `i`) hops at `hops[i]` for `hopMs`. */
  hops: number[];
  hopMs: number;
  shuffleStart: number;
  shuffleEnd: number;
  groups: SwapGroup[];
  /** Box in each slot once the shuffle is over. */
  final: number[];
  /** Slot (and box) that opens with the won prize. */
  openSlot: number;
  openBox: number;
  /** Lid flies away and the prize rises (lands at `landedAt`, the play length). */
  wiggleStart: number;
  drumStart: number;
  openAt: number;
  landedAt: number;
  /** Prize (segment index) inside each box. */
  contents: number[];
  /** Pop direction of the won lid (−1 left, 1 right). */
  lidSide: number;
  missed: MissedReveal[];
  /** Sounds and ticks, in time order. */
  events: GiftsEvent[];
}

/** Shortest and longest step of a shuffle, relative to its average. */
const FAST = 0.42;
/** Average length of a swap; long plays get more swaps up to MAX_SWAPS, then slower ones. */
const SWAP_MS = 330;
const MAX_SWAPS = 40;
const MIN_SWAPS = 2;

const span = (durationMs: number, share: number, min: number, max: number) =>
  clamp(durationMs * share, min, max);

/**
 * Plans a whole play from the server's outcome and seed. Box `i` starts in slot `i`; the boxes
 * hop, trade places in a shell-game shuffle that speeds up and slows down, then the box that ends
 * in `openSlot` wiggles, pops its lid and the won prize rises out of it.
 */
export function planGifts({ segments, segmentIndex, durationMs, seed }: GiftsInput): GiftsPlay {
  const random = seededRandom(seed ^ 0x51f7a3c5);
  const count = Math.max(MIN_BOXES, boxCount(segments));
  const layout = giftsLayout(count);
  // Lands exactly on the play length, however short (phases shrink to fit).
  const duration = Math.max(1, durationMs);

  // Phases around the shuffle, squeezed on very short plays so the shuffle keeps 30 %.
  const phases = [
    span(duration, 0.12, 300, 1100),
    span(duration, 0.15, 420, 1000),
    span(duration, 0.1, 260, 900),
    span(duration, 0.03, 60, 240),
  ];
  const fixed = phases.reduce((sum, ms) => sum + ms, 0);
  const squeeze = Math.min(1, (duration * 0.7) / fixed);
  const [intro, reveal, wiggle, settle] = phases.map((ms) => ms * squeeze) as [
    number,
    number,
    number,
    number,
  ];
  const landedAt = duration;
  const openAt = landedAt - reveal;
  const wiggleStart = openAt - wiggle;
  const shuffleStart = intro;
  const shuffleEnd = wiggleStart - settle;

  const hopMs = Math.min(440, intro * 0.62);
  const stagger = count > 1 ? (intro - hopMs) / (count - 1) : 0;
  const hops = Array.from({ length: count }, (_, i) => i * stagger);

  const groups = planShuffle(random, count, shuffleStart, shuffleEnd);
  const order = Array.from({ length: count }, (_, i) => i);
  for (const group of groups) {
    group.before = order.slice();
    for (const { a, b } of group.pairs) [order[a], order[b]] = [order[b]!, order[a]!];
  }
  const final = order;

  const openSlot = Math.floor(random() * count);
  const openBox = final[openSlot]!;
  const contents = fillBoxes(random, count, openBox, segments, segmentIndex);
  const lidSide =
    layout.slots[openSlot]!.x > 0.01 ? 1 : layout.slots[openSlot]!.x < -0.01 ? -1 : random() < 0.5 ? -1 : 1;

  // The other boxes open after landing, in a seeded order.
  const others = final.filter((box) => box !== openBox);
  shuffle(random, others);
  const missed = others.map((box, j) => ({ box, at: landedAt + MISSED_DELAY + j * MISSED_GAP }));

  const drumStart = Math.max(shuffleStart, openAt - span(duration, 0.26, 500, 1900));
  const events: GiftsEvent[] = [
    ...hops.map((at) => ({ at, kind: 'hop' as const, speed: 0.5, length: hopMs })),
    ...groups.map((g) => ({ at: g.start, kind: 'swap' as const, speed: g.speed, length: g.end - g.start })),
    { at: drumStart, kind: 'drum', speed: 1, length: openAt - drumStart },
    { at: openAt, kind: 'pop', speed: 1, length: reveal },
    ...missed.map(({ at }) => ({ at, kind: 'peek' as const, speed: 0.5, length: PEEK_MS })),
  ];
  events.sort((x, y) => x.at - y.at);

  return {
    count,
    layout,
    hops,
    hopMs,
    shuffleStart,
    shuffleEnd,
    groups,
    final,
    openSlot,
    openBox,
    wiggleStart,
    drumStart,
    openAt,
    landedAt,
    contents,
    lidSide,
    missed,
    events,
  };
}

function shuffle<T>(random: () => number, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Swap steps filling [start, end): slow, fast in the middle, slow again. */
export function planShuffle(random: () => number, count: number, start: number, end: number): SwapGroup[] {
  const length = end - start;
  if (length <= 0 || count < 2) return [];
  const steps = clamp(Math.round(length / SWAP_MS), MIN_SWAPS, MAX_SWAPS);
  // Weights from 1 (ends) down to FAST (middle), so the swaps speed up and slow down.
  const weights = Array.from(
    { length: steps },
    (_, i) => 1 - (1 - FAST) * Math.sin((Math.PI * (i + 0.5)) / steps) ** 1.5,
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  const longest = Math.max(...weights);
  const shortest = Math.min(...weights);
  const groups: SwapGroup[] = [];
  let at = start;
  let last = '';
  for (let i = 0; i < steps; i++) {
    const ms = (length * weights[i]!) / total;
    const speed = longest > shortest ? (longest - weights[i]!) / (longest - shortest) : 0.5;
    const pairs: SwapPair[] = [];
    const first = pickPair(random, count, last);
    last = `${first[0]}-${first[1]}`;
    pairs.push(makePair(random, first, ms, speed));
    // Quick steps on a wide row sometimes move two pairs at once.
    if (count >= 4 && speed > 0.45 && random() < 0.35) {
      const free = Array.from({ length: count }, (_, s) => s).filter((s) => s !== first[0] && s !== first[1]);
      const adjacent = free.filter((s) => free.includes(s + 1));
      if (adjacent.length > 0) {
        const a = adjacent[Math.floor(random() * adjacent.length)]!;
        pairs.push(makePair(random, [a, a + 1], ms, speed));
      }
    }
    groups.push({ start: at, end: at + ms, speed, pairs, before: [] });
    at += ms;
  }
  // Rounding: the last step ends exactly on time.
  groups[groups.length - 1]!.end = end;
  return groups;
}

function pickPair(random: () => number, count: number, last: string): [number, number] {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = random();
    // Mostly neighbours, sometimes a longer jump.
    const gap = count === 3 ? (r < 0.72 ? 1 : 2) : r < 0.68 ? 1 : r < 0.92 ? 2 : 3;
    const span = Math.min(gap, count - 1);
    const a = Math.floor(random() * (count - span));
    const pair: [number, number] = [a, a + span];
    if (`${pair[0]}-${pair[1]}` !== last || attempt === 7) return pair;
  }
  return [0, 1];
}

function makePair(random: () => number, [a, b]: [number, number], ms: number, speed: number): SwapPair {
  const distance = b - a;
  const lift = (0.3 + 0.12 * distance + random() * 0.08) * (1 - 0.3 * speed);
  return {
    a,
    b,
    hopper: random() < 0.5 ? 0 : 1,
    lift,
    flip: ms > 380 && distance >= 2 && random() < 0.5,
  };
}

/** Prize inside each box: the won one in `openBox`, other prizes of the wheel in the rest. */
export function fillBoxes(
  random: () => number,
  count: number,
  openBox: number,
  segments: number,
  segmentIndex: number,
): number[] {
  const won = clamp(segmentIndex, 0, Math.max(0, segments - 1));
  const pool = shuffle(
    random,
    Array.from({ length: Math.max(0, segments) }, (_, i) => i).filter((i) => i !== won),
  );
  const contents: number[] = [];
  let next = 0;
  for (let box = 0; box < count; box++) {
    if (box === openBox) contents.push(won);
    else contents.push(pool.length > 0 ? pool[next++ % pool.length]! : won);
  }
  return contents;
}

// ── Poses ────────────────────────────────────────────────────────────────

export interface BoxPose {
  /** Bottom centre of the box, in play-area units. */
  x: number;
  y: number;
  scale: number;
  /** Squash and stretch about the bottom centre. */
  sx: number;
  sy: number;
  /** Tilt about the box centre, radians. */
  rot: number;
  /** Draw order (higher on top). */
  z: number;
  /** Travelling in a swap. */
  moving: boolean;
  /** Opacity of the whole box. */
  alpha: number;
  /** Lid offset from its closed place (in box widths), its tilt and opacity; the lid may fly away. */
  lidX: number;
  lidY: number;
  lidRot: number;
  lidAlpha: number;
  /** The box is open (its mouth shows). */
  open: boolean;
  /** Light leaking from under the lid, 0..1. */
  glow: number;
}

export function blankPose(): BoxPose {
  return {
    x: 0,
    y: 0,
    scale: 1,
    sx: 1,
    sy: 1,
    rot: 0,
    z: 0,
    moving: false,
    alpha: 1,
    lidX: 0,
    lidY: 0,
    lidRot: 0,
    lidAlpha: 1,
    open: false,
    glow: 0,
  };
}

/** Puts a box at rest in a slot, lid closed. */
export function restPose(pose: BoxPose, layout: GiftsLayout, slot: number): void {
  const s = layout.slots[slot]!;
  pose.x = s.x;
  pose.y = s.y;
  pose.scale = s.scale;
  pose.sx = 1;
  pose.sy = 1;
  pose.rot = 0;
  pose.z = s.scale;
  pose.moving = false;
  pose.alpha = 1;
  pose.lidX = 0;
  pose.lidY = 0;
  pose.lidRot = 0;
  pose.lidAlpha = 1;
  pose.open = false;
  pose.glow = 0;
}

/** Squash after a landing: `dt` ms since touching down. */
function landSquash(dt: number, amount: number): number {
  if (dt < 0 || dt > 260) return 0;
  return amount * Math.exp(-dt / 70) * Math.cos(dt / 42);
}

/**
 * Pose of every box (indexed by box) at `t` ms into the play. `out` is reused (no allocation once
 * it holds `play.count` poses).
 */
export function poseBoxes(play: GiftsPlay, t: number, out: BoxPose[]): BoxPose[] {
  const { layout, count } = play;
  while (out.length < count) out.push(blankPose());
  out.length = count;

  // Slot of each box at the start of the current step (or at the end).
  const group = currentGroup(play, t);
  const order = group ? group.before : t < play.shuffleStart ? null : play.final;
  for (let slot = 0; slot < count; slot++) {
    const box = order ? order[slot]! : slot;
    restPose(out[box]!, layout, slot);
  }

  if (t < play.shuffleStart) {
    for (let box = 0; box < count; box++) hopPose(out[box]!, t - play.hops[box]!, play.hopMs, layout.width);
  }

  if (group) {
    const e = (t - group.start) / (group.end - group.start);
    for (const pair of group.pairs) {
      const boxA = group.before[pair.a]!;
      const boxB = group.before[pair.b]!;
      swapPose(out[boxA]!, layout, pair.a, pair.b, e, pair.hopper === 0, pair);
      swapPose(out[boxB]!, layout, pair.b, pair.a, e, pair.hopper === 1, pair);
    }
  }

  // Boxes that just landed from a swap squash a little.
  const previous = t >= play.shuffleStart ? previousGroup(play, t) : null;
  if (previous) {
    const squash = landSquash(t - previous.end, 0.09);
    if (squash !== 0) {
      for (const pair of previous.pairs) {
        squashLanded(out[previous.before[pair.a]!]!, group, squash);
        squashLanded(out[previous.before[pair.b]!]!, group, squash);
      }
    }
  }

  // The chosen box wiggles, then pops its lid.
  const chosen = out[play.openBox]!;
  if (t >= play.wiggleStart) wigglePose(chosen, play, t);
  if (t >= play.openAt) {
    openPose(chosen, t - play.openAt, play.lidSide, 1);
    // On top of everything once open, so the prize rises in front of the other boxes.
    chosen.z = 10;
  }
  for (const { box, at } of play.missed) {
    if (t >= at) openPose(out[box]!, t - at, out[box]!.x >= 0 ? 1 : -1, 0.7);
  }
  return out;
}

/** Step running at `t`, if any. */
export function currentGroup(play: GiftsPlay, t: number): SwapGroup | null {
  if (t < play.shuffleStart || t >= play.shuffleEnd) return null;
  for (const group of play.groups) if (t >= group.start && t < group.end) return group;
  return null;
}

/** Last step finished at or before `t`. */
function previousGroup(play: GiftsPlay, t: number): SwapGroup | null {
  let found: SwapGroup | null = null;
  for (const group of play.groups) {
    if (group.end <= t) found = group;
    else break;
  }
  return found;
}

/** Squashes a box that just landed, unless it is already moving again. */
function squashLanded(pose: BoxPose, group: SwapGroup | null, squash: number): void {
  if (group && pose.moving) return;
  pose.sy *= 1 - squash;
  pose.sx *= 1 + squash * 0.6;
}

/** Intro hop: crouch, jump, land with a squash. `dt` ms since the hop started. */
function hopPose(pose: BoxPose, dt: number, hopMs: number, width: number): void {
  if (dt < 0) return;
  const crouch = hopMs * 0.18;
  if (dt < crouch) {
    const k = Math.sin((Math.PI * dt) / crouch);
    pose.sy *= 1 - 0.1 * k;
    pose.sx *= 1 + 0.06 * k;
    return;
  }
  const air = hopMs - crouch;
  const u = (dt - crouch) / air;
  if (u < 1) {
    pose.y -= width * 0.42 * Math.sin(Math.PI * u);
    pose.sy *= 1 + 0.07 * Math.sin(Math.PI * u);
    pose.sx *= 1 - 0.04 * Math.sin(Math.PI * u);
    pose.rot = 0.06 * Math.sin(2 * Math.PI * u);
    pose.lidY = -0.14 * Math.sin(Math.PI * u) ** 2;
    return;
  }
  const s = landSquash(dt - hopMs, 0.12);
  pose.sy *= 1 - s;
  pose.sx *= 1 + s * 0.6;
}

/** A box travelling from slot `from` to slot `to` (`e` 0 → 1); the hopper jumps over the other. */
function swapPose(
  pose: BoxPose,
  layout: GiftsLayout,
  from: number,
  to: number,
  e: number,
  hopper: boolean,
  pair: SwapPair,
): void {
  const a = layout.slots[from]!;
  const b = layout.slots[to]!;
  const k = easeInOutCubic(e);
  const x = lerp(a.x, b.x, k);
  const arc = arcAt(layout, x);
  const bump = Math.sin(Math.PI * k);
  const dir = Math.sign(b.x - a.x);
  pose.x = x;
  pose.y = arc.y;
  pose.scale = arc.scale;
  if (hopper) {
    pose.y -= pair.lift * bump;
    pose.scale *= 1 + 0.1 * bump;
    // Leans into the jump and back on landing, or somersaults.
    pose.rot = pair.flip ? dir * 2 * Math.PI * smooth(0.12, 0.88, k) : dir * 0.2 * Math.sin(2 * Math.PI * k);
    pose.sy = 1 + 0.06 * bump;
    pose.sx = 1 - 0.04 * bump;
    pose.lidY = -0.1 * bump;
    pose.z = 5 + bump;
    pose.moving = true;
  } else {
    // Ducks and slides underneath.
    pose.scale *= 1 - 0.06 * bump;
    pose.sy = 1 - 0.1 * bump;
    pose.sx = 1 + 0.05 * bump;
    pose.rot = -dir * 0.1 * bump;
    pose.z = arc.scale - 1;
    pose.moving = true;
  }
}

/** The chosen box shakes harder and harder, its lid rattling with light leaking out. */
function wigglePose(pose: BoxPose, play: GiftsPlay, t: number): void {
  const dt = t - play.wiggleStart;
  const length = play.openAt - play.wiggleStart;
  const u = clamp(dt / length, 0, 1);
  if (u >= 1) return;
  const amp = 0.06 + 0.16 * u * u;
  const phase = (dt / 1000) * 2 * Math.PI * (5 + 4 * u);
  pose.rot += amp * Math.sin(phase);
  pose.x += 0.008 * Math.sin(phase * 1.5) * u;
  // Little jumps on the spot, and it swells as if something wants out.
  pose.y -= 0.04 * u * Math.abs(Math.sin(phase * 0.5));
  pose.scale *= 1 + 0.06 * smooth(0, 0.8, u) * (1 - smooth(0.85, 1, u));
  const rattle = Math.max(0, Math.sin(phase * 1.3));
  pose.lidY = -(0.04 + 0.14 * u) * rattle;
  pose.lidRot = 0.08 * u * Math.sin(phase * 0.7);
  pose.glow = smooth(0.2, 1, u) * (0.55 + 0.45 * rattle);
  // Gathers itself just before it pops.
  const crouch = smooth(0.82, 1, u);
  pose.sy *= 1 - 0.1 * crouch;
  pose.sx *= 1 + 0.06 * crouch;
}

/** Lid flies off (`strength` 1 for the won box, less for the others). `dt` ms since the pop. */
function openPose(pose: BoxPose, dt: number, side: number, strength: number): void {
  pose.open = true;
  const u = clamp(dt / LID_MS, 0, 1);
  // Fly up and out, spinning, then fade (offsets in box widths).
  pose.lidX = side * 1.1 * strength * easeOutCubic(u);
  pose.lidY = -(1.8 * strength * Math.sin(Math.PI * Math.min(1, u * 0.85)) + 0.15) + 0.6 * u * u * strength;
  pose.lidRot = side * (2.6 * strength) * easeOutCubic(u);
  pose.lidAlpha = 1 - smooth(0.55, 1, u);
  pose.glow = Math.max(0, 1 - dt / 500) * strength;
  // The box jolts as the lid goes.
  const s = landSquash(dt, 0.14 * strength);
  pose.sy *= 1 + s;
  pose.sx *= 1 - s * 0.5;
}

/** Height of a box at scale 1 with its bow (play-area units). */
export function boxHeight(width: number): number {
  return width * (BOX.body + BOX.lid + BOX.bow);
}

/** Mouth of a box in a pose (where prizes come out): centre of the top of its body. */
export function mouthOf(pose: BoxPose, width: number): { x: number; y: number } {
  const h = width * BOX.body * pose.scale * pose.sy;
  return { x: pose.x + Math.sin(pose.rot) * h * 0.5, y: pose.y - h };
}

export interface PrizePose {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  /** Tilt, radians. */
  rot: number;
}

/** The won prize: rises out of the open box to the reveal spot, landing there at `landedAt`. */
export function prizePose(
  play: GiftsPlay,
  t: number,
  mouth: { x: number; y: number },
  out: PrizePose,
): PrizePose {
  const start = play.openAt + 60;
  const u = clamp((t - start) / (play.landedAt - start), 0, 1);
  const rise = easeOutBack(u, 1.4);
  out.x = lerp(mouth.x, REVEAL.x, easeOutCubic(u));
  out.y = lerp(mouth.y + 0.06, REVEAL.y, rise);
  out.scale = lerp(0.22, 1, easeOutBack(u, 1.9));
  out.alpha = t < start ? 0 : smooth(0, 0.12, u);
  out.rot = -play.lidSide * 0.22 * (1 - easeOutCubic(u));
  return out;
}

/** A missed prize peeking out of its box (`dt` ms since its lid popped); it stays half inside. */
export function peekPose(
  dt: number,
  mouth: { x: number; y: number },
  width: number,
  out: PrizePose,
): PrizePose {
  const u = clamp((dt - 80) / PEEK_MS, 0, 1);
  out.x = mouth.x;
  out.y = mouth.y - width * 0.32 * easeOutBack(u, 1.8);
  out.scale = lerp(0.4, 1, easeOutBack(u, 1.5));
  out.alpha = dt < 80 ? 0 : smooth(0, 0.2, u);
  out.rot = 0;
  return out;
}

/**
 * Where the spotlight points (x on the floor, play-area units): centred, then searching left and
 * right during the drumroll until it settles on the chosen box, and back to the middle as the
 * prize rises.
 */
export function spotAim(play: GiftsPlay, t: number): number {
  const target = play.layout.slots[play.openSlot]!.x;
  if (t < play.drumStart || t >= play.landedAt) return 0;
  if (t < play.wiggleStart) {
    const u = (t - play.drumStart) / (play.wiggleStart - play.drumStart);
    const sweep = play.layout.reach * 0.9 * Math.sin(u * 2.5 * Math.PI) * (1 - 0.4 * u);
    return lerp(sweep, target, smooth(0.55, 1, u));
  }
  if (t < play.openAt) return target;
  return lerp(target, 0, easeInOutCubic((t - play.openAt) / (play.landedAt - play.openAt)));
}

/**
 * How much the boxes other than the chosen one are shaded (0..1): the stage dims as the spotlight
 * settles on the chosen box, and stays dim once it is open.
 */
export function focusDim(play: GiftsPlay, t: number): number {
  return (
    0.7 * smooth(play.wiggleStart - 250, play.wiggleStart + 150, t) +
    0.3 * smooth(play.openAt, play.landedAt, t)
  );
}

/** Whether all the post-landing reveals are over at `t`. */
export function revealsDone(play: GiftsPlay, t: number): boolean {
  const last = play.missed[play.missed.length - 1];
  return !last || t >= last.at + LID_MS;
}

// ── Burst ────────────────────────────────────────────────────────────────

export interface Particle {
  angle: number;
  speed: number;
  size: number;
  spin: number;
  /** 0 heart, 1 star, 2 dot, 3 ribbon curl. */
  shape: number;
  /** Index into the stage's particle colours. */
  color: number;
  life: number;
}

/** Seeded pieces flying out of an opened box. */
export function burstParticles(seed: number, count: number, colors: number): Particle[] {
  const random = seededRandom(seed ^ 0x2c1b3c6d);
  return Array.from({ length: count }, () => {
    const spread = (random() - 0.5) * 2.4;
    return {
      angle: -Math.PI / 2 + spread,
      speed: 0.9 + random() * 1.1,
      size: 0.6 + random() * 0.7,
      spin: (random() - 0.5) * 9,
      shape: Math.floor(random() * 4),
      color: Math.floor(random() * colors),
      life: 750 + random() * 500,
    };
  });
}

/** Where a particle is `dt` ms after the burst, relative to its origin (play-area units), and its fade. */
export function particleAt(
  p: Particle,
  dt: number,
  out: { x: number; y: number; alpha: number; rot: number },
) {
  const s = dt / 1000;
  const drag = (1 - Math.exp(-3 * s)) / 3;
  out.x = Math.cos(p.angle) * p.speed * drag * 2.1;
  out.y = Math.sin(p.angle) * p.speed * drag * 2.1 + 0.7 * s * s;
  out.alpha = 1 - smooth(p.life * 0.55, p.life, dt);
  out.rot = p.spin * s;
  return out;
}

// ── Colours ──────────────────────────────────────────────────────────────

/** Parses `#rgb`, `#rrggbb`, `rgb()` and `rgba()` colours into [r, g, b] (0..255); null when unknown. */
export function parseColor(color: string): [number, number, number] | null {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    const full = hex.length === 3 ? [...hex].map((h) => h + h).join('') : hex.slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(full)) return null;
    const n = Number.parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Perceived brightness 0..1 (0.5 when the colour cannot be read). */
export function brightness(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0.5;
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

/** Mixes two colours (`t` 0 → a, 1 → b) into an `rgb()` string. */
export function mixColor(a: string, b: string, t: number): string {
  const pa = parseColor(a) ?? [128, 128, 128];
  const pb = parseColor(b) ?? [128, 128, 128];
  const k = clamp(t, 0, 1);
  const ch = (i: number) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/** `rgba()` of a colour with an opacity. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color) ?? [255, 255, 255];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp(alpha, 0, 1)})`;
}

// ── Labels ───────────────────────────────────────────────────────────────

/** Splits a long label into at most two balanced lines. */
export function splitLabel(label: string, maxChars = 11): string[] {
  const text = label.trim().replace(/\s+/g, ' ');
  if (text.length <= maxChars || !text.includes(' ')) return [text];
  const words = text.split(' ');
  let best: string[] = [text];
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const score = Math.max(a.length, b.length);
    if (score < bestScore) {
      bestScore = score;
      best = [a, b];
    }
  }
  return best;
}
