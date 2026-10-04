/** Colours of the glam look and the slice style picked for each segment. Free of DOM types. */
import type { Segment } from '../../../shared/types.js';

/** Named colours of the glam look. */
export const GLAM = {
  hotPink: '#e8559f',
  deepPink: '#d63a8a',
  pink: '#f27fba',
  lightPink: '#f7b2d3',
  cream: '#f9ebe1',
  gold: '#f4c656',
  lavender: '#a46ae6',
  plum: '#3a0c2c',
  rimGold: '#efc24a',
  paleGold: '#fff1b0',
  pearl: '#fffdf8',
} as const;

export interface GlamSliceStyle {
  /** Fill near the hub, mid-slice and at the rim. */
  inner: string;
  base: string;
  edge: string;
  /** Sticker lettering: fill and thick outline. */
  text: string;
  stroke: string;
  /** Small serif captions ("TOTAL", "NEXT"), drawn without an outline. */
  caption: string;
  /** Metallic gold fill (jackpot slices). */
  metallic?: boolean;
  /** Thin inset outline in this colour. */
  inlay?: string;
}

const WHITE = '#ffffff';
const DARK_CAPTION = '#5a1840';

/** Mixes two `#rrggbb` colours (`t` = 0 → a, 1 → b) into an `rgb()` string. */
export function mix(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const channel = (shift: number) => {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    return Math.round(ca + (cb - ca) * Math.min(1, Math.max(0, t)));
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/** Perceived brightness of a `#rrggbb` colour, 0..1. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function slice(base: string, caption: string, extra: Partial<GlamSliceStyle> = {}): GlamSliceStyle {
  return {
    inner: mix(base, WHITE, 0.12),
    base,
    edge: mix(base, GLAM.plum, 0.07),
    text: WHITE,
    stroke: GLAM.plum,
    caption,
    ...extra,
  };
}

/** Base cycle: hot pink, cream, pink, light pink. */
export const GLAM_CYCLE: readonly GlamSliceStyle[] = [
  slice(GLAM.hotPink, WHITE),
  slice(GLAM.cream, DARK_CAPTION),
  slice(GLAM.pink, WHITE),
  slice(GLAM.lightPink, DARK_CAPTION),
];

/** Slices whose main effect is "×N total" (gold) or "×N next" (lavender). */
export const GLAM_EFFECT_STYLES = {
  total: slice(GLAM.gold, DARK_CAPTION),
  next: slice(GLAM.lavender, WHITE),
} as const;

const LEGENDARY: GlamSliceStyle = {
  ...slice('#a3186e', '#ffe08a'),
  inner: '#c2338a',
  edge: '#7a0f52',
  inlay: GLAM.gold,
};

const JACKPOT: GlamSliceStyle = {
  ...slice(GLAM.gold, GLAM.plum),
  inner: '#c8901e',
  edge: '#ffe9a6',
  metallic: true,
};

const BUST: GlamSliceStyle = {
  inner: '#45123a',
  base: '#2a0a22',
  edge: '#1a0515',
  text: '#ff5fae',
  stroke: '#14030f',
  caption: '#ff5fae',
  inlay: GLAM.hotPink,
};

/** Position in the base cycle; the last slice never repeats the colour of the first one. */
export function cycleSlot(index: number, count: number): number {
  const slot = index % GLAM_CYCLE.length;
  return count > 1 && index === count - 1 && slot === 0 ? 1 : slot;
}

/**
 * Style of one slice. Bankrupt, an explicit colour, jackpot, the "total" / "next" effects and the
 * legendary tier stand out; everything else follows the base cycle (no two equal neighbours).
 */
export function glamSliceStyle(segment: Segment, index: number, count: number): GlamSliceStyle {
  if (segment.bust) return BUST;
  if (segment.color) return slice(segment.color, luminance(segment.color) > 0.62 ? DARK_CAPTION : WHITE);
  if (segment.tier === 'jackpot') return JACKPOT;
  if (segment.effect === 'total' || segment.effect === 'next') return GLAM_EFFECT_STYLES[segment.effect];
  if (segment.tier === 'legendary') return LEGENDARY;
  return GLAM_CYCLE[cycleSlot(index, count)]!;
}
