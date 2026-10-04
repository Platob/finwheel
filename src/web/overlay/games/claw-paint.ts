// Drawing helpers for Loser Claw: unit-space sprites, sticker lettering and the capsules.
import type { Segment } from '../../../shared/types';
import type { PrizeStyle, WheelTheme } from '../themes/types';
import { createCanvas, TAU } from '../wheel-face';
import { fitLines, mixColor, withAlpha } from './claw-math';

export const EMOJI = /\p{Extended_Pictographic}/u;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const PHOTO_MAX_SIDE = 512;

/** A cached drawing `w × h` units big, drawn centred on a point. */
export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

/** A canvas `w × h` units big at `u` pixels per unit, drawing in units around its centre. */
export function makeSprite(
  w: number,
  h: number,
  u: number,
): { sprite: Sprite; ctx: CanvasRenderingContext2D } {
  const canvas = createCanvas(w * u, h * u);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, canvas.width / 2, canvas.height / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { sprite: { canvas, w, h }, ctx };
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1): void {
  ctx.drawImage(s.canvas, x - (s.w * scale) / 2, y - (s.h * scale) / 2, s.w * scale, s.h * scale);
}

/** Pixels per unit of the current transform. */
export function pixelScale(ctx: CanvasRenderingContext2D): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/** Heart centred on (x, y), `w` wide. */
export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const s = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.92);
  ctx.bezierCurveTo(x - s * 0.35, y + s * 0.6, x - s * 1.02, y + s * 0.18, x - s * 1.0, y - s * 0.32);
  ctx.bezierCurveTo(x - s * 0.98, y - s * 0.78, x - s * 0.42, y - s * 1.0, x, y - s * 0.55);
  ctx.bezierCurveTo(x + s * 0.42, y - s * 1.0, x + s * 0.98, y - s * 0.78, x + s * 1.0, y - s * 0.32);
  ctx.bezierCurveTo(x + s * 1.02, y + s * 0.18, x + s * 0.35, y + s * 0.6, x, y + s * 0.92);
  ctx.closePath();
}

export interface TextStyle {
  fill: string;
  outline: string;
  family: string;
  weight?: number;
  /** Outline width relative to the size (0 = none). */
  stroke?: number;
  shadow?: string;
}

/** "Sticker" lettering: one or more lines centred on (x, y), `size` units tall, outlined. */
export function sticker(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  x: number,
  y: number,
  size: number,
  style: TextStyle,
  lineHeight = 1.08,
): void {
  if (lines.length === 0 || size <= 0) return;
  const k = pixelScale(ctx);
  const px = size * k;
  const emoji = lines.some((line) => EMOJI.test(line));
  ctx.save();
  ctx.scale(1 / k, 1 / k);
  ctx.font = emoji ? `${px}px ${EMOJI_FONT}` : `${style.weight ?? 700} ${px}px ${style.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(emoji ? lines[0]! : 'H0');
  const ink = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  const first = y * k - ((lines.length - 1) * px * lineHeight) / 2;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  lines.forEach((line, i) => {
    const by = first + i * px * lineHeight + ink;
    if (style.shadow) {
      ctx.shadowColor = style.shadow;
      ctx.shadowBlur = px * 0.18;
      ctx.shadowOffsetY = px * 0.04;
    }
    if (!emoji && (style.stroke ?? 0.2) > 0) {
      ctx.lineWidth = px * (style.stroke ?? 0.2);
      ctx.strokeStyle = style.outline;
      ctx.strokeText(line, x * k, by);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = style.fill;
    ctx.fillText(line, x * k, by);
    ctx.shadowColor = 'transparent';
  });
  ctx.restore();
}

/** Width of text at size 1 in this font. */
export function measurer(ctx: CanvasRenderingContext2D, family: string, weight = 700) {
  return (text: string) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = EMOJI.test(text) ? `100px ${EMOJI_FONT}` : `${weight} 100px ${family}`;
    const width = ctx.measureText(text).width / 100;
    ctx.restore();
    return width;
  };
}

/** What a prize shows: its icon, the big text (amount or label) and a small caption. */
export function prizeText(segment: Segment): { icon: string | null; main: string; caption: string } {
  const icon = segment.icon?.trim() || null;
  if (segment.amount) return { icon, main: segment.amount, caption: segment.caption ?? '' };
  return { icon, main: segment.label, caption: '' };
}

/** Shell colours of a capsule: the clear-ish dome, the solid base and their shading. */
export function shellColors(style: PrizeStyle, theme: WheelTheme) {
  const p = theme.palette;
  if (style.metallic) {
    return { top: p.trimLight, topEdge: p.trim, base: p.trim, baseEdge: mixColor(p.trim, '#5a3a00', 0.5) };
  }
  return {
    top: mixColor(style.fill, '#ffffff', 0.5),
    topEdge: mixColor(style.fill, '#ffffff', 0.12),
    base: style.fill,
    baseEdge: mixColor(style.fill, style.outline, 0.42),
  };
}

/**
 * A round two-tone capsule of radius `r` centred on the origin: a lighter dome over a solid base,
 * a dark seam, a gloss. `part` draws only one half (the shell of an opened capsule).
 */
export function drawCapsule(
  ctx: CanvasRenderingContext2D,
  r: number,
  style: PrizeStyle,
  theme: WheelTheme,
  part: 'full' | 'top' | 'bottom' = 'full',
): void {
  const c = shellColors(style, theme);
  const seam = r * 0.07;
  ctx.save();
  if (part !== 'bottom') {
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, TAU);
    ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.55, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, mixColor(c.top, '#ffffff', 0.5));
    g.addColorStop(0.55, c.top);
    g.addColorStop(1, c.topEdge);
    ctx.fillStyle = g;
    ctx.fill();
  }
  if (part !== 'top') {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, r);
    g.addColorStop(0, c.base);
    g.addColorStop(1, c.baseEdge);
    ctx.fillStyle = g;
    ctx.fill();
    if (part === 'bottom') {
      // The inside of the opened base.
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.94, r * 0.24, 0, 0, TAU);
      ctx.fillStyle = mixColor(c.baseEdge, '#000000', 0.45);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, r * 0.03, r * 0.8, r * 0.16, 0, 0, TAU);
      ctx.fillStyle = withAlpha(theme.palette.glow, 0.35);
      ctx.fill();
    }
  }
  // Seam band.
  if (part === 'full') {
    ctx.fillStyle = style.outline;
    ctx.fillRect(-r * 0.995, -seam / 2, r * 1.99, seam);
    ctx.fillStyle = withAlpha(theme.palette.trimLight, 0.7);
    ctx.fillRect(-r * 0.97, seam / 2, r * 1.94, seam * 0.35);
  }
  // Outline.
  ctx.beginPath();
  if (part === 'top') ctx.arc(0, 0, r, Math.PI, TAU);
  else if (part === 'bottom') ctx.arc(0, 0, r, 0, Math.PI);
  else ctx.arc(0, 0, r, 0, TAU);
  if (part !== 'full') ctx.closePath();
  ctx.lineWidth = r * 0.075;
  ctx.strokeStyle = style.outline;
  ctx.stroke();
  if (part === 'full' && style.metallic) {
    ctx.lineWidth = r * 0.03;
    ctx.strokeStyle = withAlpha('#ffffff', 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.93, 0, TAU);
    ctx.stroke();
  }
  // Gloss.
  if (part !== 'bottom') {
    ctx.beginPath();
    ctx.ellipse(-r * 0.36, -r * 0.55, r * 0.34, r * 0.16, -0.55, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-r * 0.68, -r * 0.18, r * 0.06, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
  }
  ctx.restore();
}

/** Label printed on a capsule of radius `r` at the origin. */
export function capsuleLabel(
  ctx: CanvasRenderingContext2D,
  segment: Segment,
  r: number,
  style: PrizeStyle,
  theme: WheelTheme,
) {
  const { icon, main, caption } = prizeText(segment);
  const text: TextStyle = {
    fill: style.text,
    outline: style.outline,
    family: theme.palette.display,
    stroke: 0.24,
  };
  const measure = measurer(ctx, theme.palette.display);
  if (icon) {
    sticker(ctx, [icon], 0, -r * 0.02, r * 0.95, { ...text, shadow: 'rgba(0, 0, 0, 0.35)' });
    return;
  }
  const px = r * pixelScale(ctx);
  const withCaption = caption !== '' && px >= 26;
  const fit = fitLines(main, 2, measure, r * 1.62, withCaption ? r * 0.82 : r * 1.12);
  const size = Math.min(fit.size, r * 0.78);
  sticker(ctx, fit.lines, 0, withCaption ? -r * 0.2 : -r * 0.07, size, text);
  if (withCaption) {
    const capFit = fitLines(caption.toUpperCase(), 1, measurer(ctx, theme.palette.ui), r * 1.3, r * 0.3);
    sticker(ctx, capFit.lines, 0, r * 0.43, Math.min(capFit.size, r * 0.3), {
      ...text,
      family: theme.palette.ui,
      stroke: 0.3,
    });
  }
}

/** Fits a photo into a canvas whose longest side is at most PHOTO_MAX_SIDE. */
export function scaleDown(photo: HTMLImageElement): HTMLCanvasElement {
  const w = photo.naturalWidth || 1;
  const h = photo.naturalHeight || 1;
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h));
  const canvas = createCanvas(w * scale, h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Four-pointed glint centred on (x, y). */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
  color: string,
): void {
  if (size <= 0.002 || alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x, y, x + size, y);
  ctx.quadraticCurveTo(x, y, x, y + size);
  ctx.quadraticCurveTo(x, y, x - size, y);
  ctx.quadraticCurveTo(x, y, x, y - size);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, size * 0.18, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}
