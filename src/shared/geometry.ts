/**
 * Wheel geometry. Angles are in turns (1 turn = 360°), measured clockwise from 12 o'clock,
 * which is where the pointer sits. A wheel rotated by `r` turns shows, under the pointer,
 * the wheel-local angle `-r` (mod 1).
 */
import type { Sizing } from './schema.js';

export interface Arc {
  start: number;
  end: number;
}

export const mod1 = (value: number): number => ((value % 1) + 1) % 1;

export function computeArcs(weights: readonly number[], sizing: Sizing): Arc[] {
  if (weights.length === 0) return [];
  const sizes = weights.map((w) => (sizing === 'equal' ? 1 : Math.max(0, w)));
  const total = sizes.reduce((a, b) => a + b, 0);
  const normalized = total > 0 ? sizes.map((s) => s / total) : sizes.map(() => 1 / sizes.length);
  let cursor = 0;
  return normalized.map((size, i) => {
    const start = cursor;
    cursor += size;
    return { start, end: i === normalized.length - 1 ? 1 : cursor };
  });
}

/** Wheel-local angle currently under the pointer. */
export function pointerAngle(rotation: number): number {
  return mod1(-rotation);
}

/** Index of the arc under the pointer for a given wheel rotation. */
export function segmentAt(arcs: readonly Arc[], rotation: number): number {
  const angle = pointerAngle(rotation);
  let lo = 0;
  let hi = arcs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (angle < arcs[mid]!.end) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Final rotation that brings `landing` (0..1 across the arc) under the pointer after
 * `turns` full revolutions clockwise from `from`.
 */
export function landingRotation(from: number, arc: Arc, landing: number, turns: number): number {
  const target = arc.start + (arc.end - arc.start) * landing;
  const delta = mod1(mod1(-target) - mod1(from));
  return from + Math.max(0, Math.floor(turns)) + delta;
}
