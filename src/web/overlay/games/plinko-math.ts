// DOM-free maths of Simp Drop, the plinko board: board layout, the coin's path to the winning bin
// and its motion over time. Everything is in play-area units: the play area is the square
// [-1, 1] × [-1, 1], x to the right, y down, origin at its centre.

import { seededRandom } from './random.js';

/** The cabinet (pink body with the bulb frame) and the dark glass field inside it. */
export const CABINET = { left: -0.94, right: 0.94, top: -0.95, bottom: 0.99, radius: 0.12 } as const;
/** Width of the cabinet border around the field (where the bulbs sit). */
export const BORDER = 0.085;
export const FIELD = {
  left: CABINET.left + BORDER,
  right: CABINET.right - BORDER,
  top: CABINET.top + BORDER,
  bottom: CABINET.bottom - BORDER,
  radius: 0.06,
} as const;

/** Peg rows used for a board with `bins` prize bins. */
export const MIN_ROWS = 8;
export const MAX_ROWS = 15;
/** Peg and coin radii relative to the peg spacing (the coin fits between two pegs). */
export const PEG_RADIUS = 0.115;
export const COIN_RADIUS = 0.37;
/** Height of the bins and the space between the last peg row and the bins. */
const BIN_HEIGHT = 0.25;
const EXIT_GAP = 0.085;
/** Space above the first peg row, in peg spacings (nozzle + waiting coin). */
const TOP_ZONE = 2.15;
const NOZZLE = 0.075;

export interface BoardGeometry {
  /** Prize bins (0 draws an empty tray). */
  bins: number;
  /** Peg rows; row r has r + 3 pegs. */
  rows: number;
  /** Horizontal distance between two pegs of a row, and between two rows. */
  spacing: number;
  rowGap: number;
  pegRadius: number;
  coinRadius: number;
  /** y of the first peg row. */
  top: number;
  /** Where the coin waits (under the nozzle). */
  hopper: { x: number; y: number };
  /** Bins span [binLeft, binLeft + bins × binWidth], from binTop down to binFloor. */
  binLeft: number;
  binWidth: number;
  binTop: number;
  binFloor: number;
}

/**
 * Rows for a board: one more lane than rows, so `bins − 1` rows gives one lane per bin (the
 * classic triangle). Few prizes get wider bins that span several lanes; many prizes share lanes.
 */
export function rowsFor(bins: number): number {
  if (bins >= MIN_ROWS + 1 && bins <= MAX_ROWS + 1) return bins - 1;
  if (bins > MAX_ROWS + 1) return MAX_ROWS;
  // Few prizes: the most rows whose lanes split evenly between the bins.
  for (let rows = MAX_ROWS; rows >= MIN_ROWS; rows--) {
    if ((rows + 1) % Math.max(1, bins) === 0) return rows;
  }
  return MAX_ROWS;
}

export function boardGeometry(bins: number): BoardGeometry {
  const rows = rowsFor(bins);
  const width = FIELD.right - FIELD.left;
  // The last row spans rows + 1 spacings; half a spacing more on each side keeps it off the walls.
  const spacing = width / (rows + 2);
  const binFloor = FIELD.bottom - 0.02;
  const binTop = binFloor - BIN_HEIGHT;
  const top = FIELD.top + NOZZLE + TOP_ZONE * spacing;
  const last = binTop - EXIT_GAP;
  const rowGap = (last - top) / (rows - 1);
  const lanes = rows + 1;
  return {
    bins,
    rows,
    spacing,
    rowGap,
    pegRadius: PEG_RADIUS * spacing,
    coinRadius: COIN_RADIUS * spacing,
    top,
    hopper: { x: 0, y: top - 1.42 * spacing },
    binLeft: (-lanes / 2) * spacing,
    binWidth: (lanes * spacing) / Math.max(1, bins),
    binTop,
    binFloor,
  };
}

/** Pegs in a row. */
export const pegCount = (row: number): number => row + 3;

/** Position of peg `j` of row `row`. */
export function pegPosition(geo: BoardGeometry, row: number, j: number): { x: number; y: number } {
  return { x: (j - (row + 2) / 2) * geo.spacing, y: geo.top + row * geo.rowGap };
}

/** x of the lane the coin leaves the last row by after `rights` bounces to the right. */
export const laneX = (geo: BoardGeometry, rights: number): number => (rights - geo.rows / 2) * geo.spacing;

export const binCenter = (geo: BoardGeometry, bin: number): number =>
  geo.binLeft + (bin + 0.5) * geo.binWidth;

/** Bin under a point (clamped to the tray). */
export function binAt(geo: BoardGeometry, x: number): number {
  const bin = Math.floor((x - geo.binLeft) / geo.binWidth);
  return Math.min(geo.bins - 1, Math.max(0, bin));
}

/**
 * Lanes (counted in bounces to the right) that drop into `bin`: those well inside it, else the ones
 * inside it at all, else the nearest one (bins narrower than a lane).
 */
export function lanesForBin(geo: BoardGeometry, bin: number): number[] {
  const left = geo.binLeft + bin * geo.binWidth;
  const right = left + geo.binWidth;
  const lanes = Array.from({ length: geo.rows + 1 }, (_, k) => k);
  const margin = Math.min(geo.spacing * 0.3, geo.binWidth * 0.25);
  const inside = (m: number) => lanes.filter((k) => laneX(geo, k) > left + m && laneX(geo, k) < right - m);
  const well = inside(margin);
  if (well.length > 0) return well;
  const any = inside(0);
  if (any.length > 0) return any;
  const center = binCenter(geo, bin);
  let best = 0;
  for (const k of lanes) if (Math.abs(laneX(geo, k) - center) < Math.abs(laneX(geo, best) - center)) best = k;
  return [best];
}

// ── The drop ───────────────────────────────────────────────────────────────

/** One flight of the coin: a parabola from (x0, y0) to (x1, y1) between two times. */
export interface Flight {
  t0: number;
  t1: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** y(u) = y0 + b·u + c·u² for u ∈ [0, 1] (c > 0: gravity). */
  b: number;
  c: number;
}

/** A peg the coin hits. */
export interface PegHit {
  t: number;
  row: number;
  peg: number;
  /** 0 at the top row to 1 at the last one. */
  depth: number;
}

export interface Drop {
  geo: BoardGeometry;
  target: number;
  durationMs: number;
  /** The coin flips in front of the nozzle until `releaseAt`, sliding to `releaseX`. */
  releaseAt: number;
  releaseX: number;
  /** Turns of the coin flip before the release. */
  flipTurns: number;
  flights: Flight[];
  hits: PegHit[];
  /** The coin first touches the bottom of its bin, then bounces twice and rests at `rest`. */
  landAt: number;
  rest: { x: number; y: number };
  /** Every bounce (pegs, bin floor), for the squash and the tick sounds. */
  bounces: number[];
  /** Lane (bounces to the right) it leaves the pegs by. */
  lane: number;
}

/** Gravity in peg spacings per second², at the top and (stronger, so the coin speeds up) at the bottom. */
const GRAVITY = 64;
const GRAVITY_GAIN = 0.75;
/** Hop heights in peg spacings at the top and at the bottom row. */
const HOP_TOP = 0.55;
const HOP_BOTTOM = 0.17;
/** The coin hits a peg this far off its top (degrees from vertical), towards where it bounces. */
const CONTACT_MIN = 13;
const CONTACT_MAX = 30;

/** Builds the parabola from a to b whose top is `hop` above the higher end (0: a plain fall). */
function flight(ax: number, ay: number, bx: number, by: number, hop: number): Omit<Flight, 't0' | 't1'> {
  const dy = by - ay;
  if (hop <= 0 && dy >= 0) return { x0: ax, y0: ay, x1: bx, y1: by, b: 0, c: dy };
  const h = Math.max(hop, dy < 0 ? -dy + hop : hop);
  // y(u) = ay + b·u + c·u² reaches ay − h at its top and ends at by.
  const c = dy + 2 * h + 2 * Math.sqrt(h * Math.max(0, dy + h));
  return { x0: ax, y0: ay, x1: bx, y1: by, b: dy - c, c };
}

/** Natural duration of a flight under `gravity` (c = g·T² / 2). */
const flightTime = (f: Omit<Flight, 't0' | 't1'>, gravity: number) => Math.sqrt((2 * Math.max(f.c, 1e-9)) / gravity);

/** A uniformly random order of `rights` right bounces among `rows`. */
function bounceOrder(rows: number, rights: number, random: () => number): boolean[] {
  const moves: boolean[] = [];
  let left = rights;
  for (let r = 0; r < rows; r++) {
    const right = random() < left / (rows - r);
    if (right) left--;
    moves.push(right);
  }
  return moves;
}

/**
 * Plans the whole drop: where the coin is released, every peg it bounces on and how it settles in
 * bin `target`. A pure function of the bin count, the target, the seed and the duration.
 */
export function planDrop(bins: number, target: number, seed: number, durationMs: number): Drop {
  const geo = boardGeometry(Math.max(1, bins));
  const random = seededRandom(seed);
  const s = geo.spacing;
  const rows = geo.rows;
  const bin = Math.min(geo.bins - 1, Math.max(0, Math.round(target)));
  const lanes = lanesForBin(geo, bin);
  const lane = lanes[Math.floor(random() * lanes.length)]!;
  const moves = bounceOrder(rows, lane, random);
  const reach = geo.pegRadius + geo.coinRadius;

  // Where the coin touches each peg: a little off its top, on the side it bounces towards.
  const hitPoints: { x: number; y: number; peg: number }[] = [];
  let peg = 1;
  for (let r = 0; r < rows; r++) {
    const dir = moves[r] ? 1 : -1;
    const angle = ((CONTACT_MIN + random() * (CONTACT_MAX - CONTACT_MIN)) * Math.PI) / 180;
    const p = pegPosition(geo, r, peg);
    hitPoints.push({ x: p.x + dir * reach * Math.sin(angle), y: p.y - reach * Math.cos(angle), peg });
    if (moves[r]) peg++;
  }

  // Resting place in the bin (a little off-centre when the bin is roomy).
  const roomy = geo.binWidth > geo.coinRadius * 2.6;
  const slack = roomy ? (geo.binWidth / 2 - geo.coinRadius * 1.2) * 0.6 : 0;
  const restX = binCenter(geo, bin) + (random() * 2 - 1) * slack;
  // A coin wider than its bin rests on the bin's mouth.
  const fits = geo.binWidth > geo.coinRadius * 2.1;
  const restY = fits ? geo.binFloor - geo.coinRadius - 0.004 : geo.binTop + geo.coinRadius * 0.15;

  const shapes: { shape: Omit<Flight, 't0' | 't1'>; time: number }[] = [];
  const gravityAt = (depth: number) => GRAVITY * s * (1 + GRAVITY_GAIN * depth);
  const releaseX = hitPoints[0]!.x;
  const first = flight(releaseX, geo.hopper.y, releaseX, hitPoints[0]!.y, 0);
  shapes.push({ shape: first, time: flightTime(first, gravityAt(0)) });
  for (let r = 1; r < rows; r++) {
    const depth = r / Math.max(1, rows - 1);
    const hop = (HOP_TOP + (HOP_BOTTOM - HOP_TOP) * depth) * s * (0.8 + random() * 0.4);
    const a = hitPoints[r - 1]!;
    const b = hitPoints[r]!;
    const shape = flight(a.x, a.y, b.x, b.y, hop);
    shapes.push({ shape, time: flightTime(shape, gravityAt(depth)) });
  }
  const last = hitPoints[rows - 1]!;
  const drop = flight(last.x, last.y, restX + (random() * 2 - 1) * s * 0.04, restY, HOP_BOTTOM * s * 1.2);
  shapes.push({ shape: drop, time: flightTime(drop, gravityAt(1)) });
  const landX = drop.x1;
  // Two small bounces in the bin, drifting to the resting place.
  const settleHops = fits ? [0.42, 0.13] : [0.22, 0.07];
  let x = landX;
  settleHops.forEach((hop, i) => {
    const nx = i === settleHops.length - 1 ? restX : (x + restX) / 2;
    const shape = flight(x, restY, nx, restY, hop * s);
    shapes.push({ shape, time: flightTime(shape, gravityAt(1)) });
    x = nx;
  });

  // Fit the motion into the play: a short flip at the nozzle first, then the drop in (almost)
  // natural time; long plays slow down a little and flip longer.
  const natural = shapes.reduce((sum, f) => sum + f.time, 0) * 1000;
  const duration = Math.max(1, durationMs);
  const minFlip = Math.min(0.25 * duration, 500);
  const maxFlip = Math.min(0.3 * duration, 3000);
  let scale = (duration - minFlip) / natural;
  if (scale > 1.25) scale = Math.max(1.25, (duration - maxFlip) / natural);
  const releaseAt = duration - natural * scale;

  const flights: Flight[] = [];
  let t = releaseAt;
  for (const { shape, time } of shapes) {
    const t1 = t + time * 1000 * scale;
    flights.push({ ...shape, t0: t, t1 });
    t = t1;
  }
  // Rounding never lets the last bounce end after the play.
  flights[flights.length - 1]!.t1 = duration;

  const hits = hitPoints.map((p, r) => ({
    t: flights[r]!.t1,
    row: r,
    peg: p.peg,
    depth: r / Math.max(1, rows - 1),
  }));
  const landAt = flights[rows]!.t1;
  return {
    geo,
    target: bin,
    durationMs: duration,
    releaseAt,
    releaseX,
    flipTurns: Math.max(1, Math.round(releaseAt / 380)),
    flights,
    hits,
    landAt,
    rest: { x: restX, y: restY },
    bounces: flights.slice(0, -1).map((f) => f.t1),
    lane,
  };
}

/** Where the coin is and how it looks at `t` ms into a drop. */
export interface CoinPose {
  x: number;
  y: number;
  /** Rotation in radians (it rolls as it moves sideways). */
  angle: number;
  /** Horizontal scale of the face while it flips (−1 … 1). */
  flip: number;
  /** Squash on impact, 0 … 1. */
  squash: number;
  /** Index of the current flight (−1 before the release). */
  flight: number;
}

const smooth = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

/** Coin waiting under the nozzle (idle): it bobs gently. */
export function idleCoin(geo: BoardGeometry, t: number): CoinPose {
  const s = geo.spacing;
  return {
    x: geo.hopper.x,
    y: geo.hopper.y + Math.sin(t / 520) * s * 0.07,
    angle: Math.sin(t / 830) * 0.12,
    flip: 1,
    squash: 0,
    flight: -1,
  };
}

export function coinAt(drop: Drop, t: number): CoinPose {
  const { geo, flights } = drop;
  const s = geo.spacing;
  if (t < drop.releaseAt) {
    // Spins on itself in front of the nozzle while it slides to its release spot.
    const u = clamp01(t / Math.max(1, drop.releaseAt));
    const slide = smooth(clamp01((u - 0.15) / 0.7));
    const flipPhase = drop.flipTurns * Math.PI * 2 * (u * u * (2 - u));
    const lift = Math.sin(Math.PI * u) * s * 0.18;
    return {
      x: geo.hopper.x + (drop.releaseX - geo.hopper.x) * slide,
      y: geo.hopper.y - lift,
      angle: 0,
      flip: Math.cos(flipPhase),
      squash: 0,
      flight: -1,
    };
  }
  let i = flights.findIndex((f) => t < f.t1);
  if (i < 0) i = flights.length - 1;
  const f = flights[i]!;
  const u = clamp01((t - f.t0) / Math.max(1e-6, f.t1 - f.t0));
  const x = f.x0 + (f.x1 - f.x0) * u;
  const y = f.y0 + f.b * u + f.c * u * u;
  return {
    x,
    y,
    angle: ((x - drop.releaseX) / geo.coinRadius) * 0.55,
    flip: 1,
    squash: squashAt(drop, t),
    flight: i,
  };
}

/** Squash after the latest bounce (fades in 90 ms). */
export function squashAt(drop: Drop, t: number): number {
  let last = -Infinity;
  for (const b of drop.bounces) {
    if (b <= t) last = b;
    else break;
  }
  const since = t - last;
  if (since < 0 || since > 90) return 0;
  return 1 - since / 90;
}

/** True once the coin rests in its bin. */
export const landed = (drop: Drop, t: number): boolean => t >= drop.durationMs;

/** How brightly each peg flashes at `t`: hits within the last `fadeMs`. */
export function flashes(drop: Drop, t: number, fadeMs = 380): { row: number; peg: number; level: number }[] {
  const out: { row: number; peg: number; level: number }[] = [];
  for (const hit of drop.hits) {
    const since = t - hit.t;
    if (since >= 0 && since < fadeMs) out.push({ row: hit.row, peg: hit.peg, level: 1 - since / fadeMs });
  }
  return out;
}

/** Hash in [0, 1) of a peg, for idle twinkles. */
export function pegHash(row: number, peg: number): number {
  let h = Math.imul(row + 1, 0x9e3779b1) ^ Math.imul(peg + 7, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae3d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Idle twinkle of a peg, 0 … 1: every peg brightens briefly once per `periodMs`, at its own
 * moment, so a few pegs shimmer at any time.
 */
export function twinkle(row: number, peg: number, t: number, periodMs = 4200): number {
  const phase = (t / periodMs + pegHash(row, peg)) % 1;
  const width = 0.09;
  if (phase > width) return 0;
  return Math.sin((phase / width) * Math.PI);
}
