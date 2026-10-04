import type { ThemeId, Tier } from '../../shared/schema';
import { TIER_STYLES } from '../../shared/tiers';

type Kind = 'confetti' | 'coin' | 'spark';

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

const GOLDS = ['#f6e08f', '#d4af37', '#fff4c8', '#b8892a', '#e9c766', '#fffaf0'];
const TAU = Math.PI * 2;

/** Gold confetti, coins and sparkles drawn on a full-screen canvas. */
export class Celebration {
  private readonly ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lastFrame = 0;
  private rain: { until: number; rate: number; accent: string; carry: number } | null = null;
  private coin: HTMLCanvasElement | null = null;
  private theme: ThemeId = 'glam';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Picks the particle look (TODO(glam-fx): pink palette and hearts for `glam`). */
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
    const count = Math.round(70 * style.celebration);
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;
      const speed = scale * (0.6 + Math.random() * 1.1);
      const roll = Math.random();
      this.spawn(
        roll < 0.18 ? 'coin' : roll < 0.3 ? 'spark' : 'confetti',
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        scale,
        Math.random() < 0.2 ? style.accent : undefined,
      );
    }
    if (tier === 'legendary' || tier === 'jackpot') {
      this.rain = {
        until: performance.now() + (tier === 'jackpot' ? 4500 : 2500),
        rate: tier === 'jackpot' ? 90 : 45,
        accent: style.accent,
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
          const kind: Kind = Math.random() < 0.35 ? 'coin' : 'confetti';
          this.spawn(
            kind,
            Math.random() * this.width,
            -20,
            (Math.random() - 0.5) * 80 * scale,
            120 * scale,
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
      p.vy = p.vy * drag + gravity * dt * (p.kind === 'confetti' ? 0.45 : 0.8);
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
    const size = (kind === 'coin' ? 26 : kind === 'spark' ? 22 : 16) * scale * (0.7 + Math.random() * 0.6);
    this.particles.push({
      kind,
      x,
      y,
      vx: vx * 1000,
      vy: vy * 1000,
      rotation: Math.random() * TAU,
      spin: (Math.random() - 0.5) * 8,
      flip: Math.random() * TAU,
      flipSpeed: 4 + Math.random() * 8,
      size,
      color: color ?? GOLDS[Math.floor(Math.random() * GOLDS.length)]!,
      life: 0,
      maxLife: 2.6 + Math.random() * 1.8,
    });
  }

  private coinSprite(): HTMLCanvasElement {
    if (this.coin) return this.coin;
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
