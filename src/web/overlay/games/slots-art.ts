/**
 * Painting of Loser Slots: the cabinet (static layer), reel symbols, bulbs, the lever knob and
 * lettering. Everything is drawn once into offscreen canvases; the stage only composes them.
 */
import type { Segment, WheelView } from '../../../shared/types';
import type { PrizeStyle, WheelTheme } from '../themes/types';
import { createCanvas, drawPhotoCover, TAU } from '../wheel-face';
import {
  brightness,
  fitLabel,
  LAYOUT,
  marqueePoints,
  mixColor,
  paylineY,
  reelBoxes,
  reelScreen,
  withAlpha,
  type Box,
} from './slots-math';

const EMOJI_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
/** Outline width of sticker lettering, relative to the font size. */
const STROKE = 0.2;

/** Converts layout units (play-area half sides around its centre) to canvas pixels. */
export interface Frame {
  cx: number;
  cy: number;
  /** Half side of the play area, in canvas pixels. */
  u: number;
}

export const px = (f: Frame, x: number): number => f.cx + x * f.u;
export const py = (f: Frame, y: number): number => f.cy + y * f.u;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Path of a layout box (rounded), in canvas pixels. */
function boxPath(ctx: CanvasRenderingContext2D, f: Frame, box: Box, radius: number, inset = 0) {
  const x = px(f, box.left) + inset;
  const y = py(f, box.top) + inset;
  roundRect(
    ctx,
    x,
    y,
    (box.right - box.left) * f.u - inset * 2,
    (box.bottom - box.top) * f.u - inset * 2,
    radius * f.u - inset,
  );
}

function metal(
  ctx: CanvasRenderingContext2D,
  theme: WheelTheme,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): CanvasGradient {
  const { trim, trimLight } = theme.palette;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, trimLight);
  g.addColorStop(0.35, trim);
  g.addColorStop(0.6, mixColor(trim, '#7a4a10', 0.25));
  g.addColorStop(0.82, trim);
  g.addColorStop(1, trimLight);
  return g;
}

/** Text width at font size 1. */
function measurer(ctx: CanvasRenderingContext2D, family: string, weight = 700) {
  return (text: string) => {
    ctx.font = `${weight} 100px ${family}`;
    return ctx.measureText(text).width / 100;
  };
}

/** Sticker lettering: a thick round outline under the fill, vertically centred on y. */
export function sticker(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  family: string,
  colors: { fill: string; outline: string; shadow?: string },
  stroke = STROKE,
) {
  ctx.save();
  ctx.font = `700 ${size}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText('H');
  const baseline = y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = size * stroke;
  ctx.strokeStyle = colors.outline;
  ctx.shadowColor = colors.shadow ?? 'rgba(40, 6, 30, 0.45)';
  ctx.shadowBlur = size * 0.14;
  ctx.shadowOffsetY = size * 0.04;
  ctx.strokeText(text, x, baseline);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = colors.fill;
  ctx.fillText(text, x, baseline);
  ctx.restore();
}

/** Small "$" coin (rim coins, tray coins): pink face, white rim and $ for glam, gold for casino. */
export function drawCoin(ctx: CanvasRenderingContext2D, theme: WheelTheme, x: number, y: number, r: number) {
  const { body, trim, trimLight, outline } = theme.palette;
  const glam = theme.id === 'glam';
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.45);
  ctx.shadowBlur = r * 0.4;
  ctx.shadowOffsetY = r * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = glam ? '#fff7fb' : trimLight;
  ctx.fill();
  ctx.restore();
  const face = ctx.createLinearGradient(x, y - r, x, y + r);
  face.addColorStop(0, glam ? mixColor(body, '#ffffff', 0.1) : trim);
  face.addColorStop(1, glam ? mixColor(body, '#ffffff', 0.45) : mixColor(trim, '#6b4a10', 0.35));
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, TAU);
  ctx.fillStyle = face;
  ctx.fill();
  drawDollar(ctx, x, y, r * 1.02, glam ? '#ffffff' : mixColor(trim, '#3a2405', 0.6));
}

/** A rounded "$" drawn with strokes (no web font needed). */
function drawDollar(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, color: string) {
  const rx = height * 0.22;
  const ry = height * 0.19;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y - ry, rx, ry, 0, -0.45, Math.PI / 2, true);
  ctx.ellipse(x, y + ry, rx, ry, 0, -Math.PI / 2, Math.PI - 0.45);
  ctx.moveTo(x, y - height / 2);
  ctx.lineTo(x, y - ry * 2 - height * 0.04);
  ctx.moveTo(x, y + ry * 2 + height * 0.04);
  ctx.lineTo(x, y + height / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = height * 0.15;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 0.95, y - s * 1.05, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.95, y - s * 1.05, x + s * 1.25, y + s * 0.05, x, y + s * 0.9);
  ctx.closePath();
}

// ── Static cabinet ───────────────────────────────────────────────────────

/** Quilted diamonds with tiny studs, clipped to the current path. */
function quilt(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme, box: Box) {
  const step = 0.16 * f.u;
  const x0 = px(f, box.left);
  const y0 = py(f, box.top);
  const w = (box.right - box.left) * f.u;
  const h = (box.bottom - box.top) * f.u;
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = withAlpha(theme.palette.outline, 0.16);
  ctx.lineWidth = Math.max(1, f.u * 0.006);
  ctx.beginPath();
  for (let d = -h; d < w + h; d += step) {
    ctx.moveTo(x0 + d, y0);
    ctx.lineTo(x0 + d + h, y0 + h);
    ctx.moveTo(x0 + d, y0 + h);
    ctx.lineTo(x0 + d + h, y0);
  }
  ctx.stroke();
  ctx.strokeStyle = withAlpha('#ffffff', 0.08);
  ctx.translate(0, Math.max(1, f.u * 0.006));
  ctx.stroke();
  ctx.translate(0, -Math.max(1, f.u * 0.006));
  ctx.fillStyle = withAlpha(theme.palette.trimLight, 0.55);
  for (let i = 0; i * step < w + step; i++) {
    for (let j = 0; j * step < h + step; j++) {
      ctx.beginPath();
      ctx.arc(x0 + i * step + (j % 2) * (step / 2), y0 + (j * step) / 2, f.u * 0.006, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintCabinet(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme) {
  const { body, bodyDark, outline } = theme.palette;
  const c = LAYOUT.cabinet;
  const top = py(f, c.top);
  const bottom = py(f, c.bottom);

  // Floor shadow
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.6);
  ctx.shadowBlur = f.u * 0.09;
  ctx.shadowOffsetY = f.u * 0.025;
  boxPath(ctx, f, c, LAYOUT.cabinetRadius);
  ctx.fillStyle = bodyDark;
  ctx.fill();
  ctx.restore();

  // Body: lit from above, rounded at the sides
  boxPath(ctx, f, c, LAYOUT.cabinetRadius);
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, mixColor(body, '#ffffff', 0.2));
  g.addColorStop(0.45, body);
  g.addColorStop(1, mixColor(body, bodyDark, 0.75));
  ctx.fillStyle = g;
  ctx.fill();
  quilt(ctx, f, theme, c);
  boxPath(ctx, f, c, LAYOUT.cabinetRadius);
  const side = ctx.createLinearGradient(px(f, c.left), 0, px(f, c.right), 0);
  side.addColorStop(0, withAlpha(bodyDark, 0.55));
  side.addColorStop(0.12, withAlpha(bodyDark, 0));
  side.addColorStop(0.88, withAlpha(bodyDark, 0));
  side.addColorStop(1, withAlpha(bodyDark, 0.6));
  ctx.fillStyle = side;
  ctx.fill();

  // Gold trim with a pale inner line
  const trim = LAYOUT.trim * f.u;
  boxPath(ctx, f, c, LAYOUT.cabinetRadius, trim / 2);
  ctx.lineWidth = trim;
  ctx.strokeStyle = metal(ctx, theme, 0, top, 0, bottom);
  ctx.stroke();
  boxPath(ctx, f, c, LAYOUT.cabinetRadius, trim + Math.max(1, f.u * 0.004));
  ctx.lineWidth = Math.max(1, f.u * 0.006);
  ctx.strokeStyle = withAlpha(theme.palette.trimLight, 0.7);
  ctx.stroke();
}

function paintWindow(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme) {
  const { screen, outline } = theme.palette;
  const w = LAYOUT.window;
  const frame = LAYOUT.frame * f.u;
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.55);
  ctx.shadowBlur = f.u * 0.04;
  ctx.shadowOffsetY = f.u * 0.012;
  boxPath(ctx, f, w, 0.07);
  ctx.fillStyle = metal(ctx, theme, 0, py(f, w.top), 0, py(f, w.bottom));
  ctx.fill();
  ctx.restore();
  boxPath(ctx, f, w, 0.07, frame * 0.35);
  ctx.lineWidth = Math.max(1, f.u * 0.005);
  ctx.strokeStyle = withAlpha(theme.palette.trimLight, 0.8);
  ctx.stroke();

  // Dark screen behind the reels
  const s = reelScreen();
  boxPath(ctx, f, s, 0.04);
  ctx.fillStyle = screen;
  ctx.fill();

  // Cream reel strips, shaded like drums
  const cream = theme.id === 'glam' ? '#fff8f1' : '#f6eedb';
  const shade = theme.id === 'glam' ? '#f3d9e4' : '#d8c9a8';
  for (const reel of reelBoxes()) {
    const g = ctx.createLinearGradient(0, py(f, reel.top), 0, py(f, reel.bottom));
    g.addColorStop(0, shade);
    g.addColorStop(0.5, cream);
    g.addColorStop(1, shade);
    ctx.fillStyle = g;
    ctx.fillRect(
      px(f, reel.left),
      py(f, reel.top),
      (reel.right - reel.left) * f.u,
      (reel.bottom - reel.top) * f.u,
    );
  }
}

/** Gold arrows on the frame pointing at the payline. */
function paintPaylineArrows(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme) {
  const y = py(f, paylineY());
  const size = 0.055 * f.u;
  const w = LAYOUT.window;
  for (const [x, dir] of [
    [px(f, w.left) + LAYOUT.frame * f.u * 0.4, 1],
    [px(f, w.right) - LAYOUT.frame * f.u * 0.4, -1],
  ] as const) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - dir * size * 0.55, y - size * 0.75);
    ctx.lineTo(x + dir * size * 0.75, y);
    ctx.lineTo(x - dir * size * 0.55, y + size * 0.75);
    ctx.closePath();
    ctx.shadowColor = withAlpha(theme.palette.outline, 0.6);
    ctx.shadowBlur = size * 0.4;
    ctx.fillStyle = metal(ctx, theme, 0, y - size, 0, y + size);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.strokeStyle = theme.palette.outline;
    ctx.stroke();
    ctx.restore();
  }
}

function paintHeader(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme) {
  const { body, bodyDark, outline, text, display } = theme.palette;
  const h = LAYOUT.header;
  const radius = (h.bottom - h.top) / 2;
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.55);
  ctx.shadowBlur = f.u * 0.035;
  ctx.shadowOffsetY = f.u * 0.01;
  boxPath(ctx, f, h, radius);
  ctx.fillStyle = metal(ctx, theme, 0, py(f, h.top), 0, py(f, h.bottom));
  ctx.fill();
  ctx.restore();
  const inset = 0.022 * f.u;
  boxPath(ctx, f, h, radius, inset);
  const g = ctx.createLinearGradient(0, py(f, h.top), 0, py(f, h.bottom));
  g.addColorStop(0, mixColor(body, '#ffffff', 0.3));
  g.addColorStop(0.55, body);
  g.addColorStop(1, mixColor(body, bodyDark, 0.6));
  ctx.fillStyle = g;
  ctx.fill();
  const midY = py(f, (h.top + h.bottom) / 2);
  const coinR = (radius - 0.03) * f.u;
  drawCoin(ctx, theme, px(f, h.left) + radius * f.u, midY, coinR);
  drawCoin(ctx, theme, px(f, h.right) - radius * f.u, midY, coinR);
  const room = (h.right - h.left - radius * 4.2) * f.u;
  const measure = measurer(ctx, display);
  const size = Math.min((h.bottom - h.top) * f.u * 0.62, room / measure('JACKPOT'));
  sticker(ctx, 'JACKPOT', px(f, (h.left + h.right) / 2), midY, size, display, { fill: text, outline });
}

function paintDisplay(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme) {
  const { screen, outline, glow } = theme.palette;
  const d = LAYOUT.display;
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.5);
  ctx.shadowBlur = f.u * 0.03;
  boxPath(ctx, f, d, 0.06);
  ctx.fillStyle = metal(ctx, theme, 0, py(f, d.top), 0, py(f, d.bottom));
  ctx.fill();
  ctx.restore();
  boxPath(ctx, f, d, 0.06, 0.022 * f.u);
  ctx.fillStyle = screen;
  ctx.fill();
  // LED dot grid
  ctx.save();
  boxPath(ctx, f, d, 0.06, 0.022 * f.u);
  ctx.clip();
  const step = 0.022 * f.u;
  ctx.fillStyle = withAlpha(glow, 0.08);
  for (let y = py(f, d.top); y < py(f, d.bottom); y += step) {
    for (let x = px(f, d.left); x < px(f, d.right); x += step) {
      ctx.fillRect(x, y, step * 0.4, step * 0.4);
    }
  }
  const sheen = ctx.createLinearGradient(0, py(f, d.top), 0, py(f, d.bottom));
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(px(f, d.left), py(f, d.top), (d.right - d.left) * f.u, (d.bottom - d.top) * f.u);
  ctx.restore();
}

/** Candy buttons on the deck under the display. */
function paintDeck(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme) {
  const { body, bodyDark, outline, trimLight, glow } = theme.palette;
  const d = LAYOUT.deck;
  const top = py(f, d.top);
  const bottom = py(f, d.bottom);
  // Sloped ledge
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.5);
  ctx.shadowBlur = f.u * 0.03;
  ctx.shadowOffsetY = f.u * 0.015;
  boxPath(ctx, f, d, 0.05);
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, mixColor(body, '#ffffff', 0.35));
  g.addColorStop(1, mixColor(body, bodyDark, 0.3));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  boxPath(ctx, f, d, 0.05, Math.max(1, f.u * 0.004));
  ctx.lineWidth = Math.max(1, f.u * 0.008);
  ctx.strokeStyle = withAlpha(trimLight, 0.75);
  ctx.stroke();

  const colors = [glow, theme.palette.trim, theme.id === 'glam' ? '#a46ae6' : '#2f7a5c'];
  const y = (top + bottom) / 2;
  const r = (bottom - top) * 0.3;
  const xs = LAYOUT.buttons.map((x) => px(f, x));
  xs.forEach((x, i) => {
    const color = colors[i]!;
    ctx.save();
    ctx.shadowColor = withAlpha(outline, 0.5);
    ctx.shadowBlur = r * 0.3;
    ctx.shadowOffsetY = r * 0.18;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.18, r, 0, 0, TAU);
    ctx.fillStyle = trimLight;
    ctx.fill();
    ctx.restore();
    const cap = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
    cap.addColorStop(0, mixColor(color, '#ffffff', 0.6));
    cap.addColorStop(0.6, color);
    cap.addColorStop(1, mixColor(color, '#000000', 0.25));
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.1, r * 0.95, r * 0.78, 0, 0, TAU);
    ctx.fillStyle = cap;
    ctx.fill();
  });
  // Big SPIN button
  const bx = px(f, LAYOUT.spinButton.x);
  const bw = LAYOUT.spinButton.width * f.u;
  const bh = (bottom - top) * 0.62;
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.5);
  ctx.shadowBlur = bh * 0.2;
  ctx.shadowOffsetY = bh * 0.12;
  roundRect(ctx, bx - bw / 2, y - bh / 2, bw, bh, bh / 2);
  ctx.fillStyle = trimLight;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, bx - bw / 2 + bh * 0.08, y - bh / 2 + bh * 0.08, bw - bh * 0.16, bh * 0.78, bh * 0.4);
  const spin = ctx.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
  spin.addColorStop(0, mixColor(glow, '#ffffff', 0.45));
  spin.addColorStop(0.55, glow);
  spin.addColorStop(1, mixColor(glow, bodyDark, 0.35));
  ctx.fillStyle = spin;
  ctx.fill();
  sticker(ctx, 'SPIN', bx, y - bh * 0.04, bh * 0.64, theme.palette.display, {
    fill: theme.palette.text,
    outline,
  });
}

function paintTray(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme) {
  const { screen, outline } = theme.palette;
  const t = LAYOUT.tray;
  const top = py(f, t.top);
  const bottom = py(f, t.bottom);
  const left = px(f, t.left);
  const right = px(f, t.right);
  const lip = 0.05 * f.u;
  // Opening: wider at the top, like a scoop
  const path = (inset: number) => {
    ctx.beginPath();
    ctx.moveTo(left + inset, top + inset);
    ctx.lineTo(right - inset, top + inset);
    ctx.quadraticCurveTo(right - inset - lip * 0.3, bottom - inset, right - inset - lip * 2, bottom - inset);
    ctx.lineTo(left + inset + lip * 2, bottom - inset);
    ctx.quadraticCurveTo(left + inset + lip * 0.3, bottom - inset, left + inset, top + inset);
    ctx.closePath();
  };
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.5);
  ctx.shadowBlur = f.u * 0.03;
  path(0);
  ctx.fillStyle = metal(ctx, theme, 0, top, 0, bottom);
  ctx.fill();
  ctx.restore();
  path(0.025 * f.u);
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, '#000000');
  g.addColorStop(0.5, screen);
  g.addColorStop(1, mixColor(screen, theme.palette.body, 0.35));
  ctx.fillStyle = g;
  ctx.fill();
  // A little mound of coins left from earlier wins
  const coinR = 0.075 * f.u;
  const floor = bottom - 0.07 * f.u;
  const mid = (left + right) / 2;
  for (const [row, count] of [
    [0, 6],
    [1, 4],
    [2, 2],
  ] as const) {
    for (let i = 0; i < count; i++) {
      ctx.save();
      ctx.translate(
        mid + (i - (count - 1) / 2) * coinR * 1.55 + (row % 2) * coinR * 0.2,
        floor - row * coinR * 0.42,
      );
      ctx.scale(1, 0.48);
      drawCoin(ctx, theme, 0, 0, coinR);
      ctx.restore();
    }
  }
  // Chute slot above the tray
  const slotW = 0.36 * f.u;
  const cx = (left + right) / 2;
  roundRect(ctx, cx - slotW / 2, top - 0.055 * f.u, slotW, 0.045 * f.u, 0.02 * f.u);
  ctx.fillStyle = metal(ctx, theme, 0, top - 0.055 * f.u, 0, top - 0.01 * f.u);
  ctx.fill();
  roundRect(
    ctx,
    cx - slotW / 2 + 0.012 * f.u,
    top - 0.045 * f.u,
    slotW - 0.024 * f.u,
    0.022 * f.u,
    0.01 * f.u,
  );
  ctx.fillStyle = '#000000';
  ctx.fill();
}

function paintMount(ctx: CanvasRenderingContext2D, f: Frame, theme: WheelTheme) {
  const m = LAYOUT.mount;
  const { outline, body, bodyDark } = theme.palette;
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.55);
  ctx.shadowBlur = f.u * 0.03;
  ctx.shadowOffsetY = f.u * 0.01;
  boxPath(ctx, f, m, 0.05);
  ctx.fillStyle = metal(ctx, theme, 0, py(f, m.top), 0, py(f, m.bottom));
  ctx.fill();
  ctx.restore();
  boxPath(ctx, f, m, 0.05, 0.018 * f.u);
  const g = ctx.createLinearGradient(0, py(f, m.top), 0, py(f, m.bottom));
  g.addColorStop(0, mixColor(body, '#ffffff', 0.25));
  g.addColorStop(1, mixColor(body, bodyDark, 0.5));
  ctx.fillStyle = g;
  ctx.fill();
}

/** Everything that never moves: cabinet, header plate, window, display, deck, tray, lever mount. */
export function buildCabinet(theme: WheelTheme, size: number, f: Frame): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  paintCabinet(ctx, f, theme);
  paintMount(ctx, f, theme);
  paintWindow(ctx, f, theme);
  paintDisplay(ctx, f, theme);
  paintDeck(ctx, f, theme);
  paintTray(ctx, f, theme);
  paintHeader(ctx, f, theme);
  return canvas;
}

/** Drawn over the moving symbols: drum shading, glass gloss and the payline arrows. */
export function buildGlass(theme: WheelTheme, size: number, f: Frame): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const { screen } = theme.palette;
  for (const reel of reelBoxes()) {
    const x = px(f, reel.left);
    const y = py(f, reel.top);
    const w = (reel.right - reel.left) * f.u;
    const h = (reel.bottom - reel.top) * f.u;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, withAlpha(screen, 0.62));
    g.addColorStop(0.2, withAlpha(screen, 0.12));
    g.addColorStop(0.35, withAlpha(screen, 0));
    g.addColorStop(0.65, withAlpha(screen, 0));
    g.addColorStop(0.8, withAlpha(screen, 0.12));
    g.addColorStop(1, withAlpha(screen, 0.62));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    const sides = ctx.createLinearGradient(x, 0, x + w, 0);
    sides.addColorStop(0, withAlpha(screen, 0.28));
    sides.addColorStop(0.1, withAlpha(screen, 0));
    sides.addColorStop(0.9, withAlpha(screen, 0));
    sides.addColorStop(1, withAlpha(screen, 0.28));
    ctx.fillStyle = sides;
    ctx.fillRect(x, y, w, h);
  }
  // Diagonal gloss across the glass
  const s = reelScreen();
  ctx.save();
  boxPath(ctx, f, s, 0.04);
  ctx.clip();
  const x0 = px(f, s.left);
  const y0 = py(f, s.top);
  const w = (s.right - s.left) * f.u;
  const h = (s.bottom - s.top) * f.u;
  ctx.beginPath();
  ctx.moveTo(x0 + w * 0.05, y0);
  ctx.lineTo(x0 + w * 0.32, y0);
  ctx.lineTo(x0 + w * 0.12, y0 + h);
  ctx.lineTo(x0 - w * 0.15, y0 + h);
  ctx.closePath();
  const gloss = ctx.createLinearGradient(x0, y0, x0, y0 + h);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
  ctx.fillStyle = gloss;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x0 + w * 0.36, y0);
  ctx.lineTo(x0 + w * 0.4, y0);
  ctx.lineTo(x0 + w * 0.2, y0 + h);
  ctx.lineTo(x0 + w * 0.16, y0 + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  paintPaylineArrows(ctx, f, theme);
  return canvas;
}

// ── Bulbs ────────────────────────────────────────────────────────────────

/** Bulb positions in canvas pixels, along the cabinet trim. */
export function bulbPoints(f: Frame): { x: number; y: number }[] {
  const c = LAYOUT.cabinet;
  const inset = LAYOUT.trim / 2;
  const box = { left: c.left + inset, top: c.top + inset, right: c.right - inset, bottom: c.bottom - inset };
  return marqueePoints(box, LAYOUT.cabinetRadius - inset, LAYOUT.bulbSpacing).map((p) => ({
    x: px(f, p.x),
    y: py(f, p.y),
  }));
}

export function buildBulbs(theme: WheelTheme, f: Frame): { on: HTMLCanvasElement; off: HTMLCanvasElement } {
  const radius = LAYOUT.bulb * f.u;
  const glow = radius * 2.8;
  const size = Math.ceil(glow * 2);
  const c = size / 2;
  const glam = theme.id === 'glam';
  const pearl = (ctx: CanvasRenderingContext2D, colors: readonly [string, string, string]) => {
    const g = ctx.createRadialGradient(c - radius * 0.35, c - radius * 0.35, radius * 0.05, c, c, radius);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.55, colors[1]);
    g.addColorStop(1, colors[2]);
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
  };
  const off = createCanvas(size);
  let ctx = off.getContext('2d')!;
  ctx.shadowColor = withAlpha(theme.palette.outline, 0.5);
  ctx.shadowBlur = radius * 0.6;
  ctx.shadowOffsetY = radius * 0.15;
  pearl(ctx, glam ? ['#ffffff', '#f4e6d2', '#d6b98c'] : ['#fff8e0', '#c9a75a', '#7a5a1c']);

  const on = createCanvas(size);
  ctx = on.getContext('2d')!;
  const halo = ctx.createRadialGradient(c, c, 0, c, c, glow);
  halo.addColorStop(0, 'rgba(255, 255, 250, 0.75)');
  halo.addColorStop(0.35, withAlpha(glam ? '#ffd1ea' : theme.palette.glow, 0.28));
  halo.addColorStop(1, withAlpha(glam ? '#ffd1ea' : theme.palette.glow, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  pearl(ctx, glam ? ['#ffffff', '#fffdf8', '#fff1e0'] : ['#ffffff', '#fff3c4', '#f3dc8a']);
  return { on, off };
}

// ── Lever ────────────────────────────────────────────────────────────────

/** The lever's ball knob, `radius` canvas pixels, centred in its canvas. */
export function buildKnob(theme: WheelTheme, radius: number): HTMLCanvasElement {
  const size = Math.ceil(radius * 2.6);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const base = theme.id === 'glam' ? '#ff4fa3' : '#b3122f';
  ctx.save();
  ctx.shadowColor = withAlpha(theme.palette.outline, 0.55);
  ctx.shadowBlur = radius * 0.25;
  ctx.shadowOffsetY = radius * 0.12;
  const g = ctx.createRadialGradient(c - radius * 0.35, c - radius * 0.4, radius * 0.05, c, c, radius);
  g.addColorStop(0, mixColor(base, '#ffffff', 0.75));
  g.addColorStop(0.35, mixColor(base, '#ffffff', 0.15));
  g.addColorStop(0.8, base);
  g.addColorStop(1, mixColor(base, '#2a0012', 0.45));
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // Specular highlight and a soft rim light
  ctx.beginPath();
  ctx.ellipse(c - radius * 0.33, c - radius * 0.42, radius * 0.32, radius * 0.2, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, radius * 0.92, 0.3, 1.6);
  ctx.lineWidth = radius * 0.08;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.stroke();
  if (theme.id === 'glam') {
    heart(ctx, c + radius * 0.05, c + radius * 0.08, radius * 0.62);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fill();
  }
  return canvas;
}

/** The lever's rod (a vertical strip as long as the lever) and the cap over its pivot. */
export interface LeverSprites {
  rod: HTMLCanvasElement;
  cap: HTMLCanvasElement;
}

export function buildLever(theme: WheelTheme, f: Frame): LeverSprites {
  const width = 0.042 * f.u;
  const { trim, trimLight, outline } = theme.palette;
  const pad = Math.ceil(width * 0.4);
  const w = Math.ceil(width * 1.35) + pad * 2;
  const length = Math.ceil(LAYOUT.lever.length * f.u * 1.1);
  const rod = createCanvas(w, length);
  let ctx = rod.getContext('2d')!;
  const c = w / 2;
  ctx.fillStyle = withAlpha(outline, 0.35);
  ctx.fillRect(c - (width * 1.35) / 2, 0, width * 1.35, length);
  const g = ctx.createLinearGradient(c - width / 2, 0, c + width / 2, 0);
  g.addColorStop(0, mixColor(trim, '#6b4a10', 0.35));
  g.addColorStop(0.4, trimLight);
  g.addColorStop(1, mixColor(trim, '#6b4a10', 0.2));
  ctx.fillStyle = g;
  ctx.fillRect(c - width / 2, 0, width, length);

  const r = width * 1.3;
  const cap = createCanvas(Math.ceil(r * 3));
  ctx = cap.getContext('2d')!;
  const k = cap.width / 2;
  ctx.shadowColor = withAlpha(outline, 0.5);
  ctx.shadowBlur = r * 0.5;
  ctx.beginPath();
  ctx.arc(k, k, r, 0, TAU);
  ctx.fillStyle = metal(ctx, theme, 0, k - r, 0, k + r);
  ctx.fill();
  return { rod, cap };
}

/** Draws the lever rod from its pivot to the knob (straight up or down), then the pivot cap. */
export function drawRod(
  ctx: CanvasRenderingContext2D,
  lever: LeverSprites,
  pivot: { x: number; y: number },
  knobY: number,
) {
  const { rod, cap } = lever;
  const top = Math.min(pivot.y, knobY);
  const length = Math.min(rod.height, Math.abs(knobY - pivot.y));
  if (length >= 1)
    ctx.drawImage(rod, 0, 0, rod.width, length, pivot.x - rod.width / 2, top, rod.width, length);
  ctx.drawImage(cap, pivot.x - cap.width / 2, pivot.y - cap.height / 2);
}

// ── Symbols ──────────────────────────────────────────────────────────────

/** Side of a symbol sprite relative to the badge radius (room for lettering and shadow). */
export const SYMBOL_SPRITE = 2.7;

function badgeFill(ctx: CanvasRenderingContext2D, style: PrizeStyle, c: number, r: number, outline: string) {
  if (style.metallic) {
    const g = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
    g.addColorStop(0, '#c8901e');
    g.addColorStop(0.3, '#ffe9a6');
    g.addColorStop(0.55, '#e8b440');
    g.addColorStop(0.8, '#fff3c8');
    g.addColorStop(1, '#c8901e');
    return g;
  }
  const g = ctx.createRadialGradient(c - r * 0.3, c - r * 0.45, r * 0.05, c, c, r);
  g.addColorStop(0, style.light);
  g.addColorStop(0.5, style.fill);
  g.addColorStop(1, mixColor(style.fill, outline, 0.22));
  return g;
}

/** Coin-like badge: gold ring, prize-coloured face and a little shine. */
function paintBadge(
  ctx: CanvasRenderingContext2D,
  theme: WheelTheme,
  style: PrizeStyle,
  c: number,
  r: number,
  face?: (ctx: CanvasRenderingContext2D, inner: number) => void,
) {
  const { outline, trimLight } = theme.palette;
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.4);
  ctx.shadowBlur = r * 0.16;
  ctx.shadowOffsetY = r * 0.08;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, TAU);
  ctx.fillStyle = metal(ctx, theme, c - r, c - r, c + r, c + r);
  ctx.fill();
  ctx.restore();
  const inner = r * 0.88;
  ctx.beginPath();
  ctx.arc(c, c, inner, 0, TAU);
  ctx.fillStyle = badgeFill(ctx, style, c, inner, outline);
  ctx.fill();
  if (face) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, inner, 0, TAU);
    ctx.clip();
    face(ctx, inner);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(c, c, inner, 0, TAU);
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.strokeStyle = withAlpha(trimLight, 0.9);
  ctx.stroke();
  // Shine
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, inner, 0, TAU);
  ctx.clip();
  const shine = ctx.createLinearGradient(0, c - inner, 0, c);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.beginPath();
  ctx.ellipse(c, c - inner * 0.55, inner * 0.82, inner * 0.5, 0, 0, TAU);
  ctx.fillStyle = shine;
  ctx.fill();
  ctx.restore();
}

/** Short text of a prize for its symbol: the amount, else the label. */
export function symbolText(segment: Segment): { main: string; caption: string | null } {
  if (segment.amount) return { main: segment.amount, caption: segment.caption?.toUpperCase() ?? null };
  return { main: segment.label, caption: null };
}

/** A prize symbol: its icon (emoji) or its amount / label as sticker lettering, on a round badge. */
export function renderSymbol(
  theme: WheelTheme,
  segment: Segment,
  index: number,
  count: number,
  r: number,
): HTMLCanvasElement {
  const size = Math.ceil(r * SYMBOL_SPRITE);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const style = theme.prizeStyle(segment, index, count);
  const { display, ui } = theme.palette;
  paintBadge(ctx, theme, style, c, r);
  const colors = { fill: style.text, outline: style.outline };
  const { main, caption } = symbolText(segment);

  if (segment.icon) {
    ctx.save();
    ctx.font = `${r * 1.02}px ${EMOJI_FONTS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = withAlpha(theme.palette.outline, 0.45);
    ctx.shadowBlur = r * 0.12;
    ctx.shadowOffsetY = r * 0.05;
    ctx.fillText(segment.icon, c, c - r * 0.1);
    ctx.restore();
    // Small tag with the amount (or label) under the icon.
    const measure = measurer(ctx, display);
    const fit = fitLabel(main, measure, r * 1.9, r * 0.62, r * 0.6);
    if (fit.size > 0) sticker(ctx, fit.lines.join(' '), c, c + r * 0.72, fit.size, display, colors);
    return canvas;
  }

  const measure = measurer(ctx, display);
  if (caption) {
    const capSize = r * 0.24;
    const capWidth = measurer(ctx, ui)(caption) * capSize;
    const fit = fitLabel(main, measure, r * 1.75, r * 0.95, r * 0.95);
    const mainY = c - r * 0.14;
    sticker(ctx, fit.lines.join(' '), c, mainY, fit.size, display, colors);
    // Caption on a small ribbon across the lower part of the badge.
    const scale = Math.min(1, (r * 1.45) / Math.max(capWidth, 1));
    const ribbonW = Math.min(r * 1.6, capWidth * scale + r * 0.36);
    const ribbonH = capSize * scale * 1.45;
    const ry = c + r * 0.52;
    ctx.save();
    roundRect(ctx, c - ribbonW / 2, ry - ribbonH / 2, ribbonW, ribbonH, ribbonH / 2);
    ctx.fillStyle = withAlpha(style.outline, 0.82);
    ctx.fill();
    ctx.font = `700 ${capSize * scale}px ${ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = brightness(style.text) > 0.5 ? style.text : '#ffffff';
    ctx.fillText(caption, c, ry + capSize * scale * 0.05);
    ctx.restore();
    return canvas;
  }
  const fit = fitLabel(main, measure, r * 1.8, r * 1.35, r * 0.95);
  const line = fit.size * 1.02;
  fit.lines.forEach((text, i) => {
    sticker(ctx, text, c, c + (i - (fit.lines.length - 1) / 2) * line, fit.size, display, colors);
  });
  return canvas;
}

/** The streamer's photo as a premium symbol: a gold coin with the photo inside. */
export function renderPhotoSymbol(theme: WheelTheme, photo: HTMLCanvasElement, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * SYMBOL_SPRITE);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const style: PrizeStyle = {
    fill: theme.palette.body,
    light: theme.palette.glow,
    dark: theme.palette.bodyDark,
    text: theme.palette.text,
    outline: theme.palette.outline,
  };
  paintBadge(ctx, theme, style, c, r, (g, inner) => {
    g.translate(c, c);
    drawPhotoCover(g, photo, inner);
  });
  return canvas;
}

/** Resolution of the motion-blurred symbols relative to the sharp ones (blur hides the loss). */
export const BLUR_SCALE = 0.5;

/**
 * Motion-blurred copy of a symbol: the sprite smeared along the reel by `length` pixels, at
 * BLUR_SCALE resolution (draw it BLUR_SCALE⁻¹ times bigger).
 */
export function blurSymbol(sprite: HTMLCanvasElement, length: number): HTMLCanvasElement {
  const k = BLUR_SCALE;
  const pad = Math.ceil((length * k) / 2);
  const width = Math.ceil(sprite.width * k);
  const height = Math.ceil(sprite.height * k);
  const canvas = createCanvas(width, height + pad * 2);
  const ctx = canvas.getContext('2d')!;
  const steps = Math.max(8, Math.min(24, Math.round((length * k) / 2)));
  const smear = createCanvas(canvas.width, canvas.height);
  const sctx = smear.getContext('2d')!;
  for (let i = 0; i < steps; i++) {
    // Running average: every copy ends up with the same weight.
    sctx.globalAlpha = 1 / (i + 1);
    sctx.drawImage(sprite, 0, pad + (i / (steps - 1) - 0.5) * length * k, width, height);
  }
  // A light blur hides the steps between copies.
  ctx.filter = `blur(${Math.max(0.75, (length * k) / steps)}px)`;
  ctx.drawImage(smear, 0, 0);
  ctx.filter = 'none';
  return canvas;
}

/** Ring of light around a winning symbol (the badge itself stays clear). */
export function buildGlow(color: string, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 3.4);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, r * 0.96, c, c, r * 1.65);
  g.addColorStop(0, withAlpha(color, 0.9));
  g.addColorStop(0.3, withAlpha(color, 0.45));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.beginPath();
  ctx.arc(c, c, r * 1.7, 0, TAU);
  ctx.arc(c, c, r * 0.96, 0, TAU, true);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, r * 1.03, 0, TAU);
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 0.3;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = r * 0.035;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.stroke();
  return canvas;
}

/** A message in glowing letters for the display (sized to fit `width` × `height`). */
export function renderMessage(
  theme: WheelTheme,
  text: string,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const { display, glow, outline } = theme.palette;
  const measure = measurer(ctx, display);
  const fit = fitLabel(text, measure, width * 0.9, height * 0.84, height * 0.74);
  if (fit.size <= 0) return canvas;
  const lineGap = fit.size * 1.02;
  fit.lines.forEach((line, i) => {
    const y = height / 2 + (i - (fit.lines.length - 1) / 2) * lineGap;
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = fit.size * 0.45;
    sticker(ctx, line, width / 2, y, fit.size, display, {
      fill: mixColor(glow, '#ffffff', 0.55),
      outline: mixColor(glow, outline, 0.55),
      shadow: glow,
    });
    ctx.restore();
  });
  return canvas;
}

/** Four-pointed twinkle with a soft halo, `r` canvas pixels to the tips. */
export function buildSparkle(color: string, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2.2);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const halo = ctx.createRadialGradient(c, c, 0, c, c, r);
  halo.addColorStop(0, withAlpha(color, 0.55));
  halo.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const b = a + Math.PI / 4;
    ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.lineTo(c + Math.cos(b) * r * 0.16, c + Math.sin(b) * r * 0.16);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return canvas;
}

/** Soft light used to make deck buttons glow (a radial blob, `r` canvas pixels). */
export function buildLight(color: string, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, r);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  g.addColorStop(0.3, withAlpha(color, 0.6));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** A slanted band of light that sweeps across the glass now and then (`h` tall). */
export function buildSweep(width: number, h: number): HTMLCanvasElement {
  const canvas = createCanvas(width + h * 0.4, h);
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, width, 0);
  g.addColorStop(0, 'rgba(255, 255, 255, 0)');
  g.addColorStop(0.5, 'rgba(255, 255, 255, 0.28)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.setTransform(1, 0, -0.4, 1, h * 0.4, 0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, h);
  return canvas;
}

/** "No prizes left" / "Awaiting entrants" on the glass. */
export function emptyMessage(view: WheelView): string {
  return view.kind === 'raffle' ? 'Awaiting entrants' : 'No prizes left';
}
