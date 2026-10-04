import type { ThemeId, Tier } from '../../shared/schema';
import { TIER_STYLES } from '../../shared/tiers';
import { GLAM, mix } from './themes/glam-palette';

type Kind = 'confetti' | 'coin' | 'spark' | 'heart';

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

/** Share of each particle kind (the shares add up to 1). */
type KindMix = readonly (readonly [Kind, number])[];

/** How one theme celebrates: which particles fly and in which colours. */
interface FxLook {
  burst: KindMix;
  /** The legendary / jackpot rain (none for casino, which has always celebrated without one). */
  rain?: KindMix;
  colors: Record<Kind, readonly string[]>;
  /** Average size of each kind at 1080p, in CSS pixels. */
  sizes: Record<Kind, number>;
  /** Colour of the tier's accent particles (default: the tier's own accent). */
  accents?: Record<Tier, string>;
}

const GOLDS = ['#f6e08f', '#d4af37', '#fff4c8', '#b8892a', '#e9c766', '#fffaf0'];
const TAU = Math.PI * 2;
/** Gravity felt by each kind: paper and hearts flutter, coins and sparks drop. */
const FALL: Record<Kind, number> = { confetti: 0.45, heart: 0.5, coin: 0.8, spark: 0.8 };
/** Side of the cached glam sprites, in canvas pixels. */
const SPRITE = 96;

const LOOKS: Record<ThemeId, FxLook> = {
  casino: {
    burst: [
      ['coin', 0.18],
      ['spark', 0.12],
      ['confetti', 0.7],
    ],
    colors: { confetti: GOLDS, coin: GOLDS, spark: GOLDS, heart: GOLDS },
    sizes: { confetti: 16, coin: 26, spark: 22, heart: 30 },
  },
  glam: {
    burst: [
      ['coin', 0.13],
      ['heart', 0.17],
      ['spark', 0.14],
      ['confetti', 0.56],
    ],
    rain: [
      ['heart', 0.55],
      ['coin', 0.45],
    ],
    colors: {
      confetti: [GLAM.hotPink, GLAM.hotPink, GLAM.pink, GLAM.lightPink, '#ffffff', '#ffffff', GLAM.gold],
      heart: [GLAM.hotPink, GLAM.deepPink, GLAM.pink, GLAM.lightPink, GLAM.gold],
      spark: ['#ffffff', '#ffe3f1', '#ffb3da'],
      coin: [GLAM.pink],
    },
    sizes: { confetti: 16, coin: 28, spark: 22, heart: 30 },
    accents: {
      common: GLAM.paleGold,
      rare: GLAM.lightPink,
      epic: GLAM.lavender,
      legendary: GLAM.gold,
      jackpot: '#ffd86b',
    },
  },
};

/**
 * Win celebration drawn on a full-screen canvas: gold confetti, coins and sparkles for `casino`;
 * pink confetti, tumbling hearts, pink $ coins and twinkles for `glam`.
 */
export class Celebration {
  private readonly ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lastFrame = 0;
  private rain: { until: number; rate: number; kinds: KindMix; carry: number } | null = null;
  private coin: HTMLCanvasElement | null = null;
  /** Glam hearts and twinkles, one sprite per kind and colour. */
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private theme: ThemeId = 'glam';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Picks the particle look of a theme. */
  setTheme(theme: ThemeId): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.coin = null;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.coin = null;
  }

  get active(): boolean {
    return this.particles.length > 0 || this.rain !== null;
  }

  /** Radial burst at (x, y) in CSS pixels, scaled by tier. */
  burst(x: number, y: number, tier: Tier, scale: number): void {
    const style = TIER_STYLES[tier];
    const look = LOOKS[this.theme];
    const accent = look.accents?.[tier] ?? style.accent;
    const count = Math.round(70 * style.celebration);
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;
      const speed = scale * (0.6 + Math.random() * 1.1);
      this.spawn(
        pickKind(look.burst, Math.random()),
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        scale,
        Math.random() < 0.2 ? accent : undefined,
      );
    }
    if (look.rain && (tier === 'legendary' || tier === 'jackpot')) {
      this.rain = {
        until: performance.now() + (tier === 'jackpot' ? 4500 : 2500),
        rate: tier === 'jackpot' ? 90 : 45,
        kinds: look.rain,
        carry: 0,
      };
    }
  }

  clear(): void {
    this.particles = [];
    this.rain = null;
  }

  draw(now: number): void {
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    const { ctx } = this;
    if (!this.active) {
      if (dt > 0) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    const scale = Math.min(this.width, this.height) / 1080;
    if (this.rain) {
      if (now > this.rain.until) {
        this.rain = null;
      } else {
        this.rain.carry += this.rain.rate * dt;
        while (this.rain.carry >= 1) {
          this.rain.carry -= 1;
          // Same units as a burst: pixels per millisecond.
          this.spawn(
            pickKind(this.rain.kinds, Math.random()),
            Math.random() * this.width,
            -20,
            (Math.random() - 0.5) * 0.08 * scale,
            0.12 * scale,
            scale,
          );
        }
      }
    }

    const gravity = 1300 * scale;
    const drag = Math.pow(0.986, dt * 60);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.particles = this.particles.filter((p) => {
      p.life += dt;
      p.vx *= drag;
      p.vy = p.vy * drag + gravity * dt * FALL[p.kind];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      p.flip += p.flipSpeed * dt;
      if (p.life > p.maxLife || p.y > this.height + 40) return false;

      const fade = Math.min(1, (p.maxLife - p.life) / 0.6);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      if (p.kind === 'confetti') {
        ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size * 0.22, p.size, p.size * 0.44);
      } else if (p.kind === 'coin') {
        ctx.scale(Math.max(0.08, Math.abs(Math.cos(p.flip))), 1);
        const coin = this.coinSprite();
        ctx.drawImage(coin, -p.size / 2, -p.size / 2, p.size, p.size);
      } else if (p.kind === 'heart') {
        ctx.scale(Math.max(0.12, Math.abs(Math.cos(p.flip))), 1);
        ctx.drawImage(this.sprite('heart', p.color), -p.size / 2, -p.size / 2, p.size, p.size);
      } else if (this.theme === 'glam') {
        // Each twinkle keeps its own rhythm (flip speeds differ).
        ctx.globalCompositeOperation = 'lighter';
        const twinkle = 0.5 + 0.5 * Math.sin(p.flip * 2);
        const size = p.size * 1.7 * (0.55 + 0.45 * twinkle);
        ctx.globalAlpha = fade * (0.45 + 0.55 * twinkle);
        ctx.drawImage(this.sprite('twinkle', p.color), -size / 2, -size / 2, size, size);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const twinkle = 0.5 + 0.5 * Math.sin(p.life * 20);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = fade * (0.5 + 0.5 * twinkle);
        sparkle(ctx, p.size * (0.7 + 0.3 * twinkle));
      }
      ctx.restore();
      return true;
    });
  }

  private spawn(kind: Kind, x: number, y: number, vx: number, vy: number, scale: number, color?: string) {
    const look = LOOKS[this.theme];
    const size = look.sizes[kind] * scale * (0.7 + Math.random() * 0.6);
    const colors = look.colors[kind];
    const heart = kind === 'heart';
    this.particles.push({
      kind,
      x,
      y,
      vx: vx * 1000,
      vy: vy * 1000,
      rotation: heart ? (Math.random() - 0.5) * 1.2 : Math.random() * TAU,
      spin: (Math.random() - 0.5) * (heart ? 4 : 8),
      flip: Math.random() * TAU,
      flipSpeed: heart ? 2 + Math.random() * 4 : 4 + Math.random() * 8,
      size,
      color: color ?? colors[Math.floor(Math.random() * colors.length)]!,
      life: 0,
      maxLife: 2.6 + Math.random() * 1.8,
    });
  }

  private coinSprite(): HTMLCanvasElement {
    if (this.coin) return this.coin;
    if (this.theme === 'glam') return (this.coin = this.glamCoin());
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const c = size / 2;
    const g = ctx.createRadialGradient(c - 10, c - 12, 2, c, c, c);
    g.addColorStop(0, '#fff6d0');
    g.addColorStop(0.5, '#d4af37');
    g.addColorStop(1, '#7a5a16');
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, c * 0.72, 0, TAU);
    ctx.strokeStyle = 'rgba(90, 60, 10, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(90, 60, 10, 0.7)';
    ctx.font = `700 ${size * 0.5}px Cinzel, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', c, c + 2);
    this.coin = canvas;
    return canvas;
  }

  /** Pink coin with a white rim and a white $, like the coins on the glam wheel. */
  private glamCoin(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SPRITE;
    const ctx = canvas.getContext('2d')!;
    const c = SPRITE / 2;
    const r = c - 2;

    const rim = ctx.createLinearGradient(0, c - r, 0, c + r);
    rim.addColorStop(0, '#ffffff');
    rim.addColorStop(1, '#ffd9ec');
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.fillStyle = rim;
    ctx.fill();

    const face = ctx.createLinearGradient(0, c - r, 0, c + r);
    face.addColorStop(0, GLAM.deepPink);
    face.addColorStop(1, '#f7a8cf');
    ctx.beginPath();
    ctx.arc(c, c, r * 0.78, 0, TAU);
    ctx.fillStyle = face;
    ctx.fill();

    const font = `700 ${Math.round(r * 1.05)}px Fredoka, system-ui, sans-serif`;
    // Drawn before the font is in, the $ falls back; redraw it once the font arrives.
    if (!document.fonts.check(font)) {
      void document.fonts.load(font).then(() => {
        this.coin = null;
      });
    }
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(120, 10, 70, 0.5)';
    ctx.shadowBlur = r * 0.12;
    ctx.shadowOffsetY = r * 0.04;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('$', c, c + r * 0.06);
    return canvas;
  }

  /** A cached glam heart or twinkle in `color`. */
  private sprite(kind: 'heart' | 'twinkle', color: string): HTMLCanvasElement {
    const key = `${kind}:${color}`;
    let canvas = this.sprites.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = SPRITE;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(SPRITE / 2, SPRITE / 2);
      if (kind === 'heart') paintHeart(ctx, color);
      else paintTwinkle(ctx, color);
      this.sprites.set(key, canvas);
    }
    return canvas;
  }
}

function pickKind(kinds: KindMix, roll: number): Kind {
  for (const [kind, share] of kinds) {
    if (roll < share) return kind;
    roll -= share;
  }
  return kinds[kinds.length - 1]![0];
}

function sparkle(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? size / 2 : size / 9;
    const a = (i / 8) * TAU;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

/** Plump heart, 48 units wide and 42 tall, centred on the origin. */
function heartPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.bezierCurveTo(-6, 15, -24, 4, -24, -8);
  ctx.bezierCurveTo(-24, -17, -17, -22, -11, -22);
  ctx.bezierCurveTo(-5, -22, -1, -18, 0, -14);
  ctx.bezierCurveTo(1, -18, 5, -22, 11, -22);
  ctx.bezierCurveTo(17, -22, 24, -17, 24, -8);
  ctx.bezierCurveTo(24, 4, 6, 15, 0, 20);
  ctx.closePath();
}

/** Glossy candy heart with a white edge and a soft plum shadow, on a sprite centred at 0, 0. */
function paintHeart(ctx: CanvasRenderingContext2D, color: string) {
  const k = (SPRITE * 0.84) / 48;
  ctx.scale(k, k);
  ctx.translate(0, 1);
  heartPath(ctx);
  const fill = ctx.createRadialGradient(-9, -12, 1, -2, -4, 30);
  fill.addColorStop(0, mix(color, '#ffffff', 0.55));
  fill.addColorStop(0.45, color);
  fill.addColorStop(1, mix(color, GLAM.plum, 0.3));
  ctx.save();
  ctx.shadowColor = 'rgba(58, 12, 44, 0.4)';
  ctx.shadowBlur = 3 * k;
  ctx.shadowOffsetY = 1.2 * k;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-12, -12, 5.5, 3.2, -0.65, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fill();
}

/** Four-point twinkle with curved sides and a pink glow, on a sprite centred at 0, 0. */
function paintTwinkle(ctx: CanvasRenderingContext2D, color: string) {
  const r = SPRITE / 2;
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.62);
  glow.addColorStop(0, 'rgba(255, 150, 210, 0.55)');
  glow.addColorStop(1, 'rgba(255, 150, 210, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-r, -r, SPRITE, SPRITE);

  const tip = r * 0.94;
  const waist = r * 0.1;
  ctx.beginPath();
  ctx.moveTo(0, -tip);
  ctx.quadraticCurveTo(waist, -waist, tip, 0);
  ctx.quadraticCurveTo(waist, waist, 0, tip);
  ctx.quadraticCurveTo(-waist, waist, -tip, 0);
  ctx.quadraticCurveTo(-waist, -waist, 0, -tip);
  ctx.closePath();
  const star = ctx.createRadialGradient(0, 0, 0, 0, 0, tip);
  star.addColorStop(0, '#ffffff');
  star.addColorStop(0.35, color);
  star.addColorStop(1, mix(color, GLAM.hotPink, 0.35));
  ctx.fillStyle = star;
  ctx.fill();
}
