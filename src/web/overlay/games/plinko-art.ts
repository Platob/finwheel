/**
 * Painting of Simp Drop: the cabinet and its peg field (one static layer), the prize plates, pegs,
 * the coin, the carriage, bulbs, neon signs and the winner's tag. Everything is drawn once into
 * offscreen canvases; the stage only composes them.
 */
import type { Segment, WheelView } from '../../../shared/types';
import type { PrizeStyle, WheelTheme } from '../themes/types';
import { createCanvas, drawPhotoCover, setLetterSpacing, TAU } from '../wheel-face';
import {
  binText,
  brightness,
  fitLabel,
  mixColor,
  withAlpha,
  type BinText,
  type LabelFit,
} from './plinko-labels';
import { CABINET, FIELD, RAIL, pegCount, pegPosition, type BoardGeometry } from './plinko-math';

const EMOJI_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
/** Outline width of sticker lettering, relative to the font size. */
const STROKE = 0.22;
/** Labels smaller than this (in play-area units) are left out: the winner's tag says it big. */
export const MIN_LABEL = 0.026;
/** Captions ("TOTAL", "NEXT") smaller than this are left out of the plates. */
const MIN_CAPTION = 0.027;

/** Converts play-area units (half sides around its centre) to canvas pixels. */
export interface Frame {
  cx: number;
  cy: number;
  /** Half side of the play area, in canvas pixels. */
  u: number;
}

export const px = (f: Frame, x: number): number => f.cx + x * f.u;
export const py = (f: Frame, y: number): number => f.cy + y * f.u;

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function boxPath(ctx: CanvasRenderingContext2D, f: Frame, box: typeof FIELD | typeof CABINET, inset = 0) {
  roundRect(
    ctx,
    px(f, box.left) + inset,
    py(f, box.top) + inset,
    (box.right - box.left) * f.u - inset * 2,
    (box.bottom - box.top) * f.u - inset * 2,
    box.radius * f.u - inset,
  );
}

/** Gold (or the theme's trim) along a line. */
function metal(
  ctx: CanvasRenderingContext2D,
  theme: WheelTheme,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const { trim, trimLight } = theme.palette;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, trimLight);
  g.addColorStop(0.3, trim);
  g.addColorStop(0.55, mixColor(trim, '#6a3a08', 0.28));
  g.addColorStop(0.8, trim);
  g.addColorStop(1, trimLight);
  return g;
}

/** Sticker lettering centred on (x, y): a thick round outline under the fill. */
export function sticker(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  family: string,
  colors: { fill: string; outline: string; shadow?: string },
  align: CanvasTextAlign = 'center',
): void {
  ctx.save();
  ctx.font = `700 ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText('H');
  const baseline = y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = size * STROKE;
  ctx.strokeStyle = colors.outline;
  ctx.shadowColor = colors.shadow ?? 'rgba(40, 6, 30, 0.45)';
  ctx.shadowBlur = size * 0.14;
  ctx.shadowOffsetY = size * 0.05;
  ctx.strokeText(text, x, baseline);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = colors.fill;
  ctx.fillText(text, x, baseline);
  ctx.restore();
}

/** Small capitals (TOTAL, NEXT) without an outline. */
function caps(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  family: string,
  color: string,
  align: CanvasTextAlign = 'center',
) {
  ctx.save();
  ctx.font = `700 ${size}px ${family}`;
  setLetterSpacing(ctx, '0.06em');
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText('H');
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  ctx.restore();
}

function emoji(
  ctx: CanvasRenderingContext2D,
  icon: string,
  x: number,
  y: number,
  size: number,
  shadow: string,
) {
  ctx.save();
  ctx.font = `${size}px ${EMOJI_FONTS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = shadow;
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.05;
  ctx.fillText(icon, x, y + size * 0.04);
  ctx.restore();
}

/** Text width at font size 1. */
export function measurer(ctx: CanvasRenderingContext2D, family: string, spacing = 0) {
  return (text: string): number => {
    ctx.font = `700 100px ${family}`;
    return ctx.measureText(text).width / 100 + spacing * text.length;
  };
}

/** A heart path centred on (x, y), `w` wide. */
export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const s = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.95);
  ctx.bezierCurveTo(x - s * 0.15, y + s * 0.75, x - s, y + s * 0.25, x - s, y - s * 0.3);
  ctx.bezierCurveTo(x - s, y - s * 0.85, x - s * 0.35, y - s * 1.05, x, y - s * 0.55);
  ctx.bezierCurveTo(x + s * 0.35, y - s * 1.05, x + s, y - s * 0.85, x + s, y - s * 0.3);
  ctx.bezierCurveTo(x + s, y + s * 0.25, x + s * 0.15, y + s * 0.75, x, y + s * 0.95);
  ctx.closePath();
}

/** A rounded "$" stroked with the current stroke style, `height` tall. */
function dollarPath(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, width: number) {
  const rx = height * 0.22;
  const ry = height * 0.19;
  ctx.beginPath();
  ctx.ellipse(x, y - ry, rx, ry, 0, -0.45, Math.PI / 2, true);
  ctx.ellipse(x, y + ry, rx, ry, 0, -Math.PI / 2, Math.PI - 0.45);
  ctx.moveTo(x, y - height / 2);
  ctx.lineTo(x, y - ry * 2 - height * 0.04);
  ctx.moveTo(x, y + ry * 2 + height * 0.04);
  ctx.lineTo(x, y + height / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.stroke();
}

// ── Board ────────────────────────────────────────────────────────────────

export interface Neon {
  heart: HTMLCanvasElement;
  dollar: HTMLCanvasElement;
}

/** Where the two neon signs (or photo medallions) sit, in the empty corners above the pegs. */
export const SIGNS = {
  y: RAIL.y + 0.33,
  x: FIELD.right - 0.27,
  r: 0.15,
} as const;

/**
 * The static board: shadow, pink cabinet with its gold frame, the quilted glass field, rail, pegs and
 * the posts between the bins. Full canvas size.
 */
export function buildBoard(theme: WheelTheme, size: number, f: Frame, geo: BoardGeometry): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const { body, bodyDark, outline, screen, glow, trimLight } = theme.palette;
  const u = f.u;
  const glam = theme.id === 'glam';

  // Floor shadow and the cabinet body.
  ctx.save();
  const floor = ctx.createRadialGradient(
    f.cx,
    py(f, CABINET.bottom),
    0,
    f.cx,
    py(f, CABINET.bottom),
    u * 0.95,
  );
  floor.addColorStop(0, withAlpha(outline, 0.45));
  floor.addColorStop(1, withAlpha(outline, 0));
  ctx.fillStyle = floor;
  ctx.setTransform(1, 0, 0, 0.09, 0, py(f, CABINET.bottom) * 0.91);
  ctx.fillRect(f.cx - u, py(f, CABINET.bottom) - u, u * 2, u * 2);
  ctx.restore();

  ctx.save();
  boxPath(ctx, f, CABINET);
  ctx.shadowColor = withAlpha(outline, 0.55);
  ctx.shadowBlur = u * 0.07;
  ctx.shadowOffsetY = u * 0.025;
  const shell = ctx.createLinearGradient(0, py(f, CABINET.top), 0, py(f, CABINET.bottom));
  shell.addColorStop(0, mixColor(body, '#ffffff', glam ? 0.22 : 0.08));
  shell.addColorStop(0.35, body);
  shell.addColorStop(1, mixColor(body, bodyDark, 0.6));
  ctx.fillStyle = shell;
  ctx.fill();
  ctx.restore();

  // Diagonal satin sheen on the body.
  ctx.save();
  boxPath(ctx, f, CABINET);
  ctx.clip();
  const sheen = ctx.createLinearGradient(px(f, -1), py(f, -1), px(f, 1), py(f, 1));
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  sheen.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(0.7, 'rgba(255, 255, 255, 0.05)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // Gold outer rim with a dark hairline (keeps the edge crisp on a pink stream background).
  ctx.save();
  boxPath(ctx, f, CABINET, u * 0.004);
  ctx.lineWidth = u * 0.008;
  ctx.strokeStyle = withAlpha(outline, 0.75);
  ctx.stroke();
  boxPath(ctx, f, CABINET, u * 0.013);
  ctx.lineWidth = u * 0.015;
  ctx.strokeStyle = metal(ctx, theme, 0, py(f, CABINET.top), 0, py(f, CABINET.bottom));
  ctx.stroke();
  ctx.restore();

  // Field: gold bezel, then the dark glass.
  ctx.save();
  boxPath(ctx, f, FIELD, -u * 0.012);
  ctx.fillStyle = metal(
    ctx,
    theme,
    px(f, FIELD.left),
    py(f, FIELD.top),
    px(f, FIELD.right),
    py(f, FIELD.bottom),
  );
  ctx.shadowColor = withAlpha(outline, 0.5);
  ctx.shadowBlur = u * 0.02;
  ctx.fill();
  ctx.restore();

  ctx.save();
  boxPath(ctx, f, FIELD);
  ctx.clip();
  const glass = ctx.createLinearGradient(0, py(f, FIELD.top), 0, py(f, FIELD.bottom));
  glass.addColorStop(0, mixColor(screen, bodyDark, 0.35));
  glass.addColorStop(0.55, screen);
  glass.addColorStop(1, mixColor(screen, bodyDark, 0.45));
  ctx.fillStyle = glass;
  ctx.fillRect(0, 0, size, size);
  const haze = ctx.createRadialGradient(f.cx, py(f, -0.35), 0, f.cx, py(f, -0.35), u * 1.05);
  haze.addColorStop(0, withAlpha(glow, glam ? 0.26 : 0.12));
  haze.addColorStop(1, withAlpha(glow, 0));
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, size, size);
  const footlight = ctx.createRadialGradient(
    f.cx,
    py(f, FIELD.bottom),
    0,
    f.cx,
    py(f, FIELD.bottom),
    u * 0.9,
  );
  footlight.addColorStop(0, withAlpha(glow, glam ? 0.22 : 0.1));
  footlight.addColorStop(1, withAlpha(glow, 0));
  ctx.fillStyle = footlight;
  ctx.fillRect(0, 0, size, size);
  quilt(ctx, f, theme);
  // Glass reflection over the upper half.
  const shine = ctx.createLinearGradient(0, py(f, FIELD.top), 0, py(f, 0.1));
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.09)');
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // Neon line round the inside of the glass.
  ctx.save();
  boxPath(ctx, f, FIELD, u * 0.02);
  ctx.lineWidth = u * 0.006;
  ctx.strokeStyle = withAlpha(glow, 0.75);
  ctx.shadowColor = glow;
  ctx.shadowBlur = u * 0.025;
  ctx.stroke();
  ctx.lineWidth = u * 0.002;
  ctx.strokeStyle = withAlpha(trimLight, 0.7);
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();

  drawRail(ctx, theme, f);
  drawPegs(ctx, theme, f, geo);
  drawPosts(ctx, theme, f, geo);
  return canvas;
}

/** Faint quilted lattice with little studs (a padded-satin backing). */
function quilt(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme) {
  const { glow, trimLight } = theme.palette;
  const step = 0.17 * f.u;
  const left = px(f, FIELD.left);
  const right = px(f, FIELD.right);
  const top = py(f, FIELD.top);
  const bottom = py(f, FIELD.bottom);
  const span = right - left + bottom - top;
  ctx.save();
  ctx.lineWidth = f.u * 0.004;
  ctx.strokeStyle = withAlpha(glow, theme.id === 'glam' ? 0.09 : 0.05);
  ctx.beginPath();
  for (let d = -span; d <= span; d += step) {
    ctx.moveTo(f.cx + d - span, f.cy - span);
    ctx.lineTo(f.cx + d + span, f.cy + span);
    ctx.moveTo(f.cx + d + span, f.cy - span);
    ctx.lineTo(f.cx + d - span, f.cy + span);
  }
  ctx.stroke();
  ctx.fillStyle = withAlpha(trimLight, theme.id === 'glam' ? 0.16 : 0.08);
  for (let i = -12; i <= 12; i++) {
    for (let j = -12; j <= 12; j++) {
      const x = f.cx + (i + j) * step;
      const y = f.cy + (j - i) * step;
      if (x < left || x > right || y < top || y > bottom) continue;
      ctx.beginPath();
      ctx.arc(x, y, f.u * 0.006, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawRail(ctx: CanvasRenderingContext2D, theme: WheelTheme, f: Frame) {
  const y = py(f, RAIL.y);
  const x0 = px(f, -RAIL.half);
  const x1 = px(f, RAIL.half);
  const t = f.u * 0.02;
  ctx.save();
  // Struts holding the rail to the top of the glass.
  ctx.fillStyle = metal(ctx, theme, 0, py(f, FIELD.top), 0, y);
  for (const x of [x0 + t, x1 - t])
    ctx.fillRect(x - t * 0.3, py(f, FIELD.top), t * 0.6, y - py(f, FIELD.top));
  ctx.shadowColor = withAlpha(theme.palette.outline, 0.6);
  ctx.shadowBlur = t * 0.8;
  ctx.shadowOffsetY = t * 0.3;
  roundRect(ctx, x0, y - t / 2, x1 - x0, t, t / 2);
  ctx.fillStyle = metal(ctx, theme, 0, y - t / 2, 0, y + t / 2);
  ctx.fill();
  ctx.restore();
  for (const x of [x0, x1]) pearl(ctx, theme, x, y, t * 0.85);
}

/** A pearl bead (rail ends, post caps). */
function pearl(ctx: CanvasRenderingContext2D, theme: WheelTheme, x: number, y: number, r: number) {
  ctx.save();
  ctx.shadowColor = withAlpha(theme.palette.outline, 0.5);
  ctx.shadowBlur = r * 0.6;
  ctx.shadowOffsetY = r * 0.2;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, theme.id === 'glam' ? '#ffe3f0' : mixColor(theme.palette.trimLight, '#ffffff', 0.4));
  g.addColorStop(1, theme.id === 'glam' ? '#e9a8c8' : theme.palette.trim);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPegs(ctx: CanvasRenderingContext2D, theme: WheelTheme, f: Frame, geo: BoardGeometry) {
  const r = geo.pegRadius * f.u;
  const halo = buildGlow(theme.palette.glow, r * 3.2, 0.5);
  const peg = buildPeg(theme, r);
  for (let row = 0; row < geo.rows; row++) {
    for (let j = 0; j < pegCount(row); j++) {
      const p = pegPosition(geo, row, j);
      const x = px(f, p.x);
      const y = py(f, p.y);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(halo, x - halo.width / 2, y - halo.height / 2);
      ctx.globalAlpha = 1;
      ctx.drawImage(peg, x - peg.width / 2, y - peg.height / 2);
    }
  }
}

/** The gold posts between the bins, with pearl caps. */
function drawPosts(ctx: CanvasRenderingContext2D, theme: WheelTheme, f: Frame, geo: BoardGeometry) {
  if (geo.bins === 0) return;
  const w = Math.max(f.u * 0.007, Math.min(f.u * 0.014, geo.binWidth * f.u * 0.1));
  const top = py(f, geo.binTop);
  const bottom = py(f, geo.plateTop) + f.u * 0.01;
  // Very narrow bins get no posts between them (a dense comb reads worse than none).
  const posts = Array.from({ length: geo.bins + 1 }, (_, i) => i).filter(
    (i) => geo.binWidth >= 0.045 || i === 0 || i === geo.bins,
  );
  ctx.save();
  for (const i of posts) {
    const x = px(f, geo.binLeft + i * geo.binWidth);
    ctx.shadowColor = withAlpha(theme.palette.outline, 0.5);
    ctx.shadowBlur = w;
    ctx.fillStyle = metal(ctx, theme, x - w / 2, 0, x + w / 2, 0);
    roundRect(ctx, x - w / 2, top, w, bottom - top, w / 2);
    ctx.fill();
  }
  ctx.restore();
  for (const i of posts) pearl(ctx, theme, px(f, geo.binLeft + i * geo.binWidth), top, w * 0.95);
}

/** A pearl peg, `r` px in radius. */
export function buildPeg(theme: WheelTheme, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2 + 6);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  ctx.shadowColor = withAlpha(theme.palette.outline, 0.7);
  ctx.shadowBlur = Math.max(1, r * 0.5);
  ctx.shadowOffsetY = r * 0.25;
  const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.05, c, c, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, theme.id === 'glam' ? '#ffeef7' : '#fff6dc');
  g.addColorStop(1, theme.id === 'glam' ? '#f3a6cb' : mixColor(theme.palette.trim, '#ffffff', 0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, TAU);
  ctx.fill();
  return canvas;
}

/** A soft radial glow, `r` px in radius. */
export function buildGlow(color: string, r: number, core = 0.9): HTMLCanvasElement {
  const size = Math.ceil(r * 2);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, r);
  g.addColorStop(0, withAlpha(color, core));
  g.addColorStop(0.35, withAlpha(color, core * 0.45));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** A peg lit by a hit: white-hot core in a pink bloom. */
export function buildFlash(theme: WheelTheme, r: number): HTMLCanvasElement {
  const R = r * 5;
  const size = Math.ceil(R * 2);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, R);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.17, withAlpha(theme.palette.trimLight, 0.95));
  g.addColorStop(0.3, withAlpha(theme.palette.glow, 0.6));
  g.addColorStop(1, withAlpha(theme.palette.glow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** A four-pointed sparkle, `r` px in radius. */
export function buildSpark(theme: WheelTheme, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2 + 2);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  ctx.fillStyle = mixColor(theme.palette.trimLight, '#ffffff', 0.5);
  ctx.shadowColor = theme.palette.glow;
  ctx.shadowBlur = r * 0.4;
  ctx.beginPath();
  const k = r * 0.22;
  ctx.moveTo(c, c - r);
  ctx.quadraticCurveTo(c + k, c - k, c + r, c);
  ctx.quadraticCurveTo(c + k, c + k, c, c + r);
  ctx.quadraticCurveTo(c - k, c + k, c - r, c);
  ctx.quadraticCurveTo(c - k, c - k, c, c - r);
  ctx.fill();
  return canvas;
}

// ── Bulbs, neon, carriage, coin ──────────────────────────────────────────

export function buildBulbs(theme: WheelTheme, r: number): { on: HTMLCanvasElement; off: HTMLCanvasElement } {
  const size = Math.ceil(r * 6);
  const c = size / 2;
  const on = createCanvas(size);
  const a = on.getContext('2d')!;
  const halo = a.createRadialGradient(c, c, 0, c, c, r * 3);
  halo.addColorStop(0, withAlpha(theme.palette.trimLight, 0.9));
  halo.addColorStop(0.3, withAlpha(theme.palette.glow, 0.45));
  halo.addColorStop(1, withAlpha(theme.palette.glow, 0));
  a.fillStyle = halo;
  a.fillRect(0, 0, size, size);
  const core = a.createRadialGradient(c - r * 0.3, c - r * 0.3, 0, c, c, r);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(1, mixColor(theme.palette.trimLight, '#ffffff', 0.4));
  a.fillStyle = core;
  a.beginPath();
  a.arc(c, c, r, 0, TAU);
  a.fill();

  const off = createCanvas(size);
  const b = off.getContext('2d')!;
  const dim = b.createRadialGradient(c - r * 0.3, c - r * 0.35, 0, c, c, r);
  dim.addColorStop(0, mixColor(theme.palette.trimLight, '#ffffff', 0.5));
  dim.addColorStop(1, mixColor(theme.palette.body, theme.palette.trimLight, 0.45));
  b.shadowColor = withAlpha(theme.palette.outline, 0.5);
  b.shadowBlur = r * 0.5;
  b.shadowOffsetY = r * 0.2;
  b.fillStyle = dim;
  b.beginPath();
  b.arc(c, c, r, 0, TAU);
  b.fill();
  return { on, off };
}

/** Neon tube signs for the empty corners: a heart and a dollar, `r` px in radius. */
export function buildNeon(theme: WheelTheme, r: number): Neon {
  const make = (draw: (ctx: CanvasRenderingContext2D, c: number) => void) => {
    const size = Math.ceil(r * 2.6);
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d')!;
    const c = size / 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const [width, color, blur] of [
      [r * 0.13, withAlpha(theme.palette.glow, 0.55), r * 0.35],
      [r * 0.075, theme.palette.glow, r * 0.12],
      [r * 0.03, mixColor(theme.palette.trimLight, '#ffffff', 0.6), 0],
    ] as const) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.shadowColor = theme.palette.glow;
      ctx.shadowBlur = blur;
      ctx.lineWidth = width;
      draw(ctx, c);
      ctx.restore();
    }
    return canvas;
  };
  return {
    heart: make((ctx, c) => {
      heartPath(ctx, c, c + r * 0.05, r * 1.75);
      ctx.stroke();
    }),
    dollar: make((ctx, c) => {
      ctx.beginPath();
      ctx.arc(c, c, r * 0.92, 0, TAU);
      ctx.stroke();
      const w = ctx.lineWidth;
      dollarPath(ctx, c, c, r * 1.2, w);
    }),
  };
}

/** A photo in a round gold frame with a pink glow, `r` px in radius. */
export function buildMedallion(theme: WheelTheme, photo: HTMLCanvasElement, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2.6);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  ctx.save();
  ctx.shadowColor = theme.palette.glow;
  ctx.shadowBlur = r * 0.3;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, TAU);
  ctx.fillStyle = metal(ctx, theme, c - r, c - r, c + r, c + r);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(c, c);
  drawPhotoCover(ctx, photo, r * 0.86);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(c, c, r * 0.86, 0, TAU);
  ctx.lineWidth = r * 0.04;
  ctx.strokeStyle = withAlpha(theme.palette.outline, 0.5);
  ctx.stroke();
  return canvas;
}

/** The carriage: a pink heart badge in a gold rim, `w` px wide. */
export function buildCarriage(theme: WheelTheme, w: number): HTMLCanvasElement {
  const size = Math.ceil(w * 1.5);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  ctx.save();
  ctx.shadowColor = withAlpha(theme.palette.outline, 0.6);
  ctx.shadowBlur = w * 0.12;
  ctx.shadowOffsetY = w * 0.05;
  heartPath(ctx, c, c, w);
  ctx.fillStyle = metal(ctx, theme, c - w / 2, c - w / 2, c + w / 2, c + w / 2);
  ctx.fill();
  ctx.restore();
  heartPath(ctx, c, c + w * 0.02, w * 0.76);
  const face = ctx.createLinearGradient(0, c - w * 0.4, 0, c + w * 0.4);
  const glam = theme.id === 'glam';
  face.addColorStop(0, glam ? '#ff8cc6' : mixColor(theme.palette.body, '#ffffff', 0.25));
  face.addColorStop(1, glam ? '#d63a8a' : theme.palette.body);
  ctx.fillStyle = face;
  ctx.fill();
  // Shine.
  ctx.beginPath();
  ctx.ellipse(c - w * 0.17, c - w * 0.14, w * 0.1, w * 0.06, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fill();
  return canvas;
}

/** The pink "$" coin (gold in the casino look), `r` px in radius. */
export function buildCoin(theme: WheelTheme, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2.5);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const glam = theme.id === 'glam';
  const { trim, trimLight, outline } = theme.palette;
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.5);
  ctx.shadowBlur = r * 0.25;
  ctx.shadowOffsetY = r * 0.08;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, TAU);
  const rim = ctx.createLinearGradient(0, c - r, 0, c + r);
  rim.addColorStop(0, glam ? '#ffffff' : trimLight);
  rim.addColorStop(1, glam ? '#ffd6ea' : trim);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, TAU);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = withAlpha(outline, 0.55);
  ctx.stroke();

  const face = ctx.createLinearGradient(0, c - r, 0, c + r);
  face.addColorStop(0, glam ? '#ff74b8' : mixColor(trim, '#ffffff', 0.25));
  face.addColorStop(1, glam ? '#d42f86' : mixColor(trim, '#6a3a08', 0.3));
  ctx.beginPath();
  ctx.arc(c, c, r * 0.78, 0, TAU);
  ctx.fillStyle = face;
  ctx.fill();
  // Raised inner ring.
  ctx.beginPath();
  ctx.arc(c, c, r * 0.66, 0, TAU);
  ctx.lineWidth = r * 0.05;
  ctx.strokeStyle = glam ? 'rgba(255, 255, 255, 0.45)' : withAlpha(trimLight, 0.6);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = glam ? 'rgba(120, 10, 70, 0.55)' : withAlpha(outline, 0.7);
  ctx.translate(0, r * 0.04);
  dollarPath(ctx, c, c, r * 1.02, r * 0.27);
  ctx.restore();
  ctx.strokeStyle = glam ? '#ffffff' : mixColor(outline, trim, 0.2);
  dollarPath(ctx, c, c, r * 1.02, r * 0.16);

  // Gloss.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r * 0.95, 0, TAU);
  ctx.clip();
  const gloss = ctx.createLinearGradient(c - r, c - r, c + r * 0.2, c + r * 0.2);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  gloss.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  return canvas;
}

// ── Prize plates ─────────────────────────────────────────────────────────

/** Where the plate strip canvas sits (canvas px) and where each bin's column starts in it. */
export interface PlateStrip {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  /** Column edges in strip px: bin i spans [edges[i], edges[i + 1]]. */
  edges: number[];
  /** Label fit per bin (null: none) and whether it reads well from afar. */
  fits: (LabelFit | null)[];
  legible: boolean[];
}

/** Plate rectangle of bin `i` in canvas px. */
export function plateRect(f: Frame, geo: BoardGeometry, i: number) {
  const left = px(f, geo.binLeft + i * geo.binWidth + geo.plateGap / 2);
  const width = Math.max(1, (geo.binWidth - geo.plateGap) * f.u);
  const top = py(f, geo.plateTop);
  const height = (geo.binFloor - geo.plateTop) * f.u;
  return { left, top, width, height, radius: Math.min(f.u * 0.03, width * 0.28) };
}

/** Plate fill: the prize colour, glossy, or metallic gold for a jackpot. */
function paintPlate(
  ctx: CanvasRenderingContext2D,
  theme: WheelTheme,
  style: PrizeStyle,
  rect: { left: number; top: number; width: number; height: number; radius: number },
) {
  const { left, top, width, height, radius } = rect;
  ctx.save();
  roundRect(ctx, left, top, width, height, radius);
  ctx.shadowColor = withAlpha(theme.palette.outline, 0.6);
  ctx.shadowBlur = Math.min(width, height) * 0.12;
  ctx.shadowOffsetY = height * 0.03;
  if (style.metallic) {
    const g = ctx.createLinearGradient(left, top, left + width, top + height);
    g.addColorStop(0, '#c8901e');
    g.addColorStop(0.3, '#ffe9a6');
    g.addColorStop(0.55, '#e8b440');
    g.addColorStop(0.8, '#fff3c8');
    g.addColorStop(1, '#c8901e');
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, top, 0, top + height);
    g.addColorStop(0, style.light);
    g.addColorStop(0.45, style.fill);
    g.addColorStop(1, mixColor(style.fill, theme.palette.outline, 0.28));
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, left, top, width, height, radius);
  ctx.clip();
  const gloss = ctx.createLinearGradient(0, top, 0, top + height * 0.5);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(left, top, width, height * 0.5);
  ctx.restore();
  roundRect(ctx, left, top, width, height, radius);
  ctx.lineWidth = Math.max(1, Math.min(width * 0.06, height * 0.03));
  ctx.strokeStyle = style.metallic ? '#a8740f' : theme.palette.trim;
  ctx.stroke();
}

/** A label laid out by `fitLabel`, centred on (cx, cy). */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  theme: WheelTheme,
  text: BinText,
  fit: LabelFit,
  cx: number,
  cy: number,
  colors: { fill: string; outline: string; caption: string },
): void {
  const { display, ui } = theme.palette;
  const lineH = fit.size * 0.98;
  const capH = fit.caption * 0.95;
  const shadow = withAlpha(theme.palette.outline, 0.45);
  if (!fit.vertical && fit.iconBefore && text.icon) {
    // Icon, then the text block, side by side.
    const gap = fit.size * 0.15;
    const total = fit.icon + gap + fit.length;
    const textX = cx - total / 2 + fit.icon + gap + fit.length / 2;
    emoji(ctx, text.icon, cx - total / 2 + fit.icon / 2, cy, fit.icon * 0.86, shadow);
    const stack = fit.lines.length * lineH + (fit.caption ? capH : 0);
    let y = cy - stack / 2;
    for (const line of fit.lines) {
      sticker(ctx, line, textX, y + lineH / 2, fit.size, display, colors);
      y += lineH;
    }
    if (fit.caption && text.caption)
      caps(ctx, text.caption, textX, y + capH / 2, fit.caption, ui, colors.caption);
    return;
  }
  if (!fit.vertical) {
    const iconH = fit.icon ? fit.icon * 0.92 : 0;
    const total = iconH + fit.lines.length * lineH + (fit.caption ? capH : 0);
    let y = cy - total / 2;
    if (fit.icon && text.icon) {
      emoji(ctx, text.icon, cx, y + iconH / 2, fit.icon * 0.86, shadow);
      y += iconH;
    }
    for (const line of fit.lines) {
      sticker(ctx, line, cx, y + lineH / 2, fit.size, display, colors);
      y += lineH;
    }
    if (fit.caption && text.caption)
      caps(ctx, text.caption, cx, y + capH / 2, fit.caption, ui, colors.caption);
    return;
  }
  // Upright: the run reads bottom to top; the icon stands upright at its top end.
  const iconL = fit.icon ? fit.icon + fit.size * 0.15 : 0;
  const run = fit.length;
  const total = run + iconL;
  ctx.save();
  ctx.translate(cx, cy);
  if (fit.icon && text.icon) emoji(ctx, text.icon, 0, -total / 2 + fit.icon / 2, fit.icon * 0.86, shadow);
  ctx.translate(0, iconL / 2);
  ctx.rotate(-Math.PI / 2);
  const stack = fit.lines.length * lineH + (fit.caption ? capH : 0);
  let y = -stack / 2;
  for (const line of fit.lines) {
    sticker(ctx, line, 0, y + lineH / 2, fit.size, display, colors);
    y += lineH;
  }
  if (fit.caption && text.caption) caps(ctx, text.caption, 0, y + capH / 2, fit.caption, ui, colors.caption);
  ctx.restore();
}

/** Outline of a prize's lettering: dark text on a dark outline (casino gold) gets a light one. */
export function outlineFor(theme: WheelTheme, style: PrizeStyle): string {
  return brightness(style.text) < 0.4 && brightness(style.outline) < 0.4
    ? mixColor(theme.palette.trimLight, '#ffffff', 0.4)
    : style.outline;
}

function captionColor(style: PrizeStyle): string {
  return brightness(style.text) > 0.5 ? withAlpha(style.text, 0.92) : style.text;
}

/** All prize plates with their labels, in one strip. */
export function buildPlates(theme: WheelTheme, f: Frame, geo: BoardGeometry, view: WheelView): PlateStrip {
  const pad = Math.ceil(f.u * 0.04);
  const left = Math.floor(px(f, geo.binLeft)) - pad;
  const top = Math.floor(py(f, geo.plateTop)) - pad;
  const width = Math.ceil(geo.bins * geo.binWidth * f.u) + pad * 2;
  const height = Math.ceil((geo.binFloor - geo.plateTop) * f.u) + pad * 2;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.translate(-left, -top);
  const count = view.segments.length;
  const measure = measurer(ctx, theme.palette.display);
  const measureCaption = measurer(ctx, theme.palette.ui, 0.06);
  const fits: (LabelFit | null)[] = [];
  const legible: boolean[] = [];
  view.segments.forEach((segment, i) => {
    if (i >= geo.bins) return;
    const style = theme.prizeStyle(segment, i, count);
    const rect = plateRect(f, geo, i);
    paintPlate(ctx, theme, style, rect);
    const text = binText(segment);
    const fit = fitLabel(text, rect.width, rect.height, measure, measureCaption, MIN_CAPTION * f.u);
    const min = MIN_LABEL * f.u;
    if (fit.size < min) {
      fits.push(null);
      legible.push(false);
      return;
    }
    fits.push(fit);
    // An icon alone or a small or upright label: the winner's tag names the prize on landing.
    legible.push(fit.size >= 0.075 * f.u && !fit.vertical && fit.lines.length > 0);
    drawLabel(ctx, theme, text, fit, rect.left + rect.width / 2, rect.top + rect.height / 2, {
      fill: style.text,
      outline: outlineFor(theme, style),
      caption: captionColor(style),
    });
  });
  const edges = Array.from({ length: geo.bins + 1 }, (_, i) =>
    i === 0 ? 0 : i === geo.bins ? width : Math.round(px(f, geo.binLeft + i * geo.binWidth) - left),
  );
  return { canvas, x: left, y: top, edges, fits, legible };
}

/** A soft glow round a plate, in the highlight colour. */
export function buildPlateGlow(
  color: string,
  width: number,
  height: number,
  radius: number,
  maxBlur: number,
): HTMLCanvasElement {
  const blur = Math.min(Math.max(width, height) * 0.25, maxBlur) + 6;
  const canvas = createCanvas(width + blur * 4, height + blur * 4);
  const ctx = canvas.getContext('2d')!;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 10000;
  roundRect(ctx, blur * 2 - 10000, blur * 2, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = blur * 0.4;
  ctx.fill();
  return canvas;
}

/** A column of light rising from the winning bin, `width` × `height` px (bright at the bottom). */
export function buildBeam(color: string, width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const up = ctx.createLinearGradient(0, height, 0, 0);
  up.addColorStop(0, withAlpha(color, 1));
  up.addColorStop(0.3, withAlpha(color, 0.45));
  up.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = up;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-in';
  const across = ctx.createLinearGradient(0, 0, width, 0);
  across.addColorStop(0, 'rgba(0, 0, 0, 0)');
  across.addColorStop(0.3, 'rgba(0, 0, 0, 0.85)');
  across.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
  across.addColorStop(0.7, 'rgba(0, 0, 0, 0.85)');
  across.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/**
 * The winner's tag: a big rounded label in the prize colours, gold-rimmed. `size` is the main font
 * size in px; the tag never gets wider than `maxWidth`. `margin` px of glow surround the body.
 */
export function buildTag(
  theme: WheelTheme,
  segment: Segment,
  index: number,
  count: number,
  size: number,
  maxWidth: number,
): { canvas: HTMLCanvasElement; width: number; height: number; margin: number } {
  const style = theme.prizeStyle(segment, index, count);
  const text = binText(segment);
  const probe = createCanvas(4).getContext('2d')!;
  const measure = measurer(probe, theme.palette.display);
  const measureCaption = measurer(probe, theme.palette.ui, 0.06);
  // One line: [icon] MAIN caption.
  const capSize = size * 0.42;
  const iconSize = text.icon ? size * 1.05 : 0;
  const gap = size * 0.16;
  const naturalWidth =
    (measure(text.main) + 0.22) * size +
    (text.caption ? measureCaption(text.caption) * capSize + gap : 0) +
    (iconSize ? iconSize + gap : 0);
  const padX = size * 0.5;
  const scale = Math.min(1, (maxWidth - padX * 2) / naturalWidth);
  const s = size * scale;
  const contentW = naturalWidth * scale;
  const w = contentW + padX * 2;
  const h = s * 1.55;
  const margin = Math.ceil(s * 0.6);
  const canvas = createCanvas(w + margin * 2, h + margin * 2);
  const ctx = canvas.getContext('2d')!;
  const x0 = margin;
  const y0 = margin;
  const radius = h * 0.42;

  ctx.save();
  roundRect(ctx, x0, y0, w, h, radius);
  ctx.shadowColor = withAlpha(theme.palette.outline, 0.6);
  ctx.shadowBlur = s * 0.35;
  ctx.shadowOffsetY = s * 0.08;
  ctx.fillStyle = metal(ctx, theme, x0, y0, x0 + w, y0 + h);
  ctx.fill();
  ctx.restore();

  ctx.save();
  const inset = s * 0.09;
  roundRect(ctx, x0 + inset, y0 + inset, w - inset * 2, h - inset * 2, radius - inset);
  if (style.metallic) {
    const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
    g.addColorStop(0, '#c8901e');
    g.addColorStop(0.35, '#ffe9a6');
    g.addColorStop(0.65, '#e8b440');
    g.addColorStop(1, '#fff3c8');
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, style.light);
    g.addColorStop(0.5, style.fill);
    g.addColorStop(1, mixColor(style.fill, theme.palette.outline, 0.25));
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.clip();
  const gloss = ctx.createLinearGradient(0, y0, 0, y0 + h * 0.55);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(x0, y0, w, h * 0.55);
  ctx.restore();

  let x = x0 + padX;
  const y = y0 + h / 2;
  if (iconSize && text.icon) {
    const icon = iconSize * scale;
    emoji(ctx, text.icon, x + icon / 2, y, icon * 0.9, withAlpha(theme.palette.outline, 0.4));
    x += icon + gap * scale;
  }
  const colors = { fill: style.text, outline: outlineFor(theme, style) };
  sticker(ctx, text.main, x + s * 0.11, y, s, theme.palette.display, colors, 'left');
  x += (measure(text.main) + 0.22) * s + gap * scale;
  if (text.caption)
    caps(ctx, text.caption, x, y + s * 0.06, capSize * scale, theme.palette.ui, captionColor(style), 'left');
  return { canvas, width: w, height: h, margin };
}

/** "No prizes left" / "Awaiting entrants" in sticker lettering on a dark pill, at most `maxWidth` px wide. */
export function buildMessage(
  theme: WheelTheme,
  text: string,
  size: number,
  maxWidth: number,
): HTMLCanvasElement {
  const probe = createCanvas(4).getContext('2d')!;
  const width = (measurer(probe, theme.palette.display)(text) + 0.3) * size;
  const s = size * Math.min(1, (maxWidth - size) / width);
  const w = Math.min(maxWidth - size, width) + s * 1.2;
  const h = s * 1.7;
  const m = Math.ceil(s * 0.4);
  const canvas = createCanvas(w + m * 2, h + m * 2);
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  roundRect(ctx, m, m, w, h, h / 2);
  ctx.fillStyle = withAlpha(theme.palette.screen, 0.88);
  ctx.shadowColor = theme.palette.glow;
  ctx.shadowBlur = s * 0.4;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, m, m, w, h, h / 2);
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.strokeStyle = theme.palette.trim;
  ctx.stroke();
  sticker(ctx, text, canvas.width / 2, canvas.height / 2, s, theme.palette.display, {
    fill: theme.palette.text,
    outline: theme.palette.outline,
  });
  return canvas;
}
