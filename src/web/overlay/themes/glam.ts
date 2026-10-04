/**
 * Glam look: pink, cream and gold slices with white "sticker" lettering, a thin gold rim set with
 * pink $ coins and pearl lights, an upright hub showing the streamer's photo and the wheel name in
 * serif capitals, and a gold heart pointer.
 */
import { computeArcs, type Arc } from '../../../shared/geometry';
import type { Segment, WheelView } from '../../../shared/types';
import { createCanvas, drawPhotoCover, setLetterSpacing, slicePath, TAU, toRadians } from '../wheel-face';
import {
  amountCap,
  currencyMark,
  fitRadialText,
  GLAM_FACE,
  hubNameLayout,
  LABEL_LINE,
  labelCap,
  radialAmount,
  STICKER_STROKE,
  tangentialAmount,
  type AmountMeasure,
  type Measure,
  type TangentialAmount,
} from './glam-labels';
import { GLAM, GLAM_CYCLE, glamSliceStyle, type GlamSliceStyle } from './glam-palette';
import { type HubOptions, type SceneGeometry, type WheelTheme } from './types';

const STICKER_FONT = 'Fredoka';
const SERIF_FONT = 'Cinzel';
const CAPTION_SPACING = 0.04;
const HUB_SPACING = 0.04;
/** The hub name is set heavier than the captions, to stay legible over photos. */
const HUB_WEIGHT = 900;

/** Coins on the rim (one every 30°, from 12 o'clock) and pearls in each gap between two coins. */
const COINS = 12;
const PEARLS_PER_GAP = 3;
/** Rim proportions, relative to the outer rim radius. */
const RIM = { track: 0.95, coinTrack: 0.957, coin: 0.053, pearl: 0.012 } as const;
/** Hub proportions, relative to the hub radius. */
const HUB = { ring: 0.965, gold: 0.935, disc: 0.86 } as const;
/** Pointer proportions, relative to the outer rim radius (pivot = centre of its coin). */
const POINTER = { lobeX: 0.042, lobeY: -0.016, lobe: 0.104, tip: 0.212, coin: 0.073 } as const;

const font = (size: number, family = STICKER_FONT, weight = 700) => `${weight} ${size}px ${family}`;

/** Text width at font size 1, for the label fitting maths. */
function measurer(ctx: CanvasRenderingContext2D, family: string, spacing = 0, weight = 700): Measure {
  return (text) => {
    ctx.font = font(100, family, weight);
    setLetterSpacing(ctx, `${spacing}em`);
    const width = ctx.measureText(text).width / 100;
    setLetterSpacing(ctx, '0px');
    return width;
  };
}

/** Distance from the centre of the ink to the alphabetic baseline. */
function inkOffset(ctx: CanvasRenderingContext2D, text: string): number {
  const m = ctx.measureText(text);
  return (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
}

/** White lettering with a thick round outline and a soft shadow, centred on (x, y) vertically. */
function sticker(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  colors: { fill: string; stroke: string },
  align: CanvasTextAlign = 'center',
  centre = text,
) {
  ctx.font = font(size);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const baseline = y + inkOffset(ctx, centre);
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * STICKER_STROKE;
  ctx.strokeStyle = colors.stroke;
  ctx.shadowColor = 'rgba(58, 12, 44, 0.45)';
  ctx.shadowBlur = size * 0.16;
  ctx.strokeText(text, x, baseline);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = colors.fill;
  ctx.fillText(text, x, baseline);
}

/** Small serif capitals (TOTAL, NEXT, BONUS SPIN). */
function caption(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'center',
) {
  ctx.font = font(size, SERIF_FONT);
  setLetterSpacing(ctx, `${CAPTION_SPACING}em`);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + inkOffset(ctx, 'H'));
  setLetterSpacing(ctx, '0px');
}

function goldFill(ctx: CanvasRenderingContext2D, top: number, bottom: number) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, '#fde38c');
  g.addColorStop(0.45, GLAM.rimGold);
  g.addColorStop(1, '#e6ae3f');
  return g;
}

/**
 * A rounded "$" drawn as strokes, `height` tall: rim and pointer sprites are built before web
 * fonts finish loading and are not rebuilt afterwards.
 */
function drawDollar(ctx: CanvasRenderingContext2D, x: number, y: number, height: number) {
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
  ctx.lineWidth = height * 0.15;
  ctx.stroke();
}

/** Pink coin with a white ring and a white $. */
function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(58, 12, 44, 0.45)';
  ctx.shadowBlur = radius * 0.4;
  ctx.shadowOffsetY = radius * 0.1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = '#fff7fb';
  ctx.fill();
  ctx.restore();

  const face = ctx.createLinearGradient(x, y - radius, x, y + radius);
  face.addColorStop(0, GLAM.deepPink);
  face.addColorStop(1, '#f7a8cf');
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.8, 0, TAU);
  ctx.fillStyle = face;
  ctx.fill();

  ctx.save();
  ctx.shadowColor = 'rgba(120, 10, 70, 0.5)';
  ctx.shadowBlur = radius * 0.15;
  ctx.strokeStyle = '#ffffff';
  drawDollar(ctx, x, y, radius * 1.05);
  ctx.restore();
}

// ── Face ─────────────────────────────────────────────────────────────────

function paintSlice(ctx: CanvasRenderingContext2D, arc: Arc, style: GlamSliceStyle, r: number) {
  slicePath(ctx, arc, 0, r);
  if (style.metallic) {
    const mid = toRadians((arc.start + arc.end) / 2);
    const nx = Math.cos(mid + Math.PI / 2) * r * 0.3;
    const ny = Math.sin(mid + Math.PI / 2) * r * 0.3;
    const gold = ctx.createLinearGradient(-nx, -ny, nx, ny);
    gold.addColorStop(0, '#c8901e');
    gold.addColorStop(0.3, '#ffe9a6');
    gold.addColorStop(0.55, '#e8b440');
    gold.addColorStop(0.8, '#fff3c8');
    gold.addColorStop(1, '#c8901e');
    ctx.fillStyle = gold;
    ctx.fill();
    const shade = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
    shade.addColorStop(0, 'rgba(120, 60, 0, 0.35)');
    shade.addColorStop(0.6, 'rgba(120, 60, 0, 0)');
    shade.addColorStop(1, 'rgba(255, 245, 210, 0.25)');
    ctx.fillStyle = shade;
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(0, 0, r * GLAM_FACE.hub, 0, 0, r);
    g.addColorStop(0, style.inner);
    g.addColorStop(0.55, style.base);
    g.addColorStop(1, style.edge);
    ctx.fillStyle = g;
    ctx.fill();
  }
  if (style.inlay) {
    ctx.save();
    slicePath(ctx, arc, 0, r);
    ctx.clip();
    slicePath(ctx, arc, r * GLAM_FACE.hub, r * 0.965);
    ctx.strokeStyle = style.inlay;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = r * 0.018;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

/** Splits a caption into two balanced lines (null for a single word). */
function twoLines(text: string, measure: Measure): string[] | null {
  const words = text.split(/\s+/);
  let best: { lines: string[]; width: number } | null = null;
  for (let k = 1; k < words.length; k++) {
    const lines = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
    const width = Math.max(...lines.map(measure));
    if (!best || width < best.width) best = { lines, width };
  }
  return best?.lines ?? null;
}

interface AmountPlan {
  index: number;
  measure: AmountMeasure;
  captionOptions: string[][];
  mark: string | null;
  layout: TangentialAmount | null;
}

function drawTangential(
  ctx: CanvasRenderingContext2D,
  segment: Segment,
  plan: AmountPlan,
  layout: TangentialAmount,
  style: GlamSliceStyle,
  r: number,
) {
  const colors = { fill: style.text, stroke: style.stroke };
  sticker(ctx, segment.amount!, 0, -layout.radius * r, layout.size * r, colors);
  if (layout.caption) {
    const lines = plan.captionOptions[layout.caption.option]!;
    lines.forEach((line, i) => {
      caption(ctx, line, 0, -layout.caption!.radii[i]! * r, layout.caption!.size * r, style.caption);
    });
  } else if (layout.mark && plan.mark) {
    sticker(ctx, plan.mark, 0, -layout.mark.radius * r, layout.mark.size * r, colors);
  }
}

/** Amount along the radius at the rim end, caption before it: for slices too thin to print across. */
function drawRadialAmount(
  ctx: CanvasRenderingContext2D,
  segment: Segment,
  span: number,
  style: GlamSliceStyle,
  r: number,
  measures: { sticker: Measure; serif: Measure },
  minSize: number,
) {
  const amount = segment.amount!;
  const text = segment.caption?.toUpperCase() || null;
  const fit = radialAmount(span, measures.sticker(amount), text ? measures.serif(text) : null, minSize);
  if (!fit) return false;
  const size = fit.size * r;
  const outer = GLAM_FACE.textOuter * r - (size * STICKER_STROKE) / 2;
  sticker(ctx, amount, outer, 0, size, { fill: style.text, stroke: style.stroke }, 'right');
  if (text && fit.caption) {
    const right = outer - measures.sticker(amount) * size - size * STICKER_STROKE - r * 0.02;
    caption(ctx, text, right, 0, fit.caption * r, style.caption, 'right');
  }
  return true;
}

function paintLabels(
  ctx: CanvasRenderingContext2D,
  segments: readonly Segment[],
  arcs: readonly Arc[],
  styles: readonly GlamSliceStyle[],
  r: number,
) {
  const measures = {
    sticker: measurer(ctx, STICKER_FONT),
    serif: measurer(ctx, SERIF_FONT, CAPTION_SPACING),
  };
  const minSize = Math.max(10 / r, 0.026);
  const span = (arc: Arc) => (arc.end - arc.start) * TAU;

  // Money slices first: a common size keeps short and long amounts alike.
  const plans: AmountPlan[] = [];
  segments.forEach((segment, index) => {
    if (!segment.amount) return;
    const text = segment.caption?.toUpperCase().trim();
    const split = text ? twoLines(text, measures.serif) : null;
    const captionOptions = text ? [[text], ...(split ? [split] : [])] : [];
    const mark = text ? null : currencyMark(segment.amount);
    const measure: AmountMeasure = {
      span: span(arcs[index]!),
      amount: measures.sticker(segment.amount),
      captions: captionOptions.map((lines) => lines.map(measures.serif)),
      mark: mark ? measures.sticker(mark) : null,
    };
    plans.push({ index, measure, captionOptions, mark, layout: tangentialAmount(measure) });
  });
  const cap = amountCap(plans.flatMap((p) => (p.layout ? [p.layout.size] : [])));
  for (const plan of plans) {
    if (plan.layout) plan.layout = tangentialAmount(plan.measure, cap) ?? plan.layout;
  }
  const planFor = new Map(plans.map((p) => [p.index, p]));
  const labelSizes = segments.flatMap((segment, i) => {
    if (planFor.has(i)) return [];
    const fit = fitRadialText(segment.label, span(arcs[i]!), measures.sticker, minSize);
    return fit ? [fit.size] : [];
  });
  const textCap = labelCap(labelSizes);

  segments.forEach((segment, i) => {
    const arc = arcs[i]!;
    const style = styles[i]!;
    const mid = toRadians((arc.start + arc.end) / 2);
    const plan = planFor.get(i);
    ctx.save();
    if (plan?.layout) {
      // Across the slice, glyph tops toward the rim.
      ctx.rotate(mid + Math.PI / 2);
      drawTangential(ctx, segment, plan, plan.layout, style, r);
      ctx.restore();
      return;
    }
    ctx.rotate(mid);
    if (plan && drawRadialAmount(ctx, segment, span(arc), style, r, measures, minSize)) {
      ctx.restore();
      return;
    }
    const fit = fitRadialText(segment.label, span(arc), measures.sticker, minSize, textCap);
    if (fit) {
      const size = fit.size * r;
      const outer = GLAM_FACE.textOuter * r - (size * STICKER_STROKE) / 2;
      fit.lines.forEach((line, n) => {
        const y = (n - (fit.lines.length - 1) / 2) * LABEL_LINE * size;
        sticker(ctx, line, outer, y, size, { fill: style.text, stroke: style.stroke }, 'right', 'H');
      });
    }
    ctx.restore();
  });
}

function paintSeparators(ctx: CanvasRenderingContext2D, arcs: readonly Arc[], r: number) {
  if (arcs.length < 2) return;
  ctx.strokeStyle = 'rgba(255, 246, 236, 0.92)';
  ctx.lineWidth = Math.max(1, r * 0.007);
  for (const arc of arcs) {
    const a = toRadians(arc.start);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
}

/** Blank, washed-out slices with a message (no prizes or entrants yet). */
function paintEmpty(ctx: CanvasRenderingContext2D, view: WheelView, r: number) {
  const arcs = computeArcs(Array<number>(12).fill(1), 'equal');
  arcs.forEach((arc, i) => paintSlice(ctx, arc, GLAM_CYCLE[i % GLAM_CYCLE.length]!, r));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = 'rgba(255, 240, 248, 0.45)';
  ctx.fill();
  paintSeparators(ctx, arcs, r);
  const message = view.kind === 'raffle' ? 'Awaiting entrants' : 'No prizes left';
  sticker(ctx, message, 0, -r * 0.63, r * 0.085, { fill: '#ffffff', stroke: GLAM.plum });
}

/** Renders the rotating part of the wheel (slices and lettering) into an offscreen canvas. */
function renderFace(view: WheelView, radius: number): HTMLCanvasElement {
  const canvas = createCanvas(radius * 2);
  const ctx = canvas.getContext('2d')!;
  const r = radius;
  ctx.translate(r, r);

  const segments = view.segments;
  if (segments.length === 0) {
    paintEmpty(ctx, view, r);
    return canvas;
  }
  const arcs = computeArcs(
    segments.map((s) => s.weight),
    view.sizing,
  );
  const styles = segments.map((segment, i) => glamSliceStyle(segment, i, segments.length));
  segments.forEach((_, i) => paintSlice(ctx, arcs[i]!, styles[i]!, r));

  paintSeparators(ctx, arcs, r);

  // Soft depth under the rim
  const vignette = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r);
  vignette.addColorStop(0, 'rgba(58, 12, 44, 0)');
  vignette.addColorStop(1, 'rgba(58, 12, 44, 0.2)');
  ctx.fillStyle = vignette;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  paintLabels(ctx, segments, arcs, styles, r);
  return canvas;
}

// ── Static parts ─────────────────────────────────────────────────────────

function buildRim({ size, cx, cy, rim: ro, face: rf }: SceneGeometry): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;

  // Soft shadow under the wheel
  ctx.save();
  ctx.shadowColor = 'rgba(40, 4, 30, 0.55)';
  ctx.shadowBlur = size * 0.04;
  ctx.shadowOffsetY = size * 0.01;
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, TAU);
  ctx.fillStyle = '#5e1249';
  ctx.fill();
  ctx.restore();

  // Gold band
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, ro, 0, TAU);
  ctx.arc(0, 0, rf * 0.99, TAU, 0, true);
  ctx.fillStyle = goldFill(ctx, -ro, ro);
  ctx.fill();
  const bevel = ctx.createRadialGradient(0, 0, rf, 0, 0, ro);
  bevel.addColorStop(0, 'rgba(150, 80, 10, 0.25)');
  bevel.addColorStop(0.35, 'rgba(255, 250, 220, 0.12)');
  bevel.addColorStop(0.75, 'rgba(255, 250, 220, 0)');
  bevel.addColorStop(1, 'rgba(150, 80, 10, 0.2)');
  ctx.fillStyle = bevel;
  ctx.fill();

  const line = (radius: number, width: number, color: string) => {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const pale = Math.max(1, ro * 0.011);
  line(ro - pale / 2, pale, GLAM.paleGold);
  line(rf + pale / 2, pale, GLAM.paleGold);
  line(rf, Math.max(1, ro * 0.004), 'rgba(150, 80, 20, 0.5)');

  // Pink $ coins (the pointer stands on the one at 12 o'clock)
  for (let i = 1; i < COINS; i++) {
    const a = toRadians(i / COINS);
    drawCoin(ctx, Math.cos(a) * ro * RIM.coinTrack, Math.sin(a) * ro * RIM.coinTrack, ro * RIM.coin);
  }
  ctx.restore();
  return canvas;
}

function buildLights({ rim }: SceneGeometry): { on: HTMLCanvasElement; off: HTMLCanvasElement } {
  const radius = rim * RIM.pearl;
  const glow = radius * 2.6;
  const size = Math.ceil(glow * 2);
  const c = size / 2;

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
  ctx.shadowColor = 'rgba(120, 70, 10, 0.55)';
  ctx.shadowBlur = radius * 0.6;
  ctx.shadowOffsetY = radius * 0.15;
  pearl(ctx, ['#ffffff', '#f4e6d2', '#d6b98c']);

  const on = createCanvas(size);
  ctx = on.getContext('2d')!;
  const halo = ctx.createRadialGradient(c, c, 0, c, c, glow);
  halo.addColorStop(0, 'rgba(255, 255, 250, 0.7)');
  halo.addColorStop(0.35, 'rgba(255, 225, 240, 0.22)');
  halo.addColorStop(1, 'rgba(255, 210, 235, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  pearl(ctx, ['#ffffff', GLAM.pearl, '#fff1e0']);
  return { on, off };
}

/** Small gold crown centred on (0, y), `height` tall. */
function drawCrown(ctx: CanvasRenderingContext2D, y: number, height: number) {
  const h = height;
  const w = h * 1.45;
  const top = y - h / 2;
  const base = y + h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, base);
  ctx.lineTo(-w / 2, top + h * 0.22);
  ctx.lineTo(-w * 0.22, top + h * 0.5);
  ctx.lineTo(0, top + h * 0.08);
  ctx.lineTo(w * 0.22, top + h * 0.5);
  ctx.lineTo(w / 2, top + h * 0.22);
  ctx.lineTo(w * 0.42, base);
  ctx.closePath();
  ctx.shadowColor = 'rgba(58, 12, 44, 0.5)';
  ctx.shadowBlur = h * 0.15;
  ctx.fillStyle = goldFill(ctx, top, base);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, h * 0.05);
  ctx.strokeStyle = GLAM.paleGold;
  ctx.stroke();
  for (const [x, ty] of [
    [-w / 2, top + h * 0.22],
    [0, top + h * 0.08],
    [w / 2, top + h * 0.22],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, ty, h * 0.1, 0, TAU);
    ctx.fillStyle = GLAM.paleGold;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, base - h * 0.24, h * 0.1, 0, TAU);
  ctx.fillStyle = GLAM.hotPink;
  ctx.fill();
  ctx.restore();
}

function buildHub({ radius, view, photo }: HubOptions): HTMLCanvasElement {
  const canvas = createCanvas(radius * 2);
  const ctx = canvas.getContext('2d')!;
  const r = radius;
  const disc = r * HUB.disc;
  ctx.translate(r, r);

  // Pale outer line, gold ring
  ctx.save();
  ctx.shadowColor = 'rgba(58, 12, 44, 0.45)';
  ctx.shadowBlur = r * 0.05;
  ctx.beginPath();
  ctx.arc(0, 0, r * HUB.ring, 0, TAU);
  ctx.fillStyle = GLAM.paleGold;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r * HUB.gold, 0, TAU);
  ctx.fillStyle = goldFill(ctx, -r, r);
  ctx.fill();

  if (photo) {
    ctx.beginPath();
    ctx.arc(0, 0, disc, 0, TAU);
    ctx.fillStyle = GLAM.plum;
    ctx.fill();
    drawPhotoCover(ctx, photo, disc);
  } else {
    const pink = ctx.createRadialGradient(0, -disc * 0.35, disc * 0.05, 0, 0, disc);
    pink.addColorStop(0, '#f9b8d8');
    pink.addColorStop(0.6, GLAM.hotPink);
    pink.addColorStop(1, '#c42f7c');
    ctx.beginPath();
    ctx.arc(0, 0, disc, 0, TAU);
    ctx.fillStyle = pink;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, disc, 0, TAU);
  ctx.strokeStyle = 'rgba(140, 80, 10, 0.6)';
  ctx.lineWidth = Math.max(1, r * 0.015);
  ctx.stroke();

  // Wheel name in serif capitals
  const name = hubNameLayout(view?.name ?? '', measurer(ctx, SERIF_FONT, HUB_SPACING, HUB_WEIGHT), !photo);
  if (name.crown) drawCrown(ctx, name.crown.y * disc, name.crown.height * disc);
  if (name.size > 0) {
    const size = name.size * disc;
    ctx.font = font(size, SERIF_FONT, HUB_WEIGHT);
    setLetterSpacing(ctx, `${HUB_SPACING}em`);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const offset = inkOffset(ctx, 'H');
    ctx.shadowColor = 'rgba(30, 4, 22, 0.75)';
    ctx.shadowBlur = size * 0.35;
    ctx.shadowOffsetY = size * 0.05;
    ctx.fillStyle = '#ffffff';
    name.lines.forEach((line, i) => ctx.fillText(line, 0, name.ys[i]! * disc + offset));
    setLetterSpacing(ctx, '0px');
  }
  return canvas;
}

function buildGloss({ size, cx, cy, face: rf }: SceneGeometry): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(cx, cy, rf, 0, TAU);
  ctx.clip();
  const sheen = ctx.createRadialGradient(cx - rf * 0.3, cy - rf * 0.55, 0, cx - rf * 0.3, cy - rf * 0.55, rf);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

// ── Pointer ──────────────────────────────────────────────────────────────

let pointerSprite: { key: string; canvas: HTMLCanvasElement; x: number; y: number } | null = null;

/** Gold heart pointing down, with a pink $ coin; drawn once per size and reused every frame. */
function pointerCanvas(ro: number) {
  const key = String(ro);
  if (pointerSprite?.key === key) return pointerSprite;
  const margin = ro * 0.05;
  const left = (POINTER.lobeX + POINTER.lobe) * ro + margin;
  const top = (POINTER.lobe - POINTER.lobeY) * ro + margin;
  const canvas = createCanvas(left * 2, top + POINTER.tip * ro + margin * 1.4);
  const ctx = canvas.getContext('2d')!;
  ctx.translate(left, top);

  // Heart: two lobes and the tangents from the tip.
  const lobe = POINTER.lobe * ro;
  const lx = POINTER.lobeX * ro;
  const ly = POINTER.lobeY * ro;
  const tip = POINTER.tip * ro;
  const d = Math.hypot(lx, tip - ly);
  const toTip = Math.atan2(tip - ly, -lx);
  const tangent = toTip - Math.acos(lobe / d);
  const notch = Math.atan2(-Math.sqrt(lobe * lobe - lx * lx), -lx);
  ctx.beginPath();
  ctx.moveTo(0, tip);
  ctx.lineTo(lx + Math.cos(tangent) * lobe, ly + Math.sin(tangent) * lobe);
  ctx.arc(lx, ly, lobe, tangent, notch, true);
  ctx.arc(-lx, ly, lobe, Math.PI - notch, Math.PI - tangent, true);
  ctx.closePath();

  ctx.shadowColor = 'rgba(40, 4, 30, 0.5)';
  ctx.shadowBlur = ro * 0.03;
  ctx.shadowOffsetY = ro * 0.01;
  ctx.fillStyle = goldFill(ctx, ly - lobe, tip);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, ro * 0.012);
  ctx.strokeStyle = GLAM.paleGold;
  ctx.stroke();

  drawCoin(ctx, 0, 0, POINTER.coin * ro);
  pointerSprite = { key, canvas, x: left, y: top };
  return pointerSprite;
}

function drawPointer(ctx: CanvasRenderingContext2D, { cx, cy, rim: ro }: SceneGeometry, angle: number) {
  const sprite = pointerCanvas(ro);
  ctx.save();
  ctx.translate(cx, cy - ro * RIM.coinTrack);
  ctx.rotate(angle);
  ctx.drawImage(sprite.canvas, -sprite.x, -sprite.y);
  ctx.restore();
}

export const glam: WheelTheme = {
  id: 'glam',
  fonts: [font(40), font(40, SERIF_FONT), font(40, SERIF_FONT, HUB_WEIGHT)],
  layout: { centerY: 0.615, rimOuter: 0.37, face: 0.9, hub: GLAM_FACE.hub },
  hubRing: GLAM_FACE.hub,
  lights: {
    track: RIM.track,
    angles: Array.from({ length: COINS * PEARLS_PER_GAP }, (_, i) => {
      const gap = Math.floor(i / PEARLS_PER_GAP);
      return (gap + ((i % PEARLS_PER_GAP) + 1) / (PEARLS_PER_GAP + 1)) / COINS;
    }),
  },
  hubRotates: false,
  renderFace,
  buildRim,
  buildHub,
  buildGloss,
  buildLights,
  drawPointer,
  highlight: (tier, bust) => {
    if (bust) return { glow: '#ff4fa3', fill: '255, 70, 160', dim: 0.42 };
    const precious = tier === 'legendary' || tier === 'jackpot';
    return { glow: precious ? '#ffd54f' : '#fff1b0', fill: '255, 236, 170', dim: 0.34 };
  },
};
