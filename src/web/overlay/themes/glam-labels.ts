/**
 * Where the glam theme puts its lettering. Lengths are relative to the face radius (or the hub
 * disc radius for the wheel name) and text widths come in as "em" (width at font size 1), so this
 * stays free of DOM types.
 */

/** Radii of the glam face, relative to its radius. */
export const GLAM_FACE = {
  /** Edge of the hub (the theme's layout.hub). */
  hub: 0.37,
  /** Lettering stays between these radii. */
  textInner: 0.39,
  textOuter: 0.82,
  /** Highest point of a tangential amount: keeps it clear of the pointer tip. */
  amountTop: 0.8,
} as const;

/** Sticker outline width relative to the font size (half of it shows around the glyphs). */
export const STICKER_STROKE = 0.18;

/** Text width at font size 1. */
export type Measure = (text: string) => number;

const MAX_HALF_ANGLE = Math.PI / 3;
/** Clearance from the slice edges. */
const PAD = 0.02;

const AMOUNT_MAX = 0.19;
const AMOUNT_MIN = 0.08;
/** Ink height of an amount, outline included, relative to its font size. */
const AMOUNT_HEIGHT = 0.95;
/** Radii tried for the amount centre, from the reference's look outward (more room on thin slices). */
const AMOUNT_RADII = [0.61, 0.63, 0.65, 0.67, 0.69, 0.71, 0.73, 0.75];
const AMOUNT_GAP = 0.012;

const CAPTION_MAX = 0.07;
const CAPTION_MIN = 0.03;
const CAPTION_RATIO = 0.5;
/** Cap height and line advance of the (uppercase) caption font, relative to its size. */
const CAPTION_CAP = 0.72;
const CAPTION_LINE = 1.02;

const MARK_RATIO = 0.5;
const MARK_MIN = 0.035;
const MARK_GAP = 0.035;

const LABEL_MAX = 0.12;
/** Half the ink height of a one-line label (descenders and outline included). */
const LABEL_HALF = 0.47;
/** Distance between the centres of two label lines, relative to the font size. */
export const LABEL_LINE = 1.0;

const tanHalf = (span: number) => Math.tan(Math.min(span / 2, MAX_HALF_ANGLE));

export interface AmountMeasure {
  /** Angular width of the slice in radians. */
  span: number;
  /** Width of the amount ("$10", "×2"). */
  amount: number;
  /** Ways to print the caption, each a list of line widths; empty when there is no caption. */
  captions: readonly (readonly number[])[];
  /** Width of the currency mark sticker shown under a caption-less amount (null: none). */
  mark: number | null;
}

/** An amount printed across the slice (glyph tops toward the rim), with what goes under it. */
export interface TangentialAmount {
  /** Font size and the radius of the amount's centre. */
  size: number;
  radius: number;
  /** Chosen caption option, its font size and the centre radius of each line. */
  caption: { option: number; size: number; radii: number[] } | null;
  mark: { size: number; radius: number } | null;
}

function captionFit(lines: readonly number[], below: number, t: number, amountSize: number) {
  let size = Math.min(CAPTION_MAX, amountSize * CAPTION_RATIO);
  size = Math.min(size, (below - GLAM_FACE.textInner) / (CAPTION_CAP + (lines.length - 1) * CAPTION_LINE));
  lines.forEach((width, i) => {
    // The lower edge of each line is the narrowest part it has to fit in.
    size = Math.min(size, (below * t - PAD) / (width / 2 + (CAPTION_CAP + i * CAPTION_LINE) * t));
  });
  const radii = lines.map((_, i) => below - size * (CAPTION_CAP / 2 + i * CAPTION_LINE));
  return { size, radii };
}

function markFit(width: number, below: number, t: number, amountSize: number) {
  const top = below - MARK_GAP;
  const size = Math.min(
    amountSize * MARK_RATIO,
    (top - GLAM_FACE.textInner) / AMOUNT_HEIGHT,
    (top * t - PAD) / ((width + STICKER_STROKE) / 2 + AMOUNT_HEIGHT * t),
  );
  return size >= MARK_MIN ? { size, radius: top - (size * AMOUNT_HEIGHT) / 2 } : null;
}

/**
 * Lays an amount out across its slice, as large as `cap` allows, with its caption (or currency
 * mark) toward the hub. Returns null when it cannot be printed legibly that way.
 */
export function tangentialAmount(m: AmountMeasure, cap = AMOUNT_MAX): TangentialAmount | null {
  const t = tanHalf(m.span);
  const width = m.amount + STICKER_STROKE;
  let best: TangentialAmount | null = null;
  for (const radius of AMOUNT_RADII) {
    const size = Math.min(
      cap,
      (2 * (GLAM_FACE.amountTop - radius)) / AMOUNT_HEIGHT,
      (radius * t - PAD) / (width / 2 + (AMOUNT_HEIGHT / 2) * t),
    );
    if (size < AMOUNT_MIN) continue;
    const below = radius - (size * AMOUNT_HEIGHT) / 2 - AMOUNT_GAP;

    let caption: TangentialAmount['caption'] = null;
    m.captions.forEach((lines, option) => {
      const fit = captionFit(lines, below, t, size);
      // More lines only when they make the caption clearly bigger.
      if (fit.size >= CAPTION_MIN && (!caption || fit.size > caption.size * 1.15)) {
        caption = { option, ...fit };
      }
    });
    if (m.captions.length > 0 && !caption) continue;
    const mark = m.captions.length === 0 && m.mark !== null ? markFit(m.mark, below, t, size) : null;

    const layout = { size, radius, caption, mark };
    if (size >= cap * 0.999) return layout;
    if (!best || size > best.size + 1e-9) best = layout;
  }
  return best;
}

/**
 * Common amount size for a wheel, so that short and long amounts look alike: the size of the
 * longest one, unless that would shrink the typical amount by more than 15%.
 */
export function amountCap(sizes: readonly number[]): number {
  if (sizes.length === 0) return AMOUNT_MAX;
  const sorted = [...sizes].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)]!;
  return Math.min(AMOUNT_MAX, Math.max(sorted[0]!, median * 0.85));
}

/** Amount printed along the radius (rim end), with the caption's font size when it fits. */
export interface RadialAmount {
  size: number;
  caption: number | null;
}

/** Fallback for slices too thin to print the amount across: amount along the radius at the rim. */
export function radialAmount(
  span: number,
  amount: number,
  caption: number | null,
  minSize: number,
): RadialAmount | null {
  const half = Math.min(span / 2, Math.PI / 2);
  const chordAt = (radius: number) => 2 * radius * Math.sin(half);
  const maxWidth = 0.42;
  let size = Math.min(0.12, chordAt(0.72) * 0.7);
  size = Math.min(size, maxWidth / (amount + STICKER_STROKE));
  if (size < minSize) return null;
  if (caption === null) return { size, caption: null };
  const room = GLAM_FACE.textOuter - (amount + STICKER_STROKE) * size - 0.025 - GLAM_FACE.textInner;
  const captionSize = Math.min(0.045, chordAt(0.5) * 0.55, size * 0.5, room / caption);
  return { size, caption: captionSize >= minSize * 0.75 ? captionSize : null };
}

/** A text label along the radius, ending near the rim: one or two lines at `size`. */
export interface RadialText {
  lines: string[];
  size: number;
}

/** Largest font size for a label block of `width` em and `half` em half-height along the radius. */
function radialSize(width: number, half: number, t: number, cap: number): number {
  const length = GLAM_FACE.textOuter - GLAM_FACE.textInner;
  const w = width + STICKER_STROKE;
  // The inner end of the label is the narrowest part it has to fit in.
  return Math.min(cap, length / w, (GLAM_FACE.textOuter * t - PAD) / (half + w * t));
}

/**
 * Fits a label in its slice: as large as possible up to `cap`, on two lines when that is clearly
 * bigger, shortened with an ellipsis when it cannot reach `minSize`. Null when nothing fits.
 */
export function fitRadialText(
  text: string,
  span: number,
  measure: Measure,
  minSize: number,
  cap = LABEL_MAX,
): RadialText | null {
  const label = text.trim();
  if (!label) return null;
  const t = tanHalf(span);
  const single = radialSize(measure(label), LABEL_HALF, t, cap);
  let best: RadialText = { lines: [label], size: single };

  const words = label.split(/\s+/);
  for (let k = 1; k < words.length; k++) {
    const lines = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
    const size = radialSize(Math.max(...lines.map(measure)), LABEL_HALF + LABEL_LINE / 2, t, cap);
    if (size > single * 1.18 && size > best.size) best = { lines, size };
  }
  if (best.size >= minSize) return best;

  const chars = Array.from(label);
  for (let n = chars.length - 1; n >= 1; n--) {
    const short = `${chars.slice(0, n).join('').trimEnd()}…`;
    const size = radialSize(measure(short), LABEL_HALF, t, cap);
    if (size >= minSize) return { lines: [short], size };
  }
  return null;
}

/** Common label size limit for a wheel: short names do not dwarf the typical one. */
export function labelCap(sizes: readonly number[]): number {
  if (sizes.length === 0) return LABEL_MAX;
  const sorted = [...sizes].sort((a, b) => a - b);
  return Math.min(LABEL_MAX, sorted[Math.floor((sorted.length - 1) / 2)]! * 1.25);
}

/** The wheel name in the hub: one or more centred lines, and room for a crown above them. */
export interface HubName {
  lines: string[];
  size: number;
  /** Centre of each line (y grows downward, 0 = hub centre). */
  ys: number[];
  /** Crown centre and height, when one was asked for. */
  crown: { y: number; height: number } | null;
}

const HUB_TEXT_RADIUS = 0.8;
const HUB_MAX = 0.22;
const HUB_CAP = 0.72;
const HUB_LINE = 1.12;
const CROWN_HEIGHT = 1.05;
const CROWN_GAP = 0.3;

function* partitions(words: readonly string[], parts: number): Generator<string[]> {
  if (parts === 1) {
    yield [words.join(' ')];
    return;
  }
  for (let i = 1; i <= words.length - parts + 1; i++) {
    for (const rest of partitions(words.slice(i), parts - 1)) yield [words.slice(0, i).join(' '), ...rest];
  }
}

function hubPlacement(widths: readonly number[], size: number, crown: boolean) {
  const crownHeight = crown ? CROWN_HEIGHT * size : 0;
  const crownGap = crown ? CROWN_GAP * size : 0;
  const total = crownHeight + crownGap + (widths.length - 1) * HUB_LINE * size + HUB_CAP * size;
  const top = -total / 2;
  const ys = widths.map((_, i) => top + crownHeight + crownGap + (HUB_CAP / 2 + i * HUB_LINE) * size);
  return { ys, crown: crown ? { y: top + crownHeight / 2, height: crownHeight } : null };
}

function hubFits(widths: readonly number[], size: number, crown: boolean): boolean {
  const r2 = HUB_TEXT_RADIUS * HUB_TEXT_RADIUS;
  const { ys, crown: c } = hubPlacement(widths, size, crown);
  const inside = (halfWidth: number, y: number) => halfWidth * halfWidth + y * y <= r2;
  if (c && !inside(c.height * 0.75, Math.abs(c.y) + c.height / 2)) return false;
  return widths.every((width, i) => inside((width * size) / 2, Math.abs(ys[i]!) + (HUB_CAP * size) / 2));
}

/**
 * Lays the wheel name out in the hub disc (radius 1), uppercase, splitting it into lines (one
 * word per line when that is as large) at the biggest size that stays inside the disc.
 */
export function hubNameLayout(name: string, measure: Measure, crown: boolean): HubName {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { lines: [], size: 0, ys: [], crown: crown ? { y: 0, height: CROWN_HEIGHT * HUB_MAX } : null };
  }
  let best: { lines: string[]; size: number } | null = null;
  for (let parts = 1; parts <= Math.min(4, words.length); parts++) {
    let bestSplit: { lines: string[]; size: number } | null = null;
    for (const lines of partitions(words, parts)) {
      const widths = lines.map(measure);
      let size = HUB_MAX;
      if (!hubFits(widths, size, crown)) {
        let lo = 0;
        let hi = HUB_MAX;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          if (hubFits(widths, mid, crown)) lo = mid;
          else hi = mid;
        }
        size = lo;
      }
      if (!bestSplit || size > bestSplit.size) bestSplit = { lines, size };
    }
    // Ties go to more lines, like the reference's one word per line.
    if (!best || bestSplit!.size >= best.size * 0.995) best = bestSplit;
  }
  const placement = hubPlacement(best!.lines.map(measure), best!.size, crown);
  return { ...best!, ...placement };
}

/** Currency symbol of a printed amount ("$12" → "$", "12 €" → "€"); null when there is none. */
export function currencyMark(amount: string): string | null {
  const mark = amount.replace(/[\d\s.,'+\-−×]/g, '');
  return mark.length >= 1 && mark.length <= 2 ? mark : null;
}
