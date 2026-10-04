import { describe, expect, it } from 'vitest';
import type { Segment } from '../../../shared/types.js';
import { binText, brightness, fitLabel, mixColor, parseColor, splitTwo, withAlpha } from './plinko-labels.js';

const segment = (extra: Partial<Segment>): Segment => ({
  id: 'x',
  label: 'Prize',
  description: '',
  weight: 1,
  tier: 'common',
  ...extra,
});

/** A monospace-ish measure: 0.6 em per character. */
const measure = (text: string) => text.length * 0.6;

describe('binText', () => {
  it('shows money slices as an amount with a caption', () => {
    expect(binText(segment({ label: '×2 Total', amount: '×2', caption: 'total' }))).toEqual({
      main: '×2',
      caption: 'TOTAL',
      icon: null,
    });
  });

  it('falls back to the label and keeps the icon', () => {
    expect(binText(segment({ label: ' Gift Sub ', icon: '🎁' }))).toEqual({
      main: 'Gift Sub',
      caption: null,
      icon: '🎁',
    });
    expect(binText(segment({ label: '' })).main).toBe('?');
  });
});

describe('splitTwo', () => {
  it('splits at the space nearest the middle', () => {
    expect(splitTwo('Lose Half')).toEqual(['Lose', 'Half']);
    expect(splitTwo('1v1 the Streamer')).toEqual(['1v1 the', 'Streamer']);
    expect(splitTwo('Bankrupt')).toBeNull();
  });
});

describe('fitLabel', () => {
  const text = { main: '$10', caption: null, icon: null };

  it('sets labels across wide plates and upright in narrow ones', () => {
    expect(fitLabel(text, 120, 60, measure, measure).vertical).toBe(false);
    expect(fitLabel(text, 30, 90, measure, measure).vertical).toBe(true);
  });

  it('fits the text inside its box', () => {
    for (const [w, h] of [
      [120, 60],
      [30, 90],
      [200, 40],
      [12, 80],
    ] as const) {
      for (const t of [
        text,
        { main: 'Bankrupt', caption: null, icon: null },
        { main: '×2', caption: 'TOTAL', icon: '💋' },
      ]) {
        const fit = fitLabel(t, w, h, measure, measure);
        const along = fit.vertical ? h : w;
        const across = fit.vertical ? w : h;
        expect(fit.size).toBeGreaterThan(0);
        expect(fit.length).toBeLessThanOrEqual(along + 1e-9);
        expect(fit.lines.length * fit.size * 0.98).toBeLessThanOrEqual(across + 1e-9);
      }
    }
  });

  it('keeps the caption that tells ×2 total from ×2 next when there is room', () => {
    const fit = fitLabel({ main: '×2', caption: 'TOTAL', icon: null }, 124, 60, measure, measure);
    expect(fit.caption).toBeGreaterThan(0);
  });

  it('drops a caption that would be too small to read', () => {
    const fit = fitLabel({ main: '$10', caption: 'BONUS SPIN', icon: null }, 30, 90, measure, measure, 8);
    expect(fit.caption).toBe(0);
  });

  it('shows only the icon, big, when a long label would be tiny', () => {
    const bust = fitLabel({ main: 'Bankrupt', caption: null, icon: '💀' }, 60, 80, measure, measure);
    expect(bust.lines).toEqual([]);
    expect(bust.icon).toBeGreaterThan(40);
    expect(bust.icon).toBeLessThanOrEqual(60);
    // Short amounts keep their text; labels without an icon always do.
    const cash = fitLabel({ main: '$50', caption: null, icon: '💎' }, 60, 80, measure, measure);
    expect(cash.lines).toEqual(['$50']);
    const plain = fitLabel({ main: 'Bankrupt', caption: null, icon: null }, 60, 80, measure, measure);
    expect(plain.lines).toEqual(['Bankrupt']);
  });

  it('breaks two-word labels when that makes them bigger', () => {
    const fit = fitLabel({ main: 'Lose Half', caption: null, icon: null }, 70, 70, measure, measure);
    expect(fit.lines).toEqual(['Lose', 'Half']);
  });
});

describe('colours', () => {
  it('parses hex and rgb colours', () => {
    expect(parseColor('#ff0080')).toEqual([255, 0, 128, 1]);
    expect(parseColor('#f08')).toEqual([255, 0, 136, 1]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3, 0.5]);
    expect(parseColor('nonsense')).toEqual([0, 0, 0, 1]);
  });

  it('mixes and fades colours', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(withAlpha('#ff0000', 0.25)).toBe('rgba(255, 0, 0, 0.25)');
    expect(withAlpha('rgba(0, 0, 255, 0.5)', 0.5)).toBe('rgba(0, 0, 255, 0.25)');
    expect(brightness('#ffffff')).toBeCloseTo(1, 9);
    expect(brightness('#000000')).toBe(0);
  });
});
