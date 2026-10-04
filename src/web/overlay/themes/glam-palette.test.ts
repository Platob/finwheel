import { describe, expect, it } from 'vitest';
import type { Segment } from '../../../shared/types.js';
import { cycleSlot, GLAM_CYCLE, GLAM_EFFECT_STYLES, glamSliceStyle, luminance, mix } from './glam-palette.js';

const segment = (patch: Partial<Segment> = {}): Segment => ({
  id: 's',
  label: '$5',
  description: '',
  weight: 1,
  tier: 'common',
  ...patch,
});

describe('glamSliceStyle', () => {
  it('never paints two neighbouring slices alike, including last and first', () => {
    for (let count = 2; count <= 40; count++) {
      const bases = Array.from({ length: count }, (_, i) => glamSliceStyle(segment(), i, count).base);
      for (let i = 0; i < count; i++) {
        expect(bases[i], `slice ${i} of ${count}`).not.toBe(bases[(i + 1) % count]);
      }
    }
  });

  it('keeps cycle neighbours apart around effect slices', () => {
    const effects: (Segment['effect'] | undefined)[] = ['cash', 'total', 'cash', 'next', 'cash', 'cash'];
    for (let count = 2; count <= 40; count++) {
      const segments = Array.from({ length: count }, (_, i) => segment({ effect: effects[i % effects.length] }));
      const bases = segments.map((s, i) => glamSliceStyle(s, i, count).base);
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        if (segments[i]!.effect === segments[next]!.effect && segments[i]!.effect !== 'cash') continue;
        expect(bases[i], `slice ${i} of ${count}`).not.toBe(bases[next]);
      }
    }
  });

  it('cycles hot pink, cream, pink and light pink', () => {
    expect([0, 1, 2, 3, 4].map((i) => glamSliceStyle(segment(), i, 8).base)).toEqual([
      '#e8559f',
      '#f9ebe1',
      '#f27fba',
      '#f7b2d3',
      '#e8559f',
    ]);
  });

  it('paints "total" slices gold and "next" slices lavender', () => {
    expect(glamSliceStyle(segment({ effect: 'total' }), 0, 12)).toBe(GLAM_EFFECT_STYLES.total);
    expect(glamSliceStyle(segment({ effect: 'total' }), 0, 12).base).toBe('#f4c656');
    expect(glamSliceStyle(segment({ effect: 'next' }), 5, 12).base).toBe('#a46ae6');
    expect(glamSliceStyle(segment({ effect: 'cash' }), 0, 12)).toBe(GLAM_CYCLE[0]);
    expect(glamSliceStyle(segment({ effect: 'spins' }), 1, 12)).toBe(GLAM_CYCLE[1]);
  });

  it('gives bankrupt, jackpot, legendary and custom colours their own look', () => {
    const bust = glamSliceStyle(segment({ bust: true, tier: 'jackpot', color: '#00ff00' }), 0, 8);
    expect(luminance(bust.base)).toBeLessThan(0.1);
    expect(bust.text).toBe('#ff5fae');
    expect(glamSliceStyle(segment({ tier: 'jackpot', effect: 'total' }), 0, 8).metallic).toBe(true);
    const legendary = glamSliceStyle(segment({ tier: 'legendary' }), 0, 8);
    expect(legendary.inlay).toBe('#f4c656');
    expect(glamSliceStyle(segment({ tier: 'legendary', effect: 'total' }), 0, 8).base).toBe('#f4c656');
    const custom = glamSliceStyle(segment({ color: '#123456', effect: 'total' }), 0, 8);
    expect(custom.base).toBe('#123456');
    expect(custom.caption).toBe('#ffffff');
    expect(glamSliceStyle(segment({ color: '#fafafa' }), 0, 8).caption).not.toBe('#ffffff');
  });
});

describe('cycleSlot', () => {
  it('only moves the last slice when it would repeat the first', () => {
    expect(cycleSlot(4, 5)).toBe(1);
    expect(cycleSlot(4, 6)).toBe(0);
    expect(cycleSlot(0, 1)).toBe(0);
  });
});

describe('mix', () => {
  it('blends channels', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(mix('#e8559f', '#ffffff', 0)).toBe('rgb(232, 85, 159)');
  });
});
