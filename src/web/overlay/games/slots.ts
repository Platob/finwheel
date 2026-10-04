import type { Tier } from '../../../shared/schema';
import type { WheelView } from '../../../shared/types';
import type { SoundBoard } from '../audio';
import type { WheelTheme } from '../themes/types';
import { createCanvas, wheelSignature } from '../wheel-face';
import {
  BLUR_SCALE,
  blurSymbol,
  buildBulbs,
  buildCabinet,
  buildGlass,
  buildGlow,
  buildKnob,
  buildLever,
  buildLight,
  buildReelGlow,
  buildSparkle,
  buildSweep,
  bulbPoints,
  drawCoin,
  drawRod,
  emptyMessage,
  px,
  py,
  renderMessage,
  renderPhotoSymbol,
  renderSymbol,
  sticker,
  symbolText,
  type Frame,
  type LeverSprites,
} from './slots-art';
import {
  cellAt,
  chaseLevel,
  clamp,
  coinFall,
  coinSpill,
  drumPlace,
  fitLabel,
  LAYOUT,
  leverAngle,
  paylineY,
  planSlots,
  reelBoxes,
  reelPosition,
  reelScreen,
  REELS,
  reelSpeed,
  restingPhotoCells,
  restingReels,
  settlePop,
  STRIP_MARGIN,
  teasing,
  type Coin,
  type ReelMotion,
  type SlotsPlay,
} from './slots-math';
import { clunk, jingle, leverSound, teaseSound } from './slots-sounds';
import { playArea, type GameStage, type PlayPlan, type StageContext } from './types';

/** Coins poured into the tray after a win, by tier. */
const SPILL: Record<Tier, number> = { common: 7, rare: 10, epic: 14, legendary: 18, jackpot: 26 };
/** Coins left from the last win fade out this fast when the next play starts. */
const SPILL_FADE_MS = 450;
/** Fewest milliseconds between two reel ticks (≤ 25 per second). */
const TICK_GAP = 40;
/** Longest side of the photos used for the premium symbol, and how many of them take turns. */
const PHOTO_SIDE = 320;
const MAX_PHOTOS = 6;
/** A shine crosses the glass every SWEEP_EVERY ms, taking SWEEP_MS. */
const SWEEP_EVERY = 6500;
const SWEEP_MS = 1300;
/** What the display says while the machine waits, one line every IDLE_LINE_MS. */
const IDLE_LINES = ['SPIN TO WIN', 'FEELING LUCKY?', 'PAY UP, PUP', 'MORE MORE MORE'] as const;
const IDLE_LINE_MS = 3500;
/** Where the trim twinkles (layout units). */
/** The machine's fixed layout (layout units). */
const SCREEN = reelScreen();
const BOXES = reelBoxes();
const PAYLINE = paylineY();
const SPARKLES = [
  [-0.95, -0.94],
  [0.66, -0.6],
  [-0.84, -0.12],
  [0.55, -0.92],
  [-0.94, 0.5],
  [0.66, 0.72],
  [-0.5, -1.04],
  [0.4, 0.15],
] as const;

interface SymbolSprites {
  sharp: HTMLCanvasElement;
  blur: HTMLCanvasElement;
}

interface Play {
  plan: PlayPlan;
  slots: SlotsPlay;
  startedAt: number;
}

/**
 * Loser Slots: a pink slot-machine cabinet with chasing bulbs, three reels behind glass and a
 * lever. A play pulls the lever, spins the reels and stops them left to right on the winning
 * prize (a triple on the payline), sometimes teasing with the last reel.
 */
export class SlotsStage implements GameStage {
  onTick: ((speed: number) => void) | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sound: SoundBoard;
  private theme: WheelTheme;
  private size = 0;
  private dpr = 1;
  private frame: Frame = { cx: 0, cy: 0, u: 1 };

  // Cached layers, rebuilt on resize / theme / fonts / wheel change.
  private cabinet: HTMLCanvasElement | null = null;
  private glass: HTMLCanvasElement | null = null;
  private bulbs: { on: HTMLCanvasElement; off: HTMLCanvasElement } | null = null;
  private bulbSpots: { x: number; y: number }[] = [];
  private knob: HTMLCanvasElement | null = null;
  private lever: LeverSprites | null = null;
  private symbols: SymbolSprites[] = [];
  private photoSymbols: SymbolSprites[] = [];
  private glows = new Map<string, HTMLCanvasElement>();
  private messages = new Map<string, HTMLCanvasElement>();
  private coin: HTMLCanvasElement | null = null;
  private sparkle: HTMLCanvasElement | null = null;
  private light: HTMLCanvasElement | null = null;
  private sweep: HTMLCanvasElement | null = null;
  private photos: HTMLCanvasElement[] = [];
  private hotReel: HTMLCanvasElement | null = null;

  private view: WheelView | null = null;
  private signature = '';
  /** Reels at rest (cells −STRIP_MARGIN … +STRIP_MARGIN) when nothing plays. */
  private resting: number[][] = [];
  private restingPhotos: boolean[][] = [];
  private current: Play | null = null;
  /** Milliseconds into the current play at the last update, and the matching clock time. */
  private elapsed = 0;
  private lastUpdate = 0;
  private positions: number[] = [0, 0, 0];
  private speeds: number[] = [0, 0, 0];
  private lastCells: number[] = [0, 0, 0];
  private lastTick = -Infinity;

  /** Two of a kind are in and the last reel still runs: level 0 → 1 and its pulse (see `measureSuspense`). */
  private suspense = 0;
  private suspensePulse = 0;

  private highlight: { index: number; tier: Tier; bust: boolean; start: number } | null = null;
  private celebrateUntil = 0;
  private spill: { start: number; coins: Coin[]; fadeAt?: number } | null = null;

  constructor({ canvas, theme, sound }: StageContext) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.theme = theme;
    this.sound = sound;
  }

  get center(): { x: number; y: number; radius: number } {
    const f = this.frame;
    const radius = (0.5 * f.u) / this.dpr;
    // The overlay bursts confetti at `y − 0.55 × radius`: right on the payline.
    return {
      x: px(f, (SCREEN.left + SCREEN.right) / 2) / this.dpr,
      y: py(f, PAYLINE) / this.dpr + radius * 0.55,
      radius,
    };
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

  setPhotos(photos: readonly HTMLImageElement[]): void {
    this.photos = photos.slice(0, MAX_PHOTOS).map(scaleDown);
    this.buildPhotoSymbols();
  }

  show(view: WheelView, rotation: number): void {
    this.current = null;
    // Coins won stay in the tray while the same machine is on screen.
    if (view.key !== this.view?.key) this.spill = null;
    this.setView(view);
    this.resting = restingReels(view, rotation);
    this.restingPhotos = restingPhotoCells(view, rotation);
    this.positions = [0, 0, 0];
    this.speeds = [0, 0, 0];
  }

  play(plan: PlayPlan, startedAt: number, now: number): void {
    this.setView(plan.wheel);
    this.current = { plan, slots: planSlots(plan), startedAt };
    this.highlight = null;
    // Coins from the last win fade away as the lever drops.
    if (this.spill) this.spill = { ...this.spill, fadeAt: startedAt };
    this.celebrateUntil = 0;
    // Events already past (an overlay joining late) stay silent.
    this.elapsed = now - startedAt;
    this.lastUpdate = now;
    this.measure(this.elapsed);
    this.lastCells = this.positions.map((s) => Math.round(s));
  }

  update(now: number): boolean {
    const play = this.current;
    if (!play) return true;
    const t = now - play.startedAt;
    // Frames after a long pause (or a late join) catch up silently.
    const live = now - this.lastUpdate < 150 && t > this.elapsed;
    const before = this.elapsed;
    this.measure(t);
    this.trackCells(live ? now : null);
    if (live) this.fireSounds(play.slots, before, t);
    this.elapsed = t;
    this.lastUpdate = now;
    return t >= play.slots.landedAt;
  }

  setHighlight(index: number | null, tier: Tier = 'common', bust = false, now = performance.now()): void {
    if (index === null) {
      this.highlight = null;
      return;
    }
    this.highlight = { index, tier, bust, start: now };
    if (!bust) {
      const seed = this.current?.plan.seed ?? index;
      this.spill = { start: now, coins: coinSpill(seed, SPILL[tier]) };
    }
  }

  celebrate(durationMs: number, now = performance.now()): void {
    this.celebrateUntil = now + durationMs;
  }

  draw(now: number): void {
    const { ctx, size } = this;
    if (size === 0 || !this.cabinet) return;
    ctx.clearRect(0, 0, size, size);
    this.measureSuspense(now);
    ctx.drawImage(this.cabinet, 0, 0);
    // The payline runs behind the symbols, so it never hides their lettering.
    this.drawPayline(now);
    this.drawReels(now);
    if (this.glass) ctx.drawImage(this.glass, 0, 0);
    this.drawSweep(now);
    this.drawSuspense();
    this.drawHighlight(now);
    this.drawBulbs(now);
    this.drawHeaderGlow(now);
    this.drawDisplay(now);
    this.drawDeckLights(now);
    this.drawCoins(now);
    this.drawSparkles(now);
    this.drawLever(now);
  }

  // ── State ────────────────────────────────────────────────────────────────

  private setView(view: WheelView): void {
    const signature = wheelSignature(view);
    if (signature === this.signature) {
      this.view = view;
      return;
    }
    this.view = view;
    this.signature = signature;
    this.buildSymbols();
  }

  /** Reel positions and speeds at `t` ms into the current play. */
  private measure(t: number): void {
    const play = this.current;
    if (!play) return;
    play.slots.reels.forEach((motion, r) => {
      this.positions[r] = reelPosition(motion, t);
      this.speeds[r] = Math.abs(reelSpeed(motion, t));
    });
  }

  /** Ticks (at most one per TICK_GAP) as symbols cross the payline; `now` null keeps quiet. */
  private trackCells(now: number | null): void {
    for (let r = 0; r < REELS; r++) {
      const cell = Math.round(this.positions[r]!);
      if (cell === this.lastCells[r]) continue;
      this.lastCells[r] = cell;
      if (now !== null && now - this.lastTick >= TICK_GAP) {
        this.lastTick = now;
        this.onTick?.(clamp(this.speeds[r]! / 20, 0, 1));
      }
    }
  }

  /** Sounds of the moments passed in (from, to]: lever, near miss, reel stops, landing. */
  private fireSounds(slots: SlotsPlay, from: number, to: number): void {
    const passed = (at: number) => at > from && at <= to && to - at < 200;
    if (passed(slots.lever.pullEnd)) leverSound(this.sound);
    slots.reels.forEach((motion, r) => {
      if (motion.tease && passed(motion.tease.holdEnd))
        teaseSound(this.sound, (motion.peak - motion.tease.holdEnd) / 1000);
      if (passed(motion.peak)) clunk(this.sound, r === REELS - 1 ? 1 : 0.75);
    });
    if (passed(slots.landedAt)) jingle(this.sound);
  }

  // ── Caches ───────────────────────────────────────────────────────────────

  private rebuild(): void {
    this.messages.clear();
    this.glows.clear();
    if (this.size === 0) return;
    const { cx, cy, half } = playArea(this.theme, this.size);
    this.frame = { cx, cy, u: half };
    this.cabinet = buildCabinet(this.theme, this.size, this.frame);
    this.glass = buildGlass(this.theme, this.size, this.frame);
    this.bulbs = buildBulbs(this.theme, this.frame);
    const keepOut = [LAYOUT.header, LAYOUT.mount].map((b) => ({
      left: px(this.frame, b.left - 0.02),
      right: px(this.frame, b.right + 0.02),
      top: py(this.frame, b.top - 0.02),
      bottom: py(this.frame, b.bottom + 0.02),
    }));
    this.bulbSpots = bulbPoints(this.frame).filter(
      (p) => !keepOut.some((b) => p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom),
    );
    this.knob = buildKnob(this.theme, LAYOUT.lever.knob * half);
    this.lever = buildLever(this.theme, this.frame);
    const coinR = 0.068 * half;
    this.coin = createCanvas(coinR * 2.8);
    drawCoin(this.coin.getContext('2d')!, this.theme, coinR * 1.4, coinR * 1.4, coinR);
    this.sparkle = buildSparkle(this.theme.palette.trimLight, 0.05 * half);
    this.light = buildLight(this.theme.palette.glow, 0.11 * half);
    this.sweep = buildSweep(0.3 * half, (SCREEN.bottom - SCREEN.top) * half);
    const reel = BOXES[REELS - 1]!;
    this.hotReel = buildReelGlow(
      this.theme.palette.glow,
      (reel.right - reel.left) * half,
      (reel.bottom - reel.top) * half,
      0.02 * half,
      0.035 * half,
    );
    this.buildSymbols();
    this.buildPhotoSymbols();
  }

  private buildSymbols(): void {
    const view = this.view;
    if (this.size === 0 || !view) {
      this.symbols = [];
      return;
    }
    const r = LAYOUT.symbol * this.frame.u;
    const blur = LAYOUT.pitch * this.frame.u * 0.7;
    const count = view.segments.length;
    this.symbols = view.segments.map((segment, i) => {
      const sharp = renderSymbol(this.theme, segment, i, count, r);
      return { sharp, blur: blurSymbol(sharp, blur) };
    });
  }

  private buildPhotoSymbols(): void {
    if (this.size === 0) {
      this.photoSymbols = [];
      return;
    }
    const r = LAYOUT.symbol * this.frame.u;
    this.photoSymbols = this.photos.map((photo) => {
      const sharp = renderPhotoSymbol(this.theme, photo, r);
      return { sharp, blur: blurSymbol(sharp, LAYOUT.pitch * this.frame.u * 0.7) };
    });
  }

  private glow(color: string): HTMLCanvasElement {
    let sprite = this.glows.get(color);
    if (!sprite) {
      sprite = buildGlow(color, LAYOUT.symbol * this.frame.u);
      this.glows.set(color, sprite);
    }
    return sprite;
  }

  private message(text: string): HTMLCanvasElement {
    let sprite = this.messages.get(text);
    if (!sprite) {
      const d = LAYOUT.display;
      const inset = 0.03;
      sprite = renderMessage(
        this.theme,
        text,
        (d.right - d.left - inset * 2) * this.frame.u,
        (d.bottom - d.top - inset * 2) * this.frame.u,
      );
      if (this.messages.size > 40) this.messages.clear();
      this.messages.set(text, sprite);
    }
    return sprite;
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  /** Elapsed play time for drawing (the final state holds once landed). */
  private playTime(now: number): number | null {
    const play = this.current;
    if (!play) return null;
    return Math.max(0, now - play.startedAt);
  }

  private drawReels(now: number): void {
    const { ctx, frame: f } = this;
    const view = this.view;
    const payline = py(f, PAYLINE);
    if (!view || view.segments.length === 0) {
      this.drawEmpty();
      return;
    }
    const play = this.current;
    const t = this.playTime(now) ?? 0;
    const highlighted = this.highlight !== null;
    const pulse = highlighted ? 0.5 + 0.5 * Math.sin((now - this.highlight!.start) / 170) : 0;
    for (let r = 0; r < REELS; r++) {
      const pop = play ? settlePop(play.slots.reels, r, t) : 0;
      const box = BOXES[r]!;
      const x = px(f, (box.left + box.right) / 2);
      const s = play ? this.positions[r]! : 0;
      const speed = play ? this.speeds[r]! : 0;
      const strip = play ? play.slots.strips[r]! : (this.resting[r] ?? []);
      const photos = play ? play.slots.photos[r]! : this.restingPhotos[r];
      const blur = clamp((speed - 4) / 6, 0, 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(px(f, box.left), py(f, box.top), (box.right - box.left) * f.u, (box.bottom - box.top) * f.u);
      ctx.clip();
      const base = Math.floor(s);
      for (let k = base - 2; k <= base + 3; k++) {
        const place = drumPlace(s - k);
        if (!place) continue;
        // Photo cells take the streamer's photos in turn (the same on every overlay).
        const shots = this.photoSymbols.length;
        const sprites =
          photos?.[k + STRIP_MARGIN] && shots > 0
            ? this.photoSymbols[(((k * 3 + r) % shots) + shots) % shots]
            : this.symbols[cellAt(strip, k)];
        if (!sprites) continue;
        const onLine = Math.abs(s - k) < 0.5;
        // The two of a kind breathe while the last reel runs.
        const tense = r < REELS - 1 ? this.suspense * (0.02 + 0.05 * this.suspensePulse) : 0;
        const grow = onLine ? 1 + 0.06 * pulse + 0.13 * pop + tense : 1;
        const y = payline + place.y * f.u;
        this.drawSymbol(sprites, x, y, place.scale * grow, grow, blur);
      }
      ctx.restore();
      if (pop > 0 && play) this.drawLock(x, payline, play.slots.reels[r]!, t);
    }
  }

  /** Suspense level from the moment the second reel rests until the last reel clunks. */
  private measureSuspense(now: number): void {
    const play = this.current;
    const t = this.playTime(now);
    this.suspense = 0;
    this.suspensePulse = 0;
    if (!play || t === null || this.highlight) return;
    const second = play.slots.reels[REELS - 2]!;
    const last = play.slots.reels[REELS - 1]!;
    if (t < second.rest || t >= last.peak) return;
    const since = t - second.rest;
    this.suspense = Math.min(1, since / 220);
    // About 1.5 pulses per second.
    this.suspensePulse = 0.5 - 0.5 * Math.cos(since / 105);
  }

  /** Two of a kind on the payline glow, and the last reel's window burns hot. */
  private drawSuspense(): void {
    const level = this.suspense;
    const hot = this.hotReel;
    if (level <= 0 || !hot) return;
    const { ctx, frame: f } = this;
    const pulse = this.suspensePulse;
    const sprite = this.glow(this.theme.palette.glow);
    const y = py(f, PAYLINE);
    ctx.save();
    ctx.globalAlpha = level * (0.4 + 0.45 * pulse);
    for (let r = 0; r < REELS - 1; r++) {
      const box = BOXES[r]!;
      const w = sprite.width * (1 + 0.05 * pulse);
      ctx.drawImage(sprite, px(f, (box.left + box.right) / 2) - w / 2, y - w / 2, w, w);
    }
    const last = BOXES[REELS - 1]!;
    const pad = (hot.width - (last.right - last.left) * f.u) / 2;
    ctx.globalAlpha = level * (0.55 + 0.45 * pulse);
    ctx.drawImage(hot, px(f, last.left) - pad, py(f, last.top) - pad);
    ctx.restore();
  }

  /** A ring of light bursts from a symbol as its reel locks in place. */
  private drawLock(x: number, y: number, motion: ReelMotion, t: number): void {
    if (t < motion.peak || t >= motion.rest) return;
    const u = (t - motion.peak) / (motion.rest - motion.peak);
    const sprite = this.glow(this.theme.palette.trimLight);
    const w = sprite.width * (0.95 + 0.35 * u);
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = (1 - u) * 0.9;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sprite, x - w / 2, y - w / 2, w, w);
    ctx.restore();
  }

  private drawSymbol(
    sprites: SymbolSprites,
    x: number,
    y: number,
    sy: number,
    sx: number,
    blur: number,
  ): void {
    const { ctx } = this;
    const draw = (image: HTMLCanvasElement, alpha: number, scale: number) => {
      const w = image.width * scale * sx;
      const h = image.height * scale * sy;
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
    };
    if (blur < 0.999) draw(sprites.sharp, 1, 1);
    if (blur > 0.001) draw(sprites.blur, blur, 1 / BLUR_SCALE);
    ctx.globalAlpha = 1;
  }

  /** "No prizes left" (or "Awaiting entrants") in big letters across the glass. */
  private drawEmpty(): void {
    const { ctx, frame: f } = this;
    const view = this.view;
    const text = view ? emptyMessage(view) : '';
    if (!text) return;
    const { display, text: fill, outline } = this.theme.palette;
    const measure = (line: string) => {
      ctx.font = `700 100px ${display}`;
      return ctx.measureText(line).width / 100;
    };
    const width = (SCREEN.right - SCREEN.left) * f.u * 0.85;
    const height = (SCREEN.bottom - SCREEN.top) * f.u * 0.7;
    const fit = fitLabel(text, measure, width, height, 0.2 * f.u, 1.1);
    const x = px(f, (SCREEN.left + SCREEN.right) / 2);
    fit.lines.forEach((line, i) => {
      const y = py(f, PAYLINE) + (i - (fit.lines.length - 1) / 2) * fit.size * 1.1;
      sticker(ctx, line, x, y, fit.size, display, { fill, outline });
    });
  }

  private drawHighlight(now: number): void {
    const highlight = this.highlight;
    if (!highlight || !this.view || this.view.segments.length === 0) return;
    const { ctx, frame: f } = this;
    const style = this.theme.highlight(highlight.tier, highlight.bust);
    const fade = Math.min(1, (now - highlight.start) / 450);
    const pulse = 0.5 + 0.5 * Math.sin((now - highlight.start) / 170);
    const left = px(f, SCREEN.left);
    const width = (SCREEN.right - SCREEN.left) * f.u;
    const line = PAYLINE;
    const band = LAYOUT.pitch * 0.5;
    // Dim the rows above and below the payline.
    ctx.fillStyle = `rgba(${style.shade ?? '0, 0, 0'}, ${style.dim * 1.25 * fade})`;
    ctx.fillRect(left, py(f, SCREEN.top), width, (line - band - SCREEN.top) * f.u);
    ctx.fillRect(left, py(f, line + band), width, (SCREEN.bottom - line - band) * f.u);
    // Light ring around each winning symbol: neon for everyday wins, the tier's gold or the bust red.
    const precious = highlight.tier === 'legendary' || highlight.tier === 'jackpot';
    const sprite = this.glow(highlight.bust || precious ? style.glow : this.theme.palette.glow);
    const y = py(f, line);
    ctx.globalAlpha = fade * (0.55 + 0.45 * pulse);
    for (const box of BOXES) {
      const x = px(f, (box.left + box.right) / 2);
      const grow = 1 + 0.06 * pulse;
      const w = sprite.width * grow;
      ctx.drawImage(sprite, x - w / 2, y - w / 2, w, w);
    }
    ctx.globalAlpha = 1;
  }

  private drawPayline(now: number): void {
    const { ctx, frame: f } = this;
    const y = py(f, PAYLINE);
    const highlight = this.highlight;
    const { trim, trimLight } = this.theme.palette;
    ctx.save();
    ctx.lineCap = 'round';
    if (highlight) {
      const style = this.theme.highlight(highlight.tier, highlight.bust);
      const precious = highlight.tier === 'legendary' || highlight.tier === 'jackpot';
      const color = highlight.bust || precious ? style.glow : this.theme.palette.glow;
      const pulse = 0.5 + 0.5 * Math.sin((now - highlight.start) / 170);
      ctx.shadowColor = color;
      ctx.shadowBlur = f.u * (0.03 + 0.03 * pulse);
      ctx.strokeStyle = color;
      ctx.lineWidth = f.u * (0.022 + 0.008 * pulse);
    } else {
      ctx.strokeStyle = trim;
      ctx.lineWidth = f.u * 0.016;
      ctx.globalAlpha = 0.9;
    }
    ctx.beginPath();
    ctx.moveTo(px(f, SCREEN.left + 0.01), y);
    ctx.lineTo(px(f, SCREEN.right - 0.01), y);
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = trimLight;
    ctx.lineWidth = f.u * 0.005;
    ctx.stroke();
    ctx.restore();
  }

  private drawBulbs(now: number): void {
    const { ctx, bulbs } = this;
    if (!bulbs) return;
    const half = bulbs.on.width / 2;
    const celebrating = now < this.celebrateUntil;
    const t = this.playTime(now) ?? 0;
    const playing = this.isSpinning(now);
    // Lit bulbs travel slowly at rest, fast while the reels spin; party mode alternates (2.5 Hz).
    const phase = playing ? (t / 1000) * 11 : (now / 1000) * 3;
    const flash = Math.floor(now / 400) % 2;
    const settled = this.highlight !== null && !celebrating;
    this.bulbSpots.forEach((p, i) => {
      let on: number;
      if (celebrating) on = i % 2 === flash ? 1 : 0.15;
      else if (settled && this.highlight?.bust) on = 0.14 + 0.1 * Math.sin(now / 900 + i * 0.3);
      else if (settled) on = 0.72 + 0.28 * Math.sin(now / 330 + i * 0.5);
      else on = chaseLevel(i, phase);
      ctx.drawImage(bulbs.off, p.x - half, p.y - half);
      if (on > 0.13) {
        ctx.globalAlpha = on;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(bulbs.on, p.x - half, p.y - half);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    });
  }

  /** What the display says during a play (null at rest, when it cycles through IDLE_LINES). */
  private playLine(now: number): string | null {
    const view = this.view;
    if (!view) return '';
    if (view.segments.length === 0) return 'OUT OF ORDER';
    const play = this.current;
    const t = this.playTime(now);
    if (!play || t === null) return null;
    const { slots } = play;
    const last = slots.reels[REELS - 1]!;
    // The prize shows as soon as the last reel clunks into place.
    if (t >= last.peak || this.highlight) {
      const segment = play.plan.wheel.segments[play.plan.segmentIndex];
      if (!segment) return '';
      const { main, caption } = symbolText(segment);
      return caption && caption.length <= 10 ? `${main} ${caption}` : main;
    }
    if (t < slots.lever.pullEnd) return 'PULL!';
    if (teasing(last, t)) return 'SO CLOSE…';
    // Two of a kind on the payline: one more to go.
    if (t >= slots.reels[REELS - 2]!.peak) return 'ONE MORE…';
    return 'GOOD LUCK';
  }

  private drawDisplay(now: number): void {
    const line = this.playLine(now);
    if (line !== null) {
      if (line) this.drawMessage(line, 1);
      return;
    }
    // At rest the display cycles through its lines, cross-fading.
    const slot = Math.floor(now / IDLE_LINE_MS);
    const fade = Math.min(1, (now - slot * IDLE_LINE_MS) / 350);
    if (fade < 1) this.drawMessage(IDLE_LINES[(slot + IDLE_LINES.length - 1) % IDLE_LINES.length]!, 1 - fade);
    this.drawMessage(IDLE_LINES[slot % IDLE_LINES.length]!, fade);
  }

  private drawMessage(text: string, alpha: number): void {
    const sprite = this.message(text.toUpperCase());
    const d = LAYOUT.display;
    const f = this.frame;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(
      sprite,
      px(f, (d.left + d.right) / 2) - sprite.width / 2,
      py(f, (d.top + d.bottom) / 2) - sprite.height / 2,
    );
    this.ctx.globalAlpha = 1;
  }

  private drawCoins(now: number): void {
    const spill = this.spill;
    const coin = this.coin;
    if (!spill || !coin) return;
    const { ctx, frame: f } = this;
    const t = LAYOUT.tray;
    const cx = (t.left + t.right) / 2;
    const halfW = (t.right - t.left) / 2 - 0.12;
    const from = t.top - 0.04;
    const elapsed = now - spill.start;
    const fade = spill.fadeAt === undefined ? 1 : 1 - (now - spill.fadeAt) / SPILL_FADE_MS;
    if (fade <= 0) {
      this.spill = null;
      return;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, fade);
    for (const c of spill.coins) {
      const fall = coinFall(c, elapsed);
      if (!fall) continue;
      const floor = t.top + 0.12 + c.depth * (t.bottom - t.top - 0.22);
      const x = cx + c.x * halfW * Math.min(1, fall.fall * 1.6);
      const y = from + (floor - from) * fall.fall - fall.hop * 0.3;
      const w = coin.width * c.size;
      const squash = Math.abs(Math.cos(((elapsed - c.delay) / 1000) * c.spin * (1 - fall.fall * 0.85)));
      const h = coin.height * c.size * Math.max(0.25, fall.fall >= 1 && fall.hop === 0 ? 0.55 : squash);
      ctx.drawImage(coin, px(f, x) - w / 2, py(f, y) - h / 2, w, h);
    }
    ctx.restore();
  }

  /** A band of light crosses the glass every few seconds while the reels rest. */
  private drawSweep(now: number): void {
    const sweep = this.sweep;
    if (!sweep || this.isSpinning(now)) return;
    const u = (now % SWEEP_EVERY) / SWEEP_MS;
    if (u >= 1) return;
    const { ctx, frame: f } = this;
    const left = px(f, SCREEN.left);
    const width = (SCREEN.right - SCREEN.left) * f.u;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, py(f, SCREEN.top), width, (SCREEN.bottom - SCREEN.top) * f.u);
    ctx.clip();
    ctx.drawImage(sweep, left - sweep.width + (width + sweep.width) * u, py(f, SCREEN.top));
    ctx.restore();
  }

  /** The JACKPOT plate lights up while the party lasts. */
  private drawHeaderGlow(now: number): void {
    const light = this.light;
    if (!light || now >= this.celebrateUntil) return;
    const { ctx, frame: f } = this;
    const h = LAYOUT.header;
    const w = (h.right - h.left) * f.u * 1.3;
    const height = (h.bottom - h.top) * f.u * 2.2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(now / 240);
    ctx.drawImage(
      light,
      px(f, (h.left + h.right) / 2) - w / 2,
      py(f, (h.top + h.bottom) / 2) - height / 2,
      w,
      height,
    );
    ctx.restore();
  }

  /** Twinkles on the gold trim. */
  private drawSparkles(now: number): void {
    const sprite = this.sparkle;
    if (!sprite) return;
    const { ctx, frame: f } = this;
    const fast = now < this.celebrateUntil ? 2.2 : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    SPARKLES.forEach(([x, y], i) => {
      const wave = Math.sin((now / 900) * fast + i * 2.1);
      if (wave <= 0.3) return;
      const level = ((wave - 0.3) / 0.7) ** 2;
      const w = sprite.width * (0.5 + 0.6 * level);
      ctx.globalAlpha = level;
      ctx.drawImage(sprite, px(f, x) - w / 2, py(f, y) - w / 2, w, w);
    });
    ctx.restore();
  }

  /** Deck buttons: chasing while the reels spin, all aglow after a win, SPIN breathing at rest. */
  private drawDeckLights(now: number): void {
    const light = this.light;
    if (!light) return;
    const { ctx, frame: f } = this;
    const y = py(f, (LAYOUT.deck.top + LAYOUT.deck.bottom) / 2);
    const t = this.playTime(now);
    const spinning = this.isSpinning(now);
    const levels = LAYOUT.buttons.map((_, i) => {
      if (spinning && t !== null) return Math.floor(t / 250) % LAYOUT.buttons.length === i ? 1 : 0;
      if (this.highlight) return 0.6 + 0.4 * Math.sin((now - this.highlight.start) / 300 + i);
      return 0;
    });
    const spin = spinning ? 1 : this.highlight ? 0.4 : 0.35 + 0.35 * Math.sin((now / 2000) * Math.PI * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const w = light.width;
    LAYOUT.buttons.forEach((x, i) => {
      const level = levels[i]!;
      if (level <= 0.01) return;
      ctx.globalAlpha = level * 0.85;
      ctx.drawImage(light, px(f, x) - w / 2, y - w / 2);
    });
    if (spin > 0.01) {
      const sw = LAYOUT.spinButton.width * f.u * 1.1;
      ctx.globalAlpha = spin * 0.7;
      ctx.drawImage(light, px(f, LAYOUT.spinButton.x) - sw / 2, y - w / 2, sw, w);
    }
    ctx.restore();
  }

  /** Whether the reels are moving (a play between the lever pull and the landing). */
  private isSpinning(now: number): boolean {
    const t = this.playTime(now);
    return t !== null && this.current !== null && t < this.current.slots.landedAt;
  }

  private drawLever(now: number): void {
    const { knob, lever, light } = this;
    if (!knob || !lever) return;
    const { ctx, frame: f } = this;
    const L = LAYOUT.lever;
    const t = this.playTime(now);
    const angle = t !== null && this.current ? leverAngle(this.current.slots.lever, t) : 0;
    const resting = angle === 0;
    const breath = Math.sin((now / 2600) * Math.PI * 2);
    // Past 90° the knob swings toward the viewer (bigger), past the top away from them.
    const knobY = py(f, L.pivot - L.length * Math.cos(angle) + (resting ? breath * 0.014 : 0));
    const scale = clamp(1 + 0.22 * Math.sin(angle), 0.85, 1.25);
    const pivot = { x: px(f, L.x), y: py(f, L.pivot) };
    if (resting && light) {
      // A soft breathing glow invites the pull.
      const w = L.knob * f.u * 3.2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 + 0.15 * breath;
      ctx.drawImage(light, pivot.x - w / 2, knobY - w / 2, w, w);
      ctx.restore();
    }
    drawRod(ctx, lever, pivot, knobY);
    const w = knob.width * scale;
    ctx.drawImage(knob, pivot.x - w / 2, knobY - w / 2, w, w);
  }
}

/** Copies a photo into a small canvas (longest side PHOTO_SIDE). */
function scaleDown(photo: HTMLImageElement): HTMLCanvasElement {
  const w = photo.naturalWidth || 1;
  const h = photo.naturalHeight || 1;
  const scale = Math.min(1, PHOTO_SIDE / Math.max(w, h));
  const canvas = createCanvas(w * scale, h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  return canvas;
}
