import type { Tier } from '../../../shared/schema';
import type { WheelView } from '../../../shared/types';
import type { SoundBoard } from '../audio';
import type { WheelTheme } from '../themes/types';
import { TAU, wheelSignature } from '../wheel-face';
import {
  emptyMessage,
  giftPapers,
  renderRing,
  PODIUM,
  podiumBulbs,
  px,
  py,
  renderBeam,
  renderBox,
  renderBulbs,
  renderCard,
  renderGlow,
  renderMessage,
  renderPiece,
  renderPodium,
  renderPool,
  renderRays,
  renderSparkle,
  renderSpotlight,
  shaded,
  type BoxSprites,
  type CardSprite,
  type Frame,
  type Paper,
} from './gifts-art';
import {
  arcAt,
  blankPose,
  BOX,
  boxCount,
  burstParticles,
  clamp,
  easeOutCubic,
  FLOOR_Y,
  focusDim,
  giftsLayout,
  MAX_BOXES,
  mouthOf,
  particleAt,
  peekPose,
  planGifts,
  poseBoxes,
  prizePose,
  restPose,
  REVEAL,
  smooth,
  spotAim,
  TICK_GAP,
  type BoxPose,
  type GiftsEvent,
  type GiftsLayout,
  type GiftsPlay,
  type Particle,
  type PrizePose,
} from './gifts-math';
import { drumrollSound, hopSound, peekSound, popSound, whooshSound } from './gifts-sounds';
import { playArea, type GameStage, type PlayPlan, type StageContext } from './types';

/** Height of the won prize's card, in play-area units (missed prizes are drawn smaller). */
const CARD_H = 0.4;
/** Boxes drop back onto the podium one after the other when the stage resets. */
const RESTOCK_STAGGER = 90;
const RESTOCK_DROP = 520;
/** Lid-burst pieces. */
const PIECES = 34;
/** Motion trail of a box flying over another: ghosts this many ms behind. */
const GHOSTS = [26, 52] as const;
/** Events older than this are skipped instead of played late. */
const STALE_MS = 200;
/** Podium bulbs: how many, and how often the chase steps (each bulb blinks ≤ 3 times a second). */
const BULBS = 15;

interface Play {
  plan: PlayPlan;
  gifts: GiftsPlay;
  startedAt: number;
  particles: Particle[];
}

interface CardSprites {
  sharp: CardSprite;
  dim: HTMLCanvasElement;
}

/**
 * Mystery Gifts: 3–5 wrapped boxes on a pink podium under a spotlight. A play hops the boxes,
 * shuffles them like a shell game (faster, then slower), wiggles the chosen one until its lid pops
 * and the won prize rises out as a big sticker card; then the other boxes open to show what was
 * missed.
 */
export class GiftsStage implements GameStage {
  onTick: ((speed: number) => void) | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sound: SoundBoard;
  private theme: WheelTheme;
  private size = 0;
  private dpr = 1;
  private frame: Frame = { cx: 0, cy: 0, u: 1 };

  // Cached layers, rebuilt on resize / theme / fonts / wheel change.
  private papers: Paper[] = [];
  private boxes: BoxSprites[] = [];
  private boxesFor = 0;
  private podium: HTMLCanvasElement | null = null;
  private spotlight: { canvas: HTMLCanvasElement; apexX: number; apexY: number } | null = null;
  private bulbs: { on: HTMLCanvasElement; off: HTMLCanvasElement } | null = null;
  private bulbSpots: { x: number; y: number }[] = [];
  private rays: HTMLCanvasElement | null = null;
  private raysBust: HTMLCanvasElement | null = null;
  private halo: HTMLCanvasElement | null = null;
  private leak: HTMLCanvasElement | null = null;
  private beam: HTMLCanvasElement | null = null;
  private sparkle: HTMLCanvasElement | null = null;
  private shadow: HTMLCanvasElement | null = null;
  private pool: HTMLCanvasElement | null = null;
  private boxGlow: HTMLCanvasElement | null = null;
  private ring: HTMLCanvasElement | null = null;
  private mystery: CardSprite | null = null;
  private pieces: HTMLCanvasElement[][] = [];
  private cards = new Map<number, CardSprites>();
  private message: { text: string; sprite: HTMLCanvasElement } | null = null;

  private view: WheelView | null = null;
  private signature = '';
  private layout: GiftsLayout = giftsLayout(3);
  private current: Play | null = null;
  /** When the boxes last dropped back onto the podium (idle). */
  private restockAt = -Infinity;
  /** Milliseconds into the current play at the last update, and the matching clock time. */
  private elapsed = 0;
  private lastUpdate = 0;
  private lastTick = -Infinity;

  private highlight: { index: number; tier: Tier; bust: boolean; start: number } | null = null;
  private celebrateUntil = 0;

  private readonly poses: BoxPose[] = [];
  private readonly ghosts: BoxPose[][] = GHOSTS.map(() => []);
  private readonly order: BoxPose[] = [];
  private readonly prize: PrizePose = { x: 0, y: 0, scale: 0, alpha: 0, rot: 0 };
  private readonly point = { x: 0, y: 0, alpha: 0, rot: 0 };

  constructor({ canvas, theme, sound }: StageContext) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.theme = theme;
    this.sound = sound;
  }

  get center(): { x: number; y: number; radius: number } {
    const f = this.frame;
    const play = this.current;
    const radius = (CARD_H * 1.4 * f.u) / this.dpr;
    if (play && this.elapsed >= play.gifts.openAt) {
      // The overlay bursts confetti at `y − 0.55 × radius`: right on the won prize.
      return { x: px(f, REVEAL.x) / this.dpr, y: py(f, REVEAL.y) / this.dpr + radius * 0.55, radius };
    }
    return { x: px(f, 0) / this.dpr, y: py(f, 0.45) / this.dpr + radius * 0.55, radius };
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

  setPhotos(): void {
    // The gifts keep their mystery: no centre photos here.
  }

  show(view: WheelView, _rotation: number, now: number): void {
    const fresh = this.current !== null || view.key !== this.view?.key;
    this.current = null;
    this.highlight = null;
    this.setView(view);
    // New boxes drop onto the podium after a play (not on every idle state update).
    if (fresh) this.restockAt = now;
  }

  play(plan: PlayPlan, startedAt: number, now: number): void {
    this.setView(plan.wheel);
    const gifts = planGifts({
      segments: plan.wheel.segments.length,
      segmentIndex: plan.segmentIndex,
      durationMs: plan.durationMs,
      seed: plan.seed,
    });
    this.current = {
      plan,
      gifts,
      startedAt,
      particles: burstParticles(plan.seed, PIECES, Math.max(1, this.pieces.length)),
    };
    this.highlight = null;
    this.celebrateUntil = 0;
    this.restockAt = -Infinity;
    this.lastTick = -Infinity;
    // Paint the prize cards now rather than at the pop.
    for (const index of gifts.contents) this.card(index);
    // Events already past (an overlay joining late) stay silent.
    this.elapsed = now - startedAt;
    this.lastUpdate = now;
  }

  update(now: number): boolean {
    const play = this.current;
    if (!play) return true;
    this.advance(now);
    return now - play.startedAt >= play.gifts.landedAt;
  }

  setHighlight(index: number | null, tier: Tier = 'common', bust = false, now = performance.now()): void {
    this.highlight = index === null ? null : { index, tier, bust, start: now };
  }

  celebrate(durationMs: number, now = performance.now()): void {
    this.celebrateUntil = now + durationMs;
  }

  draw(now: number): void {
    const { ctx, size } = this;
    if (size === 0 || !this.podium) return;
    ctx.clearRect(0, 0, size, size);
    this.advance(now);
    const view = this.view;
    const empty = !view || view.segments.length === 0;
    const play = this.current;
    const t = play ? Math.max(0, now - play.startedAt) : 0;
    const clock = play ? t : now;

    const aim = play && !empty ? spotAim(play.gifts, t) : 0;
    this.drawSpotlight(clock, aim);
    ctx.drawImage(this.podium, 0, 0);
    this.drawPool(aim);
    this.drawBulbs(now, clock, play, t);
    if (empty) {
      this.drawEmpty(clock);
      return;
    }
    this.measure(now, play, t);
    this.drawShadows();
    if (play && t >= play.gifts.openAt) this.drawReveal(now, play, t);
    else this.drawIdleSparkle(clock);
    this.drawMystery(now, clock, play, t);
    if (play) this.drawGhosts(play, t);
    this.drawBoxes(now, play, t);
    if (play && t >= play.gifts.openAt) this.drawBurst(play, t);
    this.drawParty(now);
  }

  // ── State ────────────────────────────────────────────────────────────────

  private setView(view: WheelView): void {
    const signature = wheelSignature(view);
    this.view = view;
    if (signature === this.signature) return;
    this.signature = signature;
    this.cards.clear();
    this.message = null;
    this.layout = giftsLayout(Math.max(3, boxCount(view.segments.length)));
    this.buildBoxes();
  }

  /** Plays the sounds and ticks of the moments passed since the last call. */
  private advance(now: number): void {
    const play = this.current;
    if (!play) return;
    const t = now - play.startedAt;
    // Frames after a long pause (or a late join) catch up silently.
    const live = now - this.lastUpdate < 150 && t > this.elapsed;
    if (live) {
      for (const event of play.gifts.events) {
        if (event.at > this.elapsed && event.at <= t && t - event.at < STALE_MS) this.fire(event, now);
      }
    }
    if (t > this.elapsed) this.elapsed = t;
    this.lastUpdate = now;
  }

  private fire(event: GiftsEvent, now: number): void {
    switch (event.kind) {
      case 'hop':
        hopSound(this.sound, 0.9 + event.at / 2000);
        this.tick(now, 0.3);
        break;
      case 'swap':
        whooshSound(this.sound, event.length / 1000, event.speed);
        this.tick(now, event.speed);
        break;
      case 'drum':
        drumrollSound(this.sound, event.length / 1000);
        break;
      case 'pop':
        popSound(this.sound, 1);
        this.tick(now, 1);
        break;
      case 'peek':
        peekSound(this.sound);
        break;
    }
  }

  private tick(now: number, speed: number): void {
    if (now - this.lastTick < TICK_GAP) return;
    this.lastTick = now;
    this.onTick?.(clamp(speed, 0, 1));
  }

  // ── Caches ───────────────────────────────────────────────────────────────

  private rebuild(): void {
    this.cards.clear();
    this.message = null;
    if (this.size === 0) return;
    const { cx, cy, half } = playArea(this.theme, this.size);
    this.frame = { cx, cy, u: half };
    const { palette } = this.theme;
    this.papers = giftPapers(this.theme);
    this.podium = renderPodium(this.theme, this.size, this.frame);
    this.spotlight = renderSpotlight(this.theme, this.frame);
    this.bulbs = renderBulbs(this.theme, 0.016 * half);
    this.bulbSpots = podiumBulbs(BULBS);
    this.rays = renderRays(palette.trimLight, 0.62 * half);
    this.raysBust = renderRays(this.theme.highlight('common', true).glow, 0.5 * half, 10);
    this.halo = renderGlow(palette.glow, 0.5 * half);
    this.leak = renderGlow(palette.trimLight, 0.22 * half, 0.95);
    this.sparkle = renderSparkle(palette.trimLight, 0.045 * half);
    this.shadow = renderGlow(palette.outline, 0.3 * half, 0.6);
    this.pool = renderPool(this.theme, 0.62 * half);
    this.boxGlow = renderGlow(palette.trimLight, 0.42 * half, 0.9);
    this.ring = renderRing(palette.trimLight, 0.3 * half);
    this.mystery = renderCard(
      this.theme,
      { id: 'mystery', label: '?', description: '', weight: 1, tier: 'common' },
      0,
      1000,
      CARD_H * 0.85 * half,
    );
    const colors = [palette.trim, palette.trimLight, this.papers[0]!.fill, this.papers[3]!.fill];
    const r = 0.034 * half;
    this.pieces = [0, 1, 2, 3].map((shape) => colors.map((c) => renderPiece(shape, c, palette.outline, r)));
    this.boxesFor = 0;
    this.buildBoxes();
  }

  private buildBoxes(): void {
    if (this.size === 0 || this.papers.length === 0) return;
    const width = this.layout.width * this.frame.u * 1.12;
    if (this.boxesFor === width && this.boxes.length > 0) return;
    this.boxesFor = width;
    this.boxes = this.papers.slice(0, MAX_BOXES).map((paper) => renderBox(this.theme, paper, width));
    this.beam = renderBeam(this.theme.palette.trimLight, width * 1.5, 0.95 * this.frame.u);
  }

  private card(index: number): CardSprites | null {
    const view = this.view;
    const segment = view?.segments[index];
    if (!view || !segment) return null;
    let sprites = this.cards.get(index);
    if (!sprites) {
      const sharp = renderCard(this.theme, segment, index, view.segments.length, CARD_H * this.frame.u);
      const dim = shaded(sharp.canvas, this.theme.id === 'glam' ? '#3a0c2c' : '#000000', 0.42);
      sprites = { sharp, dim };
      if (this.cards.size > 24) this.cards.clear();
      this.cards.set(index, sprites);
    }
    return sprites;
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  /** Box poses at this moment: the play's, or the idle row (breathing, or dropping back in). */
  private measure(now: number, play: Play | null, t: number): void {
    const poses = this.poses;
    if (play) {
      poseBoxes(play.gifts, t, poses);
      return;
    }
    const layout = this.layout;
    const count = layout.count;
    while (poses.length < count) poses.push(blankPose());
    poses.length = count;
    for (let box = 0; box < count; box++) {
      const pose = poses[box]!;
      restPose(pose, layout, box);
      const phase = now / 1700 + box * 1.3;
      // Gentle breathing.
      pose.sy = 1 + 0.018 * Math.sin(phase * TAU * 0.5);
      pose.sx = 1 - 0.01 * Math.sin(phase * TAU * 0.5);
      pose.lidY = -0.02 * Math.max(0, Math.sin(phase * TAU * 0.5));
      const dt = now - this.restockAt - box * RESTOCK_STAGGER;
      if (dt < RESTOCK_DROP + 300) {
        const u = clamp(dt / RESTOCK_DROP, 0, 1);
        pose.y -= 0.95 * (1 - u * u);
        pose.alpha = smooth(0, 120, dt);
        if (u >= 1) {
          const k = Math.exp(-(dt - RESTOCK_DROP) / 80) * Math.cos((dt - RESTOCK_DROP) / 45);
          pose.sy *= 1 - 0.14 * k;
          pose.sx *= 1 + 0.08 * k;
        }
      }
    }
  }

  /** The cone of light, swinging from its apex to point at `aim` on the floor. */
  private drawSpotlight(clock: number, aim: number): void {
    const spot = this.spotlight;
    if (!spot) return;
    const { ctx, frame: f } = this;
    const apexY = -1.02;
    const angle = Math.atan2(aim, FLOOR_Y - apexY);
    ctx.save();
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(clock / 1300);
    ctx.translate(px(f, 0), py(f, apexY));
    ctx.rotate(-angle);
    ctx.drawImage(spot.canvas, -spot.apexX, -spot.apexY);
    ctx.restore();
  }

  private drawPool(aim: number): void {
    const pool = this.pool;
    if (!pool) return;
    const { ctx, frame: f } = this;
    ctx.drawImage(pool, px(f, aim * 1.05) - pool.width / 2, py(f, PODIUM.cy) - pool.height / 2);
  }

  /** Bulbs round the podium: a slow chase at rest, quicker while playing, a party when celebrating. */
  private drawBulbs(now: number, clock: number, play: Play | null, t: number): void {
    const bulbs = this.bulbs;
    if (!bulbs) return;
    const { ctx, frame: f } = this;
    const party = now < this.celebrateUntil;
    const playing = play !== null && t < play.gifts.landedAt;
    const step = party ? 110 : playing ? 160 : 420;
    const phase = Math.floor(clock / step);
    const w = bulbs.on.width;
    this.bulbSpots.forEach((p, i) => {
      const lit = party || playing ? (i + phase) % 3 === 0 : (i + phase) % 5 === 0 || (i + phase) % 5 === 2;
      ctx.drawImage(lit ? bulbs.on : bulbs.off, px(f, p.x) - w / 2, py(f, p.y) - w / 2);
    });
  }

  /** Soft shadows on the podium, shrinking as a box leaves the floor. */
  private drawShadows(): void {
    const shadow = this.shadow;
    if (!shadow) return;
    const { ctx, frame: f, layout } = this;
    for (const pose of this.poses) {
      const floor = arcAt(layout, pose.x).y;
      const lift = Math.max(0, floor - pose.y);
      const k = 1 / (1 + lift * 3);
      const w = layout.width * f.u * 1.5 * pose.scale * k;
      const h = w * 0.22;
      ctx.globalAlpha = 0.75 * k * pose.alpha;
      ctx.drawImage(shadow, px(f, pose.x) - w / 2, py(f, floor) - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  /** Twinkles hopping from bow to bow while the boxes wait. */
  private drawIdleSparkle(clock: number): void {
    const sparkle = this.sparkle;
    if (!sparkle || this.poses.length === 0) return;
    const { ctx, frame: f, layout } = this;
    const period = 760;
    const k = Math.floor(clock / period);
    const u = (clock % period) / period;
    const box = (k * 3) % this.poses.length;
    const pose = this.poses[box]!;
    const w = layout.width * pose.scale;
    const side = k % 2 ? 1 : -1;
    const x = pose.x + side * w * 0.3;
    const y = pose.y - w * (BOX.body + BOX.lid + BOX.bow * 0.75) * pose.sy;
    const s = Math.sin(Math.PI * u);
    const size = sparkle.width * (0.4 + 0.8 * s) * pose.scale;
    ctx.save();
    ctx.globalAlpha = s;
    ctx.translate(px(f, x), py(f, y));
    ctx.rotate(u * 1.2);
    ctx.drawImage(sparkle, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  /** Light rays and halo behind the won prize, growing as it rises. */
  private drawReveal(now: number, play: Play, t: number): void {
    const { ctx, frame: f } = this;
    const g = play.gifts;
    const grow = smooth(g.openAt + 100, g.landedAt, t);
    const x = px(f, REVEAL.x);
    const y = py(f, REVEAL.y);
    const lit = this.highlight !== null;
    const pulse = lit ? 0.5 + 0.5 * Math.sin((now - this.highlight!.start) / 260) : 0;
    const won = play.plan.wheel.segments[play.plan.segmentIndex];
    // Rarer prizes get bigger rays; a bankrupt gets a smaller, hot-pink fan.
    const rare =
      won?.tier === 'jackpot' || won?.tier === 'legendary' ? 1.18 : won?.tier === 'epic' ? 1.08 : 1;
    const rays = won?.bust ? this.raysBust : this.rays;
    if (this.halo) {
      const w = this.halo.width * (0.6 + 0.5 * grow + 0.08 * pulse);
      ctx.globalAlpha = grow * (0.75 + 0.25 * pulse);
      ctx.drawImage(this.halo, x - w / 2, y - w / 2, w, w);
    }
    if (rays) {
      ctx.save();
      ctx.globalAlpha = grow * (0.7 + 0.2 * pulse);
      ctx.translate(x, y);
      ctx.rotate(t / 2600);
      const w = rays.width * (0.5 + 0.5 * easeOutCubic(grow)) * rare;
      ctx.drawImage(rays, -w / 2, -w / 2, w, w);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The "?" card floating where the prize will appear. It bobs while the boxes wait, comes back
   * when they are restocked, and dives into the boxes as a play starts.
   */
  private drawMystery(now: number, clock: number, play: Play | null, t: number): void {
    const card = this.mystery;
    if (!card) return;
    let alpha: number;
    let scale: number;
    let dy = 0.025 * Math.sin(clock / 650);
    let rot = 0.04 * Math.sin(clock / 1100);
    if (play) {
      const u = clamp(t / Math.max(1, play.gifts.shuffleStart * 0.8), 0, 1);
      if (u >= 1) return;
      // A little hop up, then a dive down into the row, shrinking away.
      dy = -0.08 * Math.sin(Math.PI * Math.min(1, u * 2.2)) + 1.0 * smooth(0.35, 1, u) ** 2;
      scale = 1 - 0.75 * smooth(0.3, 1, u);
      alpha = 1 - smooth(0.7, 1, u);
      rot = 0.6 * smooth(0.3, 1, u);
    } else {
      const since = now - this.restockAt;
      const come = smooth(0, 450, since - 300);
      alpha = come;
      scale = 0.6 + 0.4 * come;
    }
    if (alpha <= 0) return;
    const { ctx, frame: f } = this;
    const sparkle = this.sparkle;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (this.rays && !play) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      ctx.translate(px(f, REVEAL.x), py(f, REVEAL.y));
      ctx.rotate(clock / 5000);
      const w = this.rays.width * 0.75;
      ctx.drawImage(this.rays, -w / 2, -w / 2, w, w);
      ctx.restore();
    }
    ctx.translate(px(f, REVEAL.x), py(f, REVEAL.y + dy));
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.drawImage(card.canvas, -card.cx, -card.cy);
    ctx.restore();
    if (sparkle && !play) {
      // Two twinkles taking turns at the card's corners.
      const period = 1100;
      const k = Math.floor(clock / period);
      const u = (clock % period) / period;
      const s = Math.sin(Math.PI * u);
      const corner = k % 2 ? 1 : -1;
      const x = px(f, REVEAL.x) + corner * card.width * 0.5;
      const y = py(f, REVEAL.y + dy) - corner * card.height * 0.45;
      const w = sparkle.width * (0.5 + 0.9 * s);
      ctx.globalAlpha = alpha * s;
      ctx.drawImage(sparkle, x - w / 2, y - w / 2, w, w);
      ctx.globalAlpha = 1;
    }
  }

  /** Faint copies of boxes in fast flight, a few milliseconds behind (pure function of time). */
  private drawGhosts(play: Play, t: number): void {
    const g = play.gifts;
    if (t < g.shuffleStart || t >= g.shuffleEnd + GHOSTS[GHOSTS.length - 1]!) return;
    const { ctx } = this;
    GHOSTS.forEach((lag, i) => {
      const poses = poseBoxes(g, t - lag, this.ghosts[i]!);
      ctx.globalAlpha = i === 0 ? 0.28 : 0.13;
      poses.forEach((pose, box) => {
        const live = this.poses[box];
        if (!pose.moving || !live?.moving || live.z < 5) return;
        const sprites = this.boxes[box % this.boxes.length];
        if (!sprites) return;
        this.drawBoxPart(pose, sprites, 0, 'body', ctx.globalAlpha);
        this.drawBoxPart(pose, sprites, 0, 'lid', ctx.globalAlpha);
      });
    });
    ctx.globalAlpha = 1;
  }

  /** The won box glows while it is highlighted. */
  private drawBoxGlow(now: number, pose: BoxPose): void {
    const glow = this.boxGlow;
    if (!glow || !this.highlight) return;
    const { ctx, frame: f, layout } = this;
    const pulse = 0.5 + 0.5 * Math.sin((now - this.highlight.start) / 260);
    const w = glow.width * pose.scale * (layout.width / 0.4) * (1 + 0.06 * pulse);
    const h = w * 0.9;
    const cy = py(f, pose.y - layout.width * BOX.body * 0.6 * pose.scale);
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glow, px(f, pose.x) - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }

  private drawBoxes(now: number, play: Play | null, t: number): void {
    const order = this.order;
    order.length = 0;
    for (const pose of this.poses) order.push(pose);
    order.sort((a, b) => a.z - b.z);
    const lit = this.highlight !== null && play !== null;
    const focus = play ? (lit ? 1 : focusDim(play.gifts, t)) : 0;
    for (const pose of order) {
      const box = this.poses.indexOf(pose);
      const sprites = this.boxes[box % this.boxes.length];
      if (!sprites) continue;
      const chosen = play !== null && box === play.gifts.openBox;
      const dim = chosen ? 0 : focus;
      if (lit && chosen) this.drawBoxGlow(now, pose);
      if (pose.open) {
        this.drawBoxPart(pose, sprites, dim, 'mouth');
        if (play) this.drawContents(now, play, t, box, pose);
      }
      this.drawBoxPart(pose, sprites, dim, 'body');
      if (pose.glow > 0) this.drawLeak(pose);
      this.drawBoxPart(pose, sprites, dim, 'lid');
      if (play && pose.open) this.drawRing(play, t, box, pose);
    }
  }

  /** Draws one part of a box in its pose (bottom centre, tilt, squash); `dim` 0..1 shades it. */
  private drawBoxPart(
    pose: BoxPose,
    sprites: BoxSprites,
    dim: number,
    part: 'mouth' | 'body' | 'lid',
    alpha = 1,
  ): void {
    if (part === 'lid' && pose.lidAlpha <= 0) return;
    const { ctx, frame: f, layout } = this;
    const W = layout.width * f.u;
    const k = W / sprites.width;
    const bodyH = W * BOX.body;
    const s = pose.scale;
    if (pose.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= pose.alpha;
    ctx.translate(px(f, pose.x), py(f, pose.y));
    const pivot = bodyH * 0.55 * s;
    ctx.translate(0, -pivot);
    ctx.rotate(pose.rot);
    ctx.translate(0, pivot);
    ctx.scale(s * pose.sx, s * pose.sy);
    const pad = sprites.pad * k;
    const w = sprites.width * k;
    let sharp: HTMLCanvasElement;
    let shade: HTMLCanvasElement;
    let x: number;
    let y: number;
    if (part === 'mouth') {
      [sharp, shade] = [sprites.mouth, sprites.mouthDim];
      x = -w / 2 - pad;
      y = -bodyH - w * 0.16 - pad;
    } else if (part === 'body') {
      [sharp, shade] = [sprites.body, sprites.bodyDim];
      x = -w / 2 - pad;
      y = -bodyH - pad;
    } else {
      [sharp, shade] = [sprites.lid, sprites.lidDim];
      const lidH = w * BOX.lid;
      ctx.globalAlpha = alpha * pose.alpha * pose.lidAlpha;
      ctx.translate(pose.lidX * W, -bodyH + W * 0.035 + pose.lidY * W);
      ctx.translate(0, -lidH / 2);
      ctx.rotate(pose.lidRot);
      ctx.translate(0, lidH / 2);
      x = -(sharp.width * k) / 2;
      y = -lidH - w * BOX.bow - pad;
    }
    const base = ctx.globalAlpha;
    if (dim < 1) ctx.drawImage(sharp, x, y, sharp.width * k, sharp.height * k);
    if (dim > 0) {
      ctx.globalAlpha = base * dim;
      ctx.drawImage(shade, x, y, shade.width * k, shade.height * k);
    }
    ctx.restore();
  }

  /** A ring of light bursting from a box as its lid pops. */
  private drawRing(play: Play, t: number, box: number, pose: BoxPose): void {
    const ring = this.ring;
    if (!ring) return;
    const g = play.gifts;
    const at = box === g.openBox ? g.openAt : g.missed.find((m) => m.box === box)?.at;
    if (at === undefined) return;
    const dt = t - at;
    const length = box === g.openBox ? 420 : 300;
    if (dt < 0 || dt > length) return;
    const u = dt / length;
    const { ctx, frame: f, layout } = this;
    const mouth = mouthOf(pose, layout.width);
    const strength = box === g.openBox ? 1 : 0.55;
    const w = ring.width * pose.scale * strength * (0.35 + 1.1 * easeOutCubic(u)) * (layout.width / 0.35);
    ctx.save();
    ctx.globalAlpha = (1 - u) * strength;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(ring, px(f, mouth.x) - w / 2, py(f, mouth.y) - w * 0.3, w, w * 0.6);
    ctx.restore();
  }

  /** Light leaking out of the lid's seam while the chosen box shakes, flashing as it pops. */
  private drawLeak(pose: BoxPose): void {
    const leak = this.leak;
    if (!leak) return;
    const { ctx, frame: f, layout } = this;
    const mouth = mouthOf(pose, layout.width);
    const w = leak.width * pose.scale * (0.7 + 0.5 * pose.glow);
    const h = w * 0.55;
    ctx.save();
    ctx.globalAlpha = clamp(pose.glow, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(leak, px(f, mouth.x) - w / 2, py(f, mouth.y) - h / 2, w, h);
    ctx.restore();
  }

  /** What comes out of an open box: the won prize (rising to the reveal spot) or a missed one. */
  private drawContents(now: number, play: Play, t: number, box: number, pose: BoxPose): void {
    const { ctx, frame: f, layout } = this;
    const g = play.gifts;
    const mouth = mouthOf(pose, layout.width);
    const index = g.contents[box]!;
    const sprites = this.card(index);
    if (!sprites) return;
    if (box === g.openBox) {
      // Light pours out of the box.
      if (this.beam) {
        const fade =
          smooth(g.openAt, g.openAt + 160, t) * (1 - 0.6 * smooth(g.landedAt, g.landedAt + 900, t));
        const w = this.beam.width * pose.scale;
        const h = this.beam.height * (0.4 + 0.6 * smooth(g.openAt, g.openAt + 300, t));
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.beam, px(f, mouth.x) - w / 2, py(f, mouth.y) - h, w, h);
        ctx.restore();
      }
      const p = prizePose(g, t, mouth, this.prize);
      const lit = this.highlight !== null;
      const pulse = lit ? 1 + 0.035 * Math.sin((now - this.highlight!.start) / 260) : 1;
      this.drawCard(sprites.sharp.canvas, sprites.sharp, p, p.scale * pulse);
      return;
    }
    const reveal = g.missed.find((m) => m.box === box);
    if (!reveal) return;
    const p = peekPose(t - reveal.at, mouth, layout.width, this.prize);
    const fit = Math.min(0.7, (layout.width * f.u * 1.3) / sprites.sharp.width) * pose.scale;
    p.rot = (box % 2 ? 1 : -1) * 0.07;
    this.drawCard(sprites.dim, sprites.sharp, p, p.scale * fit);
  }

  private drawCard(image: HTMLCanvasElement, card: CardSprite, p: PrizePose, scale: number): void {
    if (p.alpha <= 0 || scale <= 0) return;
    const { ctx, frame: f } = this;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(px(f, p.x), py(f, p.y));
    ctx.rotate(p.rot);
    ctx.scale(scale, scale);
    ctx.drawImage(image, -card.cx, -card.cy);
    ctx.restore();
  }

  /** Hearts, stars and curls flying out of the won box. */
  private drawBurst(play: Play, t: number): void {
    const g = play.gifts;
    const dt = t - g.openAt;
    if (dt > 1400 || this.pieces.length === 0) return;
    const pose = this.poses[g.openBox];
    if (!pose) return;
    const { ctx, frame: f, layout } = this;
    const mouth = mouthOf(pose, layout.width);
    const reach = 0.75;
    for (const piece of play.particles) {
      const at = particleAt(piece, dt, this.point);
      if (at.alpha <= 0) continue;
      const sprite = this.pieces[piece.shape]?.[piece.color];
      if (!sprite) continue;
      const w = sprite.width * piece.size;
      ctx.save();
      ctx.globalAlpha = at.alpha;
      ctx.translate(px(f, mouth.x + at.x * reach), py(f, mouth.y + at.y * reach));
      ctx.rotate(at.rot);
      ctx.drawImage(sprite, -w / 2, -w / 2, w, w);
      ctx.restore();
    }
  }

  /** Twinkles round the won prize while the party lasts. */
  private drawParty(now: number): void {
    const sparkle = this.sparkle;
    if (!sparkle || !this.current || this.highlight === null) return;
    const { ctx, frame: f } = this;
    const party = now < this.celebrateUntil;
    const count = party ? 7 : 3;
    const since = now - this.highlight.start;
    for (let i = 0; i < count; i++) {
      const period = 900 + i * 130;
      const u = ((since + i * 370) % period) / period;
      const a = i * 2.4 + Math.floor((since + i * 370) / period) * 1.7;
      const r = 0.36 + 0.12 * ((i * 7) % 3);
      const x = REVEAL.x + Math.cos(a) * r * 1.3;
      const y = REVEAL.y + Math.sin(a) * r * 0.55;
      const s = Math.sin(Math.PI * u);
      const w = sparkle.width * (0.5 + 0.9 * s);
      ctx.globalAlpha = s;
      ctx.drawImage(sparkle, px(f, x) - w / 2, py(f, y) - w / 2, w, w);
    }
    ctx.globalAlpha = 1;
  }

  /** "No prizes left" (or "Awaiting entrants") floating over the empty podium. */
  private drawEmpty(clock: number): void {
    const view = this.view;
    if (!view) return;
    const text = emptyMessage(view);
    if (!this.message || this.message.text !== text) {
      this.message = {
        text,
        sprite: renderMessage(this.theme, text, 1.6 * this.frame.u, 0.16 * this.frame.u),
      };
    }
    const { ctx, frame: f } = this;
    const sprite = this.message.sprite;
    const y = py(f, 0.2 + 0.015 * Math.sin(clock / 700));
    ctx.drawImage(sprite, px(f, 0) - sprite.width / 2, y - sprite.height / 2);
  }
}
