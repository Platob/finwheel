import type { Arc } from '../../shared/geometry';
import type { WheelView } from '../../shared/types';

export const TAU = Math.PI * 2;

/** Turns (clockwise from 12 o'clock) → canvas radians (clockwise from 3 o'clock). */
export const toRadians = (turns: number): number => turns * TAU - Math.PI / 2;

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

export function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = value;
}

/** Draws `photo` scaled to cover a circle of radius `r` centred on the origin (clipped). */
export function drawPhotoCover(ctx: CanvasRenderingContext2D, photo: HTMLCanvasElement, r: number): void {
  const w = photo.width;
  const h = photo.height;
  if (!w || !h) return;
  const scale = (2 * r) / Math.min(w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();
  // Portraits keep the upper part in view, where faces usually are.
  const dw = w * scale;
  const dh = h * scale;
  const dy = h > w ? -r - (dh - 2 * r) * 0.18 : -dh / 2;
  ctx.drawImage(photo, -dw / 2, dy, dw, dh);
  ctx.restore();
}

export function wheelSignature(view: WheelView): string {
  return JSON.stringify([view.key, view.name, view.sizing, view.segments]);
}
