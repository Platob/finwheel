import { computeArcs, segmentAt, type Arc } from '../../shared/geometry';
import type { Tier } from '../../shared/schema';
import { TIER_STYLES } from '../../shared/tiers';
import type { WheelView } from '../../shared/types';
import { createCanvas, renderFace, slicePath, wheelSignature, FACE } from './wheel-face';

const TAU = Math.PI * 2;
const BULBS = 32;
const FADE_MS = 450;

/** Layout of the wheel inside the square canvas, relative to its size. */
const LAYOUT = {
  centerY: 0.485,
  rimOuter: 0.44,
  /** Face radius relative to the outer rim. */
  face: 0.85,
  hub: 0.3,
} as const;

interface Sprites {
  rim: HTMLCanvasElement;
  hub: HTMLCanvasElement;
  gloss: HTMLCanvasElement;
  bulbOn: HTMLCanvasElement;
  bulbOff: HTMLCanvasElement;
}

/**
 * Draws the complete wheel: shadow, gold rim with marquee bulbs, rotating face, hub,
 * glass sheen and the ruby pointer that flicks on every peg.
 */
export class WheelScene {
  /** Called whenever a peg passes the pointer while the wheel moves. */
  onTick: ((speed: number) => void) | null = null;

  private readonly ctx: CanvasRenderingContext2D;
  private size = 0;
  private dpr = 1;
  private sprites: Sprites | null = null;

  private view: WheelView | null = null;
  private signature = '';
  private arcs: Arc[] = [];
  private face: HTMLCanvasElement | null = null;
  private fading: { face: HTMLCanvasElement; rotation: number; start: number } | null = null;

  private rotation = 0;
  private lastSegment = -1;
  private velocity = 0;
  private lastFrame = 0;
  private lastRotationAt = 0;

  private pointerAngle = 0;
  private pointerVelocity = 0;

  private highlight: { index: number; start: number; tier: Tier; bust: boolean } | null = null;
  private celebrateUntil = 0;
  private bulbPhase = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(cssSize: number, dpr: number): void {
    const size = Math.round(cssSize * dpr);
    if (size === this.size && dpr === this.dpr) return;
    this.size = size;
    this.dpr = dpr;
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.style.width = `${cssSize}px`;
    this.canvas.style.height = `${cssSize}px`;
    this.sprites = size > 0 ? this.buildSprites() : null;
    this.face = this.view && size > 0 ? renderFace(this.view, this.faceRadius) : null;
    this.fading = null;
  }

  /** Re-renders text after web fonts finish loading. */
  refresh(): void {
    if (this.view && this.size > 0) this.face = renderFace(this.view, this.faceRadius);
  }

  setWheel(view: WheelView, now = performance.now()): void {
    const signature = wheelSignature(view);
    if (signature === this.signature) return;
    const sameWheel = this.view?.key === view.key;
    if (this.face && !sameWheel) this.fading = { face: this.face, rotation: this.rotation, start: now };
    this.view = view;
    this.signature = signature;
    this.arcs = computeArcs(
      view.segments.map((s) => s.weight),
      view.sizing,
    );
    this.face = this.size > 0 ? renderFace(view, this.faceRadius) : null;
    this.lastSegment = -1;
  }

  /** Sets the wheel rotation (turns). With `animated`, pegs flick the pointer and fire `onTick`. */
  setRotation(rotation: number, now = performance.now(), animated = false): void {
    const dt = (now - this.lastRotationAt) / 1000;
    if (animated && dt > 0 && dt < 0.25) {
      this.velocity = (rotation - this.rotation) / dt;
    } else if (!animated) {
      this.velocity = 0;
    }
    this.lastRotationAt = now;
    this.rotation = rotation;

    if (this.arcs.length < 2) return;
    const index = segmentAt(this.arcs, rotation);
    if (animated && this.lastSegment >= 0 && index !== this.lastSegment) {
      const speed = Math.min(1, Math.abs(this.velocity) / 2.5);
      // A peg pushes the pointer tip sideways; stronger kicks when the wheel is slow (more contact).
      this.pointerVelocity -= 9 + (1 - speed) * 6;
      this.onTick?.(speed);
    }
    this.lastSegment = index;
  }

  setHighlight(index: number | null, tier: Tier = 'common', bust = false, now = performance.now()): void {
    this.highlight = index === null ? null : { index, start: now, tier, bust };
  }

  celebrate(durationMs: number, now = performance.now()): void {
    this.celebrateUntil = now + durationMs;
  }

  /** Centre of the wheel in CSS pixels relative to the canvas. */
  get center(): { x: number; y: number; radius: number } {
    const css = this.size / this.dpr;
    return { x: css / 2, y: css * LAYOUT.centerY, radius: css * LAYOUT.rimOuter };
  }

  draw(now: number): void {
    const { ctx, size, sprites } = this;
    if (!sprites || size === 0) return;
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (now - this.lastRotationAt > 120) this.velocity *= 0.8;
    this.stepPointer(dt);

    const cx = size / 2;
    const cy = size * LAYOUT.centerY;
    const rf = this.faceRadius;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(sprites.rim, 0, 0);

    // Rotating face (cross-fading when the wheel changes)
    ctx.save();
    ctx.translate(cx, cy);
    const fadeProgress = this.fading ? Math.min(1, (now - this.fading.start) / FADE_MS) : 1;
    if (this.fading) {
      ctx.save();
      ctx.rotate(this.fading.rotation * TAU);
      ctx.globalAlpha = 1 - fadeProgress;
      ctx.drawImage(this.fading.face, -rf, -rf, rf * 2, rf * 2);
      ctx.restore();
      if (fadeProgress >= 1) this.fading = null;
    }
    ctx.rotate(this.rotation * TAU);
    if (this.face) {
      ctx.globalAlpha = fadeProgress;
      ctx.drawImage(this.face, -rf, -rf, rf * 2, rf * 2);
      ctx.globalAlpha = 1;
    }
    this.drawHighlight(now, rf);
    const hub = rf * LAYOUT.hub;
    ctx.drawImage(sprites.hub, -hub, -hub, hub * 2, hub * 2);
    ctx.restore();

    ctx.drawImage(sprites.gloss, 0, 0);
    this.drawBulbs(now, dt);
    this.drawPointer();
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private get rimRadius(): number {
    return this.size * LAYOUT.rimOuter;
  }

  private get faceRadius(): number {
    return this.rimRadius * LAYOUT.face;
  }

  private stepPointer(dt: number): void {
    if (dt <= 0) return;
    // Damped spring back to rest.
    const stiffness = 260;
    const damping = 16;
    this.pointerVelocity += (-stiffness * this.pointerAngle - damping * this.pointerVelocity) * dt;
    this.pointerAngle += this.pointerVelocity * dt;
    this.pointerAngle = Math.max(-0.55, Math.min(0.12, this.pointerAngle));
  }

  private drawHighlight(now: number, rf: number): void {
    const highlight = this.highlight;
    const arc = highlight ? this.arcs[highlight.index] : undefined;
    if (!highlight || !arc) return;
    const { ctx } = this;
    const fade = Math.min(1, (now - highlight.start) / 500);
    const pulse = 0.5 + 0.5 * Math.sin((now - highlight.start) / 180);
    const glow = highlight.bust ? '#ff2d55' : TIER_STYLES[highlight.tier].accent;

    // Dim every other slice.
    if (this.arcs.length > 1) {
      ctx.beginPath();
      ctx.moveTo(rf, 0);
      ctx.arc(0, 0, rf, 0, TAU);
      slicePath(ctx, arc, 0, rf, false);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * fade})`;
      ctx.fill('evenodd');
    }

    ctx.save();
    slicePath(ctx, arc, rf * FACE.hubRing, rf);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = highlight.bust
      ? `rgba(255, 40, 80, ${(0.04 + 0.06 * pulse) * fade})`
      : `rgba(255, 200, 90, ${(0.03 + 0.06 * pulse) * fade})`;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = glow;
    ctx.shadowBlur = rf * (0.04 + 0.04 * pulse);
    ctx.strokeStyle = glow;
    ctx.globalAlpha = fade;
    ctx.lineWidth = rf * 0.014;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  private drawBulbs(now: number, dt: number): void {
    const { ctx, sprites } = this;
    if (!sprites) return;
    const t = now / 1000;
    const celebrating = now < this.celebrateUntil;
    const speed = Math.abs(this.velocity);
    // Chase speed in bulbs per second follows the wheel.
    this.bulbPhase += dt * (celebrating ? 0 : 3 + speed * 18);

    const cx = this.size / 2;
    const cy = this.size * LAYOUT.centerY;
    const track = this.rimRadius * 0.925;
    const bulb = sprites.bulbOn.width / 2;
    const flash = Math.floor(t * 6) % 2;
    const settled = this.highlight !== null && !celebrating;

    for (let i = 0; i < BULBS; i++) {
      const angle = (i / BULBS) * TAU - Math.PI / 2;
      const x = cx + Math.cos(angle) * track;
      const y = cy + Math.sin(angle) * track;
      let on: number;
      if (celebrating) {
        on = i % 2 === flash ? 1 : 0.15;
      } else if (settled) {
        on = 0.75 + 0.25 * Math.sin(t * 3 + i * 0.6);
      } else {
        const d = (((this.bulbPhase - i) % 4) + 4) % 4;
        on = d < 1 ? 1 : Math.max(0.12, 1 - (d - 1) * 0.55);
      }
      ctx.drawImage(sprites.bulbOff, x - bulb, y - bulb);
      if (on > 0.13) {
        ctx.globalAlpha = on;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sprites.bulbOn, x - bulb, y - bulb);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawPointer(): void {
    const { ctx } = this;
    const ro = this.rimRadius;
    const w = ro * 0.085;
    const length = ro * 0.215;
    const pivotY = this.size * LAYOUT.centerY - ro - this.size * 0.004;

    ctx.save();
    ctx.translate(this.size / 2, pivotY);
    ctx.rotate(this.pointerAngle);

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

  private buildSprites(): Sprites {
    return {
      rim: this.buildRim(),
      hub: this.buildHub(Math.round(this.faceRadius * LAYOUT.hub)),
      gloss: this.buildGloss(),
      ...this.buildBulbs(),
    };
  }

  private buildRim(): HTMLCanvasElement {
    const canvas = createCanvas(this.size);
    const ctx = canvas.getContext('2d')!;
    const cx = this.size / 2;
    const cy = this.size * LAYOUT.centerY;
    const ro = this.rimRadius;
    const rf = this.faceRadius;

    // Soft floor shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = this.size * 0.045;
    ctx.shadowOffsetY = this.size * 0.014;
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
    const track = ro * 0.925;
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
    const hair = Math.max(1, this.size * 0.0015);
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

  private buildHub(radius: number): HTMLCanvasElement {
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

  private buildGloss(): HTMLCanvasElement {
    const canvas = createCanvas(this.size);
    const ctx = canvas.getContext('2d')!;
    const cx = this.size / 2;
    const cy = this.size * LAYOUT.centerY;
    const rf = this.faceRadius;
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
    ctx.fillRect(0, 0, this.size, this.size);
    return canvas;
  }

  private buildBulbs(): { bulbOn: HTMLCanvasElement; bulbOff: HTMLCanvasElement } {
    const radius = this.rimRadius * 0.024;
    const glow = radius * 3.2;
    const size = Math.ceil(glow * 2);
    const c = size / 2;

    const bulbOff = createCanvas(size);
    let ctx = bulbOff.getContext('2d')!;
    let g = ctx.createRadialGradient(c - radius * 0.3, c - radius * 0.3, radius * 0.1, c, c, radius);
    g.addColorStop(0, '#9b7a3a');
    g.addColorStop(0.6, '#4d3812');
    g.addColorStop(1, '#1e1505');
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();

    const bulbOn = createCanvas(size);
    ctx = bulbOn.getContext('2d')!;
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
    return { bulbOn, bulbOff };
  }
}
