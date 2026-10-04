import { computeArcs, segmentAt, type Arc } from '../../shared/geometry';
import type { Tier } from '../../shared/schema';
import type { WheelView } from '../../shared/types';
import type { SceneGeometry, WheelTheme } from './themes/types';
import { createCanvas, slicePath, TAU, wheelSignature } from './wheel-face';

const FADE_MS = 450;
/** Cross-fade between two centre photos. */
const PHOTO_FADE_MS = 700;
/** Longest side of a centre photo once scaled down (keeps hub rebuilds cheap). */
const PHOTO_MAX_SIDE = 768;

/** Wheel placement relative to the canvas size: centre height and outer rim radius. */
export interface Framing {
  centerY: number;
  rimOuter: number;
}

interface Sprites {
  rim: HTMLCanvasElement;
  gloss: HTMLCanvasElement | null;
  lightOn: HTMLCanvasElement;
  lightOff: HTMLCanvasElement;
}

/**
 * Draws the complete wheel: rim with marquee lights, rotating face, hub (with optional centre
 * photos), sheen and the pointer that flicks on every peg. The theme paints every part.
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

  /** Photos scaled down once; one hub sprite per photo (or a single photo-less hub). */
  private photos: HTMLCanvasElement[] = [];
  private photoMs = 8000;
  private hubs: HTMLCanvasElement[] = [];

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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private theme: WheelTheme,
    /** Overrides where the theme places the wheel (e.g. centred, without the overlay's signs). */
    private readonly framing: Framing | null = null,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  get themeId(): WheelTheme['id'] {
    return this.theme.id;
  }

  setTheme(theme: WheelTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.fading = null;
    this.rebuild();
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
    this.fading = null;
    this.rebuild();
  }

  /** Re-renders text after web fonts finish loading. */
  refresh(): void {
    if (this.size === 0) return;
    if (this.view) this.face = this.theme.renderFace(this.view, this.geometry.face);
    this.buildHubs();
  }

  setWheel(view: WheelView, now = performance.now()): void {
    const signature = wheelSignature(view);
    if (signature === this.signature) return;
    const sameWheel = this.view?.key === view.key;
    if (this.face && !sameWheel) this.fading = { face: this.face, rotation: this.rotation, start: now };
    const renamed = this.view?.name !== view.name;
    this.view = view;
    this.signature = signature;
    this.arcs = computeArcs(
      view.segments.map((s) => s.weight),
      view.sizing,
    );
    this.face = this.size > 0 ? this.theme.renderFace(view, this.geometry.face) : null;
    if (renamed) this.buildHubs();
    this.lastSegment = -1;
  }

  /** Centre photos, shown one after the other (`seconds` each). An empty list shows the theme's hub. */
  setHubPhotos(photos: readonly HTMLImageElement[], seconds: number): void {
    this.photoMs = Math.max(1, seconds) * 1000;
    this.photos = photos.map(scaleDown);
    this.buildHubs();
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
    const { centerY, rimOuter } = this.framing ?? this.theme.layout;
    return { x: css / 2, y: css * centerY, radius: css * rimOuter };
  }

  draw(now: number): void {
    const { ctx, size, sprites, theme } = this;
    if (!sprites || size === 0) return;
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    if (now - this.lastRotationAt > 120) this.velocity *= 0.8;
    this.stepPointer(dt);

    const g = this.geometry;
    const rf = g.face;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(sprites.rim, 0, 0);

    // Rotating face (cross-fading when the wheel changes)
    ctx.save();
    ctx.translate(g.cx, g.cy);
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
    if (theme.hubRotates) this.drawHub(now, g.hub);
    ctx.restore();

    if (!theme.hubRotates) {
      ctx.save();
      ctx.translate(g.cx, g.cy);
      this.drawHub(now, g.hub);
      ctx.restore();
    }

    if (sprites.gloss) ctx.drawImage(sprites.gloss, 0, 0);
    this.drawLights(now, dt);
    theme.drawPointer(ctx, g, this.pointerAngle);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private get geometry(): SceneGeometry {
    const { face, hub } = this.theme.layout;
    const { centerY, rimOuter } = this.framing ?? this.theme.layout;
    const rim = this.size * rimOuter;
    return {
      size: this.size,
      cx: this.size / 2,
      cy: this.size * centerY,
      rim,
      face: rim * face,
      hub: rim * face * hub,
    };
  }

  private rebuild(): void {
    if (this.size === 0) {
      this.sprites = null;
      this.face = null;
      this.hubs = [];
      return;
    }
    const g = this.geometry;
    const lights = this.theme.buildLights(g);
    this.sprites = {
      rim: this.theme.buildRim(g),
      gloss: this.theme.buildGloss(g),
      lightOn: lights.on,
      lightOff: lights.off,
    };
    this.face = this.view ? this.theme.renderFace(this.view, g.face) : null;
    this.buildHubs();
  }

  private buildHubs(): void {
    if (this.size === 0) return;
    const radius = Math.round(this.geometry.hub);
    const photos = this.photos.length > 0 ? this.photos : [null];
    this.hubs = photos.map((photo) => this.theme.buildHub({ radius, view: this.view, photo }));
  }

  private drawHub(now: number, hub: number): void {
    const { ctx, hubs } = this;
    if (hubs.length === 0) return;
    const draw = (sprite: HTMLCanvasElement, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, -hub, -hub, hub * 2, hub * 2);
      ctx.globalAlpha = 1;
    };
    if (hubs.length === 1) return draw(hubs[0]!, 1);
    const slot = Math.floor(now / this.photoMs);
    const fade = Math.min(1, (now - slot * this.photoMs) / PHOTO_FADE_MS);
    const current = hubs[slot % hubs.length]!;
    if (fade < 1) draw(hubs[(slot - 1 + hubs.length) % hubs.length]!, 1);
    draw(current, fade);
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
    const style = this.theme.highlight(highlight.tier, highlight.bust);

    // Dim every other slice.
    if (this.arcs.length > 1) {
      ctx.beginPath();
      ctx.moveTo(rf, 0);
      ctx.arc(0, 0, rf, 0, TAU);
      slicePath(ctx, arc, 0, rf, false);
      ctx.fillStyle = `rgba(${style.shade ?? '0, 0, 0'}, ${style.dim * fade})`;
      ctx.fill('evenodd');
    }

    ctx.save();
    slicePath(ctx, arc, rf * this.theme.hubRing, rf);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${style.fill}, ${(0.03 + 0.06 * pulse) * fade})`;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = style.glow;
    ctx.shadowBlur = rf * (0.04 + 0.04 * pulse);
    ctx.strokeStyle = style.glow;
    ctx.globalAlpha = fade;
    ctx.lineWidth = rf * 0.014;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  private drawLights(now: number, dt: number): void {
    const { ctx, sprites } = this;
    if (!sprites) return;
    const t = now / 1000;
    const celebrating = now < this.celebrateUntil;
    const speed = Math.abs(this.velocity);
    // Chase speed in lights per second follows the wheel.
    this.bulbPhase += dt * (celebrating ? 0 : 3 + speed * 18);

    const { cx, cy, rim } = this.geometry;
    const track = rim * this.theme.lights.track;
    const half = sprites.lightOn.width / 2;
    const flash = Math.floor(t * 6) % 2;
    const settled = this.highlight !== null && !celebrating;

    this.theme.lights.angles.forEach((turns, i) => {
      const angle = turns * TAU - Math.PI / 2;
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
      ctx.drawImage(sprites.lightOff, x - half, y - half);
      if (on > 0.13) {
        ctx.globalAlpha = on;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sprites.lightOn, x - half, y - half);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    });
  }
}

/** Copies a (possibly huge) photo into a canvas whose longest side is at most PHOTO_MAX_SIDE. */
function scaleDown(photo: HTMLImageElement): HTMLCanvasElement {
  const w = photo.naturalWidth || 1;
  const h = photo.naturalHeight || 1;
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h));
  const canvas = createCanvas(w * scale, h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  return canvas;
}
