import { computeArcs, type Arc } from '../../shared/geometry';
import type { Segment, WheelView } from '../../shared/types';
import { sliceStyle, type SliceStyle } from './palette';

const TAU = Math.PI * 2;
export const DISPLAY_FONT = 'Cinzel';
export const UI_FONT = 'Inter';

/** Turns (clockwise from 12 o'clock) → canvas radians (clockwise from 3 o'clock). */
export const toRadians = (turns: number): number => turns * TAU - Math.PI / 2;

/** Proportions of the face, relative to its radius. */
export const FACE = {
  textOuter: 0.86,
  textInner: 0.37,
  hubRing: 0.315,
  peg: 0.95,
} as const;

export function createCanvas(width: number, height = width): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Adds a slice (or ring segment) sub-path. Pass `begin = false` to append to the current path. */
export function slicePath(
  ctx: CanvasRenderingContext2D,
  arc: Arc,
  inner: number,
  outer: number,
  begin = true,
): void {
  if (begin) ctx.beginPath();
  if (arc.end - arc.start >= 0.9999) {
    ctx.moveTo(outer, 0);
    ctx.arc(0, 0, outer, 0, TAU);
    if (inner > 0) {
      ctx.moveTo(inner, 0);
      ctx.arc(0, 0, inner, TAU, 0, true);
    }
    return;
  }
  const a0 = toRadians(arc.start);
  const a1 = toRadians(arc.end);
  if (inner > 0) {
    ctx.moveTo(Math.cos(a0) * outer, Math.sin(a0) * outer);
    ctx.arc(0, 0, outer, a0, a1);
    ctx.arc(0, 0, inner, a1, a0, true);
  } else {
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, outer, a0, a1);
  }
  ctx.closePath();
}

function goldGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#8f6a1c');
  g.addColorStop(0.25, '#f3dc8a');
  g.addColorStop(0.5, '#b8892a');
  g.addColorStop(0.72, '#fff3c4');
  g.addColorStop(1, '#9a7420');
  return g;
}

function fitLabel(ctx: CanvasRenderingContext2D, label: string, arc: Arc, r: number) {
  const span = Math.min(arc.end - arc.start, 0.5) * TAU;
  const maxLength = (FACE.textOuter - FACE.textInner) * r;
  // Font height is limited by the slice's chord around the middle of the label area.
  const chord = 2 * r * 0.6 * Math.sin(span / 2);
  let size = Math.min(r * 0.085, chord * 0.62);
  const min = Math.max(9, r * 0.028);
  if (size < min) return null;

  ctx.font = `700 ${size}px ${DISPLAY_FONT}`;
  let width = ctx.measureText(label).width;
  if (width > maxLength) {
    // Small safety margin: glyph metrics do not scale perfectly linearly.
    size = Math.max(min, size * (maxLength / width) * 0.97);
    ctx.font = `700 ${size}px ${DISPLAY_FONT}`;
    width = ctx.measureText(label).width;
  }
  let text = label;
  while (width > maxLength && text.length > 1) {
    text = text.slice(0, -1);
    width = ctx.measureText(`${text.trimEnd()}…`).width;
  }
  return { text: text === label ? label : `${text.trimEnd()}…`, size };
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = value;
}

/** Money slice: a large amount at the rim and a small caption toward the hub. Returns false if it can't fit. */
function drawAmount(ctx: CanvasRenderingContext2D, segment: Segment, arc: Arc, r: number, style: SliceStyle) {
  const amount = segment.amount!;
  const span = Math.min(arc.end - arc.start, 0.5) * TAU;
  const chordAt = (radius: number) => 2 * radius * Math.sin(span / 2);
  const outer = r * FACE.textOuter;
  const min = Math.max(9, r * 0.03);

  let size = Math.min(r * 0.135, chordAt(r * 0.72) * 0.72);
  if (size < min) return false;
  ctx.font = `900 ${size}px ${DISPLAY_FONT}`;
  let width = ctx.measureText(amount).width;
  const maxAmount = r * 0.4;
  if (width > maxAmount) {
    size *= (maxAmount / width) * 0.97;
    if (size < min) return false;
    ctx.font = `900 ${size}px ${DISPLAY_FONT}`;
    width = ctx.measureText(amount).width;
  }

  const shadow = () => {
    if (style.metallic) return;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = size * 0.2;
    ctx.shadowOffsetY = size * 0.05;
  };
  shadow();
  ctx.fillStyle = style.text;
  ctx.fillText(amount, outer, size * 0.06);

  const caption = segment.caption?.toUpperCase();
  if (!caption) return true;
  const gap = r * 0.03;
  const right = outer - width - gap;
  const room = right - r * FACE.textInner;
  let captionSize = Math.min(r * 0.045, chordAt(r * 0.45) * 0.5, size * 0.45);
  if (captionSize < 7 || room < r * 0.06) return true;
  ctx.font = `700 ${captionSize}px ${UI_FONT}`;
  setLetterSpacing(ctx, '0.12em');
  const captionWidth = ctx.measureText(caption).width;
  if (captionWidth > room) {
    captionSize *= (room / captionWidth) * 0.97;
    ctx.font = `700 ${captionSize}px ${UI_FONT}`;
  }
  if (captionSize >= 7) {
    ctx.globalAlpha = 0.85;
    ctx.fillText(caption, right, captionSize * 0.05);
    ctx.globalAlpha = 1;
  }
  setLetterSpacing(ctx, '0px');
  return true;
}

/** Renders the rotating part of the wheel (slices, labels, pegs) into an offscreen canvas. */
export function renderFace(view: WheelView, radius: number): HTMLCanvasElement {
  const canvas = createCanvas(radius * 2);
  const ctx = canvas.getContext('2d')!;
  const r = radius;
  ctx.translate(r, r);

  const segments = view.segments;
  const arcs = computeArcs(
    segments.map((s) => s.weight),
    view.sizing,
  );

  if (segments.length === 0) {
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    g.addColorStop(0, '#08080b');
    g.addColorStop(1, '#1a1a21');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#9d9480';
    ctx.font = `600 ${r * 0.07}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(view.kind === 'raffle' ? 'Awaiting entrants' : 'No prizes left', 0, -r * 0.58);
    return canvas;
  }

  // Slices
  segments.forEach((segment, i) => {
    const arc = arcs[i]!;
    const style = sliceStyle(segment, i, segments.length);
    slicePath(ctx, arc, 0, r);
    if (style.metallic) {
      const mid = toRadians((arc.start + arc.end) / 2);
      const nx = Math.cos(mid + Math.PI / 2) * r;
      const ny = Math.sin(mid + Math.PI / 2) * r;
      ctx.fillStyle = goldGradient(ctx, -nx * 0.3, -ny * 0.3, nx * 0.3, ny * 0.3);
      ctx.fill();
      const shade = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
      shade.addColorStop(0, 'rgba(60, 35, 0, 0.55)');
      shade.addColorStop(0.6, 'rgba(60, 35, 0, 0.05)');
      shade.addColorStop(1, 'rgba(255, 240, 190, 0.25)');
      ctx.fillStyle = shade;
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r);
      g.addColorStop(0, style.inner);
      g.addColorStop(0.68, style.base);
      g.addColorStop(1, style.edge);
      ctx.fillStyle = g;
      ctx.fill();
    }
    if (style.inlay) {
      ctx.save();
      slicePath(ctx, arc, 0, r);
      ctx.clip();
      slicePath(ctx, arc, r * FACE.hubRing, r);
      ctx.strokeStyle = style.inlay;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = r * 0.016;
      ctx.stroke();
      ctx.restore();
    }
  });

  // Art-deco pinstripes
  for (const [radiusRatio, alpha] of [
    [0.9, 0.45],
    [0.885, 0.2],
    [0.37, 0.35],
  ] as const) {
    ctx.beginPath();
    ctx.arc(0, 0, r * radiusRatio, 0, TAU);
    ctx.strokeStyle = `rgba(243, 220, 138, ${alpha})`;
    ctx.lineWidth = Math.max(1, r * 0.004);
    ctx.stroke();
  }

  // Gold separators
  if (segments.length > 1) {
    for (const arc of arcs) {
      const a = toRadians(arc.start);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cos * r * FACE.hubRing, sin * r * FACE.hubRing);
      ctx.lineTo(cos * r, sin * r);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = r * 0.016;
      ctx.stroke();
      ctx.strokeStyle = goldGradient(ctx, 0, 0, cos * r, sin * r);
      ctx.lineWidth = r * 0.0075;
      ctx.stroke();
    }
  }

  // Labels and tier gems
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  segments.forEach((segment, i) => {
    const arc = arcs[i]!;
    const style = sliceStyle(segment, i, segments.length);
    const fit = fitLabel(ctx, segment.label, arc, r);
    ctx.save();
    ctx.rotate(toRadians((arc.start + arc.end) / 2));
    if (segment.amount && drawAmount(ctx, segment, arc, r, style)) {
      ctx.restore();
      return;
    }
    if (fit) {
      ctx.font = `700 ${fit.size}px ${DISPLAY_FONT}`;
      if (!style.metallic) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = fit.size * 0.25;
        ctx.shadowOffsetY = fit.size * 0.06;
      }
      ctx.fillStyle = style.text;
      ctx.fillText(fit.text, r * FACE.textOuter, fit.size * 0.04);
    }
    ctx.restore();
  });

  // Pegs on every boundary
  if (segments.length > 1 && segments.length <= 120) {
    const pegRadius = r * Math.min(0.022, 0.6 / segments.length + 0.008);
    for (const arc of arcs) {
      const a = toRadians(arc.start);
      const x = Math.cos(a) * r * FACE.peg;
      const y = Math.sin(a) * r * FACE.peg;
      const g = ctx.createRadialGradient(
        x - pegRadius * 0.3,
        y - pegRadius * 0.3,
        pegRadius * 0.1,
        x,
        y,
        pegRadius,
      );
      g.addColorStop(0, '#fff6d0');
      g.addColorStop(0.5, '#d4af37');
      g.addColorStop(1, '#6b4f12');
      ctx.beginPath();
      ctx.arc(x, y, pegRadius, 0, TAU);
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = pegRadius;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // Inner shadow at the rim for depth
  const vignette = ctx.createRadialGradient(0, 0, r * 0.75, 0, 0, r);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = vignette;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  return canvas;
}

export function wheelSignature(view: WheelView): string {
  return JSON.stringify([view.key, view.sizing, view.segments]);
}
