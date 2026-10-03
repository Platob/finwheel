import type { Segment } from '../../shared/types';

export interface SliceStyle {
  /** Colour near the hub, mid-slice and at the rim. */
  inner: string;
  base: string;
  edge: string;
  text: string;
  /** Gold metallic fill (jackpot slices). */
  metallic?: boolean;
  /** Draws a thin inset outline in this colour. */
  inlay?: string;
}

// Roulette-inspired base cycle: emerald felt, bordeaux and onyx.
const CYCLE: SliceStyle[] = [
  { inner: '#052a1f', base: '#0d5a43', edge: '#137257', text: '#f6eedb' },
  { inner: '#33060f', base: '#7a1530', edge: '#97203f', text: '#f6eedb' },
  { inner: '#08080b', base: '#1a1a21', edge: '#272731', text: '#f6eedb' },
];

const TIER_STYLES: Partial<Record<Segment['tier'], SliceStyle>> = {
  rare: { inner: '#081a36', base: '#163d78', edge: '#1f4f96', text: '#f6eedb' },
  epic: { inner: '#230735', base: '#561d7c', edge: '#6c2a98', text: '#f6eedb' },
  legendary: { inner: '#1a1003', base: '#4d3510', edge: '#6e4f1a', text: '#ffe9a8', inlay: '#e9c766' },
  jackpot: { inner: '#7a5414', base: '#d9b048', edge: '#f7df8e', text: '#2a1a03', metallic: true },
};

const BUST_STYLE: SliceStyle = {
  inner: '#020203',
  base: '#0b0b0e',
  edge: '#151519',
  text: '#ff4a64',
  inlay: '#c0102e',
};

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (n >> shift) & 255;
    const v = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount;
    return Math.round(Math.min(255, Math.max(0, v)));
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Picks a slice style; adjacent common slices never share a colour, including first/last. */
export function sliceStyle(segment: Segment, index: number, count: number): SliceStyle {
  if (segment.bust) return BUST_STYLE;
  if (segment.color) {
    return {
      inner: shade(segment.color, -0.6),
      base: segment.color,
      edge: shade(segment.color, 0.12),
      text: luminance(segment.color) > 0.6 ? '#1b1405' : '#f6eedb',
    };
  }
  const tierStyle = TIER_STYLES[segment.tier];
  if (tierStyle) return tierStyle;
  let slot = index % CYCLE.length;
  if (count > 1 && index === count - 1 && count % CYCLE.length === 1) slot = 1;
  return CYCLE[slot]!;
}
