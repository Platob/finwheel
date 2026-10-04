import { describe, expect, it } from 'vitest';
import {
  amountCap,
  currencyMark,
  fitRadialText,
  GLAM_FACE,
  hubNameLayout,
  radialAmount,
  STICKER_STROKE,
  tangentialAmount,
} from './glam-labels.js';

/** Fake metrics: every character is 0.6 em wide. */
const measure = (text: string) => Array.from(text).length * 0.6;
const span = (slices: number) => (2 * Math.PI) / slices;

/** Checks that a box centred on the slice axis at `radius` stays inside the slice. */
function insideSlice(slices: number, radius: number, width: number, height: number) {
  const inner = radius - height / 2;
  return width / 2 <= inner * Math.tan(span(slices) / 2) + 1e-9;
}

describe('tangentialAmount', () => {
  it('prints short amounts large, where the reference does, on a 11-slice wheel', () => {
    const layout = tangentialAmount({ span: span(11), amount: measure('$7'), captions: [], mark: measure('$') });
    expect(layout).not.toBeNull();
    expect(layout!.size).toBeCloseTo(0.17);
    expect(layout!.radius).toBeCloseTo(0.65);
    expect(layout!.mark).not.toBeNull();
    expect(layout!.mark!.radius).toBeLessThan(layout!.radius);
    expect(layout!.mark!.radius).toBeGreaterThan(GLAM_FACE.textInner);
  });

  it('keeps the amount inside its slice and below the pointer tip', () => {
    for (const slices of [6, 11, 16, 20]) {
      for (const amount of ['$2', '$10', '$500', '$1,000']) {
        const width = measure(amount);
        const layout = tangentialAmount({ span: span(slices), amount: width, captions: [], mark: null });
        if (!layout) continue;
        const box = (width + STICKER_STROKE) * layout.size;
        expect(insideSlice(slices, layout.radius, box, layout.size * 0.95), `${amount} / ${slices}`).toBe(true);
        expect(layout.radius + layout.size * 0.475).toBeLessThanOrEqual(GLAM_FACE.amountTop + 1e-9);
      }
    }
  });

  it('moves outward on thin slices, where there is more room', () => {
    const wide = tangentialAmount({ span: span(10), amount: measure('$10'), captions: [], mark: null })!;
    const thin = tangentialAmount({ span: span(16), amount: measure('$10'), captions: [], mark: null })!;
    expect(thin.radius).toBeGreaterThan(wide.radius);
    expect(thin.size).toBeLessThan(wide.size);
  });

  it('puts the caption between the amount and the hub, on two lines when that is bigger', () => {
    const captions = [[measure('BONUS SPIN')], [measure('BONUS'), measure('SPIN')]];
    const layout = tangentialAmount({ span: span(16), amount: measure('$2'), captions, mark: measure('$') })!;
    expect(layout.caption).not.toBeNull();
    expect(layout.caption!.option).toBe(1);
    expect(layout.mark).toBeNull();
    const [first, second] = layout.caption!.radii;
    expect(first).toBeLessThan(layout.radius);
    expect(second).toBeLessThan(first!);
    expect(second! - layout.caption!.size * 0.36).toBeGreaterThanOrEqual(GLAM_FACE.textInner - 1e-9);
  });

  it('falls back (null) when the slice is too thin to print the amount across', () => {
    expect(tangentialAmount({ span: span(40), amount: measure('$10'), captions: [], mark: null })).toBeNull();
    expect(tangentialAmount({ span: span(30), amount: measure('$100'), captions: [], mark: null })).toBeNull();
    // A caption that cannot fit forces the fallback too.
    const long = [[measure('A VERY LONG CAPTION INDEED')]];
    expect(tangentialAmount({ span: span(16), amount: measure('$5'), captions: long, mark: null })).toBeNull();
  });

  it('honours a common cap', () => {
    const layout = tangentialAmount({ span: span(8), amount: measure('$5'), captions: [], mark: null }, 0.1)!;
    expect(layout.size).toBeCloseTo(0.1);
    expect(layout.radius).toBeCloseTo(0.65);
  });
});

describe('amountCap', () => {
  it('follows the median size', () => {
    expect(amountCap([0.1, 0.1, 0.12, 0.17])).toBeCloseTo(0.11);
    expect(amountCap([0.17, 0.17])).toBe(0.17);
    expect(amountCap([])).toBe(0.17);
  });
});

describe('radialAmount', () => {
  it('fits the amount along the radius and drops a caption that does not fit', () => {
    const fit = radialAmount(span(40), measure('$10'), measure('BONUS'), 0.025)!;
    expect(fit.size).toBeGreaterThan(0.05);
    expect(fit.caption === null || fit.caption > 0).toBe(true);
    expect(radialAmount(span(400), measure('$10'), null, 0.025)).toBeNull();
  });
});

describe('fitRadialText', () => {
  it('fits short labels large and long ones smaller', () => {
    const short = fitRadialText('No HUD', span(6), measure, 0.03)!;
    const long = fitRadialText('Chat Picks Loadout', span(16), measure, 0.03)!;
    expect(short.size).toBeGreaterThan(long.size);
  });

  it('uses two lines on wide slices when that is clearly bigger', () => {
    const fit = fitRadialText('Chat Picks Loadout', span(6), measure, 0.03)!;
    expect(fit.lines).toHaveLength(2);
    expect(fitRadialText('Chat Picks Loadout', span(40), measure, 0.03)!.lines).toHaveLength(1);
  });

  it('shortens with an ellipsis when the label cannot reach the minimum size', () => {
    const fit = fitRadialText('Supercalifragilisticexpialidocious', span(40), measure, 0.035)!;
    expect(fit.lines[0]!.endsWith('…')).toBe(true);
    expect(fit.size).toBeGreaterThanOrEqual(0.035);
    expect(fitRadialText('   ', span(8), measure, 0.03)).toBeNull();
    expect(fitRadialText('Name', span(2000), measure, 0.03)).toBeNull();
  });
});

describe('hubNameLayout', () => {
  it('prints one word per line when that is as large', () => {
    const name = hubNameLayout('Broke Boi Wheel', measure, false);
    expect(name.lines).toEqual(['BROKE', 'BOI', 'WHEEL']);
    expect(name.ys[0]).toBeLessThan(0);
    expect(name.ys[2]).toBeGreaterThan(0);
    expect(name.crown).toBeNull();
  });

  it('keeps every line inside the disc and leaves room for the crown', () => {
    const name = hubNameLayout('The Grand Wheel of Fortune', measure, true);
    expect(name.crown).not.toBeNull();
    expect(name.crown!.y).toBeLessThan(name.ys[0]!);
    name.lines.forEach((line, i) => {
      const half = (measure(line) * name.size) / 2;
      const y = Math.abs(name.ys[i]!) + name.size * 0.36;
      expect(Math.hypot(half, y)).toBeLessThanOrEqual(0.8 + 1e-6);
    });
  });

  it('handles an empty name', () => {
    expect(hubNameLayout('  ', measure, false).lines).toEqual([]);
  });
});

describe('currencyMark', () => {
  it('extracts the currency symbol of an amount', () => {
    expect(currencyMark('$1,250')).toBe('$');
    expect(currencyMark('12.50 €')).toBe('€');
    expect(currencyMark('×2')).toBeNull();
    expect(currencyMark('+1')).toBeNull();
    expect(currencyMark('5 USD')).toBeNull();
  });
});
