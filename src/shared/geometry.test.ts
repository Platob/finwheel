import { describe, expect, it } from 'vitest';
import { computeArcs, landingRotation, mod1, pointerAngle, segmentAt } from './geometry.js';

describe('computeArcs', () => {
  it('sizes slices by weight and covers the full turn', () => {
    const arcs = computeArcs([1, 2, 1], 'weight');
    expect(arcs.map((a) => a.end - a.start)).toEqual([0.25, 0.5, 0.25]);
    expect(arcs[0]!.start).toBe(0);
    expect(arcs.at(-1)!.end).toBe(1);
  });

  it('ignores weights when sizing is equal', () => {
    const arcs = computeArcs([1, 50, 3, 7], 'equal');
    for (const arc of arcs) expect(arc.end - arc.start).toBeCloseTo(0.25);
  });

  it('handles empty and all-zero inputs', () => {
    expect(computeArcs([], 'weight')).toEqual([]);
    expect(computeArcs([0, 0], 'weight').map((a) => a.end - a.start)).toEqual([0.5, 0.5]);
  });
});

describe('pointer math', () => {
  it('maps rotation to the wheel angle under the pointer', () => {
    expect(pointerAngle(0)).toBe(0);
    expect(pointerAngle(0.25)).toBeCloseTo(0.75);
    expect(mod1(-0.25)).toBeCloseTo(0.75);
  });

  it('finds the slice under the pointer', () => {
    const arcs = computeArcs([1, 1, 1, 1], 'weight');
    expect(segmentAt(arcs, 0)).toBe(0);
    expect(segmentAt(arcs, -0.3)).toBe(1);
    expect(segmentAt(arcs, 0.1)).toBe(3);
  });

  it('always lands on the requested slice after whole turns', () => {
    const arcs = computeArcs([5, 1, 3, 0.5, 2, 8], 'weight');
    let rotation = 0.37;
    for (let i = 0; i < 500; i++) {
      const index = i % arcs.length;
      const landing = 0.12 + (((i * 7919) % 1000) / 1000) * 0.76;
      const turns = 3 + (i % 5);
      const next = landingRotation(rotation, arcs[index]!, landing, turns);
      expect(segmentAt(arcs, next)).toBe(index);
      expect(next - rotation).toBeGreaterThanOrEqual(turns);
      expect(next - rotation).toBeLessThan(turns + 1);
      rotation = mod1(next);
    }
  });
});
