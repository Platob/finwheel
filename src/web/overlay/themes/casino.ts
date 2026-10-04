/**
 * Casino look: gold rim with chasing marquee bulbs, emerald / bordeaux / onyx slices, Cinzel
 * lettering, compass-star hub and a ruby pointer.
 */
import { computeArcs, type Arc } from '../../../shared/geometry';
import { TIER_STYLES } from '../../../shared/tiers';
import type { Segment, WheelView } from '../../../shared/types';
import { createCanvas, drawPhotoCover, setLetterSpacing, slicePath, TAU, toRadians } from '../wheel-face';
import { sliceStyle, type SliceStyle } from './casino-palette';
import { evenAngles, type HubOptions, type SceneGeometry, type WheelTheme } from './types';

const DISPLAY_FONT = 'Cinzel';
const UI_FONT = 'Inter';
const BULBS = 32;

/** Proportions of the face, relative to its radius. */
const FACE = {
  textOuter: 0.86,
  textInner: 0.37,
  hubRing: 0.315,
  peg: 0.95,
} as const;

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
function renderFace(view: WheelView, radius: number): HTMLCanvasElement {
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

function buildRim({ size, cx, cy, rim: ro, face: rf }: SceneGeometry): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;

  // Soft floor shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = size * 0.045;
  ctx.shadowOffsetY = size * 0.014;
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, TAU);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  // Metallic gold ring
  const ring = ctx.createConicGradient(-Math.PI / 2, cx, cy);
  const stops = ['#8a6a1c', '#f3d27a', '#a77c22', '#fff1b8', '#8a6a1c', '#e7c35f', '#7a5a14', '#f8e3a0'];
  stops.forEach((color, i) => ring.addColorStop(i / stops.length, color));
  ring.addColorStop(1, stops[0]!);
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, TAU);
  ctx.arc(cx, cy, rf * 0.98, TAU, 0, true);
  ctx.fillStyle = ring;
  ctx.fill();

  // Bevel shading across the ring
  const bevel = ctx.createRadialGradient(cx, cy, rf, cx, cy, ro);
  bevel.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  bevel.addColorStop(0.12, 'rgba(255, 245, 210, 0.25)');
  bevel.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  bevel.addColorStop(0.88, 'rgba(255, 245, 210, 0.3)');
  bevel.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  ctx.fillStyle = bevel;
  ctx.fill();

  // Dark channel holding the bulbs
  const track = ro * casino.lights.track;
  const trackWidth = ro * 0.075;
  ctx.beginPath();
  ctx.arc(cx, cy, track + trackWidth / 2, 0, TAU);
  ctx.arc(cx, cy, track - trackWidth / 2, TAU, 0, true);
  const channel = ctx.createRadialGradient(cx, cy, track - trackWidth / 2, cx, cy, track + trackWidth / 2);
  channel.addColorStop(0, '#050403');
  channel.addColorStop(0.5, '#1d150a');
  channel.addColorStop(1, '#050403');
  ctx.fillStyle = channel;
  ctx.fill();

  const line = (radius: number, color: string, width: number) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const hair = Math.max(1, size * 0.0015);
  line(ro - hair / 2, 'rgba(255, 240, 200, 0.7)', hair);
  line(track + trackWidth / 2, 'rgba(255, 236, 170, 0.55)', hair);
  line(track - trackWidth / 2, 'rgba(255, 236, 170, 0.55)', hair);
  line(rf, 'rgba(20, 12, 0, 0.9)', hair * 2.5);

  // Diamonds between bulbs
  for (let i = 0; i < BULBS; i++) {
    const angle = ((i + 0.5) / BULBS) * TAU - Math.PI / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * track, cy + Math.sin(angle) * track);
    ctx.rotate(angle);
    ctx.beginPath();
    const d = ro * 0.012;
    ctx.moveTo(-d * 1.6, 0);
    ctx.lineTo(0, -d);
    ctx.lineTo(d * 1.6, 0);
    ctx.lineTo(0, d);
    ctx.closePath();
    ctx.fillStyle = '#c99a35';
    ctx.fill();
    ctx.restore();
  }
  return canvas;
}

function buildHub({ radius, photo }: HubOptions): HTMLCanvasElement {
  const canvas = createCanvas(radius * 2);
  const ctx = canvas.getContext('2d')!;
  const r = radius;
  ctx.translate(r, r);

  const gold = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
  gold.addColorStop(0, '#fff3c4');
  gold.addColorStop(0.45, '#d4af37');
  gold.addColorStop(0.85, '#8f6a1c');
  gold.addColorStop(1, '#5a420f');
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.98, 0, TAU);
  ctx.fillStyle = gold;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = r * 0.12;
  ctx.fill();
  ctx.shadowBlur = 0;

  const onyx = ctx.createRadialGradient(0, -r * 0.2, r * 0.1, 0, 0, r * 0.78);
  onyx.addColorStop(0, '#2a2a33');
  onyx.addColorStop(1, '#060608');
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, TAU);
  ctx.fillStyle = onyx;
  ctx.fill();
  if (photo) drawPhotoCover(ctx, photo, r * 0.78);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, TAU);
  ctx.strokeStyle = 'rgba(255, 236, 170, 0.6)';
  ctx.lineWidth = Math.max(1, r * 0.02);
  ctx.stroke();

  // Rivets
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88, r * 0.035, 0, TAU);
    ctx.fillStyle = '#fff1b8';
    ctx.fill();
  }
  if (photo) return canvas;

  // Compass star
  const star = (points: number, outer: number, inner: number, rotation: number) => {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radiusAt = i % 2 === 0 ? outer : inner;
      const a = rotation + (i / (points * 2)) * TAU;
      ctx.lineTo(Math.cos(a) * radiusAt, Math.sin(a) * radiusAt);
    }
    ctx.closePath();
  };
  const starGold = ctx.createLinearGradient(-r * 0.6, -r * 0.6, r * 0.6, r * 0.6);
  starGold.addColorStop(0, '#fff3c4');
  starGold.addColorStop(0.5, '#c99a35');
  starGold.addColorStop(1, '#f3dc8a');
  star(4, r * 0.42, r * 0.1, -Math.PI / 2 + Math.PI / 4);
  ctx.fillStyle = 'rgba(201, 154, 53, 0.55)';
  ctx.fill();
  star(4, r * 0.66, r * 0.12, -Math.PI / 2);
  ctx.fillStyle = starGold;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 25, 0, 0.6)';
  ctx.lineWidth = Math.max(1, r * 0.012);
  ctx.stroke();

  // Ruby centre stone
  const ruby = ctx.createRadialGradient(-r * 0.04, -r * 0.05, r * 0.01, 0, 0, r * 0.14);
  ruby.addColorStop(0, '#ff9db0');
  ruby.addColorStop(0.35, '#e0193f');
  ruby.addColorStop(1, '#4a000e');
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.13, 0, TAU);
  ctx.fillStyle = ruby;
  ctx.fill();
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = Math.max(1, r * 0.025);
  ctx.stroke();
  return canvas;
}

function buildGloss({ size, cx, cy, face: rf }: SceneGeometry): HTMLCanvasElement {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(cx, cy, rf, 0, TAU);
  ctx.clip();
  const sheen = ctx.createRadialGradient(
    cx - rf * 0.35,
    cy - rf * 0.5,
    0,
    cx - rf * 0.35,
    cy - rf * 0.5,
    rf * 1.1,
  );
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.13)');
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0.03)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function buildLights({ rim }: SceneGeometry): { on: HTMLCanvasElement; off: HTMLCanvasElement } {
  const radius = rim * 0.024;
  const glow = radius * 3.2;
  const size = Math.ceil(glow * 2);
  const c = size / 2;

  const off = createCanvas(size);
  let ctx = off.getContext('2d')!;
  let g = ctx.createRadialGradient(c - radius * 0.3, c - radius * 0.3, radius * 0.1, c, c, radius);
  g.addColorStop(0, '#9b7a3a');
  g.addColorStop(0.6, '#4d3812');
  g.addColorStop(1, '#1e1505');
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();

  const on = createCanvas(size);
  ctx = on.getContext('2d')!;
  g = ctx.createRadialGradient(c, c, 0, c, c, glow);
  g.addColorStop(0, 'rgba(255, 228, 160, 0.85)');
  g.addColorStop(0.3, 'rgba(255, 190, 80, 0.35)');
  g.addColorStop(1, 'rgba(255, 170, 40, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  g = ctx.createRadialGradient(c - radius * 0.25, c - radius * 0.25, 0, c, c, radius);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, '#fff0bf');
  g.addColorStop(1, '#f0b040');
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  return { on, off };
}

function drawPointer(ctx: CanvasRenderingContext2D, { size, cx, cy, rim: ro }: SceneGeometry, angle: number) {
  const w = ro * 0.085;
  const length = ro * 0.215;
  const pivotY = cy - ro - size * 0.004;

  ctx.save();
  ctx.translate(cx, pivotY);
  ctx.rotate(angle);

  const drop = (scale: number, offsetY: number) => {
    const r = w * scale;
    const tip = length * scale;
    const alpha = Math.acos(Math.min(1, r / tip));
    ctx.beginPath();
    ctx.moveTo(0, offsetY + tip);
    ctx.arc(0, offsetY, r, Math.PI / 2 - alpha, Math.PI / 2 + alpha, true);
    ctx.closePath();
  };

  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = ro * 0.03;
  ctx.shadowOffsetY = ro * 0.012;
  drop(1, 0);
  const gold = ctx.createLinearGradient(-w, 0, w, 0);
  gold.addColorStop(0, '#7a5a16');
  gold.addColorStop(0.3, '#f7e08a');
  gold.addColorStop(0.55, '#b8892a');
  gold.addColorStop(0.8, '#fff4c2');
  gold.addColorStop(1, '#8a6a1c');
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(60, 40, 5, 0.8)';
  ctx.lineWidth = Math.max(1, ro * 0.004);
  ctx.stroke();

  drop(0.68, w * 0.08);
  const ruby = ctx.createRadialGradient(-w * 0.2, -w * 0.1, w * 0.05, 0, w * 0.4, length * 0.7);
  ruby.addColorStop(0, '#ff8aa0');
  ruby.addColorStop(0.25, '#e0193f');
  ruby.addColorStop(0.7, '#8a0019');
  ruby.addColorStop(1, '#3d000b');
  ctx.fillStyle = ruby;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(-w * 0.18, -w * 0.12, w * 0.18, w * 0.1, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, w * 0.2, 0, TAU);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.strokeStyle = 'rgba(60, 40, 5, 0.9)';
  ctx.stroke();
  ctx.restore();
}

export const casino: WheelTheme = {
  id: 'casino',
  fonts: [`700 40px ${DISPLAY_FONT}`, `900 40px ${DISPLAY_FONT}`, `700 20px ${UI_FONT}`],
  layout: { centerY: 0.485, rimOuter: 0.44, face: 0.85, hub: 0.3 },
  hubRing: FACE.hubRing,
  lights: { track: 0.925, angles: evenAngles(BULBS) },
  hubRotates: true,
  renderFace,
  buildRim,
  buildHub,
  buildGloss,
  buildLights,
  drawPointer,
  highlight: (tier, bust) => ({
    glow: bust ? '#ff2d55' : TIER_STYLES[tier].accent,
    fill: bust ? '255, 40, 80' : '255, 200, 90',
    dim: 0.5,
  }),
};
