import { describe, expect, it } from 'vitest';
import {
  CABINET,
  capsuleCounts,
  clawFrame,
  fitLines,
  hashString,
  idleFrame,
  layoutPile,
  mixColor,
  parseColor,
  pickTarget,
  planClaw,
  REST_OPEN,
  withAlpha,
  type ClawSetup,
} from './claw-math.js';

const setup = (overrides: Partial<ClawSetup> = {}): ClawSetup => ({
  durationMs: 8000,
  seed: 12345,
  targetX: 0.3,
  targetDepth: 0.5,
  grabCable: 0.7,
  ...overrides,
});

describe('colours', () => {
  it('parses hex and rgb() colours', () => {
    expect(parseColor('#ff8000')).toEqual([255, 128, 0]);
    expect(parseColor('#f80')).toEqual([255, 136, 0]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3]);
    expect(parseColor('nonsense')).toEqual([0, 0, 0]);
  });

  it('mixes and adds alpha', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(mixColor('rgb(0, 0, 0)', '#ff0000', 2)).toBe('rgb(255, 0, 0)');
    expect(withAlpha('#ff5fa8', 0.25)).toBe('rgba(255, 95, 168, 0.25)');
  });
});

describe('fitLines', () => {
  const measure = (text: string) => text.length * 0.6;

  it('keeps short text on one line', () => {
    const fit = fitLines('$10', 3, measure, 2, 1);
    expect(fit.lines).toEqual(['$10']);
    expect(fit.size).toBeCloseTo(Math.min(2 / 1.8, 1 / 1.1));
  });

  it('wraps long labels into balanced lines when that makes them bigger', () => {
    const fit = fitLines('VIP for a Week', 3, measure, 1.2, 1.2);
    expect(fit.lines.length).toBeGreaterThan(1);
    expect(fit.lines.join(' ')).toBe('VIP for a Week');
  });

  it('handles empty text', () => {
    expect(fitLines('  ', 2, measure, 1, 1)).toEqual({ lines: [], size: 0 });
  });
});

describe('capsuleCounts', () => {
  it('gives every prize a capsule and splits the rest by weight', () => {
    const counts = capsuleCounts([1, 3, 1], 13, true);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(13);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
    expect(counts[1]).toBeGreaterThan(counts[0]!);
  });

  it('shares equally with equal sizing', () => {
    expect(capsuleCounts([1, 5, 1], 7, false)).toEqual([3, 2, 2]);
  });

  it('handles no prizes', () => {
    expect(capsuleCounts([], 10, true)).toEqual([]);
  });
});

describe('layoutPile', () => {
  const weights = (n: number) => Array.from({ length: n }, () => 1);

  it.each([1, 2, 5, 12, 16, 30, 64])('puts every one of %i prizes in the pile, inside the glass', (n) => {
    const pile = layoutPile(weights(n), true, hashString(`wheel-${n}`));
    expect(pile.capsules.length).toBeGreaterThanOrEqual(Math.max(n, 14));
    const prizes = new Set(pile.capsules.map((c) => c.prize));
    expect(prizes.size).toBe(n);
    for (const c of pile.capsules) {
      expect(c.x - c.r).toBeGreaterThan(CABINET.chuteRight - 0.02);
      expect(c.x + c.r).toBeLessThan(CABINET.glassRight);
      expect(c.y + c.r).toBeLessThan(CABINET.floor + 0.02);
      expect(c.y - c.r).toBeGreaterThan(CABINET.floor - CABINET.pileHeight - 0.02);
    }
  });

  it('uses big capsules for few prizes and smaller ones for many', () => {
    const few = layoutPile(weights(4), true, 1);
    const many = layoutPile(weights(64), true, 1);
    expect(few.diameter).toBeGreaterThan(many.diameter);
    expect(many.diameter).toBeGreaterThanOrEqual(0.06);
  });

  it('draws back rows first', () => {
    const pile = layoutPile(weights(16), true, 7);
    const rows = pile.capsules.map((c) => c.row);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(pile.capsules[0]!.depth).toBeLessThan(pile.capsules.at(-1)!.depth);
  });

  it('is deterministic and empty without prizes', () => {
    expect(layoutPile(weights(9), true, 99)).toEqual(layoutPile(weights(9), true, 99));
    expect(layoutPile([], true, 1).capsules).toEqual([]);
  });

  it('picks a capsule holding the won prize', () => {
    const pile = layoutPile(weights(12), true, 5);
    for (let prize = 0; prize < 12; prize++) {
      for (const seed of [1, 2, 3, 0xffffffff]) {
        const index = pickTarget(pile, prize, seed);
        expect(pile.capsules[index]!.prize).toBe(prize);
      }
    }
    expect(pickTarget(pile, 40, 1)).toBe(-1);
  });
});

describe('planClaw', () => {
  it.each([2000, 2500, 8000, 30000])('fills a %i ms play with every phase in order', (durationMs) => {
    const script = planClaw(setup({ durationMs }));
    const order = ['roam', 'drop', 'grab', 'lift', 'carry', 'release', 'reveal'] as const;
    let at = 0;
    for (const phase of order) {
      expect(script.phases[phase].start).toBeCloseTo(at);
      expect(script.phases[phase].duration).toBeGreaterThan(0);
      at += script.phases[phase].duration;
    }
    expect(at).toBeCloseTo(durationMs);
    expect(script.phases.roam.duration).toBeGreaterThanOrEqual(durationMs * 0.12 - 1e-6);
    for (const event of script.events) {
      expect(event.at).toBeGreaterThanOrEqual(0);
      expect(event.at).toBeLessThanOrEqual(durationMs);
    }
  });

  it('starts at rest and settles over the target before dropping', () => {
    const script = planClaw(setup());
    const start = clawFrame(script, 0);
    expect(start.x).toBeCloseTo(CABINET.homeX);
    expect(start.cable).toBeCloseTo(CABINET.restCable);
    expect(start.capsule).toBe('pile');
    const drop = clawFrame(script, script.phases.drop.start);
    expect(drop.x).toBeCloseTo(0.3, 5);
    expect(drop.depth).toBeCloseTo(0.5, 5);
    const bottom = clawFrame(script, script.phases.grab.start);
    expect(bottom.cable).toBeCloseTo(0.7, 5);
    expect(bottom.open).toBeCloseTo(1);
  });

  it('grabs, slips, carries the capsule to the chute and lets it fall', () => {
    const script = planClaw(setup());
    expect(clawFrame(script, script.closeAt - 1).capsule).toBe('pile');
    expect(clawFrame(script, script.closeAt + 1).capsule).toBe('held');
    expect(clawFrame(script, script.slipAt - 1).slip).toBe(0);
    expect(clawFrame(script, script.slipAt + 400).slip).toBeCloseTo(script.slipSize, 2);
    expect(clawFrame(script, script.slipAt + 400).capsule).toBe('held');
    const atChute = clawFrame(script, script.phases.release.start);
    expect(atChute.x).toBeCloseTo((CABINET.chuteLeft + CABINET.chuteRight) / 2);
    expect(clawFrame(script, script.fallAt + 1).capsule).toBe('falling');
    expect(clawFrame(script, script.landAt + 1).capsule).toBe('chute');
  });

  it('ends with the capsule open in front and the claw back home', () => {
    const script = planClaw(setup());
    for (const t of [script.durationMs, script.durationMs + 5000]) {
      const end = clawFrame(script, t);
      expect(end.capsule).toBe('reveal');
      expect([end.fly, end.burst, end.prize, end.emerge]).toEqual([1, 1, 1, 1]);
      expect(end.flash).toBe(0);
      expect(end.door).toBe(0);
      expect(end.x).toBeCloseTo(CABINET.homeX);
      expect(end.open).toBeCloseTo(REST_OPEN);
    }
  });

  it('is a pure function of the setup and time', () => {
    const a = planClaw(setup({ seed: 42 }));
    const b = planClaw(setup({ seed: 42 }));
    for (let t = 0; t <= 8000; t += 137) expect(clawFrame(a, t)).toEqual(clawFrame(b, t));
    const other = planClaw(setup({ seed: 43 }));
    expect(other.moves.map((m) => m.x1)).not.toEqual(a.moves.map((m) => m.x1));
  });

  it('moves smoothly (no jumps between frames)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const durationMs of [2200, 8000, 20000]) {
        const script = planClaw(setup({ seed, durationMs }));
        let prev = clawFrame(script, 0);
        for (let t = 4; t <= durationMs; t += 4) {
          const frame = clawFrame(script, t);
          expect(Math.abs(frame.x - prev.x)).toBeLessThan(0.035);
          expect(Math.abs(frame.cable - prev.cable)).toBeLessThan(0.035);
          expect(Math.abs(frame.swing - prev.swing)).toBeLessThan(0.03);
          expect(frame.x).toBeGreaterThan(CABINET.glassLeft);
          expect(frame.x).toBeLessThan(CABINET.glassRight);
          prev = frame;
        }
      }
    }
  });

  it('keeps the roaming carriage on the rail', () => {
    for (let seed = 0; seed < 40; seed++) {
      const script = planClaw(setup({ seed, durationMs: 30000, targetX: 0.65 }));
      for (const m of script.moves) {
        expect(m.x1).toBeGreaterThanOrEqual(CABINET.railLeft - 0.01);
        expect(m.x1).toBeLessThanOrEqual(CABINET.railRight + 0.05);
      }
    }
  });
});

describe('idleFrame', () => {
  it('sways gently around home', () => {
    for (let now = 0; now < 20000; now += 333) {
      const frame = idleFrame(now);
      expect(Math.abs(frame.x - CABINET.homeX)).toBeLessThan(0.03);
      expect(Math.abs(frame.swing)).toBeLessThan(0.08);
      expect(frame.capsule).toBe('pile');
    }
  });
});
