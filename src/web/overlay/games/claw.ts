/**
 * Loser Claw: a neon claw machine. The claw roams the rail with a few fake-outs, drops on a capsule
 * holding the server's prize, lifts it (a slip scare, but it holds), drops it in the chute, and the
 * capsule pops out of the prize door and opens in front of the glass with the prize big and centred.
 */
import type { Tier } from '../../../shared/schema';
import type { Segment, WheelView } from '../../../shared/types';
import type { SoundBoard } from '../audio';
import type { PrizeStyle, WheelTheme } from '../themes/types';
import { createCanvas, TAU, wheelSignature } from '../wheel-face';
import {
  CABINET,
  clamp,
  clawFrame,
  depthScale,
  easeOutBack,
  fitLines,
  hashString,
  idleFrame,
  layoutPile,
  lerp,
  mixColor,
  pickTarget,
  planClaw,
  withAlpha,
  type ClawFrame,
  type ClawScript,
  type Pile,
  type PileCapsule,
} from './claw-math';
import {
  capsuleLabel,
  drawCapsule,
  drawSprite,
  drawStar,
  heartPath,
  makeSprite,
  measurer,
  prizeText,
  roundRect,
  scaleDown,
  sticker,
  type Sprite,
  type TextStyle,
} from './claw-paint';
import {
  alertSprite,
  ballSprite,
  BUTTON,
  carriageSprite,
  DOOR,
  glowSprite,
  hubSprite,
  lightPositions,
  lightSprites,
  paintBack,
  paintFront,
  paintNeon,
  POSTER,
  posterSprite,
  raysSprite,
  STICK,
} from './claw-cabinet';
import { playClawSound } from './claw-sounds';
import { playArea, type GameStage, type PlayPlan, type StageContext } from './types';

/** Extra room around the play area in the cached layers (units). */
const MARGIN = 0.08;
/** Rail and cable notches that click (units), and the fastest the clicks may come. */
const RAIL_NOTCH = 0.045;
const CABLE_NOTCH = 0.06;
const TICK_GAP_MS = 40;
/** Sounds older than this are skipped (an overlay joining late stays quiet). */
const LATE_SOUND_MS = 250;
const PHOTO_FADE_MS = 700;
/** The cable leaves the carriage this far below the rail. */
const PIVOT_DROP = 0.07;

interface Art {
  /** Pixels per unit and the play-area centre (canvas pixels). */
  u: number;
  cx: number;
  cy: number;
  /** Top-left corner of the full-size layers (canvas pixels). */
  ox: number;
  oy: number;
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  neon: HTMLCanvasElement;
  /** One sprite per depth row, and its centre. */
  rows: { sprite: Sprite; x: number; y: number }[];
  /** One capsule per prize, at the front-row size. */
  capsules: Sprite[];
  posters: Sprite[];
  empty: Sprite | null;
  hub: Sprite;
  carriage: Sprite;
  ball: Sprite;
  lightOn: Sprite;
  lightOff: Sprite;
  lights: { x: number; y: number }[];
  rays: Sprite;
  glow: Sprite;
  /** "!!" burst for the slip scare. */
  alert: Sprite;
  /** Claw proportions: size, hub radius, front-row capsule radius. */
  claw: { c: number; hub: number; r: number };
}

interface Reveal {
  closed: Sprite;
  top: Sprite;
  bottom: Sprite;
  prize: Sprite;
}

interface Game {
  plan: PlayPlan;
  startedAt: number;
  script: ClawScript;
  /** Index of the grabbed capsule in the pile (-1 when the pile is empty). */
  target: number;
  /** Its depth row drawn without it, once it has been grabbed. */
  rowWithout: Sprite | null;
  reveal: Reveal | null;
  /** Elapsed time of the last update, for sounds and clicks. */
  lastT: number;
  notch: number;
}

export class ClawStage implements GameStage {
  onTick: ((speed: number) => void) | null = null;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly sound: SoundBoard;
  private theme: WheelTheme;
  private size = 0;
  private dpr = 1;

  private view: WheelView | null = null;
  private signature = '';
  private pile: Pile = { diameter: 0.2, rows: 0, capsules: [] };
  private art: Art | null = null;
  private game: Game | null = null;

  private photos: HTMLCanvasElement[] = [];
  private photoMs = 8000;
  private highlight: { index: number; tier: Tier; bust: boolean; start: number } | null = null;
  private celebrateUntil = 0;
  private lastTickAt = 0;

  constructor({ canvas, theme, sound }: StageContext) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.theme = theme;
    this.sound = sound;
  }

  get center(): { x: number; y: number; radius: number } {
    const { cx, cy, half } = playArea(this.theme, this.size || 1);
    const k = 1 / this.dpr;
    if (this.game) {
      return {
        x: (cx + CABINET.revealX * half) * k,
        y: (cy + CABINET.revealY * half) * k,
        radius: CABINET.revealR * half * k,
      };
    }
    return { x: cx * k, y: (cy - 0.2 * half) * k, radius: 0.5 * half * k };
  }

  resize(cssSize: number, dpr: number): void {
    const size = Math.round(cssSize * dpr);
    if (size === this.size && dpr === this.dpr) return;
    this.size = size;
    this.dpr = dpr;
    if (this.canvas.width !== size) this.canvas.width = size;
    if (this.canvas.height !== size) this.canvas.height = size;
    this.canvas.style.width = `${cssSize}px`;
    this.canvas.style.height = `${cssSize}px`;
    this.rebuild();
  }

  refresh(): void {
    this.rebuild();
  }

  setTheme(theme: WheelTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.rebuild();
  }

  setPhotos(photos: readonly HTMLImageElement[], seconds: number): void {
    this.photoMs = Math.max(1, seconds) * 1000;
    this.photos = photos.map(scaleDown);
    this.rebuild();
  }

  show(view: WheelView, _rotation: number, _now: number): void {
    this.game = null;
    this.setView(view);
  }

  play(plan: PlayPlan, startedAt: number, now: number): void {
    this.game = null;
    this.setView(plan.wheel);
    const target = pickTarget(this.pile, plan.segmentIndex, plan.seed);
    const capsule = this.pile.capsules[target];
    const claw = this.clawSize();
    const depth = capsule?.depth ?? 1;
    const s = depthScale(depth);
    const targetY = capsule?.y ?? CABINET.floor - claw.r;
    const grabCable = targetY - this.hang(claw) * s - CABINET.railY;
    const script = planClaw({
      durationMs: plan.durationMs,
      seed: plan.seed,
      targetX: capsule?.x ?? CABINET.homeX,
      targetDepth: depth,
      grabCable,
    });
    const elapsed = now - startedAt;
    this.game = {
      plan,
      startedAt,
      script,
      target,
      rowWithout: null,
      reveal: null,
      // A play joined late stays quiet about what already happened.
      lastT: elapsed > LATE_SOUND_MS ? elapsed : -1,
      notch: Number.NaN,
    };
    this.buildGameSprites();
  }

  update(now: number): boolean {
    const game = this.game;
    if (!game) return true;
    const t = now - game.startedAt;
    const { script } = game;
    if (t > game.lastT) {
      for (const event of script.events) {
        if (event.at > game.lastT && event.at <= t && t - event.at < LATE_SOUND_MS)
          playClawSound(this.sound, event);
      }
      const frame = clawFrame(script, t);
      const notch = Math.floor((frame.x + 2) / RAIL_NOTCH) * 1000 + Math.floor(frame.cable / CABLE_NOTCH);
      if (
        t < script.durationMs &&
        game.lastT >= 0 &&
        notch !== game.notch &&
        now - this.lastTickAt >= TICK_GAP_MS
      ) {
        this.lastTickAt = now;
        this.onTick?.(Math.max(0.25, Math.abs(frame.stick)));
      }
      game.notch = notch;
      game.lastT = t;
    }
    return t >= script.durationMs;
  }

  setHighlight(index: number | null, tier: Tier = 'common', bust = false, now = performance.now()): void {
    this.highlight = index === null ? null : { index, tier, bust, start: now };
  }

  celebrate(durationMs: number, now = performance.now()): void {
    this.celebrateUntil = now + durationMs;
  }

  draw(now: number): void {
    const { ctx, art } = this;
    if (!art || this.size === 0) return;
    const game = this.game;
    const t = game ? now - game.startedAt : 0;
    const landed = game ? t >= game.script.durationMs : false;
    const frame = game ? clawFrame(game.script, t) : idleFrame(now);
    const celebrating = now < this.celebrateUntil;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.drawImage(art.back, art.ox, art.oy);
    ctx.setTransform(art.u, 0, 0, art.u, art.cx, art.cy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.drawPoster(now);
    const clock = game ? t : now;
    this.drawPile(frame);
    this.drawTwinkles(clock, frame);
    this.drawFalling(frame);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(art.front, art.ox, art.oy);
    // Neon tubes breathe at rest and burn bright while playing or partying.
    const breathe = game && !landed ? 0.95 : 0.72 + 0.22 * Math.sin(now / 900);
    ctx.globalAlpha = celebrating ? 1 : breathe;
    ctx.drawImage(art.neon, art.ox, art.oy);
    ctx.globalAlpha = 1;
    ctx.setTransform(art.u, 0, 0, art.u, art.cx, art.cy);
    this.drawDeck(frame);
    this.drawDoor(frame);
    this.drawLights(celebrating ? now : clock, game !== null && !landed, celebrating);
    if (game) this.drawEffects(frame, t);
    if (this.view && this.view.segments.length === 0 && art.empty) drawSprite(ctx, art.empty, 0, -0.18);

    const highlight = this.highlight;
    if (highlight && (!game || landed)) this.drawDim(highlight);
    if (highlight && !game) this.drawPileHighlight(highlight, now);
    if (game && frame.capsule === 'reveal') this.drawReveal(frame, now, clock, landed, celebrating);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ── State ────────────────────────────────────────────────────────────────

  private setView(view: WheelView): void {
    const signature = wheelSignature(view);
    if (signature === this.signature && this.view) {
      this.view = view;
      return;
    }
    this.view = view;
    this.signature = signature;
    const seed = hashString(`${view.key}|${view.segments.map((s) => s.id).join(',')}`);
    this.pile = layoutPile(
      view.segments.map((s) => s.weight),
      view.sizing === 'weight',
      seed,
    );
    this.highlight = null;
    this.rebuildPile();
  }

  /** Claw proportions for the current pile. */
  private clawSize(): Art['claw'] {
    const c = clamp(this.pile.diameter * 1.1, 0.17, 0.26);
    return { c, hub: c * 0.28, r: this.pile.diameter / 2 };
  }

  /** Distance from the hub centre to a held capsule's centre (front scale). */
  private hang(claw: Art['claw']): number {
    return claw.hub * 0.92 + claw.r;
  }

  private segmentStyle(index: number): PrizeStyle {
    const segments = this.view?.segments ?? [];
    const segment = segments[index];
    return segment
      ? this.theme.prizeStyle(segment, index, segments.length)
      : {
          fill: this.theme.palette.body,
          light: '#ffffff',
          dark: '#000000',
          text: '#ffffff',
          outline: '#000000',
        };
  }

  // ── Cached art ───────────────────────────────────────────────────────────

  private rebuild(): void {
    if (this.size === 0) {
      this.art = null;
      return;
    }
    const { cx, cy, half } = playArea(this.theme, this.size);
    const side = Math.ceil(2 * (1 + MARGIN) * half);
    const ox = Math.round(cx - side / 2);
    const oy = Math.round(cy - side / 2);
    const u = half;
    const layer = () => {
      const canvas = createCanvas(side, side);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(u, 0, 0, u, cx - ox, cy - oy);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      return { canvas, ctx };
    };
    const p = this.theme.palette;
    const back = layer();
    const front = layer();
    const neon = layer();
    paintBack(p, back.ctx, this.photos.length > 0);
    paintFront(p, front.ctx);
    paintNeon(p, neon.ctx);
    const lights = lightSprites(p, u);
    const claw = this.clawSize();
    this.art = {
      u,
      cx,
      cy,
      ox,
      oy,
      back: back.canvas,
      front: front.canvas,
      neon: neon.canvas,
      rows: [],
      capsules: [],
      posters: this.photos.map((photo) => posterSprite(p, photo, u)),
      empty: null,
      hub: hubSprite(p, claw.hub, u),
      carriage: carriageSprite(p, u),
      ball: ballSprite(p, u),
      lightOn: lights.on,
      lightOff: lights.off,
      lights: lightPositions(),
      rays: raysSprite(p, u),
      alert: alertSprite(p, u),
      glow: glowSprite(p, u),
      claw,
    };
    this.rebuildPile();
  }

  /** Sprites that depend on the wheel (capsules, pile rows, claw size); the cabinet stays as it is. */
  private rebuildPile(): void {
    const art = this.art;
    if (!art) return;
    const claw = this.clawSize();
    if (claw.hub !== art.claw.hub) art.hub = hubSprite(this.theme.palette, claw.hub, art.u);
    art.claw = claw;
    art.capsules = (this.view?.segments ?? []).map((segment, i) =>
      this.capsuleSprite(segment, i, claw.r, art.u),
    );
    art.empty = this.emptySprite(art.u);
    art.rows = this.rowSprites(-1);
    if (this.game) this.buildGameSprites();
  }

  /** Sprites that depend on the play: the target's row without it, and the big reveal capsule. */
  private buildGameSprites(): void {
    const { art, game } = this;
    if (!art || !game) return;
    const capsule = this.pile.capsules[game.target];
    game.rowWithout = capsule ? (this.rowSprites(game.target)[capsule.row]?.sprite ?? null) : null;
    const segment = game.plan.wheel.segments[game.plan.segmentIndex];
    game.reveal = segment ? this.revealSprites(segment, game.plan.segmentIndex, art.u) : null;
  }

  private capsuleSprite(segment: Segment, index: number, r: number, u: number): Sprite {
    const { sprite, ctx } = makeSprite(r * 2.24, r * 2.24, u);
    const style = this.segmentStyle(index);
    drawCapsule(ctx, r, style, this.theme);
    capsuleLabel(ctx, segment, r, style, this.theme);
    return sprite;
  }

  /** Depth rows of the pile (optionally leaving out one capsule), tinted darker towards the back. */
  private rowSprites(skip: number): Art['rows'] {
    const art = this.art;
    if (!art) return [];
    const { capsules } = this.pile;
    const rows: Art['rows'] = [];
    const shade = this.theme.palette.outline;
    for (let row = 0; row < this.pile.rows; row++) {
      const members = capsules.filter((c) => c.row === row);
      if (members.length === 0) continue;
      const top = Math.min(...members.map((c) => c.y - c.r)) - 0.04;
      const bottom = Math.max(...members.map((c) => c.y + c.r)) + 0.04;
      const left = CABINET.pileLeft - 0.06;
      const right = CABINET.pileRight + 0.06;
      const { sprite, ctx } = makeSprite(right - left, bottom - top, art.u);
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;
      ctx.translate(-x, -y);
      for (const c of members) {
        if (capsules.indexOf(c) === skip) continue;
        // Contact shadow, then the capsule.
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + c.r * 0.9, c.r * 0.85, c.r * 0.18, 0, 0, TAU);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fill();
        this.drawPileCapsule(ctx, c);
      }
      const depth = members[0]!.depth;
      if (depth < 1) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = withAlpha(shade, (1 - depth) * 0.32);
        ctx.fillRect(left, top, right - left, bottom - top);
        ctx.globalCompositeOperation = 'source-over';
      }
      rows[row] = { sprite, x, y };
    }
    return rows;
  }

  private drawPileCapsule(ctx: CanvasRenderingContext2D, c: PileCapsule, scale = 1): void {
    const sprite = this.art?.capsules[c.prize];
    if (!sprite) return;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.tilt);
    drawSprite(ctx, sprite, 0, 0, depthScale(c.depth) * scale);
    ctx.restore();
  }

  private revealSprites(segment: Segment, index: number, u: number): Reveal {
    const R = CABINET.revealR;
    const style = this.segmentStyle(index);
    const theme = this.theme;
    const closed = makeSprite(R * 2.24, R * 2.24, u);
    drawCapsule(closed.ctx, R, style, theme);
    capsuleLabel(closed.ctx, segment, R, style, theme);
    const top = makeSprite(R * 2.24, R * 2.24, u);
    drawCapsule(top.ctx, R, style, theme, 'top');
    const bottom = makeSprite(R * 2.24, R * 2.24, u);
    drawCapsule(bottom.ctx, R, style, theme, 'bottom');

    // The prize, bigger than the capsule it came out of.
    const prize = makeSprite(R * 3.3, R * 2.4, u);
    const { icon, main, caption } = prizeText(segment);
    const ctx = prize.ctx;
    const text: TextStyle = {
      fill: style.text,
      outline: style.outline,
      family: theme.palette.display,
      stroke: 0.22,
      shadow: withAlpha(theme.palette.glow, 0.9),
    };
    const measure = measurer(ctx, theme.palette.display);
    let y = 0;
    let height = R * 1.5;
    if (icon) {
      sticker(ctx, [icon], 0, -R * 0.52, R * 0.72, { ...text, shadow: 'rgba(0, 0, 0, 0.4)' });
      y = R * 0.32;
      height = R * 0.78;
    }
    if (caption) {
      y -= R * 0.14;
      height -= R * 0.3;
    }
    const fit = fitLines(main, icon ? 2 : 3, measure, R * 3.0, height, 1.02);
    const size = Math.min(fit.size, R * (icon ? 0.72 : 1.05));
    sticker(ctx, fit.lines, 0, y, size, text, 1.02);
    if (caption) {
      const capY = y + (fit.lines.length * size * 1.02) / 2 + R * 0.2;
      const capFit = fitLines(caption.toUpperCase(), 1, measurer(ctx, theme.palette.ui), R * 2.4, R * 0.34);
      sticker(ctx, capFit.lines, 0, capY, Math.min(capFit.size, R * 0.3), {
        ...text,
        family: theme.palette.ui,
        stroke: 0.3,
      });
    }
    return { closed: closed.sprite, top: top.sprite, bottom: bottom.sprite, prize: prize.sprite };
  }

  private emptySprite(u: number): Sprite | null {
    if (!this.view || this.view.segments.length > 0) return null;
    const { sprite, ctx } = makeSprite(1.4, 0.4, u);
    const p = this.theme.palette;
    const text = this.view.kind === 'raffle' ? 'Awaiting entrants' : 'No prizes left';
    const fit = fitLines(text, 2, measurer(ctx, p.display), 1.2, 0.34);
    sticker(ctx, fit.lines, 0, 0, Math.min(fit.size, 0.13), {
      fill: p.text,
      outline: p.outline,
      family: p.display,
      stroke: 0.24,
      shadow: withAlpha(p.glow, 0.8),
    });
    return sprite;
  }

  // ── Per-frame drawing (units) ────────────────────────────────────────────

  private drawPoster(now: number): void {
    const { ctx, art } = this;
    if (!art || art.posters.length === 0) return;
    const draw = (sprite: Sprite, alpha: number) => {
      ctx.globalAlpha = alpha;
      drawSprite(ctx, sprite, POSTER.x, POSTER.y);
      ctx.globalAlpha = 1;
    };
    if (art.posters.length === 1) return draw(art.posters[0]!, 1);
    const slot = Math.floor(now / this.photoMs);
    const fade = Math.min(1, (now - slot * this.photoMs) / PHOTO_FADE_MS);
    if (fade < 1) draw(art.posters[(slot - 1 + art.posters.length) % art.posters.length]!, 1);
    draw(art.posters[slot % art.posters.length]!, fade);
  }

  /** Pile rows back to front, with the claw slipped in at its depth while it reaches into the pile. */
  private drawPile(frame: ClawFrame): void {
    const { ctx, art, game } = this;
    if (!art) return;
    const target = game ? this.pile.capsules[game.target] : undefined;
    const reaching = frame.phase === 'drop' || frame.phase === 'grab' || frame.phase === 'lift';
    const clawRow = target && reaching ? target.row : Number.POSITIVE_INFINITY;
    const grabbed = frame.capsule !== 'pile';
    art.rows.forEach((row, index) => {
      const sprite =
        target && grabbed && index === target.row && game?.rowWithout ? game.rowWithout : row.sprite;
      drawSprite(ctx, sprite, row.x, row.y);
      if (index === clawRow) this.drawClaw(frame);
    });
    if (!Number.isFinite(clawRow) || art.rows[clawRow] === undefined) this.drawClaw(frame);
  }

  private drawClaw(frame: ClawFrame): void {
    const { ctx, art, game } = this;
    if (!art) return;
    const p = this.theme.palette;
    const { c, hub } = art.claw;
    const target = game ? this.pile.capsules[game.target] : undefined;
    const s = depthScale(frame.depth);
    const r = (target ? target.r / depthScale(target.depth) : art.claw.r) * s;
    const h = hub * s;
    const cs = c * s;
    const hang = this.hang(art.claw) * s;

    // Carriage on the rail.
    drawSprite(ctx, art.carriage, frame.x, CABINET.railY + 0.032);
    const pivotY = CABINET.railY + PIVOT_DROP;
    ctx.save();
    ctx.translate(frame.x, pivotY);
    ctx.rotate(frame.swing);
    const hubY = frame.cable - PIVOT_DROP;
    const hx = frame.shake;
    // Cable.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(hx, hubY - h * 1.2);
    ctx.lineWidth = 0.017;
    ctx.strokeStyle = p.outline;
    ctx.stroke();
    ctx.lineWidth = 0.007;
    ctx.strokeStyle = withAlpha(p.trimLight, 0.9);
    ctx.stroke();
    ctx.translate(hx, hubY);

    const open = frame.open;
    const capY = hang + frame.slip * r;
    // Back prong (behind the capsule).
    const backTip = hang + r * (0.98 - 0.55 * clamp(open, 0, 1));
    this.prong(
      ctx,
      [0, h * 0.5],
      [0, lerp(h + r * 0.6, h + r * 0.35, clamp(open, 0, 1))],
      [0, backTip],
      cs,
      true,
    );
    // Held capsule.
    if (frame.capsule === 'held' && target) {
      ctx.save();
      ctx.translate(0, capY);
      // Hangs straighter as the claw lifts it.
      ctx.rotate(target.tilt * (1 - 0.6 * frame.grip));
      const sprite = art.capsules[target.prize];
      if (sprite) drawSprite(ctx, sprite, 0, 0, s);
      ctx.restore();
    }
    drawSprite(ctx, art.hub, 0, -h * 0.3, s);
    // Side prongs.
    for (const side of [-1, 1]) {
      const o = open;
      const shoulder: [number, number] = [side * h * 0.72, h * 0.5];
      const knuckle: [number, number] = [
        side * lerp(r * 1.06, r * 1.08 + cs * 0.22, o),
        lerp(hang - r * 0.5, hang - r * 0.78 - cs * 0.06, o),
      ];
      const tip: [number, number] = [
        side * lerp(r * 0.5, r * 1.3 + cs * 0.24, o),
        lerp(hang + r * 0.8, hang + r * 0.12, o),
      ];
      this.prong(ctx, shoulder, knuckle, tip, cs, false);
    }
    ctx.restore();
  }

  /** One prong: upper arm, knuckle, finger and a pink tip. */
  private prong(
    ctx: CanvasRenderingContext2D,
    a: readonly [number, number],
    b: readonly [number, number],
    tip: readonly [number, number],
    c: number,
    behind: boolean,
  ): void {
    const p = this.theme.palette;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineWidth = c * 0.19;
    ctx.strokeStyle = p.outline;
    ctx.stroke();
    ctx.lineWidth = c * 0.115;
    ctx.strokeStyle = behind ? mixColor(p.trim, p.outline, 0.5) : p.trim;
    ctx.stroke();
    if (!behind) {
      ctx.lineWidth = c * 0.032;
      ctx.strokeStyle = withAlpha(p.trimLight, 0.95);
      ctx.beginPath();
      ctx.moveTo(a[0] - c * 0.015, a[1]);
      ctx.lineTo(b[0] - c * 0.015, b[1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b[0], b[1], c * 0.075, 0, TAU);
      ctx.fillStyle = p.trim;
      ctx.fill();
      ctx.lineWidth = c * 0.035;
      ctx.strokeStyle = p.outline;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], c * 0.07, 0, TAU);
    ctx.fillStyle = behind ? mixColor(p.glow, p.outline, 0.45) : p.glow;
    ctx.fill();
    ctx.lineWidth = c * 0.035;
    ctx.strokeStyle = p.outline;
    ctx.stroke();
  }

  /** Centre and radius of the grabbed capsule while the claw holds it. */
  private heldCapsule(frame: ClawFrame, target: PileCapsule): { x: number; y: number; r: number } {
    const claw = this.art?.claw ?? this.clawSize();
    const s = depthScale(frame.depth);
    const r = (target.r / depthScale(target.depth)) * s;
    const length = frame.cable - PIVOT_DROP + this.hang(claw) * s + frame.slip * r;
    const cos = Math.cos(frame.swing);
    const sin = Math.sin(frame.swing);
    return {
      x: frame.x + frame.shake * cos - length * sin,
      y: CABINET.railY + PIVOT_DROP + frame.shake * sin + length * cos,
      r,
    };
  }

  /** Glints on a few capsules (ambient, ~3 at a time). */
  private drawTwinkles(clock: number, frame: ClawFrame): void {
    const { ctx, game } = this;
    const capsules = this.pile.capsules;
    if (capsules.length === 0) return;
    const color = this.theme.palette.trimLight;
    for (let k = 0; k < 3; k++) {
      const period = 1900;
      const local = clock + k * 633;
      const slot = Math.floor(local / period);
      const phase = (local - slot * period) / period;
      const index = hashString(`${slot}:${k}`) % capsules.length;
      if (game && index === game.target && frame.capsule !== 'pile') continue;
      const c = capsules[index]!;
      const a = Math.sin(Math.PI * phase) ** 2;
      drawStar(ctx, c.x - c.r * 0.42, c.y - c.r * 0.52, c.r * 0.6 * a, a, color);
    }
  }

  /** Sparkle burst on the grab, "!!" on the slip scare, a flash when the capsule lands in the chute. */
  private drawEffects(frame: ClawFrame, t: number): void {
    const { ctx, art, game } = this;
    const target = game ? this.pile.capsules[game.target] : undefined;
    if (!art || !game || !target) return;
    const p = this.theme.palette;
    const { closeAt, slipAt, landAt } = game.script;
    const sinceClose = t - closeAt;
    if (sinceClose >= 0 && sinceClose < 450) {
      const q = sinceClose / 450;
      const { x, y, r } = this.heldCapsule(frame, target);
      ctx.save();
      ctx.globalAlpha = 1 - q;
      ctx.strokeStyle = p.trimLight;
      ctx.lineWidth = 0.014 * (1 - q * 0.5);
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + 0.3;
        const r0 = r * (1.2 + 0.5 * q);
        const r1 = r * (1.5 + 0.8 * q);
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      }
      ctx.stroke();
      ctx.restore();
    }
    const sinceSlip = t - slipAt;
    if (sinceSlip >= 0 && sinceSlip < 950 && (frame.capsule === 'held' || frame.phase === 'lift')) {
      const { x, y, r } = this.heldCapsule(frame, target);
      const side = x > 0.25 ? -1 : 1;
      ctx.save();
      ctx.globalAlpha = sinceSlip > 700 ? 1 - (sinceSlip - 700) / 250 : 1;
      ctx.translate(x + side * (r + 0.13), y - r * 0.9);
      ctx.rotate(side * 0.18 + 0.05 * Math.sin(sinceSlip / 45));
      drawSprite(ctx, art.alert, 0, 0, easeOutBack(Math.min(1, sinceSlip / 160), 2.6));
      ctx.restore();
    }
    const sinceLand = t - landAt;
    if (sinceLand >= 0 && sinceLand < 500) {
      const q = sinceLand / 500;
      const C = CABINET;
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - q);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.glow;
      ctx.fillRect(C.chuteLeft, C.chuteTop, C.chuteRight - C.chuteLeft, C.glassBottom - C.chuteTop);
      ctx.restore();
    }
  }

  /** The capsule falling into the chute (clipped to the chute). */
  private drawFalling(frame: ClawFrame): void {
    const { ctx, art, game } = this;
    if (!art || !game || frame.capsule !== 'falling') return;
    const target = this.pile.capsules[game.target];
    const sprite = target ? art.capsules[target.prize] : undefined;
    if (!target || !sprite) return;
    // Starts where the claw let go of it.
    const start = this.heldCapsule(clawFrame(game.script, game.script.fallAt), target);
    const { x: x0, y: y0, r } = start;
    const s = depthScale(1);
    const y1 = CABINET.glassBottom + r;
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      CABINET.chuteLeft - 0.2,
      -2,
      CABINET.chuteRight - CABINET.chuteLeft + 0.4,
      2 + CABINET.glassBottom,
    );
    ctx.clip();
    ctx.translate(
      lerp(x0, (CABINET.chuteLeft + CABINET.chuteRight) / 2, frame.fall),
      lerp(y0, y1, frame.fall),
    );
    ctx.rotate(target.tilt * 0.4 + frame.fall * 1.4);
    drawSprite(ctx, sprite, 0, 0, s);
    ctx.restore();
  }

  /** Joystick (follows the claw) and the grab button (pressed for the drop). */
  private drawDeck(frame: ClawFrame): void {
    const { ctx, art } = this;
    if (!art) return;
    const p = this.theme.palette;
    const tx = STICK.x + frame.stick * 0.03;
    const ty = STICK.y - 0.07;
    ctx.beginPath();
    ctx.moveTo(STICK.x, STICK.y + 0.008);
    ctx.lineTo(tx, ty);
    ctx.lineWidth = 0.02;
    ctx.strokeStyle = p.outline;
    ctx.stroke();
    ctx.lineWidth = 0.011;
    ctx.strokeStyle = p.trimLight;
    ctx.stroke();
    drawSprite(ctx, art.ball, tx, ty);
    const press = frame.button * 0.012;
    ctx.beginPath();
    ctx.ellipse(BUTTON.x, BUTTON.y - 0.006 + press, 0.052, 0.03, 0, 0, TAU);
    ctx.fillStyle = mixColor(p.glow, '#ffffff', 0.15 + 0.4 * frame.button);
    ctx.fill();
    ctx.lineWidth = 0.007;
    ctx.strokeStyle = p.outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(BUTTON.x - 0.016, BUTTON.y - 0.016 + press, 0.018, 0.008, -0.2, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fill();
  }

  /** Door flap, and the capsule popping out of it. */
  private drawDoor(frame: ClawFrame): void {
    const { ctx, art, game } = this;
    if (!art) return;
    const p = this.theme.palette;
    const C = CABINET;
    const w = C.doorRight - C.doorLeft - 0.03;
    const fullH = C.doorBottom - C.doorTop - 0.03;
    // Translucent flap hinged at the top; it swings up as the capsule pushes it.
    const h = fullH * (1 - 0.82 * frame.door);
    roundRect(ctx, C.doorLeft + 0.015, C.doorTop + 0.015, w, h, 0.03);
    ctx.fillStyle = withAlpha(mixColor(p.glow, p.body, 0.4), 0.55);
    ctx.fill();
    ctx.lineWidth = 0.008;
    ctx.strokeStyle = withAlpha(p.trimLight, 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(C.doorLeft + 0.04, C.doorTop + 0.04);
    ctx.lineTo(C.doorLeft + 0.04, C.doorTop + 0.015 + h - 0.03);
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.stroke();
    if (frame.door < 0.05) {
      heartPath(ctx, DOOR.x, DOOR.y + 0.01, 0.1);
      ctx.fillStyle = withAlpha(p.trimLight, 0.75);
      ctx.fill();
    }

    // The capsule bounces out of the door before flying up.
    if (game && frame.capsule === 'reveal' && frame.fly <= 0) {
      const target = this.pile.capsules[game.target];
      const sprite = target ? art.capsules[target.prize] : undefined;
      if (sprite && frame.emerge > 0) {
        ctx.save();
        const e = Math.min(1, frame.emerge);
        ctx.translate(DOOR.x, DOOR.y + 0.03 * (1 - e) - 0.05 * Math.sin(Math.PI * e));
        drawSprite(ctx, sprite, 0, 0, 0.5 + 0.5 * frame.emerge);
        ctx.restore();
      }
    }
  }

  private drawLights(now: number, playing: boolean, celebrating: boolean): void {
    const { ctx, art } = this;
    if (!art) return;
    const t = now / 1000;
    const settled = this.highlight !== null && !celebrating;
    const flash = Math.floor(t * 5) % 2;
    // Chase: a few lights per second at rest, faster while the claw works (each light ≤ 3 flashes/s).
    const phase = t * (playing ? 9 : 3.5);
    art.lights.forEach(({ x, y }, i) => {
      let on: number;
      if (celebrating) on = i % 2 === flash ? 1 : 0.15;
      else if (settled) on = 0.7 + 0.3 * Math.sin(t * 3 + i * 0.5);
      else {
        const d = (((phase - i) % 4) + 4) % 4;
        on = d < 1 ? 1 : Math.max(0.1, 1 - (d - 1) * 0.6);
      }
      drawSprite(ctx, art.lightOff, x, y);
      if (on > 0.12) {
        ctx.globalAlpha = on;
        drawSprite(ctx, art.lightOn, x, y);
        ctx.globalAlpha = 1;
      }
    });
  }

  /** Shade over the machine so the winner stands out. */
  private drawDim(highlight: NonNullable<ClawStage['highlight']>): void {
    const { ctx } = this;
    const style = this.theme.highlight(highlight.tier, highlight.bust);
    const C = CABINET;
    ctx.beginPath();
    ctx.roundRect(C.left, C.top, C.right - C.left, C.bottom - C.top, [0.14, 0.14, 0.03, 0.03]);
    ctx.fillStyle = `rgba(${style.shade ?? '0, 0, 0'}, ${style.dim})`;
    ctx.fill();
  }

  /** Without a play (a highlight on the idle machine): the capsules of that prize glow over the shade. */
  private drawPileHighlight(highlight: NonNullable<ClawStage['highlight']>, now: number): void {
    const { ctx, art } = this;
    if (!art) return;
    const style = this.theme.highlight(highlight.tier, highlight.bust);
    const pulse = 0.5 + 0.5 * Math.sin((now - highlight.start) / 220);
    for (const c of this.pile.capsules) {
      if (c.prize !== highlight.index) continue;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * (1.12 + 0.05 * pulse), 0, TAU);
      ctx.lineWidth = 0.012;
      ctx.strokeStyle = style.glow;
      ctx.stroke();
      this.drawPileCapsule(ctx, c);
    }
  }

  /** The capsule flying out to the front, opening, and the prize. */
  private drawReveal(
    frame: ClawFrame,
    now: number,
    clock: number,
    landed: boolean,
    celebrating: boolean,
  ): void {
    const { ctx, art, game } = this;
    const reveal = game?.reveal;
    if (!art || !game || !reveal || frame.fly <= 0) return;
    const R = CABINET.revealR;
    const target = this.pile.capsules[game.target];
    const r0 = target ? target.r / depthScale(target.depth) : art.claw.r;
    const f = frame.fly;
    const x = lerp(DOOR.x, CABINET.revealX, f);
    const y = lerp(DOOR.y, CABINET.revealY, f) - 0.32 * Math.sin(Math.PI * f) * (1 - f * 0.4);
    const scale = lerp(r0 / R, 1, f);

    const highlight = this.highlight;
    const hl = highlight && landed ? this.theme.highlight(highlight.tier, highlight.bust) : null;
    const since = highlight ? now - highlight.start : 0;
    const pulse = hl ? 0.5 + 0.5 * Math.sin(since / 230) : 0;

    // Light burst behind it.
    const shine = clamp((f - 0.4) / 0.6, 0, 1);
    if (shine > 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = Math.min(
        1,
        shine * (0.55 + 0.25 * frame.burst + (hl ? 0.2 * pulse : 0) + (celebrating ? 0.2 : 0)),
      );
      ctx.rotate((clock / 1000) * 0.2);
      drawSprite(ctx, art.rays, 0, 0, 0.6 + 0.4 * frame.burst);
      ctx.restore();
      ctx.globalAlpha = shine * (0.7 + (hl ? 0.3 * pulse : 0));
      drawSprite(ctx, art.glow, x, y, 0.8 + 0.2 * frame.burst);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(x, y);
    if (frame.burst <= 0) {
      // One full spin on the way (upright when it leaves the door and when it arrives).
      ctx.rotate(-TAU * f);
      drawSprite(ctx, reveal.closed, 0, 0, scale);
      ctx.restore();
      return;
    }
    const b = frame.burst;
    // Lid flies up and tilts away, the base drops a little: the prize pops out between them.
    ctx.save();
    ctx.translate(R * 0.06 * b, R * 0.5 * b);
    ctx.rotate(0.08 * b);
    drawSprite(ctx, reveal.bottom, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(-R * 0.9 * b, -R * 0.52 * b);
    ctx.rotate(-0.85 * b);
    drawSprite(ctx, reveal.top, 0, 0);
    ctx.restore();
    if (hl) {
      ctx.beginPath();
      ctx.arc(0, 0, R * (1.32 + 0.06 * pulse), 0, TAU);
      ctx.lineWidth = 0.014;
      ctx.strokeStyle = hl.glow;
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (frame.flash > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, R * (1 + 1.1 * (1 - frame.flash)), 0, TAU);
      ctx.lineWidth = 0.03 * frame.flash;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.85 * frame.flash})`;
      ctx.stroke();
    }
    drawSprite(ctx, reveal.prize, 0, -R * 0.06, frame.prize);
    ctx.restore();
  }
}
