import { describe, expect, it } from 'vitest';
import {
  binAt,
  binCenter,
  boardGeometry,
  bulbLevel,
  bulbPoints,
  carriageX,
  coinAt,
  dropTiming,
  FIELD,
  flashes,
  idleWave,
  lanesForBin,
  landingRing,
  laneX,
  litPegs,
  MAX_ROWS,
  MIN_ROWS,
  partyWave,
  pegCount,
  pegPosition,
  planDrop,
  plateDip,
  RAIL,
  rowsFor,
  sparks,
  twinkle,
} from './plinko-math.js';
import { seededRandom } from './random.js';

const BIN_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 20, 24, 32, 48, 64];

describe('board geometry', () => {
  it('keeps every board inside the field, top to bottom', () => {
    for (let bins = 0; bins <= 64; bins++) {
      const geo = boardGeometry(bins);
      expect(geo.rows).toBeGreaterThanOrEqual(MIN_ROWS);
      expect(geo.rows).toBeLessThanOrEqual(MAX_ROWS);
      expect(geo.hopper.y - geo.coinRadius).toBeGreaterThan(RAIL.y);
      expect(geo.hopper.y + geo.coinRadius).toBeLessThan(geo.top - geo.pegRadius);
      const lastRow = geo.top + (geo.rows - 1) * geo.rowGap;
      expect(geo.rowGap).toBeGreaterThan(geo.spacing * 0.6);
      expect(lastRow + geo.pegRadius).toBeLessThan(geo.binTop);
      expect(geo.binTop).toBeLessThan(geo.plateTop);
      expect(geo.plateTop).toBeLessThan(geo.binFloor);
      expect(geo.binFloor).toBeLessThanOrEqual(FIELD.bottom);
      // Pegs and bins stay off the walls.
      const last = pegPosition(geo, geo.rows - 1, 0);
      expect(last.x - geo.pegRadius).toBeGreaterThan(FIELD.left);
      expect(geo.binLeft).toBeGreaterThanOrEqual(FIELD.left);
      expect(geo.binLeft + Math.max(1, bins) * geo.binWidth).toBeLessThanOrEqual(FIELD.right + 1e-9);
    }
  });

  it('gives one lane per bin on mid-sized boards and splits lanes evenly for few prizes', () => {
    for (let bins = MIN_ROWS + 1; bins <= MAX_ROWS + 1; bins++) expect(rowsFor(bins)).toBe(bins - 1);
    for (const bins of [2, 3, 4, 5]) expect((rowsFor(bins) + 1) % bins).toBe(0);
    expect(rowsFor(64)).toBe(MAX_ROWS);
  });

  it('centres the pegs of each row and staggers the rows', () => {
    const geo = boardGeometry(10);
    for (let row = 0; row < geo.rows; row++) {
      const first = pegPosition(geo, row, 0).x;
      const last = pegPosition(geo, row, pegCount(row) - 1).x;
      expect(first + last).toBeCloseTo(0, 9);
    }
    expect(pegPosition(geo, 1, 0).x).toBeCloseTo(pegPosition(geo, 0, 0).x - geo.spacing / 2, 9);
  });

  it('finds lanes for every bin', () => {
    for (const bins of BIN_COUNTS) {
      const geo = boardGeometry(bins);
      for (let bin = 0; bin < bins; bin++) {
        const lanes = lanesForBin(geo, bin);
        expect(lanes.length).toBeGreaterThan(0);
        for (const lane of lanes) {
          expect(lane).toBeGreaterThanOrEqual(0);
          expect(lane).toBeLessThanOrEqual(geo.rows);
        }
        expect(binAt(geo, binCenter(geo, bin))).toBe(bin);
      }
    }
  });
});

describe('planDrop', () => {
  it('always ends in the target bin, for many seeds and bin counts', () => {
    const random = seededRandom(42);
    for (const bins of BIN_COUNTS) {
      for (let n = 0; n < 60; n++) {
        const target = Math.floor(random() * bins);
        const seed = Math.floor(random() * 2 ** 32);
        const duration = 1500 + random() * 28000;
        const drop = planDrop(bins, target, seed, duration);
        expect(drop.target).toBe(target);
        expect(binAt(drop.geo, drop.rest.x)).toBe(target);
        const end = coinAt(drop, duration);
        expect(end.x).toBeCloseTo(drop.rest.x, 9);
        expect(end.y).toBeCloseTo(drop.rest.y, 9);
        // It rests on its plate, inside its bin.
        expect(drop.rest.y + drop.geo.coinRadius).toBeCloseTo(drop.geo.plateTop, 9);
        const left = drop.geo.binLeft + target * drop.geo.binWidth;
        expect(drop.rest.x).toBeGreaterThanOrEqual(left);
        expect(drop.rest.x).toBeLessThanOrEqual(left + drop.geo.binWidth);
      }
    }
  });

  it('bounces down row by row, moving at most one peg to the right each time', () => {
    for (const bins of BIN_COUNTS) {
      for (let target = 0; target < bins; target += Math.max(1, Math.floor(bins / 7))) {
        const drop = planDrop(bins, target, 1000 + target * 7919 + bins, 7000);
        const { hits, geo } = drop;
        expect(hits[0]!.row).toBe(0);
        expect(hits[0]!.peg).toBe(drop.startPeg);
        expect(hits[hits.length - 1]!.row).toBe(geo.rows - 1);
        for (let i = 1; i < hits.length; i++) {
          const a = hits[i - 1]!;
          const b = hits[i]!;
          expect(b.t).toBeGreaterThan(a.t);
          expect(b.peg).toBeGreaterThanOrEqual(0);
          expect(b.peg).toBeLessThan(pegCount(b.row));
          if (b.row === a.row)
            expect(b.peg).toBe(a.peg); // a rattle on the same peg
          else {
            expect(b.row).toBe(a.row + 1);
            expect([0, 1]).toContain(b.peg - a.peg);
          }
        }
        // Every row is hit once, or twice when the coin rattles.
        for (let row = 0; row < geo.rows; row++) {
          const n = hits.filter((h) => h.row === row).length;
          expect(n === 1 || n === 2).toBe(true);
        }
        // The lane it leaves by follows from the last peg and the last bounce.
        const lastPeg = hits[hits.length - 1]!.peg;
        expect([lastPeg - 1, lastPeg]).toContain(drop.lane);
        expect(lanesForBin(geo, target)).toContain(drop.lane);
        expect(drop.landFlight).toBe(hits.length);
      }
    }
  });

  it('rattles more in long plays and not at all in snappy ones', () => {
    const rattles = (duration: number) => {
      const drop = planDrop(11, 4, 31337, duration);
      return drop.hits.length - drop.geo.rows;
    };
    expect(rattles(1600)).toBe(0);
    expect(rattles(6800)).toBeGreaterThan(0);
    expect(rattles(27000)).toBeGreaterThanOrEqual(rattles(6800));
  });

  it('chains its flights continuously and fits them in the play', () => {
    for (const duration of [1564, 2125, 5000, 6800, 8000, 15000, 27540]) {
      const drop = planDrop(16, 5, 777, duration);
      const { flights } = drop;
      expect(drop.releaseAt).toBeGreaterThan(0);
      expect(flights[0]!.t0).toBeCloseTo(drop.releaseAt, 9);
      for (let i = 1; i < flights.length; i++) {
        const a = flights[i - 1]!;
        const b = flights[i]!;
        expect(b.t0).toBeCloseTo(a.t1, 9);
        expect(b.x0).toBeCloseTo(a.x1, 9);
        expect(b.y0).toBeCloseTo(a.y1, 9);
        expect(b.t1).toBeGreaterThan(b.t0);
      }
      expect(flights[flights.length - 1]!.t1).toBe(duration);
      expect(drop.landAt).toBeLessThan(duration);
      expect(drop.plateHits[0]!.t).toBe(drop.landAt);
    }
  });

  it('keeps the coin inside the glass all the way down', () => {
    for (const bins of [1, 3, 9, 16, 40]) {
      for (let seed = 1; seed <= 25; seed++) {
        const drop = planDrop(bins, (seed * 5) % bins, seed * 2654435761, 6800);
        const r = drop.geo.coinRadius;
        for (let t = 0; t <= drop.durationMs; t += 10) {
          const p = coinAt(drop, t);
          expect(p.x - r).toBeGreaterThan(FIELD.left);
          expect(p.x + r).toBeLessThan(FIELD.right);
          expect(p.y - r).toBeGreaterThan(FIELD.top);
          expect(p.y + r).toBeLessThanOrEqual(drop.geo.plateTop + 1e-9);
        }
      }
    }
  });

  it('hands the coin over smoothly from the carriage to its first fall', () => {
    const drop = planDrop(12, 3, 99, 8000);
    const before = coinAt(drop, drop.releaseAt - 1);
    const after = coinAt(drop, drop.releaseAt + 1);
    expect(Math.abs(before.x - after.x)).toBeLessThan(drop.geo.spacing * 0.05);
    expect(Math.abs(before.y - after.y)).toBeLessThan(drop.geo.spacing * 0.05);
    expect(carriageX(drop, drop.releaseAt)).toBeCloseTo(drop.releaseX, 9);
    expect(carriageX(drop, 0)).toBeCloseTo(drop.geo.hopper.x, 9);
    // Back home once the coin is gone.
    expect(carriageX(drop, drop.durationMs)).toBeCloseTo(drop.geo.hopper.x, 9);
  });

  it('speeds up as the coin goes down', () => {
    const drop = planDrop(11, 4, 2024, 2600);
    // Time between the first touches of two rows.
    const firsts = Array.from({ length: drop.geo.rows }, (_, row) => drop.hits.find((h) => h.row === row)!.t);
    const gaps = firsts.slice(1).map((t, i) => t - firsts[i]!);
    const firstHalf = gaps.slice(0, Math.floor(gaps.length / 2));
    const secondHalf = gaps.slice(Math.ceil(gaps.length / 2));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(secondHalf)).toBeLessThan(mean(firstHalf));
  });

  it('is a pure function of its inputs', () => {
    expect(planDrop(16, 7, 123456, 6800)).toEqual(planDrop(16, 7, 123456, 6800));
    const a = planDrop(16, 7, 1, 6800);
    const b = planDrop(16, 7, 2, 6800);
    expect(a.hits.map((h) => h.peg)).not.toEqual(b.hits.map((h) => h.peg));
  });

  it('clamps targets outside the board', () => {
    expect(planDrop(5, 9, 3, 5000).target).toBe(4);
    expect(planDrop(5, -2, 3, 5000).target).toBe(0);
  });

  it('starts from different spots of the top row', () => {
    const starts = new Set<number>();
    for (let seed = 0; seed < 40; seed++) starts.add(planDrop(9, 4, seed, 6000).startPeg);
    expect(starts.size).toBe(3);
  });
});

describe('drop timing', () => {
  it('fills the play exactly, with a hold before the drop', () => {
    for (const duration of [1200, 2000, 4000, 6800, 10000, 30000]) {
      for (const natural of [1500, 3000, 4500]) {
        const { releaseAt, scale } = dropTiming(natural, duration);
        expect(releaseAt).toBeGreaterThan(0);
        expect(releaseAt + natural * scale).toBeCloseTo(duration, 6);
        expect(scale).toBeGreaterThan(0);
        expect(scale).toBeLessThanOrEqual(1.7);
      }
    }
  });
});

describe('lights and effects', () => {
  it('flashes each hit peg briefly', () => {
    const drop = planDrop(10, 2, 5, 1600);
    expect(drop.hits).toHaveLength(drop.geo.rows);
    const hit = drop.hits[3]!;
    expect(flashes(drop, hit.t - 1).some((f) => f.row === 3)).toBe(false);
    expect(flashes(drop, hit.t).find((f) => f.row === 3)?.level).toBeCloseTo(1, 9);
    expect(flashes(drop, hit.t + 1000).some((f) => f.row === 3)).toBe(false);
    expect(litPegs(drop, hit.t)).toHaveLength(4);
  });

  it('throws sparks only for a moment after each hit', () => {
    const drop = planDrop(10, 2, 5, 6000);
    expect(sparks(drop, drop.hits[0]!.t - 1)).toHaveLength(0);
    const fresh = sparks(drop, drop.hits[0]!.t + 50);
    expect(fresh.length).toBeGreaterThan(0);
    for (const s of fresh) {
      expect(s.alpha).toBeGreaterThan(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
    }
    expect(sparks(drop, drop.hits[0]!.t + 50)).toEqual(fresh);
  });

  it('pushes the winning plate down only once the coin lands', () => {
    const drop = planDrop(8, 1, 77, 6000);
    expect(plateDip(drop, drop.landAt - 1)).toBe(0);
    expect(plateDip(drop, drop.landAt + 30)).toBeGreaterThan(0);
  });

  it('rings out once as the coin lands', () => {
    const drop = planDrop(8, 1, 77, 6000);
    expect(landingRing(drop, drop.landAt - 1)).toBeNull();
    expect(landingRing(drop, drop.landAt)?.alpha).toBeCloseTo(1, 9);
    expect(landingRing(drop, drop.landAt + 600)).toBeNull();
  });

  it('keeps light levels within 0 … 1', () => {
    for (let t = 0; t < 20000; t += 37) {
      for (const depth of [0, 0.3, 1]) {
        const w = idleWave(depth, t);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
      const tw = twinkle(3, 2, t);
      expect(tw).toBeGreaterThanOrEqual(0);
      expect(tw).toBeLessThanOrEqual(1);
      for (const mode of ['idle', 'play', 'win', 'party'] as const) {
        const level = bulbLevel(t % 50, 50, t, mode);
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never flashes a light more than 3 times a second', () => {
    const risesPerSecond = (level: (t: number) => number) => {
      let rises = 0;
      let lit = false;
      for (let t = 0; t <= 10000; t += 5) {
        const on = level(t) > 0.5;
        if (on && !lit) rises++;
        lit = on;
      }
      return rises / 10;
    };
    expect(risesPerSecond((t) => bulbLevel(7, 60, t, 'party'))).toBeLessThanOrEqual(3);
    expect(risesPerSecond((t) => partyWave(0.4, t))).toBeLessThanOrEqual(3);
  });

  it('spaces the bulbs evenly round the frame', () => {
    const box = { left: -0.9, right: 0.9, top: -0.9, bottom: 0.9 };
    const points = bulbPoints(box, 0.1, 0.1);
    expect(points.length).toBeGreaterThan(50);
    for (const p of points) {
      const inside = p.x >= box.left - 1e-9 && p.x <= box.right + 1e-9;
      expect(inside && p.y >= box.top - 1e-9 && p.y <= box.bottom + 1e-9).toBe(true);
    }
    const gaps = points.map((p, i) => {
      const q = points[(i + 1) % points.length]!;
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.15);
  });
});

describe('lanes', () => {
  it('maps lane k to the gap between the last row pegs', () => {
    const geo = boardGeometry(11);
    const last = geo.rows - 1;
    for (let k = 0; k <= geo.rows; k++) {
      const left = pegPosition(geo, last, k).x;
      expect(laneX(geo, k)).toBeCloseTo(left + geo.spacing / 2, 9);
    }
  });
});
