import type { Tier } from '../../../shared/schema';
import type { WheelView } from '../../../shared/types';
import type { SoundBoard } from '../audio';
import type { HighlightStyle, WheelTheme } from '../themes/types';
import { createCanvas, wheelSignature } from '../wheel-face';
import {
  buildBoard,
  buildBeam,
  buildBulbs,
  buildCarriage,
  buildCoin,
  buildFlash,
  buildGlow,
  buildMedallion,
  buildMessage,
  buildNeon,
  buildPlateGlow,
  buildPlates,
  buildSpark,
  buildTag,
  plateRect,
  px,
  py,
  roundRect,
  SIGNS,
  type Frame,
  type Neon,
  type PlateStrip,
} from './plinko-art';
import {
  binCenter,
  boardGeometry,
  BORDER,
  bulbLevel,
  bulbPoints,
  CABINET,
  carriageKick,
  carriageX,
  clamp01,
  coinAt,
  FIELD,
  flashes,
  litPegs,
  idleCoin,
  idleWave,
  landingRing,
  partyWave,
  pegCount,
  pegPosition,
  plateDip,
  planDrop,
  RAIL,
  sparks,
  twinkle,
  type BoardGeometry,
  type BulbMode,
  type CoinPose,
  type Drop,
} from './plinko-math';
import { landChime, pegPing, releaseClick } from './plinko-sounds';
import { playArea, type GameStage, type PlayPlan, type StageContext } from './types';

/**
 * Board placement in the play area per look: the casino chrome lays its name plate over the bottom
 * of the play area, where the prize bins are, so the board sits a little higher and smaller there.
 */
const BOARD_FIT: Partial<Record<WheelTheme['id'], { dy: number; scale: number }>> = {
  casino: { dy: -0.085, scale: 0.955 },
};
/** Fewest milliseconds between two ticks (≤ 25 per second). */
const TICK_GAP = 40;
/** Longest side of a photo shown in the corner medallions. */
const PHOTO_SIDE = 280;
/** Trail of the falling coin: ghosts this many ms apart. */
const TRAIL = [16, 32, 50, 70, 92] as const;
/** How far a plate sinks under the coin (play-area units). */
const DIP = 0.02;

interface Play {
  plan: PlayPlan;
  drop: Drop;
  startedAt: number;
}

interface Highlight {
  index: number;
  tier: Tier;
  bust: boolean;
  start: number;
  style: HighlightStyle;
  glow: HTMLCanvasElement;
  beam: HTMLCanvasElement;
  tag: { canvas: HTMLCanvasElement; width: number; height: number; margin: number } | null;
}

/**
 * Simp Drop: a pink plinko cabinet. A heart carriage carries a "$" coin along a gold rail, sways and
 * lets go; the coin bounces down a triangle of pearl pegs (each hit flashes and pings) along a
 * seeded path that ends in the winning prize's bin, where it settles with a bounce.
 */
export class PlinkoStage implements GameStage {
  onTick: ((speed: number) => void) | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sound: SoundBoard;
  private theme: WheelTheme;
  private size = 0;
  private dpr = 1;
  private frame: Frame = { cx: 0, cy: 0, u: 1 };

  private view: WheelView | null = null;
  private signature = '';
  private geo: BoardGeometry = boardGeometry(0);

  // Cached layers, rebuilt on resize / theme / fonts / wheel change.
  private board: HTMLCanvasElement | null = null;
  private plates: PlateStrip | null = null;
  private plateRects: ReturnType<typeof plateRect>[] = [];
  private pegGlow: HTMLCanvasElement | null = null;
  private flash: HTMLCanvasElement | null = null;
  private spark: HTMLCanvasElement | null = null;
  private coin: HTMLCanvasElement | null = null;
  private coinGlow: HTMLCanvasElement | null = null;
  /** Soft light that follows the coin over the glass. */
  private pool: HTMLCanvasElement | null = null;
  private carriage: HTMLCanvasElement | null = null;
  private bulbs: { on: HTMLCanvasElement; off: HTMLCanvasElement } | null = null;
  private bulbSpots: { x: number; y: number }[] = [];
  private neon: Neon | null = null;
  private medallions: HTMLCanvasElement[] = [];
  private message: HTMLCanvasElement | null = null;

  private photos: HTMLCanvasElement[] = [];
  private photoSeconds = 8;

  private current: Play | null = null;
  /** Milliseconds into the current play at the last update, and the matching clock time. */
  private elapsed = 0;
  private lastUpdate = 0;
  private lastTick = -Infinity;
  /** When a new coin appeared in the carriage (after a play), for its pop-in. */
  private coinSince = -Infinity;

  private highlight: Highlight | null = null;
  private celebrateFrom = 0;
  private celebrateUntil = 0;

  constructor({ canvas, theme, sound }: StageContext) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.theme = theme;
    this.sound = sound;
  }

  get center(): { x: number; y: number; radius: number } {
    const f = this.frame;
    const radius = (0.35 * f.u) / this.dpr;
    const index = this.highlight?.index ?? null;
    if (index === null || this.geo.bins === 0) return { x: f.cx / this.dpr, y: f.cy / this.dpr, radius };
    // The overlay bursts confetti at `y − 0.55 × radius`: just above the winning bin.
    const x = px(f, binCenter(this.geo, index)) / this.dpr;
    return { x, y: py(f, this.geo.binTop - 0.04) / this.dpr + radius * 0.55, radius };
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

  setPhotos(photos: readonly HTMLImageElement[], seconds: number): void {
    this.photos = photos.slice(0, 12).map(scaleDown);
    this.photoSeconds = Math.max(2, seconds || 8);
    this.buildMedallions();
  }

  show(view: WheelView, _rotation: number, now: number): void {
    // A fresh coin pops into the carriage once a play is over.
    if (this.current) this.coinSince = now;
    this.current = null;
    this.setView(view);
  }

  play(plan: PlayPlan, startedAt: number, now: number): void {
    this.setView(plan.wheel);
    this.highlight = null;
    this.celebrateUntil = 0;
    this.coinSince = -Infinity;
    this.lastTick = -Infinity;
    if (plan.wheel.segments.length === 0) {
      this.current = null;
      return;
    }
    const drop = planDrop(plan.wheel.segments.length, plan.segmentIndex, plan.seed, plan.durationMs);
    this.current = { plan, drop, startedAt };
    // Events already past (an overlay joining late) stay silent.
    this.elapsed = now - startedAt;
    this.lastUpdate = now;
  }

  update(now: number): boolean {
    const play = this.current;
    if (!play) return true;
    const t = now - play.startedAt;
    // Frames after a long pause (or a late join) catch up silently.
    const live = now - this.lastUpdate < 150 && t > this.elapsed;
    if (live) this.fireEvents(play.drop, this.elapsed, t, now);
    this.elapsed = Math.max(this.elapsed, t);
    this.lastUpdate = now;
    return t >= play.drop.durationMs;
  }

  setHighlight(index: number | null, tier: Tier = 'common', bust = false, now = performance.now()): void {
    if (index === null || !this.view || index < 0 || index >= this.geo.bins) {
      this.highlight = null;
      return;
    }
    const style = this.theme.highlight(tier, bust);
    const f = this.frame;
    const rect = plateRect(f, this.geo, index);
    const legible = this.plates?.legible[index] ?? false;
    const segment = this.view.segments[index]!;
    const tag = legible
      ? null
      : buildTag(this.theme, segment, index, this.view.segments.length, 0.13 * f.u, 0.95 * f.u);
    this.highlight = {
      index,
      tier,
      bust,
      start: now,
      style,
      glow: buildPlateGlow(style.glow, rect.width, rect.height, rect.radius, f.u * 0.05),
      beam: buildBeam(
        style.glow,
        Math.min(Math.max(rect.width * 1.8, f.u * 0.2), rect.width + f.u * 0.14),
        (this.geo.plateTop - this.geo.top + this.geo.rowGap) * f.u * 0.75,
      ),
      tag,
    };
  }

  celebrate(durationMs: number, now = performance.now()): void {
    this.celebrateFrom = now;
    this.celebrateUntil = now + durationMs;
  }

  draw(now: number): void {
    const { ctx, size } = this;
    if (size === 0 || !this.board) return;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.board, 0, 0);
    const play = this.current;
    const t = play ? Math.max(0, now - play.startedAt) : 0;
    this.drawSigns(now);
    this.drawPegLights(now, t);
    this.drawPlates(now, t);
    this.drawCarriageAndCoin(now, t);
    this.drawBulbs(now);
    this.drawTag(now);
    if (this.message) {
      const m = this.message;
      ctx.drawImage(m, this.frame.cx - m.width / 2, py(this.frame, 0.05) - m.height / 2);
    }
  }

  // ── State ────────────────────────────────────────────────────────────────

  private setView(view: WheelView): void {
    const signature = wheelSignature(view);
    this.view = view;
    if (signature === this.signature) return;
    this.signature = signature;
    this.geo = boardGeometry(view.segments.length);
    this.highlight = null;
    this.rebuildBoard();
  }

  /** Ticks, pings and chimes of the moments passed in (from, to]. */
  private fireEvents(drop: Drop, from: number, to: number, now: number): void {
    const passed = (at: number) => at > from && at <= to && to - at < 200;
    if (passed(drop.releaseAt)) releaseClick(this.sound);
    for (const hit of drop.hits) {
      if (!passed(hit.t)) continue;
      if (now - this.lastTick >= TICK_GAP) {
        this.lastTick = now;
        this.onTick?.(0.25 + 0.75 * hit.depth);
        pegPing(this.sound, hit.depth);
      }
    }
    if (passed(drop.landAt)) landChime(this.sound);
    for (let i = 1; i < drop.plateHits.length; i++) {
      if (passed(drop.plateHits[i]!.t) && now - this.lastTick >= TICK_GAP) {
        this.lastTick = now;
        this.onTick?.(0.2);
      }
    }
  }

  // ── Caches ───────────────────────────────────────────────────────────────

  private rebuild(): void {
    if (this.size === 0) return;
    const { cx, cy, half } = playArea(this.theme, this.size);
    const fit = BOARD_FIT[this.theme.id] ?? { dy: 0, scale: 1 };
    this.frame = { cx, cy: cy + fit.dy * half, u: half * fit.scale };
    const u = this.frame.u;
    this.bulbs = buildBulbs(this.theme, 0.015 * u);
    const inset = BORDER / 2;
    const ring = {
      left: CABINET.left + inset,
      right: CABINET.right - inset,
      top: CABINET.top + inset,
      bottom: CABINET.bottom - inset,
    };
    this.bulbSpots = bulbPoints(ring, CABINET.radius - inset, 0.105).map((p) => ({
      x: px(this.frame, p.x),
      y: py(this.frame, p.y),
    }));
    this.neon = buildNeon(this.theme, SIGNS.r * u);
    this.carriage = buildCarriage(this.theme, 0.1 * u);
    this.pool = buildGlow(this.theme.palette.glow, 0.3 * u, 0.3);
    this.rebuildBoard();
    this.buildMedallions();
  }

  /** Layers that depend on the wheel (bins, pegs) as well as the size and the theme. */
  private rebuildBoard(): void {
    if (this.size === 0) return;
    const f = this.frame;
    const geo = this.geo;
    const board = buildBoard(this.theme, this.size, f, geo);
    // The bulbs' unlit state belongs to the static layer.
    const bctx = board.getContext('2d')!;
    const off = this.bulbs?.off;
    if (off) for (const p of this.bulbSpots) bctx.drawImage(off, p.x - off.width / 2, p.y - off.height / 2);
    this.board = board;
    const view = this.view;
    this.plates = view && geo.bins > 0 ? buildPlates(this.theme, f, geo, view) : null;
    this.plateRects = Array.from({ length: geo.bins }, (_, i) => plateRect(f, geo, i));
    const pegR = geo.pegRadius * f.u;
    this.pegGlow = buildGlow(this.theme.palette.glow, pegR * 4, 0.95);
    this.flash = buildFlash(this.theme, pegR);
    this.spark = buildSpark(this.theme, geo.spacing * f.u * 0.12);
    const coinR = geo.coinRadius * f.u;
    this.coin = buildCoin(this.theme, coinR);
    this.coinGlow = buildGlow(this.theme.palette.glow, coinR * 2.4, 0.75);
    this.message =
      view && view.segments.length === 0
        ? buildMessage(
            this.theme,
            view.kind === 'raffle' ? 'Awaiting entrants' : 'No prizes left',
            0.13 * f.u,
            (FIELD.right - FIELD.left - 0.2) * f.u,
          )
        : null;
    // Plates and the highlight glow depend on the layout.
    if (this.highlight && this.view) {
      const { index, tier, bust, start } = this.highlight;
      this.setHighlight(index, tier, bust, start);
    }
  }

  private buildMedallions(): void {
    this.medallions =
      this.size === 0 ? [] : this.photos.map((p) => buildMedallion(this.theme, p, SIGNS.r * this.frame.u));
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  /** Neon heart and dollar in the top corners (or photo medallions), breathing gently. */
  private drawSigns(now: number): void {
    const { ctx, frame: f, neon } = this;
    if (!neon) return;
    const y = py(f, SIGNS.y);
    const party = now < this.celebrateUntil;
    const level = party ? 0.85 + 0.15 * Math.sin(now / 160) : 0.62 + 0.18 * Math.sin(now / 1300);
    const spots = [
      { x: px(f, -SIGNS.x), sign: neon.heart, slot: 0 },
      { x: px(f, SIGNS.x), sign: neon.dollar, slot: 1 },
    ];
    const photos = this.medallions;
    const cycle = Math.floor(now / (this.photoSeconds * 1000));
    for (const spot of spots) {
      const usePhoto = photos.length >= 2 || (photos.length === 1 && spot.slot === 0);
      if (usePhoto) {
        const k = photos.length === 1 ? 0 : (cycle * 2 + spot.slot) % photos.length;
        const m = photos[k]!;
        ctx.drawImage(m, spot.x - m.width / 2, y - m.height / 2);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = level;
      ctx.drawImage(spot.sign, spot.x - spot.sign.width / 2, y - spot.sign.height / 2);
      ctx.restore();
    }
  }

  /** Twinkles and the idle wave at rest; hit flashes while playing; the party wave after a win. */
  private drawPegLights(now: number, t: number): void {
    const { ctx, frame: f, geo, pegGlow, flash } = this;
    if (!pegGlow || !flash) return;
    const play = this.current;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glowAt = (row: number, j: number, level: number, scale = 1) => {
      const p = pegPosition(geo, row, j);
      const w = pegGlow.width * scale;
      ctx.globalAlpha = Math.min(1, level);
      ctx.drawImage(pegGlow, px(f, p.x) - w / 2, py(f, p.y) - w / 2, w, w);
    };
    const resting = !play || t >= play.drop.durationMs;
    if (resting && !this.highlight) {
      for (let row = 0; row < geo.rows; row++) {
        const wave = idleWave(row / Math.max(1, geo.rows - 1), now) * 0.55;
        for (let j = 0; j < pegCount(row); j++) {
          const level = Math.max(wave, twinkle(row, j, now) * 0.9);
          if (level > 0.03) glowAt(row, j, level);
        }
      }
    }
    if (now < this.celebrateUntil) {
      // Rings of light spread from the winning bin (or from the middle of the tray).
      const origin = { x: this.highlight ? binCenter(geo, this.highlight.index) : 0, y: geo.binTop };
      const fade = clamp01((this.celebrateUntil - now) / 600);
      for (let row = 0; row < geo.rows; row++) {
        for (let j = 0; j < pegCount(row); j++) {
          const p = pegPosition(geo, row, j);
          const level =
            partyWave(Math.hypot(p.x - origin.x, p.y - origin.y), now - this.celebrateFrom) * fade;
          if (level > 0.03) glowAt(row, j, level, 1.25);
        }
      }
    }
    if (play) {
      // The path so far keeps a soft afterglow.
      for (const hit of litPegs(play.drop, t)) glowAt(hit.row, hit.peg, 0.32);
      for (const hit of flashes(play.drop, t)) {
        const p = pegPosition(geo, hit.row, hit.peg);
        const x = px(f, p.x);
        const y = py(f, p.y);
        const w = flash.width * (0.75 + 0.35 * hit.level);
        ctx.globalAlpha = hit.level;
        ctx.drawImage(flash, x - w / 2, y - w / 2, w, w);
        // A ring ripples out of the peg.
        const r = geo.pegRadius * f.u * (1.6 + 3.2 * (1 - hit.level));
        ctx.globalAlpha = hit.level * 0.8;
        ctx.strokeStyle = this.theme.palette.trimLight;
        ctx.lineWidth = Math.max(1, f.u * 0.005);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      const spark = this.spark;
      if (spark) {
        for (const p of sparks(play.drop, t)) {
          const w = p.size * geo.spacing * f.u * 2.4;
          ctx.globalAlpha = p.alpha;
          ctx.drawImage(spark, px(f, p.x) - w / 2, py(f, p.y) - w / 2, w, w);
        }
      }
    }
    ctx.restore();
  }

  private drawPlates(now: number, t: number): void {
    const { ctx, frame: f, geo, plates } = this;
    if (!plates) return;
    const play = this.current;
    const hl = this.highlight;
    const pulse = hl ? 0.5 + 0.5 * Math.sin((now - hl.start) / 165) : 0;
    const appear = hl ? clamp01((now - hl.start) / 250) : 0;
    if (hl) {
      const rect = this.plateRects[hl.index]!;
      const g = hl.glow;
      const beam = hl.beam;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = appear * (0.6 + 0.4 * pulse);
      ctx.drawImage(
        beam,
        rect.left + rect.width / 2 - beam.width / 2,
        rect.top + rect.height * 0.3 - beam.height,
      );
      ctx.globalAlpha = appear * (0.75 + 0.25 * pulse);
      ctx.drawImage(g, rect.left + rect.width / 2 - g.width / 2, rect.top + rect.height / 2 - g.height / 2);
      ctx.restore();
    }
    const dip = play ? plateDip(play.drop, t) * DIP * f.u : 0;
    for (let i = 0; i < geo.bins; i++) {
      const sx = plates.edges[i]!;
      const sw = plates.edges[i + 1]! - sx;
      if (sw <= 0) continue;
      const lift = hl && i === hl.index ? -this.winnerLift(now) : 0;
      const dy = (play && i === play.drop.target ? dip : 0) + lift;
      ctx.drawImage(
        plates.canvas,
        sx,
        0,
        sw,
        plates.canvas.height,
        plates.x + sx,
        plates.y + dy,
        sw,
        plates.canvas.height,
      );
    }
    if (!hl) return;
    // The winner brightens with the pulse; the others sink into the shade.
    ctx.save();
    for (let i = 0; i < geo.bins; i++) {
      const rect = this.plateRects[i]!;
      if (i === hl.index) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${hl.style.fill}, ${0.1 + 0.18 * pulse * appear})`;
        roundRect(ctx, rect.left, rect.top - this.winnerLift(now), rect.width, rect.height, rect.radius);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = Math.max(2, f.u * 0.008);
        ctx.strokeStyle = hl.style.glow;
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${hl.style.shade ?? '0, 0, 0'}, ${hl.style.dim * appear})`;
        roundRect(ctx, rect.left - 1, rect.top - 1, rect.width + 2, rect.height + 2, rect.radius);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** How far the winning plate (and the coin on it) rises, in px, breathing with the pulse. */
  private winnerLift(now: number): number {
    const hl = this.highlight;
    if (!hl) return 0;
    const since = now - hl.start;
    const pulse = 0.5 + 0.5 * Math.sin(since / 165);
    return clamp01(since / 250) * this.frame.u * 0.012 * (0.6 + 0.4 * pulse);
  }

  private drawCarriageAndCoin(now: number, t: number): void {
    const { ctx, frame: f, geo, coin, coinGlow, carriage } = this;
    if (!coin || !coinGlow || !carriage) return;
    const play = this.current;
    const drop = play?.drop ?? null;
    const empty = geo.bins === 0;
    // Carriage on the rail.
    const cx = drop ? carriageX(drop, t) : Math.sin(now / 1700) * geo.spacing * 0.12;
    const kick = drop ? carriageKick(drop, t) : 0;
    const pivot = { x: px(f, cx), y: py(f, RAIL.y + 0.012) - kick * f.u * 0.014 };
    const pose: CoinPose = drop ? coinAt(drop, t) : idleCoin(geo, now);
    const carried = !drop || pose.flight < 0;
    let coinX = px(f, pose.x);
    let coinY = py(f, pose.y);
    const coinR = geo.coinRadius * f.u;
    if (carried && !drop) {
      // At rest the coin hangs under the carriage, swinging a little with it.
      const swing = Math.sin(now / 1700 - 0.6) * 0.1 + pose.angle * 0.4;
      const length = coinY - pivot.y;
      coinX = pivot.x + Math.sin(swing) * length;
      coinY = pivot.y + Math.cos(swing) * length;
    } else if (carried) {
      const length = coinY - pivot.y;
      coinX = pivot.x + Math.sin(pose.angle) * length;
      coinY = pivot.y + Math.cos(pose.angle) * length;
    }
    // Rod and grip.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.theme.palette.trim;
    ctx.lineWidth = f.u * 0.007;
    const gripX = carried ? coinX : pivot.x;
    const gripY = carried ? coinY - coinR * 0.92 : pivot.y + (py(f, geo.hopper.y) - coinR - pivot.y) * 0.75;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(gripX, gripY);
    ctx.stroke();
    ctx.lineWidth = f.u * 0.011;
    ctx.beginPath();
    ctx.moveTo(gripX - coinR * 0.42, gripY + coinR * 0.06);
    ctx.lineTo(gripX + coinR * 0.42, gripY + coinR * 0.06);
    ctx.stroke();
    ctx.restore();
    ctx.drawImage(carriage, pivot.x - carriage.width / 2, pivot.y - carriage.height / 2);

    if (empty) return;
    // A fresh coin pops in after a play.
    const pop = drop ? 1 : popScale(now - this.coinSince);
    if (pop <= 0) return;

    // Light pool, comet trail and aura while it falls.
    if (drop && pose.flight >= 0 && t < drop.landAt + 60) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (this.pool) {
        ctx.globalAlpha = 0.9;
        ctx.drawImage(this.pool, coinX - this.pool.width / 2, coinY - this.pool.height / 2);
      }
      TRAIL.forEach((lag, k) => {
        if (t - lag < drop.releaseAt) return;
        const ghost = coinAt(drop, t - lag);
        const w = coinGlow.width * (0.85 - k * 0.1);
        ctx.globalAlpha = 0.42 * (1 - k / TRAIL.length);
        ctx.drawImage(coinGlow, px(f, ghost.x) - w / 2, py(f, ghost.y) - w / 2, w, w);
      });
      ctx.restore();
    }
    // Near the bottom, the plates under the coin warm up: where is it heading?
    if (drop && this.pool && pose.flight >= 0 && t < drop.landAt) {
      const from = drop.hits[Math.max(0, drop.hits.length - 4)]!.t;
      const heat = clamp01((t - from) / Math.max(1, drop.landAt - from));
      if (heat > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.65 * heat;
        const w = this.pool.width * 0.8;
        ctx.drawImage(this.pool, coinX - w / 2, py(f, geo.plateTop) - w / 2, w, w);
        ctx.restore();
      }
    }
    const won = this.highlight !== null;
    const auraLevel = won
      ? 0.6 + 0.4 * Math.sin((now - this.highlight!.start) / 165)
      : drop && pose.flight >= 0
        ? 0.7
        : 0.45;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = auraLevel;
    ctx.drawImage(coinGlow, coinX - coinGlow.width / 2, coinY - coinGlow.height / 2);
    ctx.restore();

    // The coin sinks with its plate while it rests on it.
    if (drop && pose.flight >= drop.landFlight && Math.abs(pose.y - drop.rest.y) < geo.coinRadius * 0.05) {
      coinY += Math.max(0, plateDip(drop, t)) * DIP * f.u - this.winnerLift(now);
    }
    const ring = drop ? landingRing(drop, t) : null;
    if (drop && ring) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = ring.alpha;
      ctx.strokeStyle = this.theme.palette.trimLight;
      ctx.shadowColor = this.theme.palette.glow;
      ctx.shadowBlur = f.u * 0.02;
      ctx.lineWidth = f.u * 0.008;
      ctx.beginPath();
      ctx.ellipse(
        px(f, drop.rest.x),
        py(f, drop.rest.y + geo.coinRadius),
        ring.radius * f.u,
        ring.radius * f.u * 0.4,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
    const squash = pose.squash * 0.2;
    ctx.save();
    ctx.translate(coinX, coinY + squash * coinR * 0.5);
    ctx.rotate(pose.angle);
    ctx.scale(pose.flip * (1 + squash * 0.6) * pop, (1 - squash) * pop);
    ctx.drawImage(coin, -coin.width / 2, -coin.height / 2);
    ctx.restore();
  }

  private drawBulbs(now: number): void {
    const { ctx, bulbs } = this;
    if (!bulbs) return;
    const play = this.current;
    const t = play ? now - play.startedAt : 0;
    const mode: BulbMode =
      now < this.celebrateUntil
        ? 'party'
        : this.highlight
          ? 'win'
          : play && t < play.drop.durationMs
            ? 'play'
            : 'idle';
    const count = this.bulbSpots.length;
    const on = bulbs.on;
    ctx.save();
    this.bulbSpots.forEach((p, i) => {
      const level = bulbLevel(i, count, now, mode);
      if (level <= 0.02) return;
      ctx.globalAlpha = level;
      ctx.drawImage(on, p.x - on.width / 2, p.y - on.height / 2);
    });
    ctx.restore();
  }

  /** The winner's tag springs out of its plate, bigger than the plates around it. */
  private drawTag(now: number): void {
    const hl = this.highlight;
    const tag = hl?.tag;
    if (!hl || !tag) return;
    const { ctx, frame: f } = this;
    const since = now - hl.start - 120;
    const scale = popScale(since);
    if (scale <= 0) return;
    const rect = this.plateRects[hl.index]!;
    const binX = rect.left + rect.width / 2;
    const half = tag.width / 2 + f.u * 0.012;
    const x = Math.min(px(f, FIELD.right) - half, Math.max(px(f, FIELD.left) + half, binX));
    const y = rect.top + rect.height * 0.55 + Math.sin(since / 420) * f.u * 0.004;
    ctx.save();
    ctx.translate(binX, y);
    ctx.scale(scale, scale);
    ctx.translate(-binX, -y);
    ctx.drawImage(tag.canvas, x - tag.canvas.width / 2, y - tag.canvas.height / 2);
    ctx.restore();
  }
}

/** Overshooting pop-in: 0 → 1 over ~350 ms (0 before it starts). */
function popScale(since: number): number {
  if (since < 0) return 0;
  if (since >= 420) return 1;
  const u = since / 420;
  return 1 - Math.exp(-6 * u) * Math.cos(u * 9);
}

/** A photo scaled down for the medallions (and decoded once). */
function scaleDown(image: HTMLImageElement): HTMLCanvasElement {
  const w = image.naturalWidth || image.width || 1;
  const h = image.naturalHeight || image.height || 1;
  const k = Math.min(1, PHOTO_SIDE / Math.max(w, h));
  const canvas = createCanvas(w * k, h * k);
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
