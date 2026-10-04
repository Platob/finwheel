// DOM-free text and colour helpers of Simp Drop: what a bin says and how its label fits.

import type { Segment } from '../../../shared/types.js';

/** Text width at font size 1. */
export type Measure = (text: string) => number;

/** What a bin shows: a big amount or label, a small caption ("TOTAL", "NEXT") and an icon. */
export interface BinText {
  main: string;
  caption: string | null;
  icon: string | null;
}

export function binText(segment: Segment): BinText {
  const icon = segment.icon?.trim() || null;
  if (segment.amount) {
    return { main: segment.amount, caption: segment.caption?.trim().toUpperCase() || null, icon };
  }
  return { main: segment.label.trim() || '?', caption: null, icon };
}

/** How a label is set in its box (sizes in the box's units). */
export interface LabelFit {
  /** Reads bottom to top (narrow bins). */
  vertical: boolean;
  lines: string[];
  /** Font size of the main text. */
  size: number;
  /** Font size of the caption (0: no caption). */
  caption: number;
  /** Size of the icon (0: no icon). */
  icon: number;
  /** Horizontal labels: the icon sits before the text instead of above it (wide plates). */
  iconBefore: boolean;
  /** Length of the text along its run (widest main line or caption), without the icon. */
  length: number;
}

/** Sticker lettering takes this much room around the ink (outline), relative to the font size. */
const PAD = 0.22;
/** Height of one line of main text and of the caption line, relative to their font sizes. */
const LINE = 0.98;
const CAPTION_LINE = 0.95;
/** Caption size relative to the main text (at most). */
const CAPTION_RATIO = 0.4;
/** Icon size relative to the main text. */
const ICON_RATIO = 1.15;
/** Readers prefer horizontal text: a vertical layout must be this much bigger to win. */
const VERTICAL_BIAS = 1.25;
/**
 * A label whose text would be smaller than this share of the icon alone shows just the icon, big
 * ("Bankrupt" in a narrow bin becomes a large 💀; the winner's tag names it on landing).
 */
const ICON_ONLY = 0.3;

/** Splits a label into two lines at the space nearest its middle (null: a single word). */
export function splitTwo(text: string): [string, string] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }
  return best;
}

/**
 * Fits a bin label in a `width` × `height` box: horizontal or upright (reading bottom to top), on
 * one or two lines, with the caption under the amount and the icon above (horizontal) or before it
 * (upright). Returns the biggest layout; its sizes are 0 when nothing fits. Captions smaller than
 * `minCaption` are left out. A label with an icon that would only fit tiny shows the icon alone
 * (no `lines`).
 */
export function fitLabel(
  text: BinText,
  width: number,
  height: number,
  measure: Measure,
  measureCaption: Measure,
  minCaption = 0,
  inset = 0.86,
): LabelFit {
  const options: { fit: LabelFit; score: number }[] = [];
  const splits: string[][] = [[text.main]];
  const two = splitTwo(text.main);
  if (two) splits.push(two);
  // Horizontal with the icon above or before the text, or upright with the icon at its top end.
  const modes = [
    { vertical: false, before: false },
    ...(text.icon ? [{ vertical: false, before: true }] : []),
    { vertical: true, before: true },
  ];
  for (const { vertical, before } of modes) {
    const along = (vertical ? height : width) * inset;
    const across = (vertical ? width : height) * inset;
    for (const lines of splits) {
      for (const withCaption of text.caption ? [true, false] : [false]) {
        const widest = Math.max(...lines.map((line) => measure(line))) + PAD;
        const captionWidth = withCaption ? measureCaption(text.caption!) * CAPTION_RATIO : 0;
        const iconAlong = text.icon && before ? ICON_RATIO + 0.15 : 0;
        const iconAcross = text.icon && !before ? ICON_RATIO * 0.92 : 0;
        const textStack = lines.length * LINE + (withCaption ? CAPTION_RATIO * CAPTION_LINE : 0);
        const stack = text.icon && before ? Math.max(textStack, ICON_RATIO * 0.92) : textStack + iconAcross;
        let size = Math.min(along / (Math.max(widest, captionWidth) + iconAlong), across / stack);
        if (vertical && text.icon) size = Math.min(size, across / ICON_RATIO);
        size = Math.max(0, size);
        // A caption too small to read only shrinks the amount.
        if (withCaption && size * CAPTION_RATIO < minCaption) continue;
        const fit: LabelFit = {
          vertical,
          lines,
          size,
          caption: withCaption ? size * CAPTION_RATIO : 0,
          icon: text.icon ? size * ICON_RATIO : 0,
          iconBefore: Boolean(text.icon) && before && !vertical,
          length: Math.max(widest, captionWidth) * size,
        };
        let score = size * (vertical ? 1 : VERTICAL_BIAS) * (lines.length === 1 ? 1.08 : 1);
        // A caption ("TOTAL" or "NEXT" tells two ×2 apart) is worth a smaller amount.
        if (withCaption) score *= 1.6;
        options.push({ fit, score });
      }
    }
  }
  options.sort((a, b) => b.score - a.score);
  const best = options[0]!.fit;
  if (text.icon) {
    // The icon alone, as big as the box allows (an emoji is about as wide as it is tall).
    const icon = Math.min(width, height / 0.92) * inset * 0.95;
    if (best.size < ICON_ONLY * icon) {
      return {
        vertical: false,
        lines: [],
        size: icon / ICON_RATIO,
        caption: 0,
        icon,
        iconBefore: false,
        length: 0,
      };
    }
  }
  return best;
}

// ── Colours ───────────────────────────────────────────────────────────────

/** Parses `#rgb`, `#rrggbb`, `rgb()` and `rgba()` colours into [r, g, b, a] (black if unknown). */
export function parseColor(color: string): [number, number, number, number] {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    const full =
      hex.length === 3 || hex.length === 4
        ? hex
            .split('')
            .map((d) => d + d)
            .join('')
        : hex;
    const n = Number.parseInt(full.slice(0, 6), 16);
    if (Number.isNaN(n)) return [0, 0, 0, 1];
    const a = full.length >= 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = /rgba?\(([^)]+)\)/i.exec(c);
  if (m) {
    const parts = m[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
  }
  return [0, 0, 0, 1];
}

export function withAlpha(color: string, alpha: number): string {
  const [r, g, b, a] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * alpha * 1000) / 1000})`;
}

/** Mixes two colours (`t` = 0 → a, 1 → b). */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const k = Math.min(1, Math.max(0, t));
  const ch = (i: number) => Math.round(ca[i]! + (cb[i]! - ca[i]!) * k);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/** Perceived brightness, 0 … 1. */
export function brightness(color: string): number {
  const [r, g, b] = parseColor(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
