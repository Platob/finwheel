// DOM-free maths of Simp Drop, the plinko board: board layout, the coin's path to the winning bin,
// its motion over time and the board's lights. Everything is in play-area units: the play area is
// the square [-1, 1] × [-1, 1], x to the right, y down, origin at its centre.

import { seededRandom } from './random.js';

/** The cabinet (pink body with the gold bulb frame) and the dark glass field inside it. */
export const CABINET = { left: -0.94, right: 0.94, top: -0.95, bottom: 0.99, radius: 0.13 } as const;
/** Width of the cabinet border around the field (where the bulbs sit). */
export const BORDER = 0.085;
export const FIELD = {
  left: CABINET.left + BORDER,
  right: CABINET.right - BORDER,
  top: CABINET.top + BORDER,
  bottom: CABINET.bottom - BORDER,
  radius: 0.07,
} as const;
/** The gold rail the coin carriage slides on, near the top of the field. */
export const RAIL = { y: FIELD.top + 0.052, half: 0.62 } as const;
/** From the rail to the top of the coin hanging under the carriage. */
const HANG = 0.072;

/** Peg rows used for a board (7 … 10: more rows would make pegs and coin too small on stream). */
export const MIN_ROWS = 7;
export const MAX_ROWS = 10;
/** Peg and coin radii relative to the peg spacing. */
export const PEG_RADIUS = 0.14;
export const COIN_RADIUS = 0.42;
/** Space between the bottom of the field and the bin plates. */
const FLOOR_GAP = 0.024;

export interface BoardGeometry {
  /** Prize bins (0 draws an empty tray). */
  bins: number;
  /** Peg rows; row r has r + 3 pegs. */
  rows: number;
  /** Horizontal distance between two pegs of a row, and vertical distance between two rows. */
  spacing: number;
  rowGap: number;
  pegRadius: number;
  coinRadius: number;
  /** y of the first peg row. */
  top: number;
  /** Where the coin waits, hanging under the carriage. */
  hopper: { x: number; y: number };
  /** Bins span [binLeft, binLeft + bins × binWidth]. */
  binLeft: number;
  binWidth: number;
  /** Top of the posts between the bins, top of the label plates (the coin rests on them), bottom. */
  binTop: number;
  plateTop: number;
  binFloor: number;
  /** Gap between two plates. */
  plateGap: number;
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

/** Height of the label plates: narrow bins get taller plates for their upright labels. */
export function plateHeight(bins: number): number {
  const t = Math.min(1, Math.max(0, (bins - 6) / 8));
  return 0.15 + 0.07 * t;
}

export function boardGeometry(bins: number): BoardGeometry {
  const count = Math.max(0, Math.floor(bins));
  const rows = rowsFor(count);
  const width = FIELD.right - FIELD.left;
  // The last row spans rows + 1 spacings; half a spacing more on each side keeps it off the walls.
  const spacing = width / (rows + 2);
  const pegRadius = PEG_RADIUS * spacing;
  const coinRadius = COIN_RADIUS * spacing;
  const binFloor = FIELD.bottom - FLOOR_GAP;
  const plateTop = binFloor - plateHeight(count);
  const binTop = plateTop - Math.max(coinRadius * 2.3, 0.07);
  const hopper = { x: 0, y: RAIL.y + HANG + coinRadius };
  const top = hopper.y + coinRadius + pegRadius + 0.95 * spacing;
  const last = binTop - Math.max(0.06, 0.55 * spacing);
  const rowGap = (last - top) / (rows - 1);
  const lanes = rows + 1;
  const binWidth = (lanes * spacing) / Math.max(1, count);
  return {
    bins: count,
    rows,
    spacing,
    rowGap,
    pegRadius,
    coinRadius,
    top,
    hopper,
    binLeft: (-lanes / 2) * spacing,
    binWidth,
    binTop,
    plateTop,
    binFloor,
    plateGap: Math.min(0.014, binWidth * 0.09),
  };
}

/** Pegs in a row. */
export const pegCount = (row: number): number => row + 3;

/** Position of peg `j` of row `row`. */
export function pegPosition(geo: BoardGeometry, row: number, j: number): { x: number; y: number } {
  return { x: (j - (row + 2) / 2) * geo.spacing, y: geo.top + row * geo.rowGap };
}

/**
 * x of lane `k` under the last row: the coin starting on the middle peg of the top row leaves by
 * lane k after k bounces to the right.
 */
export const laneX = (geo: BoardGeometry, k: number): number => (k - geo.rows / 2) * geo.spacing;

export const binCenter = (geo: BoardGeometry, bin: number): number =>
  geo.binLeft + (bin + 0.5) * geo.binWidth;

/** Bin under a point (clamped to the tray). */
export function binAt(geo: BoardGeometry, x: number): number {
  const bin = Math.floor((x - geo.binLeft) / geo.binWidth);
  return Math.min(geo.bins - 1, Math.max(0, bin));
}

/**
 * Lanes that drop into `bin`: those well inside it, else the ones inside it at all, else the
 * nearest one (bins narrower than a lane).
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
  /** Where the coin touches the peg. */
  x: number;
  y: number;
}

export interface Drop {
  geo: BoardGeometry;
  target: number;
  durationMs: number;
  /** The carriage carries the coin to `releaseX` (swaying on the way) and lets go at `releaseAt`. */
  releaseAt: number;
  releaseX: number;
  /** Sway of the carriage before the release: peak offset and number of swings. */
  sway: { amplitude: number; swings: number };
  /** Peg of the top row the coin falls on first (0 … 2). */
  startPeg: number;
  flights: Flight[];
  hits: PegHit[];
  /** The coin first touches its plate at `landAt` (the end of flight `landFlight`), then bounces twice and rests at `rest`. */
  landFlight: number;
  landAt: number;
  rest: { x: number; y: number };
  /** Every bounce (pegs, plate), for the squash. */
  bounces: number[];
  /** Touches of the plate (the first one is `landAt`) and how hard each one is (1, then less). */
  plateHits: { t: number; strength: number }[];
  /** Lane (see `laneX`) it leaves the pegs by. */
  lane: number;
}

/** Gravity in peg spacings per second², at the top and (stronger, so the coin speeds up) at the bottom. */
const GRAVITY = 64;
const GRAVITY_GAIN = 0.8;
/** Hop heights in peg spacings at the top and at the bottom row. */
const HOP_TOP = 0.55;
const HOP_BOTTOM = 0.17;
/** The coin hits a peg this far off its top (degrees from vertical), towards where it bounces. */
const CONTACT_MIN = 6;
const CONTACT_MAX = 16;
/** Height of a rattle (a second bounce on the same peg), in peg spacings. */
const RATTLE_HOP = 0.3;
/** Share of the play the drop itself should fill (the carriage holds the coin before). */
const DROP_SHARE = 0.76;
/** Motion speed limits relative to its natural pace (slow motion for long plays). */
const SLOWEST = 1.3;
const SLOWEST_LONG = 1.7;
/** One carriage swing takes about this long. */
const SWING_MS = 950;

/** Builds the parabola from a to b whose top is `hop` above the higher end (0: a plain fall). */
function flight(ax: number, ay: number, bx: number, by: number, hop: number): Omit<Flight, 't0' | 't1'> {
  const dy = by - ay;
  if (hop <= 0 && dy >= 0) return { x0: ax, y0: ay, x1: bx, y1: by, b: 0, c: dy };
  const h = Math.max(hop, dy < 0 ? -dy + hop : hop);
  // y(u) = ay + b·u + c·u² reaches ay − h at its top and ends at by.
  const c = dy + 2 * h + 2 * Math.sqrt(h * Math.max(0, dy + h));
  return { x0: ax, y0: ay, x1: bx, y1: by, b: dy - c, c };
}

/** Natural duration of a flight under `gravity` (c = g·T² / 2), in seconds. */
const flightTime = (f: Omit<Flight, 't0' | 't1'>, gravity: number) =>
  Math.sqrt((2 * Math.max(f.c, 1e-9)) / gravity);

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

/** Timing of a drop: how long the carriage carries the coin and how fast the drop runs. */
export function dropTiming(naturalMs: number, durationMs: number): { releaseAt: number; scale: number } {
  const duration = Math.max(1, durationMs);
  const natural = Math.max(1, naturalMs);
  const minHold = Math.min(Math.max(duration * 0.18, 250), 700, duration * 0.5);
  const maxHold = Math.max(minHold, Math.min(duration * 0.3, 3000));
  let scale = Math.min(SLOWEST, (duration - minHold) / natural);
  if (duration - natural * scale > maxHold) scale = Math.min(SLOWEST_LONG, (duration - maxHold) / natural);
  return { releaseAt: duration - natural * scale, scale };
}

/** A point where the coin touches a peg. */
interface Touch {
  x: number;
  y: number;
  row: number;
  peg: number;
}

/**
 * Plans the whole drop: where the coin is released, every peg it bounces on (now and then twice on
 * the same peg: a rattle, more of them in long plays) and how it settles in bin `target`. A pure
 * function of the bin count, the target, the seed and the duration.
 */
export function planDrop(bins: number, target: number, seed: number, durationMs: number): Drop {
  const geo = boardGeometry(Math.max(1, bins));
  const random = seededRandom(seed);
  const s = geo.spacing;
  const rows = geo.rows;
  const duration = Math.max(1, durationMs);
  const bin = Math.min(geo.bins - 1, Math.max(0, Math.round(target)));
  const lanes = lanesForBin(geo, bin);
  const lane = lanes[Math.floor(random() * lanes.length)]!;
  // Any top peg the lane can be reached from (lane = start − 1 + bounces to the right).
  const starts = [0, 1, 2].filter((p) => lane - p + 1 >= 0 && lane - p + 1 <= rows);
  const startPeg = starts[Math.floor(random() * starts.length)]!;
  const moves = bounceOrder(rows, lane - startPeg + 1, random);
  const reach = geo.pegRadius + geo.coinRadius;
  const contactAngle = () => ((CONTACT_MIN + random() * (CONTACT_MAX - CONTACT_MIN)) * Math.PI) / 180;
  const touchAt = (row: number, peg: number, side: number, angle: number): Touch => {
    const p = pegPosition(geo, row, peg);
    return { x: p.x + side * reach * Math.sin(angle), y: p.y - reach * Math.cos(angle), row, peg };
  };

  // Where the coin touches each peg: a little off its top, on the side it bounces towards; and
  // where it would first touch it if it rattled there.
  const contacts: Touch[] = [];
  const rattles: Touch[] = [];
  const hops: number[] = [];
  let peg = startPeg;
  for (let r = 0; r < rows; r++) {
    contacts.push(touchAt(r, peg, moves[r] ? 1 : -1, contactAngle()));
    rattles.push(touchAt(r, peg, random() < 0.5 ? -1 : 1, contactAngle()));
    hops.push(0.8 + random() * 0.4);
    if (moves[r]) peg++;
  }

  // Resting place on the plate (a little off-centre when the bin is roomy).
  const room = geo.binWidth / 2 - geo.plateGap / 2 - geo.coinRadius * 1.15;
  const restX = binCenter(geo, bin) + (random() * 2 - 1) * Math.max(0, room) * 0.55;
  const restY = geo.plateTop - geo.coinRadius;
  const landX = restX + (random() * 2 - 1) * Math.min(s * 0.08, Math.max(0, room) * 0.4);
  const gravityAt = (depth: number) => GRAVITY * s * (1 + GRAVITY_GAIN * depth);
  const depthOf = (row: number) => row / Math.max(1, rows - 1);

  const plan = (rattleRows: ReadonlySet<number>) => {
    const touches: Touch[] = [];
    contacts.forEach((contact, r) => {
      if (rattleRows.has(r)) touches.push(rattles[r]!);
      touches.push(contact);
    });
    const shapes: { shape: Omit<Flight, 't0' | 't1'>; time: number }[] = [];
    const add = (shape: Omit<Flight, 't0' | 't1'>, depth: number) =>
      shapes.push({ shape, time: flightTime(shape, gravityAt(depth)) });
    add(flight(touches[0]!.x, geo.hopper.y, touches[0]!.x, touches[0]!.y, 0), 0);
    for (let i = 1; i < touches.length; i++) {
      const a = touches[i - 1]!;
      const b = touches[i]!;
      const depth = depthOf(b.row);
      const factor = hops[b.row]!;
      const hop =
        a.row === b.row ? RATTLE_HOP * s * factor : (HOP_TOP + (HOP_BOTTOM - HOP_TOP) * depth) * s * factor;
      add(flight(a.x, a.y, b.x, b.y, hop), depth);
    }
    const last = touches[touches.length - 1]!;
    add(flight(last.x, last.y, landX, restY, HOP_BOTTOM * s * 1.2), 1);
    // Two small bounces on the plate, drifting to the resting place.
    add(flight(landX, restY, (landX + restX) / 2, restY, 0.38 * s), 1);
    add(flight((landX + restX) / 2, restY, restX, restY, 0.12 * s), 1);
    const natural = shapes.reduce((sum, f) => sum + f.time, 0) * 1000;
    return { touches, shapes, natural };
  };

  // Rattles fill plays that the plain drop would leave mostly waiting at the top.
  const straight = plan(new Set());
  const rattleMs = 1000 * Math.sqrt((8 * RATTLE_HOP) / (GRAVITY * (1 + GRAVITY_GAIN * 0.3)));
  const wanted = (duration * DROP_SHARE) / SLOWEST - straight.natural;
  const eligible = Array.from({ length: Math.max(0, rows - 3) }, (_, i) => i + 1);
  const most = Math.min(eligible.length, Math.max(2, Math.floor(duration / 1700)));
  const count = Math.max(0, Math.min(most, Math.floor(wanted / rattleMs)));
  const chosen = new Set<number>();
  while (chosen.size < count) {
    const pick = eligible.splice(Math.floor(random() * eligible.length), 1)[0];
    if (pick === undefined) break;
    chosen.add(pick);
  }
  const { touches, shapes, natural } = count > 0 ? plan(chosen) : straight;

  const { releaseAt, scale } = dropTiming(natural, duration);
  const flights: Flight[] = [];
  let t = releaseAt;
  for (const { shape, time } of shapes) {
    const t1 = t + time * 1000 * scale;
    flights.push({ ...shape, t0: t, t1 });
    t = t1;
  }
  // Rounding never lets the last bounce end after the play.
  flights[flights.length - 1]!.t1 = duration;

  const k = geo.pegRadius / reach;
  const hits = touches.map((touch, i) => {
    const p = pegPosition(geo, touch.row, touch.peg);
    return {
      t: flights[i]!.t1,
      row: touch.row,
      peg: touch.peg,
      depth: depthOf(touch.row),
      x: p.x + (touch.x - p.x) * k,
      y: p.y + (touch.y - p.y) * k,
    };
  });
  const landFlight = touches.length;
  const landAt = flights[landFlight]!.t1;
  const plateHits = flights
    .slice(landFlight, -1)
    .map((f, i) => ({ t: f.t1, strength: i === 0 ? 1 : 0.35 / i }));
  const swings = Math.floor(releaseAt / SWING_MS);
  return {
    geo,
    target: bin,
    durationMs: duration,
    releaseAt,
    releaseX: touches[0]!.x,
    sway: {
      amplitude:
        swings > 0 ? Math.min(2.4 * s, 0.32) * (0.65 + random() * 0.35) * (random() < 0.5 ? -1 : 1) : 0,
      swings,
    },
    startPeg,
    flights,
    hits,
    landFlight,
    landAt,
    rest: { x: restX, y: restY },
    bounces: flights.slice(0, -1).map((f) => f.t1),
    plateHits,
    lane,
  };
}

/** Where the coin is and how it looks at `t` ms into a drop. */
export interface CoinPose {
  x: number;
  y: number;
  /** Rotation in radians (it rolls as it moves sideways, tilts as the carriage sways). */
  angle: number;
  /** Horizontal scale of the face while it flips (−1 … 1). */
  flip: number;
  /** Squash on impact, 0 … 1. */
  squash: number;
  /** Index of the current flight (−1 while carried). */
  flight: number;
}

const smooth = (u: number) => u * u * (3 - 2 * u);
export const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));

/** Envelope of the carriage sway: 0 at both ends with a flat start and end, peak 1 at u = 1/3. */
const swayEnvelope = (u: number) => 6.75 * u * (1 - u) * (1 - u);

/** x of the carriage at `t`: it sways towards the release spot, lets go, then glides back home. */
export function carriageX(drop: Drop, t: number): number {
  const home = drop.geo.hopper.x;
  if (t >= drop.releaseAt) {
    const back = smooth(clamp01((t - drop.releaseAt - 250) / 900));
    return drop.releaseX + (home - drop.releaseX) * back;
  }
  const u = clamp01(t / Math.max(1, drop.releaseAt));
  const { amplitude, swings } = drop.sway;
  const sway = swings > 0 ? amplitude * swayEnvelope(u) * Math.sin(Math.PI * 2 * swings * u) : 0;
  return home + (drop.releaseX - home) * smooth(u) + sway;
}

/** Upward kick of the carriage as it lets go (0 … 1, a damped bounce). */
export function carriageKick(drop: Drop, t: number): number {
  const since = t - drop.releaseAt;
  if (since < 0 || since > 600) return 0;
  return Math.exp(-since / 140) * Math.cos(since / 55);
}

/** Coin waiting under the carriage (idle): it bobs gently. */
export function idleCoin(geo: BoardGeometry, t: number): CoinPose {
  const s = geo.spacing;
  return {
    x: geo.hopper.x,
    y: geo.hopper.y + Math.sin(t / 520) * s * 0.05,
    angle: Math.sin(t / 830) * 0.12,
    flip: 1,
    squash: 0,
    flight: -1,
  };
}

/** The coin flips on itself just before the release, this long. */
const FLIP_MS = 420;

export function coinAt(drop: Drop, t: number): CoinPose {
  const { geo, flights } = drop;
  if (t < drop.releaseAt) {
    // Carried: hangs under the carriage and lags behind its sway like a pendulum.
    const x = carriageX(drop, t);
    const ahead = carriageX(drop, t + 60);
    const behind = carriageX(drop, t - 60);
    const accel = (ahead - 2 * x + behind) / geo.spacing;
    const flipMs = Math.min(FLIP_MS, drop.releaseAt * 0.8);
    const flipU = clamp01((t - (drop.releaseAt - flipMs)) / Math.max(1, flipMs));
    return {
      x,
      y: geo.hopper.y + Math.sin(t / 520) * geo.spacing * 0.05 * (1 - flipU),
      angle: Math.max(-0.45, Math.min(0.45, -accel * 1.2)),
      flip: Math.cos(Math.PI * 2 * smooth(flipU)),
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
    angle: ((x - drop.releaseX) / geo.coinRadius) * 0.6,
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

/** How far the winning plate is pushed down by the coin at `t` (a damped spring, ≥ 0 at first). */
export function plateDip(drop: Drop, t: number): number {
  let dip = 0;
  for (const hit of drop.plateHits) {
    const since = t - hit.t;
    if (since < 0 || since > 900) continue;
    dip +=
      hit.strength *
      Math.exp(-since / 160) *
      Math.sin(Math.PI * 0.5 + since / 70) *
      (since < 35 ? since / 35 : 1);
  }
  return dip;
}

/** Shock ring as the coin lands: grows from the coin over 520 ms (null outside that moment). */
export function landingRing(drop: Drop, t: number): { radius: number; alpha: number } | null {
  const since = t - drop.landAt;
  if (since < 0 || since >= 520) return null;
  const u = since / 520;
  const ease = 1 - (1 - u) ** 3;
  return { radius: drop.geo.coinRadius * (1 + 3.2 * ease), alpha: (1 - u) ** 1.5 };
}

/** How brightly each peg flashes at `t`: hits within the last `fadeMs`. */
export function flashes(drop: Drop, t: number, fadeMs = 420): { row: number; peg: number; level: number }[] {
  const out: { row: number; peg: number; level: number }[] = [];
  for (const hit of drop.hits) {
    const since = t - hit.t;
    if (since >= 0 && since < fadeMs) out.push({ row: hit.row, peg: hit.peg, level: 1 - since / fadeMs });
  }
  return out;
}

/** Pegs already hit at `t` (they keep a soft afterglow, tracing the coin's path). */
export function litPegs(drop: Drop, t: number): PegHit[] {
  return drop.hits.filter((hit) => hit.t <= t);
}

/** A spark thrown off a peg hit. */
export interface Spark {
  x: number;
  y: number;
  /** Size relative to the peg spacing, and opacity. */
  size: number;
  alpha: number;
}

const SPARKS_PER_HIT = 4;
const SPARK_MS = 420;

/** Sparks flying off the pegs hit in the last SPARK_MS: a pure function of the drop and `t`. */
export function sparks(drop: Drop, t: number): Spark[] {
  const out: Spark[] = [];
  const s = drop.geo.spacing;
  for (const hit of drop.hits) {
    const since = t - hit.t;
    if (since < 0 || since >= SPARK_MS) continue;
    const u = since / SPARK_MS;
    for (let k = 0; k < SPARKS_PER_HIT; k++) {
      const h1 = pegHash(hit.row * 7 + k, hit.peg * 13 + k);
      const h2 = pegHash(hit.peg + k * 31, hit.row + 101);
      // Mostly upwards and outwards, like a splash.
      const angle = -Math.PI / 2 + (h1 - 0.5) * 2.8;
      const reach = (0.35 + 0.45 * h2) * s * (1 - Math.exp(-since / 110));
      out.push({
        x: hit.x + Math.cos(angle) * reach,
        y: hit.y + Math.sin(angle) * reach + 0.5 * s * u * u,
        size: (0.1 + 0.08 * h2) * (1 - 0.4 * u),
        alpha: (1 - u) * (1 - u),
      });
    }
  }
  return out;
}

// ── Lights ───────────────────────────────────────────────────────────────

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

/**
 * Idle wave: every `periodMs` a soft band of light rolls down the rows, inviting a drop. Level of a
 * row at depth 0 … 1 (0 when the band is elsewhere).
 */
export function idleWave(depth: number, t: number, periodMs = 5600, travelMs = 1500): number {
  const phase = (((t % periodMs) + periodMs) % periodMs) / travelMs;
  const d = (depth - (phase * 1.4 - 0.2)) / 0.13;
  return d * d > 9 ? 0 : Math.exp(-d * d);
}

/**
 * Party wave after a win: rings of light spread from the winning bin through the pegs, one ring
 * every `everyMs` (each peg lights up at most 1000 / everyMs times per second).
 */
export function partyWave(distance: number, since: number, everyMs = 650, speed = 1.6): number {
  if (since < 0) return 0;
  const reach = (since / 1000) * speed - distance;
  if (reach < 0) return 0;
  const phase = (reach / speed) * 1000;
  const u = (phase % everyMs) / everyMs;
  return Math.max(0, 1 - u * 3.2);
}

export type BulbMode = 'idle' | 'play' | 'win' | 'party';

/**
 * Brightness (0 … 1) of bulb `i` of `count` round the frame. Idle: a slow sparkle drifts round;
 * play: a quicker chase; win: the bulbs breathe; party: even and odd bulbs alternate (≤ 2.5 Hz).
 */
export function bulbLevel(i: number, count: number, t: number, mode: BulbMode): number {
  const pos = i / Math.max(1, count);
  if (mode === 'party') {
    const beat = Math.floor(t / 400) % 2;
    return (i + beat) % 2 === 0 ? 1 : 0.18;
  }
  if (mode === 'win') return 0.55 + 0.45 * Math.sin(t / 260 + pos * Math.PI * 8) ** 2;
  const speed = mode === 'play' ? 1 / 2600 : 1 / 9000;
  const wave = Math.sin(Math.PI * 2 * (pos * 4 - t * speed));
  const peak = Math.max(0, wave) ** 6;
  return (mode === 'play' ? 0.42 : 0.5) + (mode === 'play' ? 0.58 : 0.5) * peak;
}

/** Bulb centres evenly spaced round a rounded rectangle (clockwise from the top-left straight). */
export function bulbPoints(
  box: { left: number; right: number; top: number; bottom: number },
  radius: number,
  step: number,
): { x: number; y: number }[] {
  const w = box.right - box.left - 2 * radius;
  const h = box.bottom - box.top - 2 * radius;
  const arc = (Math.PI / 2) * radius;
  const perimeter = 2 * (w + h) + 4 * arc;
  const count = Math.max(4, Math.round(perimeter / step));
  const points: { x: number; y: number }[] = [];
  const corner = (cx: number, cy: number, a: number) => ({
    x: cx + Math.cos(a) * radius,
    y: cy + Math.sin(a) * radius,
  });
  // Walks the outline: top, top-right corner, right, … ; `d` is the distance along it.
  const segments: { length: number; at: (u: number) => { x: number; y: number } }[] = [
    { length: w, at: (u) => ({ x: box.left + radius + u * w, y: box.top }) },
    {
      length: arc,
      at: (u) => corner(box.right - radius, box.top + radius, -Math.PI / 2 + (u * Math.PI) / 2),
    },
    { length: h, at: (u) => ({ x: box.right, y: box.top + radius + u * h }) },
    { length: arc, at: (u) => corner(box.right - radius, box.bottom - radius, (u * Math.PI) / 2) },
    { length: w, at: (u) => ({ x: box.right - radius - u * w, y: box.bottom }) },
    {
      length: arc,
      at: (u) => corner(box.left + radius, box.bottom - radius, Math.PI / 2 + (u * Math.PI) / 2),
    },
    { length: h, at: (u) => ({ x: box.left, y: box.bottom - radius - u * h }) },
    { length: arc, at: (u) => corner(box.left + radius, box.top + radius, Math.PI + (u * Math.PI) / 2) },
  ];
  for (let i = 0; i < count; i++) {
    let d = ((i + 0.5) / count) * perimeter;
    for (const segment of segments) {
      if (d <= segment.length || segment === segments[segments.length - 1]) {
        points.push(segment.at(segment.length > 0 ? Math.min(1, d / segment.length) : 0));
        break;
      }
      d -= segment.length;
    }
  }
  return points;
}
