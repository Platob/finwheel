import { describe, expect, it } from 'vitest';
import { computeArcs, landingRotation, mod1, segmentAt } from '../../../shared/geometry.js';
import type { Segment } from '../../../shared/types.js';
import {
  cellAt,
  chaseLevel,
  coinFall,
  coinSpill,
  drumPlace,
  fitLabel,
  LAYOUT,
  LEVER_SWING,
  leverAngle,
  leverMotion,
  marqueePoints,
  mixColor,
  parseColor,
  planSlots,
  reelPosition,
  REELS,
  reelSpeed,
  REST_PHOTO_ODDS,
  restingCells,
  restingPhotoCells,
  restingPhotos,
  restingReels,
  settlePop,
  STOP_AT,
  STRIP_MARGIN,
  teasing,
  withAlpha,
  type SlotsSpin,
} from './slots-math.js';
import { seededRandom } from './random.js';

const segments = (count: number): Segment[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    label: `$${i + 1}`,
    description: '',
    weight: 1 + (i % 3),
    tier: 'common',
  }));

/** A spin as the server makes it: the wheel lands on `winner` from the previous resting angle. */
function spin(count: number, winner: number, seed: number, durationMs = 5600, from = 0): SlotsSpin {
  const wheel = { key: 'slots', sizing: 'weight' as const, segments: segments(count) };
  const arcs = computeArcs(
    wheel.segments.map((s) => s.weight),
    wheel.sizing,
  );
  const next = seededRandom(seed ^ 0xabcdef);
  const toRotation = landingRotation(from, arcs[winner]!, 0.12 + next() * 0.76, 5);
  return { wheel, segmentIndex: winner, fromRotation: from, toRotation, durationMs, seed };
}

const DURATIONS = [1000, 1288, 1750, 3000, 5600, 12000, 21000, 30000];

describe('reel motion', () => {
  it('kicks back, runs forward without jumps and rests exactly on its stop', () => {
    for (const durationMs of DURATIONS) {
      for (let seed = 1; seed <= 12; seed++) {
        const play = planSlots(spin(16, seed % 16, seed, durationMs));
        for (const m of play.reels) {
          expect(reelPosition(m, 0)).toBe(0);
          expect(reelPosition(m, m.windEnd)).toBeLessThan(0);
          let last = reelPosition(m, m.windEnd);
          let backwards = 0;
          let jump = 0;
          for (let t = m.windEnd; t <= m.peak; t += 3) {
            const s = reelPosition(m, t);
            backwards = Math.max(backwards, last - s);
            jump = Math.max(jump, s - last);
            last = s;
          }
          expect(backwards).toBeLessThan(1e-9);
          expect(jump).toBeLessThanOrEqual(m.speed * 3 + 1e-6);
          expect(reelPosition(m, m.peak)).toBeCloseTo(m.stop + m.overshoot, 6);
          expect(reelPosition(m, m.rest)).toBe(m.stop);
          expect(reelPosition(m, durationMs * 2)).toBe(m.stop);
        }
      }
    }
  });

  it('stops the reels left to right at their share of the play and lands before the end', () => {
    for (const durationMs of DURATIONS) {
      const play = planSlots(spin(8, 3, 7, durationMs));
      play.reels.forEach((m, i) => expect(m.peak).toBeCloseTo(durationMs * STOP_AT[i]!, 6));
      expect(play.reels[0]!.rest).toBeLessThan(play.reels[1]!.peak);
      expect(play.reels[1]!.rest).toBeLessThan(play.reels[2]!.peak);
      expect(play.landedAt).toBe(Math.max(...play.reels.map((m) => m.rest)));
      expect(play.landedAt).toBeLessThanOrEqual(durationMs);
      expect(play.reels[0]!.start).toBeGreaterThanOrEqual(play.lever.pullEnd);
    }
  });

  it('spins fast enough to blur but never absurdly fast', () => {
    for (const durationMs of DURATIONS.slice(1)) {
      for (let seed = 1; seed <= 20; seed++) {
        for (const m of planSlots(spin(12, 0, seed, durationMs)).reels) {
          const perSecond = m.speed * 1000;
          expect(perSecond).toBeGreaterThan(9);
          expect(perSecond).toBeLessThan(32);
          expect(reelSpeed(m, (m.accelEnd + m.decelStart) / 2)).toBeCloseTo(perSecond, 3);
        }
      }
    }
  });

  it('teases with the last reel in about 40% of plays', () => {
    let teases = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const play = planSlots(spin(10, seed % 10, seed * 7919 + 1));
      const last = play.reels[REELS - 1]!;
      expect(play.reels.slice(0, -1).every((m) => m.tease === null)).toBe(true);
      if (!play.tease) {
        expect(last.tease).toBeNull();
        continue;
      }
      teases++;
      // Halted one symbol short, on something else than the winner, then crawls in.
      const halt = (last.decelEnd + last.tease!.holdEnd) / 2;
      expect(reelPosition(last, halt)).toBe(last.stop - 1);
      expect(cellAt(play.strips[REELS - 1]!, last.stop - 1)).not.toBe(seed % 10);
      expect(teasing(last, halt)).toBe(true);
      expect(teasing(last, last.rest)).toBe(false);
      expect(reelPosition(last, last.peak)).toBeCloseTo(last.stop + last.overshoot, 6);
    }
    expect(teases / 2000).toBeGreaterThan(0.35);
    expect(teases / 2000).toBeLessThan(0.45);
  });

  it('pops the payline symbol while a reel settles, and the triple with the last reel', () => {
    const play = planSlots(spin(8, 2, 3));
    const [first, , last] = play.reels;
    expect(settlePop(play.reels, 0, first!.peak - 1)).toBe(0);
    expect(settlePop(play.reels, 0, (first!.peak + first!.rest) / 2)).toBeCloseTo(1, 6);
    expect(settlePop(play.reels, 0, first!.rest)).toBe(0);
    expect(settlePop(play.reels, 0, (last!.peak + last!.rest) / 2)).toBeCloseTo(1, 6);
    expect(settlePop(play.reels, 1, play.landedAt)).toBe(0);
  });
});

describe('strips', () => {
  it('lands every reel on the winner, the same way for the same spin', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const count = 1 + (seed % 20);
      const winner = seed % count;
      const input = spin(count, winner, seed);
      const play = planSlots(input);
      play.reels.forEach((m, r) => {
        expect(cellAt(play.strips[r]!, m.stop)).toBe(winner);
        expect(play.photos[r]![m.stop + STRIP_MARGIN]).toBe(false);
        expect(play.strips[r]!.length).toBe(m.stop + STRIP_MARGIN * 2 + 1);
        expect(play.strips[r]!.every((i) => i >= 0 && i < count)).toBe(true);
      });
      expect(planSlots(input)).toEqual(play);
    }
    expect(planSlots(spin(16, 4, 1))).not.toEqual(planSlots(spin(16, 4, 2)));
  });

  it('starts from the resting reels and lands on the resting reels of the new angle', () => {
    let from = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const input = spin(14, (seed * 5) % 14, seed, 5600, from);
      const play = planSlots(input);
      const before = restingReels(input.wheel, input.fromRotation);
      const after = restingReels(input.wheel, input.toRotation);
      const photosBefore = restingPhotoCells(input.wheel, input.fromRotation);
      const photosAfter = restingPhotoCells(input.wheel, input.toRotation);
      play.reels.forEach((m, r) => {
        for (let k = -STRIP_MARGIN; k <= STRIP_MARGIN; k++) {
          expect(cellAt(play.strips[r]!, k)).toBe(before[r]![k + STRIP_MARGIN]);
          expect(cellAt(play.strips[r]!, m.stop + k)).toBe(after[r]![k + STRIP_MARGIN]);
          expect(play.photos[r]![k + STRIP_MARGIN]).toBe(photosBefore[r]![k + STRIP_MARGIN]);
          expect(play.photos[r]![m.stop + k + STRIP_MARGIN]).toBe(photosAfter[r]![k + STRIP_MARGIN]);
        }
      });
      // The next play starts exactly where this one landed.
      from = mod1(input.toRotation);
    }
  });

  it('shows the last result as a triple at rest, and no triple before the first play', () => {
    const wheel = { key: 'slots', sizing: 'equal' as const, segments: segments(9) };
    const fresh = restingReels(wheel, 0);
    expect(new Set(fresh.map((reel) => reel[STRIP_MARGIN])).size).toBeGreaterThan(1);
    const rotation = 0.37;
    const shown = restingReels(wheel, rotation);
    const winner = segmentAt(computeArcs(Array<number>(9).fill(1), 'equal'), rotation);
    expect(shown.map((reel) => reel[STRIP_MARGIN])).toEqual([winner, winner, winner]);
  });

  it('keeps the payline neighbours different and avoids other triples', () => {
    for (let seed = 0; seed < 500; seed++) {
      const count = 2 + (seed % 12);
      const payline = seed % 3 === 0 ? null : seed % count;
      const cells = restingCells(count, seed, payline);
      expect(restingCells(count, seed, payline)).toEqual(cells);
      for (const reel of cells) {
        expect(reel).toHaveLength(STRIP_MARGIN * 2 + 1);
        expect(reel[STRIP_MARGIN - 1]).not.toBe(reel[STRIP_MARGIN]);
        expect(reel[STRIP_MARGIN + 1]).not.toBe(reel[STRIP_MARGIN]);
      }
      const row = (i: number) => cells.map((reel) => reel[i]);
      const isTriple = (i: number) => new Set(row(i)).size === 1;
      if (payline === null) expect(isTriple(STRIP_MARGIN)).toBe(false);
      else expect(row(STRIP_MARGIN)).toEqual([payline, payline, payline]);
      if (count >= 3) {
        for (let i = 0; i < STRIP_MARGIN * 2 + 1; i++)
          if (i !== STRIP_MARGIN) expect(isTriple(i)).toBe(false);
      }
    }
  });

  it('shows the photo now and then next to the payline at rest, never on it', () => {
    let shown = 0;
    let cells = 0;
    for (let seed = 0; seed < 3000; seed++) {
      const photos = restingPhotos(seed);
      expect(restingPhotos(seed)).toEqual(photos);
      for (const reel of photos) {
        expect(reel).toHaveLength(STRIP_MARGIN * 2 + 1);
        expect(reel[STRIP_MARGIN]).toBe(false);
        reel.forEach((photo, i) => {
          if (i === STRIP_MARGIN) return;
          cells++;
          if (photo) shown++;
        });
      }
    }
    expect(shown / cells).toBeGreaterThan(REST_PHOTO_ODDS * 0.8);
    expect(shown / cells).toBeLessThan(REST_PHOTO_ODDS * 1.2);
  });

  it('handles a single prize', () => {
    const play = planSlots(spin(1, 0, 99));
    for (const strip of play.strips) expect(strip.every((i) => i === 0)).toBe(true);
    expect(
      restingCells(1, 5, null)
        .flat()
        .every((i) => i === 0),
    ).toBe(true);
  });
});

describe('lever', () => {
  it('is pulled down, held, then springs back to rest', () => {
    for (const durationMs of DURATIONS) {
      const lever = leverMotion(durationMs);
      expect(leverAngle(lever, 0)).toBe(0);
      expect(leverAngle(lever, (lever.pullEnd + lever.holdEnd) / 2)).toBe(LEVER_SWING);
      expect(leverAngle(lever, lever.returnEnd)).toBe(0);
      expect(leverAngle(lever, lever.returnEnd - 1)).toBeCloseTo(0, 2);
      expect(lever.returnEnd).toBeLessThan(durationMs * STOP_AT[0]);
    }
  });
});

describe('layout', () => {
  const inside = (box: { left: number; top: number; right: number; bottom: number }) => {
    // Glam reserves the canvas above the play area's top − 2 % (≈ 0.054 play-area half sides).
    expect(box.top).toBeGreaterThanOrEqual(-1.054);
    expect(box.bottom).toBeLessThanOrEqual(1.04);
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual(1);
  };

  it('keeps the machine inside the play area', () => {
    for (const box of [
      LAYOUT.cabinet,
      LAYOUT.header,
      LAYOUT.window,
      LAYOUT.display,
      LAYOUT.deck,
      LAYOUT.tray,
      LAYOUT.mount,
    ]) {
      inside(box);
    }
    const { x, pivot, length, knob } = LAYOUT.lever;
    inside({
      left: x - knob * 1.25,
      right: x + knob * 1.25,
      top: pivot - length - knob * 1.25,
      bottom: pivot,
    });
  });

  it('keeps the payline high, above the result card', () => {
    const screen = { top: LAYOUT.window.top + LAYOUT.frame, bottom: LAYOUT.window.bottom - LAYOUT.frame };
    expect((screen.top + screen.bottom) / 2 + LAYOUT.symbol).toBeLessThan(-0.35);
  });

  it('places symbols on the drum', () => {
    expect(drumPlace(0)).toEqual({ y: 0, scale: 1 });
    const above = drumPlace(-1)!;
    const below = drumPlace(1)!;
    expect(above.y).toBeCloseTo(-below.y, 9);
    expect(below.scale).toBeLessThan(1);
    expect(drumPlace(3)).toBeNull();
  });

  it('spreads marquee bulbs evenly along a rounded rectangle', () => {
    const box = { left: -1, top: -0.5, right: 1, bottom: 0.5 };
    const points = marqueePoints(box, 0.2, 0.1);
    const perimeter = 2 * (1.6 + 0.6) + 2 * Math.PI * 0.2;
    expect(points.length).toBe(Math.round(perimeter / 0.1));
    for (const p of points) {
      // On the outline: on a straight side, or at the corner radius from a corner centre.
      const cx = Math.max(-0.8, Math.min(0.8, p.x));
      const cy = Math.max(-0.3, Math.min(0.3, p.y));
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(0.2, 6);
    }
    expect(chaseLevel(3, 3)).toBe(1);
    for (let i = 0; i < 20; i++) expect(chaseLevel(i, 7.3)).toBeGreaterThanOrEqual(0.12);
  });
});

describe('coin spill', () => {
  it('pours a fixed set of coins that fall, hop and settle', () => {
    const coins = coinSpill(42, 10);
    expect(coinSpill(42, 10)).toEqual(coins);
    expect(coins).toHaveLength(10);
    for (const coin of coins) {
      expect(coinFall(coin, coin.delay - 1)).toBeNull();
      expect(coinFall(coin, coin.delay)!.fall).toBe(0);
      expect(coinFall(coin, coin.delay + 520)!.fall).toBe(1);
      expect(coinFall(coin, coin.delay + 5000)).toEqual({ fall: 1, hop: 0 });
      expect(Math.abs(coin.x)).toBeLessThanOrEqual(0.85);
    }
  });
});

describe('labels', () => {
  const measure = (text: string) => text.length * 0.55;

  it('fits short labels on one line and long ones on several', () => {
    expect(fitLabel('$10', measure, 2, 1, 0.9)).toEqual({ lines: ['$10'], size: 0.9 });
    const long = fitLabel('VIP for a Week', measure, 1.6, 1.4, 0.9);
    expect(long.lines.length).toBeGreaterThan(1);
    expect(Math.max(...long.lines.map(measure)) * long.size).toBeLessThanOrEqual(1.6 + 1e-9);
    expect(long.lines.length * 1.05 * long.size).toBeLessThanOrEqual(1.4 + 1e-9);
    expect(fitLabel('  ', measure, 1, 1, 1).size).toBe(0);
  });
});

describe('colours', () => {
  it('parses, mixes and fades colours', () => {
    expect(parseColor('#ff8000')).toEqual([255, 128, 0, 1]);
    expect(parseColor('#f80')).toEqual([255, 136, 0, 1]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30, 1]);
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 0.5]);
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(mixColor('rgb(255, 0, 0)', '#0000ff', 1)).toBe('rgb(0, 0, 255)');
    expect(withAlpha('#3a0c2c', 0.4)).toBe('rgba(58, 12, 44, 0.4)');
  });
});
