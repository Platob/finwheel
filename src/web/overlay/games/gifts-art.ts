// Painting of Mystery Gifts: wrapped boxes (body, open mouth, lid with bow), prize cards, the
// spotlight and podium, and small sprites (rays, glows, sparkles, confetti). Everything is drawn
// once into offscreen canvases; the stage only moves them around.
import type { Segment, WheelView } from '../../../shared/types';
import type { PrizeStyle, WheelTheme } from '../themes/types';
import { createCanvas, TAU } from '../wheel-face';
import { BOX, brightness, FLOOR_Y, mixColor, splitLabel, withAlpha } from './gifts-math';

const EMOJI_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
/** Outline width of sticker lettering, relative to the font size. */
const STROKE = 0.22;
const WHITE = '#ffffff';

/** Converts play-area units (half sides around its centre) to canvas pixels. */
export interface Frame {
  cx: number;
  cy: number;
  u: number;
}

export const px = (f: Frame, x: number): number => f.cx + x * f.u;
export const py = (f: Frame, y: number): number => f.cy + y * f.u;

// ── Shapes ───────────────────────────────────────────────────────────────

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 2;
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 0.95, y - s * 1.05, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.95, y - s * 1.05, x + s * 1.25, y + s * 0.05, x, y + s * 0.9);
  ctx.closePath();
}

/** Four-pointed twinkle star. */
function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, waist = 0.28) {
  ctx.moveTo(x, y - r);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 - Math.PI / 2;
    const b = a + Math.PI / 4;
    const c = a + Math.PI / 2;
    ctx.quadraticCurveTo(
      x + Math.cos(b) * r * waist,
      y + Math.sin(b) * r * waist,
      x + Math.cos(c) * r,
      y + Math.sin(c) * r,
    );
  }
  ctx.closePath();
}

/** Sticker lettering: a thick round outline under the fill, with a soft drop shadow. */
export function sticker(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  family: string,
  colors: { fill: string; outline: string },
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
  ctx.shadowColor = withAlpha(colors.outline, 0.5);
  ctx.shadowBlur = size * 0.14;
  ctx.shadowOffsetY = size * 0.05;
  ctx.strokeText(text, x, baseline);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = colors.fill;
  ctx.fillText(text, x, baseline);
  ctx.restore();
}

function textWidth(ctx: CanvasRenderingContext2D, text: string, size: number, family: string): number {
  ctx.font = `700 ${size}px ${family}`;
  return ctx.measureText(text).width;
}

// ── Gift wrap ────────────────────────────────────────────────────────────

export type Pattern = 'dots' | 'hearts' | 'stars' | 'stripes' | 'diamonds';

/** Wrapping paper and ribbon of one box. */
export interface Paper {
  fill: string;
  light: string;
  dark: string;
  ribbon: string;
  ribbonLight: string;
  ribbonDark: string;
  pattern: Pattern;
  metallic: boolean;
}

const giftSegment = (tier: Segment['tier'], effect?: Segment['effect']): Segment => ({
  id: 'gift',
  label: '',
  description: '',
  weight: 1,
  tier,
  ...(effect ? { effect } : {}),
});

/** Papers of the five boxes, from the theme's prize colours (pink, cream, gold, … in glam). */
export function giftPapers(theme: WheelTheme): Paper[] {
  const glam = theme.id === 'glam';
  const styles: PrizeStyle[] = [
    theme.prizeStyle(giftSegment('common'), 0, 1000),
    theme.prizeStyle(giftSegment('common'), 1, 1000),
    theme.prizeStyle(giftSegment('jackpot'), 0, 1000),
    theme.prizeStyle(giftSegment('rare'), 2, 1000),
    theme.prizeStyle(giftSegment('epic', 'next'), 4, 1000),
  ];
  const patterns: Pattern[] = glam
    ? ['dots', 'hearts', 'stars', 'stripes', 'hearts']
    : ['diamonds', 'dots', 'stars', 'stripes', 'dots'];
  const { trim, trimLight, body, bodyDark } = theme.palette;
  return styles.map((style, i) => {
    const light = brightness(style.fill) > 0.62 || Boolean(style.metallic);
    const ribbon = light ? (glam ? '#e8559f' : body) : glam && i === 4 ? '#fff4fa' : trim;
    return {
      fill: style.fill,
      light: mixColor(style.fill, WHITE, light ? 0.45 : 0.3),
      dark: mixColor(style.fill, glam ? '#3a0c2c' : '#000000', light ? 0.16 : 0.32),
      ribbon,
      ribbonLight: mixColor(ribbon, light ? WHITE : trimLight, 0.55),
      ribbonDark: mixColor(ribbon, light ? bodyDark : '#5a3a08', 0.35),
      pattern: patterns[i]!,
      metallic: Boolean(style.metallic),
    };
  });
}

/** One box's sprites; `anchor` gives where in each sprite the reference point sits (pixels). */
export interface BoxSprites {
  /** Front of the body; reference = bottom centre. */
  body: HTMLCanvasElement;
  /** Inside seen through the open top; reference = top centre of the body. */
  mouth: HTMLCanvasElement;
  /** Lid with its bow; reference = bottom centre of the lid. */
  lid: HTMLCanvasElement;
  /** Same, shaded (other boxes while the winner is highlighted). */
  bodyDim: HTMLCanvasElement;
  mouthDim: HTMLCanvasElement;
  lidDim: HTMLCanvasElement;
  /** Box width the sprites were drawn for, in pixels, and the padding around them. */
  width: number;
  pad: number;
}

function goldFill(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#a8741c');
  g.addColorStop(0.22, '#ffe7a0');
  g.addColorStop(0.45, '#e2b244');
  g.addColorStop(0.7, '#fff3c8');
  g.addColorStop(1, '#b8862a');
  return g;
}

function paperFill(
  ctx: CanvasRenderingContext2D,
  paper: Paper,
  x0: number,
  x1: number,
  y: number,
): CanvasGradient {
  if (paper.metallic) return goldFill(ctx, x0, y, x1, y);
  const g = ctx.createLinearGradient(x0, y, x1, y);
  g.addColorStop(0, paper.light);
  g.addColorStop(0.3, paper.fill);
  g.addColorStop(0.75, paper.fill);
  g.addColorStop(1, paper.dark);
  return g;
}

function ribbonFill(
  ctx: CanvasRenderingContext2D,
  paper: Paper,
  x0: number,
  x1: number,
  y: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y, x1, y);
  g.addColorStop(0, paper.ribbonDark);
  g.addColorStop(0.3, paper.ribbon);
  g.addColorStop(0.48, paper.ribbonLight);
  g.addColorStop(0.62, paper.ribbon);
  g.addColorStop(1, paper.ribbonDark);
  return g;
}

/** Wrapping-paper print inside the current clip. */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  paper: Paper,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const unit = w * 0.17;
  const ink = paper.metallic
    ? 'rgba(255, 255, 255, 0.45)'
    : brightness(paper.fill) > 0.62
      ? withAlpha(paper.ribbon, 0.28)
      : 'rgba(255, 255, 255, 0.26)';
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (paper.pattern === 'stripes') {
    ctx.lineWidth = unit * 0.32;
    ctx.beginPath();
    for (let s = -h; s < w + h; s += unit * 0.9) {
      ctx.moveTo(x + s, y + h);
      ctx.lineTo(x + s + h, y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  let row = 0;
  for (let yy = y + unit * 0.5; yy < y + h + unit; yy += unit * 0.85, row++) {
    for (let xx = x + (row % 2 ? unit * 0.5 : 0); xx < x + w + unit; xx += unit) {
      if (paper.pattern === 'dots') {
        ctx.moveTo(xx + unit * 0.16, yy);
        ctx.arc(xx, yy, unit * 0.16, 0, TAU);
      } else if (paper.pattern === 'hearts') {
        heartPath(ctx, xx, yy, unit * 0.42);
      } else if (paper.pattern === 'stars') {
        starPath(ctx, xx, yy, unit * 0.26, 0.3);
      } else {
        ctx.moveTo(xx, yy - unit * 0.2);
        ctx.lineTo(xx + unit * 0.14, yy);
        ctx.lineTo(xx, yy + unit * 0.2);
        ctx.lineTo(xx - unit * 0.14, yy);
        ctx.closePath();
      }
    }
  }
  ctx.fill();
  ctx.restore();
}

/** Shades a copy of a sprite (keeps its alpha). */
export function shaded(sprite: HTMLCanvasElement, color: string, alpha: number): HTMLCanvasElement {
  const copy = createCanvas(sprite.width, sprite.height);
  const ctx = copy.getContext('2d')!;
  ctx.drawImage(sprite, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = withAlpha(color, alpha);
  ctx.fillRect(0, 0, copy.width, copy.height);
  return copy;
}

/** Paints a box of width `w` pixels. */
export function renderBox(theme: WheelTheme, paper: Paper, w: number): BoxSprites {
  const { outline } = theme.palette;
  const line = Math.max(1.5, w * 0.032);
  const pad = Math.ceil(w * 0.12 + line);
  const bodyH = w * BOX.body;
  const lidH = w * BOX.lid;
  const lidW = w * BOX.lidWidth;
  const band = w * 0.2;

  // Body: reference (bottom centre) at (pad + w/2, pad + bodyH).
  const body = createCanvas(w + pad * 2, bodyH + pad * 2);
  {
    const ctx = body.getContext('2d')!;
    const x = pad;
    const y = pad;
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.arcTo(x + w, y + bodyH, x, y + bodyH, w * 0.06);
      ctx.arcTo(x, y + bodyH, x, y, w * 0.06);
      ctx.closePath();
    };
    shape();
    ctx.fillStyle = paperFill(ctx, paper, x, x + w, y);
    ctx.fill();
    ctx.save();
    shape();
    ctx.clip();
    drawPattern(ctx, paper, x, y, w, bodyH);
    // Satin ribbon down the middle.
    ctx.fillStyle = ribbonFill(ctx, paper, x + w / 2 - band / 2, x + w / 2 + band / 2, y);
    ctx.fillRect(x + w / 2 - band / 2, y, band, bodyH);
    ctx.fillStyle = withAlpha(paper.ribbonDark, 0.6);
    ctx.fillRect(x + w / 2 - band / 2, y, line * 0.5, bodyH);
    ctx.fillRect(x + w / 2 + band / 2 - line * 0.5, y, line * 0.5, bodyH);
    // Shadow under the lid, shade at the bottom, a soft gloss on the left.
    const top = ctx.createLinearGradient(0, y, 0, y + bodyH * 0.22);
    top.addColorStop(0, withAlpha(outline, 0.42));
    top.addColorStop(1, withAlpha(outline, 0));
    ctx.fillStyle = top;
    ctx.fillRect(x, y, w, bodyH * 0.22);
    const bottom = ctx.createLinearGradient(0, y + bodyH * 0.7, 0, y + bodyH);
    bottom.addColorStop(0, withAlpha(outline, 0));
    bottom.addColorStop(1, withAlpha(outline, 0.28));
    ctx.fillStyle = bottom;
    ctx.fillRect(x, y + bodyH * 0.7, w, bodyH * 0.3);
    const gloss = ctx.createLinearGradient(x, 0, x + w * 0.3, 0);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gloss.addColorStop(0.35, 'rgba(255, 255, 255, 0.28)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x + w * 0.05, y + bodyH * 0.12, w * 0.22, bodyH * 0.8);
    ctx.restore();
    shape();
    ctx.lineJoin = 'round';
    ctx.lineWidth = line;
    ctx.strokeStyle = outline;
    ctx.stroke();
    drawSeal(ctx, theme, paper, x + w / 2, y + bodyH * 0.54, w * 0.2, line);
  }

  // Mouth: the inside of the open box; reference (top centre of the body) at (pad + w/2, pad + depth).
  const depth = w * 0.16;
  const mouth = createCanvas(w + pad * 2, depth + pad * 2);
  {
    const ctx = mouth.getContext('2d')!;
    const x = pad;
    const y = pad;
    roundRect(ctx, x, y, w, depth + line, w * 0.04);
    ctx.fillStyle = paper.metallic ? goldFill(ctx, x, y, x + w, y) : paper.dark;
    ctx.fill();
    ctx.lineWidth = line;
    ctx.strokeStyle = outline;
    ctx.stroke();
    // The dark inside, lit from above.
    const inside = ctx.createLinearGradient(0, y + depth * 0.25, 0, y + depth + line);
    inside.addColorStop(0, mixColor(paper.fill, '#1a0412', 0.75));
    inside.addColorStop(1, mixColor(paper.fill, '#1a0412', 0.45));
    roundRect(ctx, x + w * 0.05, y + depth * 0.28, w * 0.9, depth * 0.72 + line, w * 0.03);
    ctx.fillStyle = inside;
    ctx.fill();
  }

  // Lid with bow; reference (bottom centre of the lid) at (cx, ref).
  const bowH = w * BOX.bow;
  const lid = createCanvas(lidW + pad * 2, lidH + bowH + pad * 2);
  {
    const ctx = lid.getContext('2d')!;
    const cx = lid.width / 2;
    const bottom = pad + bowH + lidH;
    const top = bottom - lidH;
    const x = cx - lidW / 2;
    // Tails of the bow fall behind the lid's front edge.
    drawTails(ctx, paper, cx, top + lidH * 0.1, w, line, outline);
    roundRect(ctx, x, top, lidW, lidH, w * 0.05);
    const face = paper.metallic
      ? goldFill(ctx, x, top, x + lidW, top)
      : paperFill(ctx, paper, x, x + lidW, top);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, top, lidW, lidH, w * 0.05);
    ctx.clip();
    drawPattern(ctx, paper, x, top, lidW, lidH);
    ctx.fillStyle = ribbonFill(ctx, paper, cx - band / 2, cx + band / 2, top);
    ctx.fillRect(cx - band / 2, top, band, lidH);
    // Top edge catches the light; the bottom edge is in shade.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(x, top, lidW, lidH * 0.16);
    ctx.fillStyle = withAlpha(outline, 0.22);
    ctx.fillRect(x, bottom - lidH * 0.2, lidW, lidH * 0.2);
    ctx.restore();
    roundRect(ctx, x, top, lidW, lidH, w * 0.05);
    ctx.lineJoin = 'round';
    ctx.lineWidth = line;
    ctx.strokeStyle = outline;
    ctx.stroke();
    drawBow(ctx, paper, cx, top + line * 0.2, w, line, outline);
  }

  const shade = theme.id === 'glam' ? '#3a0c2c' : '#000000';
  return {
    body,
    mouth,
    lid,
    bodyDim: shaded(body, shade, 0.5),
    mouthDim: shaded(mouth, shade, 0.5),
    lidDim: shaded(lid, shade, 0.5),
    width: w,
    pad,
  };
}

/** Round "?" seal stuck on the ribbon. */
function drawSeal(
  ctx: CanvasRenderingContext2D,
  theme: WheelTheme,
  paper: Paper,
  x: number,
  y: number,
  r: number,
  line: number,
) {
  const { outline, display, trim, trimLight } = theme.palette;
  const glam = theme.id === 'glam';
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.shadowColor = withAlpha(outline, 0.4);
  ctx.shadowBlur = r * 0.3;
  ctx.shadowOffsetY = r * 0.08;
  ctx.fillStyle = paper.metallic ? (glam ? '#e8559f' : '#7a1530') : goldFill(ctx, x - r, y - r, x + r, y + r);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.lineWidth = line;
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, TAU);
  ctx.fillStyle = paper.metallic ? (glam ? '#f27fba' : '#97203f') : glam ? '#fff6fb' : trimLight;
  ctx.fill();
  ctx.lineWidth = line * 0.5;
  ctx.strokeStyle = paper.metallic ? trimLight : trim;
  ctx.stroke();
  const fill = glam ? (paper.metallic ? WHITE : '#e8559f') : paper.metallic ? '#fff3c4' : '#7a1530';
  sticker(ctx, '?', x, y + r * 0.04, r * 1.3, display, { fill, outline }, 0.2);
}

/** Two satin tails hanging from the knot. */
function drawTails(
  ctx: CanvasRenderingContext2D,
  paper: Paper,
  cx: number,
  y: number,
  w: number,
  line: number,
  outline: string,
) {
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * w * 0.03, y - w * 0.04);
    ctx.quadraticCurveTo(cx + side * w * 0.14, y + w * 0.05, cx + side * w * 0.22, y + w * 0.2);
    ctx.lineTo(cx + side * w * 0.15, y + w * 0.17);
    ctx.lineTo(cx + side * w * 0.12, y + w * 0.24);
    ctx.quadraticCurveTo(cx + side * w * 0.06, y + w * 0.08, cx - side * w * 0.04, y - w * 0.01);
    ctx.closePath();
    ctx.fillStyle = side < 0 ? paper.ribbon : paper.ribbonDark;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = line;
    ctx.strokeStyle = outline;
    ctx.stroke();
  }
}

/** A big two-loop bow sitting on the lid at (cx, y). */
function drawBow(
  ctx: CanvasRenderingContext2D,
  paper: Paper,
  cx: number,
  y: number,
  w: number,
  line: number,
  outline: string,
) {
  const knotY = y - w * 0.07;
  for (const side of [-1, 1]) {
    const tipX = cx + side * w * 0.36;
    const tipY = knotY - w * 0.2;
    const loop = () => {
      ctx.beginPath();
      ctx.moveTo(cx, knotY);
      ctx.bezierCurveTo(
        cx + side * w * 0.12,
        knotY - w * 0.32,
        tipX + side * w * 0.06,
        tipY - w * 0.12,
        tipX,
        tipY + w * 0.05,
      );
      ctx.bezierCurveTo(
        tipX - side * w * 0.02,
        knotY + w * 0.08,
        cx + side * w * 0.14,
        knotY + w * 0.08,
        cx,
        knotY,
      );
      ctx.closePath();
    };
    loop();
    const g = ctx.createLinearGradient(cx, knotY - w * 0.3, cx, knotY + w * 0.06);
    g.addColorStop(0, paper.ribbonLight);
    g.addColorStop(0.55, paper.ribbon);
    g.addColorStop(1, paper.ribbonDark);
    ctx.fillStyle = g;
    ctx.fill();
    // Inner fold of the loop.
    ctx.save();
    loop();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(cx + side * w * 0.2, knotY - w * 0.07, w * 0.09, w * 0.05, side * -0.5, 0, TAU);
    ctx.fillStyle = withAlpha(paper.ribbonDark, 0.85);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + side * w * 0.17, knotY - w * 0.17, w * 0.1, w * 0.03, side * -0.6, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
    ctx.restore();
    loop();
    ctx.lineJoin = 'round';
    ctx.lineWidth = line;
    ctx.strokeStyle = outline;
    ctx.stroke();
  }
  // Knot.
  roundRect(ctx, cx - w * 0.075, knotY - w * 0.075, w * 0.15, w * 0.13, w * 0.045);
  const k = ctx.createLinearGradient(cx, knotY - w * 0.075, cx, knotY + w * 0.06);
  k.addColorStop(0, paper.ribbonLight);
  k.addColorStop(1, paper.ribbon);
  ctx.fillStyle = k;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

// ── Prize cards ──────────────────────────────────────────────────────────

export interface CardSprite {
  canvas: HTMLCanvasElement;
  /** Card centre inside the canvas, and the card's own size (pixels). */
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/** What a card says: the amount (with a caption) or the label, plus the icon. */
export function cardText(segment: Segment): { main: string[]; caption: string | null; icon: string | null } {
  const icon = segment.icon ?? null;
  if (segment.amount)
    return { main: [segment.amount], caption: segment.caption?.toUpperCase() || null, icon };
  return { main: splitLabel(segment.label || '?'), caption: null, icon };
}

/**
 * A prize as a big sticker card: the prize's colours, a gold frame, its amount or label in
 * sticker lettering, a caption ribbon and its icon popping over the top edge. `h` = card height.
 */
export function renderCard(
  theme: WheelTheme,
  segment: Segment,
  index: number,
  count: number,
  h: number,
): CardSprite {
  const style = theme.prizeStyle(segment, index, count);
  const { display, ui, outline, trim, trimLight } = theme.palette;
  const { main, caption, icon } = cardText(segment);
  const probe = createCanvas(4).getContext('2d')!;

  const lines = main.length;
  const maxW = h * 3.2;
  // The icon sits inside the card, left of the lettering.
  const iconSize = icon ? h * 0.55 : 0;
  const iconRoom = icon ? iconSize + h * 0.08 : 0;
  let size = lines > 1 ? h * 0.34 : h * 0.56;
  const widest = Math.max(...main.map((l) => textWidth(probe, l, size, display)));
  const room = maxW - h * 0.5 - iconRoom;
  if (widest > room) size *= room / widest;
  const textW = Math.max(...main.map((l) => textWidth(probe, l, size, display)));
  const capSize = h * 0.15;
  const capW = caption ? textWidth(probe, caption, capSize, ui) + h * 0.3 : 0;
  const width = Math.min(maxW, Math.max(h * 1.35, textW + iconRoom + h * 0.55, capW + iconRoom + h * 0.4));
  const line = Math.max(2, h * 0.045);
  const pad = Math.ceil(h * 0.2);
  const canvas = createCanvas(width + pad * 2, h + pad * 2);
  const ctx = canvas.getContext('2d')!;
  const cx = canvas.width / 2;
  const cy = pad + h / 2;
  // Centre of the lettering (shifted right of the icon).
  const tx = cx + iconRoom / 2;
  const x = cx - width / 2;
  const y = cy - h / 2;
  const r = h * 0.22;

  // Frame: dark outline, gold rim, then the prize colour.
  ctx.save();
  ctx.shadowColor = withAlpha(outline, 0.55);
  ctx.shadowBlur = h * 0.12;
  ctx.shadowOffsetY = h * 0.05;
  roundRect(ctx, x, y, width, h, r);
  ctx.fillStyle = outline;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x + line * 0.6, y + line * 0.6, width - line * 1.2, h - line * 1.2, r - line * 0.6);
  ctx.fillStyle = goldFill(ctx, x, y, x + width, y + h);
  ctx.fill();
  const inset = h * 0.075;
  roundRect(ctx, x + inset, y + inset, width - inset * 2, h - inset * 2, r - inset * 0.7);
  if (style.metallic) {
    ctx.fillStyle = goldFill(ctx, x, y + h, x + width, y);
  } else {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, style.light);
    g.addColorStop(0.45, style.fill);
    g.addColorStop(1, style.dark);
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.lineWidth = line * 0.6;
  ctx.strokeStyle = withAlpha(outline, 0.6);
  ctx.stroke();
  // Glossy top half.
  ctx.save();
  roundRect(ctx, x + inset, y + inset, width - inset * 2, h - inset * 2, r - inset * 0.7);
  ctx.clip();
  const gloss = ctx.createLinearGradient(0, y + inset, 0, y + h * 0.5);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(x, y, width, h * 0.5);
  ctx.restore();
  // Tiny sparkles on the frame corners.
  ctx.beginPath();
  starPath(ctx, x + inset * 1.9, y + inset * 1.9, h * 0.07);
  starPath(ctx, x + width - inset * 1.9, y + h - inset * 1.9, h * 0.07);
  ctx.fillStyle = trimLight;
  ctx.fill();

  // Dark lettering (casino gold) gets a light rim instead of a dark one, so it still reads.
  const darkText = brightness(style.text) < 0.4 && brightness(style.outline) < 0.4;
  const colors = { fill: style.text, outline: darkText ? mixColor(style.fill, WHITE, 0.75) : style.outline };
  const mainY = caption ? cy - h * 0.1 : cy;
  if (lines > 1) {
    sticker(ctx, main[0]!, tx, mainY - size * 0.55, size, display, colors);
    sticker(ctx, main[1]!, tx, mainY + size * 0.55, size, display, colors);
  } else {
    sticker(ctx, main[0]!, tx, mainY, size, display, colors);
  }
  if (caption) {
    const ribbonW = Math.min(width - inset * 2.5 - iconRoom, capW);
    const ribbonH = capSize * 1.55;
    const ry = cy + h * 0.29;
    roundRect(ctx, tx - ribbonW / 2, ry - ribbonH / 2, ribbonW, ribbonH, ribbonH / 2);
    ctx.fillStyle = withAlpha(outline, 0.85);
    ctx.fill();
    ctx.lineWidth = line * 0.45;
    ctx.strokeStyle = trim;
    ctx.stroke();
    ctx.save();
    ctx.font = `700 ${capSize}px ${ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = trimLight;
    const fit = Math.min(1, (ribbonW - h * 0.12) / Math.max(1, textWidth(ctx, caption, capSize, ui)));
    ctx.font = `700 ${capSize * fit}px ${ui}`;
    ctx.fillText(caption, tx, ry + capSize * 0.06);
    ctx.restore();
  }
  if (icon) {
    ctx.save();
    ctx.font = `${iconSize}px ${EMOJI_FONTS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = withAlpha(outline, 0.5);
    ctx.shadowBlur = iconSize * 0.12;
    ctx.shadowOffsetY = iconSize * 0.05;
    ctx.fillText(icon, x + h * 0.22 + iconSize / 2, cy + iconSize * 0.04);
    ctx.restore();
  }
  return { canvas, cx, cy, width, height: h };
}

// ── Stage ────────────────────────────────────────────────────────────────

/** Spotlight colour of a theme. */
export function spotColor(theme: WheelTheme): string {
  return theme.id === 'glam' ? '#fff0f7' : mixColor(theme.palette.trimLight, WHITE, 0.4);
}

/** The cone of light from above, drawn from its apex (top centre) downwards. */
export function renderSpotlight(
  theme: WheelTheme,
  f: Frame,
): { canvas: HTMLCanvasElement; apexX: number; apexY: number } {
  const u = f.u;
  const height = (FLOOR_Y + 0.12 + 1.02) * u;
  const topW = 0.16 * u;
  const bottomW = 1.9 * u;
  const blur = 0.05 * u;
  const canvas = createCanvas(bottomW + blur * 6, height + blur * 4);
  const ctx = canvas.getContext('2d')!;
  const apexX = canvas.width / 2;
  const apexY = blur * 2;
  const color = spotColor(theme);
  ctx.filter = `blur(${blur}px)`;
  const g = ctx.createLinearGradient(0, apexY, 0, apexY + height);
  g.addColorStop(0, withAlpha(color, 0.0));
  g.addColorStop(0.12, withAlpha(color, 0.26));
  g.addColorStop(0.75, withAlpha(color, 0.15));
  g.addColorStop(1, withAlpha(color, 0.0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(apexX - topW / 2, apexY);
  ctx.lineTo(apexX + topW / 2, apexY);
  ctx.lineTo(apexX + bottomW / 2, apexY + height);
  ctx.lineTo(apexX - bottomW / 2, apexY + height);
  ctx.closePath();
  ctx.fill();
  // A brighter core.
  ctx.beginPath();
  ctx.moveTo(apexX - topW * 0.25, apexY);
  ctx.lineTo(apexX + topW * 0.25, apexY);
  ctx.lineTo(apexX + bottomW * 0.25, apexY + height);
  ctx.lineTo(apexX - bottomW * 0.25, apexY + height);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.filter = 'none';
  return { canvas, apexX, apexY };
}

/** Podium geometry, in play-area units. */
export const PODIUM = { cy: FLOOR_Y - 0.035, rx: 1.0, ry: 0.13, side: 0.06 } as const;

/** Points of the podium's front bulbs, in play-area units. */
export function podiumBulbs(count = 15): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.PI * (0.06 + (0.88 * i) / (count - 1));
    points.push({
      x: -Math.cos(a) * PODIUM.rx * 0.97,
      y: PODIUM.cy + Math.sin(a) * PODIUM.ry + PODIUM.side * 0.55,
    });
  }
  return points;
}

/** The round stage the boxes stand on, with a pool of light. Full canvas size. */
export function renderPodium(theme: WheelTheme, size: number, f: Frame): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const { body, bodyDark, trim, trimLight, outline } = theme.palette;
  const glam = theme.id === 'glam';
  const u = f.u;
  const cx = px(f, 0);
  const cy = py(f, PODIUM.cy);
  const rx = PODIUM.rx * u;
  const ry = PODIUM.ry * u;
  const side = PODIUM.side * u;
  const line = Math.max(2, 0.012 * u);

  // Soft floor shadow.
  ctx.save();
  ctx.filter = `blur(${0.03 * u}px)`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + side + ry * 0.35, rx * 0.98, ry * 0.75, 0, 0, TAU);
  ctx.fillStyle = withAlpha(outline, 0.45);
  ctx.fill();
  ctx.restore();

  // Side band.
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(cx - rx, cy + side);
  ctx.ellipse(cx, cy + side, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  const band = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  const sideBase = glam ? bodyDark : body;
  band.addColorStop(0, mixColor(sideBase, '#000000', 0.25));
  band.addColorStop(0.45, mixColor(sideBase, WHITE, 0.08));
  band.addColorStop(1, mixColor(sideBase, '#000000', 0.35));
  ctx.fillStyle = band;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = outline;
  ctx.stroke();
  // Gold bottom rim.
  ctx.beginPath();
  ctx.ellipse(cx, cy + side, rx, ry, 0, 0.02, Math.PI - 0.02);
  ctx.lineWidth = line * 1.6;
  ctx.strokeStyle = trim;
  ctx.stroke();

  // Top surface.
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  const top = ctx.createRadialGradient(cx, cy - ry * 0.1, 0, cx, cy, rx);
  if (glam) {
    top.addColorStop(0, '#ffd0e6');
    top.addColorStop(0.45, '#f27fba');
    top.addColorStop(1, body);
  } else {
    top.addColorStop(0, mixColor(body, WHITE, 0.25));
    top.addColorStop(0.6, body);
    top.addColorStop(1, mixColor(body, '#000000', 0.3));
  }
  ctx.fillStyle = top;
  ctx.fill();
  ctx.lineWidth = line * 2.2;
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - line * 0.4, ry - line * 0.4, 0, 0, TAU);
  ctx.lineWidth = line * 1.4;
  ctx.strokeStyle = goldFill(ctx, cx - rx, cy, cx + rx, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.86, ry * 0.8, 0, 0, TAU);
  ctx.lineWidth = line * 0.6;
  ctx.strokeStyle = withAlpha(trimLight, 0.55);
  ctx.setLineDash([line * 1.2, line * 2.4]);
  ctx.stroke();
  ctx.setLineDash([]);
  return canvas;
}

/** Pool of light the spotlight casts on the podium (an ellipse, `r` wide). */
export function renderPool(theme: WheelTheme, r: number): HTMLCanvasElement {
  const canvas = createCanvas(r * 2, r * 2 * PODIUM.ry);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(1, PODIUM.ry);
  const color = spotColor(theme);
  const pool = ctx.createRadialGradient(r, r, 0, r, r, r);
  pool.addColorStop(0, withAlpha(color, 0.6));
  pool.addColorStop(0.55, withAlpha(color, 0.2));
  pool.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, r * 2, r * 2);
  return canvas;
}

/** Podium bulb sprites. */
export function renderBulbs(theme: WheelTheme, r: number): { on: HTMLCanvasElement; off: HTMLCanvasElement } {
  const { trimLight, glow, outline } = theme.palette;
  const size = Math.ceil(r * 5);
  const make = (lit: boolean) => {
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d')!;
    const c = size / 2;
    if (lit) {
      const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
      halo.addColorStop(0, withAlpha(glow, 0.7));
      halo.addColorStop(0.4, withAlpha(glow, 0.25));
      halo.addColorStop(1, withAlpha(glow, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.fillStyle = lit ? WHITE : mixColor(trimLight, outline, 0.45);
    ctx.fill();
    ctx.lineWidth = r * 0.3;
    ctx.strokeStyle = withAlpha(outline, 0.7);
    ctx.stroke();
    if (lit) {
      ctx.beginPath();
      ctx.arc(c - r * 0.3, c - r * 0.3, r * 0.35, 0, TAU);
      ctx.fillStyle = trimLight;
      ctx.fill();
    }
    return canvas;
  };
  return { on: make(true), off: make(false) };
}

/** Rotating light rays behind the revealed prize. */
export function renderRays(color: string, r: number, rays = 16): HTMLCanvasElement {
  const size = Math.ceil(r * 2);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, r * 0.1, c, c, r);
  g.addColorStop(0, withAlpha(color, 0.75));
  g.addColorStop(0.5, withAlpha(color, 0.32));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU;
    const half = (TAU / rays) * 0.28;
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, a - half, a + half);
    ctx.closePath();
  }
  ctx.fill();
  return canvas;
}

/** Soft round glow. */
export function renderGlow(color: string, r: number, strength = 0.85): HTMLCanvasElement {
  const size = Math.ceil(r * 2);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, withAlpha(color, strength));
  g.addColorStop(0.4, withAlpha(color, strength * 0.4));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** A bright ring (a burst of light seen at an angle when squashed vertically). */
export function renderRing(color: string, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2.2);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, r * 0.55, c, c, r * 1.05);
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(0.6, withAlpha(color, 0.9));
  g.addColorStop(0.75, withAlpha(WHITE, 0.95));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Light pouring out of an open box: a fan of rays from the mouth, upwards. */
export function renderBeam(color: string, w: number, h: number): HTMLCanvasElement {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, withAlpha(color, 0.8));
  g.addColorStop(0.5, withAlpha(color, 0.3));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  const base = w * 0.18;
  for (let i = 0; i < 5; i++) {
    const spread = (i - 2) / 2;
    const top = w / 2 + spread * w * 0.42;
    ctx.moveTo(w / 2 + spread * base - base * 0.22, h);
    ctx.lineTo(top - w * 0.06, 0);
    ctx.lineTo(top + w * 0.06, 0);
    ctx.lineTo(w / 2 + spread * base + base * 0.22, h);
    ctx.closePath();
  }
  ctx.fill();
  return canvas;
}

/** Four-pointed twinkle. */
export function renderSparkle(color: string, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2.4);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
  halo.addColorStop(0, withAlpha(color, 0.55));
  halo.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  starPath(ctx, c, c, r, 0.18);
  ctx.fillStyle = WHITE;
  ctx.fill();
  return canvas;
}

/** Confetti pieces of the lid burst: heart, star, dot and ribbon curl in a colour. */
export function renderPiece(shape: number, color: string, outline: string, r: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2.6);
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.strokeStyle = outline;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (shape === 0) heartPath(ctx, c, c, r * 1.7);
  else if (shape === 1) starPath(ctx, c, c, r * 1.1, 0.36);
  else if (shape === 2) ctx.arc(c, c, r * 0.6, 0, TAU);
  else {
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.5;
    ctx.moveTo(c - r, c);
    ctx.bezierCurveTo(c - r * 0.4, c - r * 1.1, c + r * 0.2, c + r * 1.1, c + r, c);
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.lineWidth = r * 0.3;
    ctx.strokeStyle = color;
    ctx.stroke();
    return canvas;
  }
  ctx.stroke();
  ctx.fill();
  return canvas;
}

/** The view's empty message as sticker lettering, fitted to `maxW`. */
export function renderMessage(
  theme: WheelTheme,
  text: string,
  maxW: number,
  size: number,
): HTMLCanvasElement {
  const { display, text: fill, outline } = theme.palette;
  const probe = createCanvas(4).getContext('2d')!;
  const fit = Math.min(size, (size * maxW) / Math.max(1, textWidth(probe, text, size, display)));
  const canvas = createCanvas(maxW + fit, fit * 2);
  sticker(canvas.getContext('2d')!, text, canvas.width / 2, canvas.height / 2, fit, display, {
    fill,
    outline,
  });
  return canvas;
}

export function emptyMessage(view: WheelView): string {
  return view.kind === 'raffle' ? 'Awaiting entrants' : 'No prizes left';
}
