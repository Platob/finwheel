// The Loser Claw cabinet: static layers and sprites painted once per size, theme and photos.
import { TAU } from '../wheel-face';
import type { GamePalette } from '../themes/types';
import { CABINET, mixColor, withAlpha } from './claw-math';
import { heartPath, makeSprite, pixelScale, roundRect, sticker, type Sprite } from './claw-paint';

/** Prize door centre, the poster / neon heart on the back wall, the joystick and the grab button. */
export const DOOR = {
  x: (CABINET.doorLeft + CABINET.doorRight) / 2,
  y: (CABINET.doorTop + CABINET.doorBottom) / 2,
};
export const POSTER = { x: 0.06, y: -0.36, w: 0.6 };
export const STICK = { x: 0.24, y: 0.485 };
export const BUTTON = { x: 0.54, y: 0.485 };

/** The claw's shiny hub (dome, collar and a heart gem), for a hub of radius `h`. */
export function hubSprite(p: GamePalette, h: number, u: number): Sprite {
  const { sprite, ctx } = makeSprite(h * 2.6, h * 3.2, u);
  ctx.translate(0, h * 0.3);
  // Collar where the cable attaches.
  roundRect(ctx, -h * 0.42, -h * 1.45, h * 0.84, h * 0.7, h * 0.12);
  const collar = ctx.createLinearGradient(-h * 0.42, 0, h * 0.42, 0);
  collar.addColorStop(0, mixColor(p.trim, p.outline, 0.4));
  collar.addColorStop(0.4, p.trimLight);
  collar.addColorStop(1, mixColor(p.trim, p.outline, 0.3));
  ctx.fillStyle = collar;
  ctx.fill();
  ctx.lineWidth = h * 0.1;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  // Shiny dome.
  ctx.beginPath();
  ctx.arc(0, 0, h, 0, TAU);
  const dome = ctx.createRadialGradient(-h * 0.35, -h * 0.4, h * 0.05, 0, 0, h);
  dome.addColorStop(0, '#ffffff');
  dome.addColorStop(0.3, p.trimLight);
  dome.addColorStop(0.75, p.trim);
  dome.addColorStop(1, mixColor(p.trim, p.outline, 0.45));
  ctx.fillStyle = dome;
  ctx.fill();
  ctx.lineWidth = h * 0.12;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  // A pink heart gem on the front.
  heartPath(ctx, 0, h * 0.12, h * 0.95);
  const gem = ctx.createLinearGradient(0, -h * 0.4, 0, h * 0.6);
  gem.addColorStop(0, mixColor(p.glow, '#ffffff', 0.45));
  gem.addColorStop(1, p.body);
  ctx.fillStyle = gem;
  ctx.fill();
  ctx.lineWidth = h * 0.08;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-h * 0.2, -h * 0.08, h * 0.14, h * 0.07, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fill();
  return sprite;
}

/** The gantry carriage that runs on the rail (wheels, body, cable spool). */
export function carriageSprite(p: GamePalette, u: number): Sprite {
  const { sprite, ctx } = makeSprite(0.26, 0.13, u);
  // Wheels on the rail.
  for (const x of [-0.06, 0.06]) {
    ctx.beginPath();
    ctx.arc(x, -0.022, 0.016, 0, TAU);
    ctx.fillStyle = mixColor(p.trim, p.outline, 0.35);
    ctx.fill();
    ctx.lineWidth = 0.006;
    ctx.strokeStyle = p.outline;
    ctx.stroke();
  }
  // Body.
  roundRect(ctx, -0.1, -0.012, 0.2, 0.058, 0.018);
  const body = ctx.createLinearGradient(0, -0.012, 0, 0.046);
  body.addColorStop(0, mixColor(p.body, '#ffffff', 0.35));
  body.addColorStop(0.5, p.body);
  body.addColorStop(1, p.bodyDark);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 0.008;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  roundRect(ctx, -0.085, 0.006, 0.17, 0.012, 0.006);
  ctx.fillStyle = p.trim;
  ctx.fill();
  // Spool under it.
  roundRect(ctx, -0.028, 0.04, 0.056, 0.022, 0.008);
  ctx.fillStyle = mixColor(p.trim, p.outline, 0.25);
  ctx.fill();
  ctx.lineWidth = 0.006;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  return sprite;
}

/** Glossy ball of the joystick. */
export function ballSprite(p: GamePalette, u: number): Sprite {
  const { sprite, ctx } = makeSprite(0.09, 0.09, u);
  ctx.beginPath();
  ctx.arc(0, 0, 0.034, 0, TAU);
  const g = ctx.createRadialGradient(-0.012, -0.014, 0.002, 0, 0, 0.034);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, mixColor(p.glow, '#ffffff', 0.25));
  g.addColorStop(1, p.body);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.007;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  return sprite;
}

/** Marquee bulb, lit and unlit. */
export function lightSprites(p: GamePalette, u: number): { on: Sprite; off: Sprite } {
  const r = 0.017;
  const on = makeSprite(r * 7, r * 7, u);
  const halo = on.ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.4);
  halo.addColorStop(0, withAlpha(p.glow, 0.85));
  halo.addColorStop(0.35, withAlpha(p.glow, 0.35));
  halo.addColorStop(1, withAlpha(p.glow, 0));
  on.ctx.fillStyle = halo;
  on.ctx.fillRect(-r * 3.5, -r * 3.5, r * 7, r * 7);
  on.ctx.beginPath();
  on.ctx.arc(0, 0, r, 0, TAU);
  on.ctx.fillStyle = '#ffffff';
  on.ctx.fill();
  const off = makeSprite(r * 7, r * 7, u);
  off.ctx.beginPath();
  off.ctx.arc(0, 0, r, 0, TAU);
  const g = off.ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, mixColor(p.trimLight, p.body, 0.35));
  off.ctx.fillStyle = g;
  off.ctx.fill();
  off.ctx.lineWidth = r * 0.25;
  off.ctx.strokeStyle = withAlpha(p.outline, 0.6);
  off.ctx.stroke();
  return { on: on.sprite, off: off.sprite };
}

/** Light rays behind the opened capsule. */
export function raysSprite(p: GamePalette, u: number): Sprite {
  const R = CABINET.revealR * 1.95;
  const { sprite, ctx } = makeSprite(R * 2, R * 2, u);
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU;
    const w = (TAU / rays) * 0.32;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a - w, a + w);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, CABINET.revealR * 0.4, 0, 0, R);
    const color = i % 2 === 0 ? p.glow : p.trimLight;
    g.addColorStop(0, withAlpha(color, 0.75));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fill();
  }
  return sprite;
}

/** A gold comic burst with "!!" in it. */
export function alertSprite(p: GamePalette, u: number): Sprite {
  const { sprite, ctx } = makeSprite(0.26, 0.26, u);
  const spikes = 11;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU - Math.PI / 2;
    const r = i % 2 === 0 ? 0.115 : 0.078;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(0, -0.03, 0.01, 0, 0, 0.115);
  g.addColorStop(0, p.trimLight);
  g.addColorStop(1, p.trim);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  sticker(ctx, ['!!'], 0, 0.004, 0.105, {
    fill: p.text,
    outline: p.outline,
    family: p.display,
    stroke: 0.26,
  });
  return sprite;
}

/** Soft neon glow behind the opened capsule. */
export function glowSprite(p: GamePalette, u: number): Sprite {
  const R = CABINET.revealR * 1.7;
  const { sprite, ctx } = makeSprite(R * 2, R * 2, u);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, withAlpha(p.glow, 0.85));
  g.addColorStop(0.5, withAlpha(p.glow, 0.4));
  g.addColorStop(1, withAlpha(p.glow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-R, -R, R * 2, R * 2);
  return sprite;
}

/** A centre photo as a heart-shaped poster on the back wall, seen through the glass. */
export function posterSprite(p: GamePalette, photo: HTMLCanvasElement, u: number): Sprite {
  const w = POSTER.w;
  const { sprite, ctx } = makeSprite(w * 1.3, w * 1.3, u);
  ctx.save();
  heartPath(ctx, 0, 0, w);
  ctx.clip();
  const scale = Math.max(w / photo.width, w / photo.height);
  const dw = photo.width * scale;
  const dh = photo.height * scale;
  ctx.drawImage(
    photo,
    -dw / 2,
    -w * 0.5 - (photo.height > photo.width ? (dh - w) * 0.12 : (dh - w) / 2),
    dw,
    dh,
  );
  // Seen through the glass.
  ctx.fillStyle = withAlpha(p.screen, 0.28);
  ctx.fillRect(-w, -w, w * 2, w * 2);
  ctx.restore();
  heartPath(ctx, 0, 0, w);
  ctx.lineWidth = 0.018;
  ctx.strokeStyle = p.trim;
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 0.05 * u;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 0.006;
  ctx.strokeStyle = p.trimLight;
  ctx.stroke();
  return sprite;
}

/** Inside the glass: back wall, neon heart, rail, chute interior and the floor. */
export function paintBack(p: GamePalette, ctx: CanvasRenderingContext2D, poster: boolean): void {
  const C = CABINET;
  // Soft shadow under the machine and a pink haze around it.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, C.bottom + 0.005, 0.9, 0.035, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 0.04 * pixelScale(ctx);
  ctx.fill();
  ctx.restore();

  // Back wall.
  const gw = C.glassRight - C.glassLeft;
  const gh = C.glassBottom - C.glassTop;
  const wall = ctx.createLinearGradient(0, C.glassTop, 0, C.glassBottom);
  wall.addColorStop(0, mixColor(p.screen, p.glow, 0.08));
  wall.addColorStop(0.55, p.screen);
  wall.addColorStop(1, mixColor(p.screen, p.glow, 0.3));
  ctx.fillStyle = wall;
  ctx.fillRect(C.glassLeft, C.glassTop, gw, gh);
  // Diagonal candy stripes, very faint.
  ctx.save();
  ctx.beginPath();
  ctx.rect(C.glassLeft, C.glassTop, gw, gh);
  ctx.clip();
  ctx.fillStyle = withAlpha(p.glow, 0.045);
  for (let x = C.glassLeft - gh; x < C.glassRight; x += 0.16) {
    ctx.beginPath();
    ctx.moveTo(x, C.glassBottom);
    ctx.lineTo(x + 0.06, C.glassBottom);
    ctx.lineTo(x + 0.06 + gh * 0.6, C.glassTop);
    ctx.lineTo(x + gh * 0.6, C.glassTop);
    ctx.closePath();
    ctx.fill();
  }
  // Floor glow under the pile.
  const floorGlow = ctx.createRadialGradient(0.17, C.floor, 0.05, 0.17, C.floor, 0.75);
  floorGlow.addColorStop(0, withAlpha(p.glow, 0.42));
  floorGlow.addColorStop(1, withAlpha(p.glow, 0));
  ctx.fillStyle = floorGlow;
  ctx.fillRect(C.glassLeft, C.glassTop, gw, gh);
  ctx.restore();

  // Neon heart sign on the back wall (a photo poster replaces it).
  if (!poster) {
    ctx.save();
    heartPath(ctx, POSTER.x, POSTER.y, POSTER.w);
    ctx.lineWidth = 0.016;
    ctx.strokeStyle = withAlpha(p.glow, 0.55);
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 0.06 * pixelScale(ctx);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 0.005;
    ctx.strokeStyle = withAlpha('#ffffff', 0.35);
    ctx.stroke();
    ctx.restore();
    sticker(ctx, ['$'], POSTER.x, POSTER.y - 0.02, 0.26, {
      fill: withAlpha(p.glow, 0.22),
      outline: withAlpha(p.glow, 0.5),
      family: p.display,
      stroke: 0.06,
      shadow: withAlpha(p.glow, 0.6),
    });
  }

  // Rails: a thin back rail and the main one the carriage runs on.
  ctx.fillStyle = mixColor(p.trim, p.screen, 0.55);
  ctx.fillRect(C.glassLeft + 0.01, C.railY - 0.045, gw - 0.02, 0.012);
  roundRect(ctx, C.glassLeft + 0.005, C.railY - 0.014, gw - 0.01, 0.026, 0.01);
  const rail = ctx.createLinearGradient(0, C.railY - 0.014, 0, C.railY + 0.012);
  rail.addColorStop(0, p.trimLight);
  rail.addColorStop(0.5, p.trim);
  rail.addColorStop(1, mixColor(p.trim, p.outline, 0.4));
  ctx.fillStyle = rail;
  ctx.fill();
  ctx.lineWidth = 0.005;
  ctx.strokeStyle = p.outline;
  ctx.stroke();

  // Chute interior and the back of its rim.
  const cw = C.chuteRight - C.chuteLeft;
  const inside = ctx.createLinearGradient(0, C.chuteTop, 0, C.glassBottom);
  inside.addColorStop(0, mixColor(p.screen, '#000000', 0.35));
  inside.addColorStop(1, mixColor(p.screen, p.glow, 0.15));
  ctx.fillStyle = inside;
  ctx.fillRect(C.chuteLeft, C.chuteTop, cw, C.glassBottom - C.chuteTop);
  ctx.beginPath();
  ctx.ellipse(C.chuteLeft + cw / 2, C.chuteTop, cw / 2, 0.028, 0, Math.PI, TAU);
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = mixColor(p.trim, p.screen, 0.3);
  ctx.stroke();

  // Floor.
  ctx.fillStyle = mixColor(p.screen, p.glow, 0.22);
  ctx.fillRect(C.chuteRight, C.floor, C.glassRight - C.chuteRight, C.glassBottom - C.floor);
}

/** In front of the pile: chute glass, glass sheen, pillars, header, deck, front panel, prize door. */
export function paintFront(p: GamePalette, ctx: CanvasRenderingContext2D): void {
  const C = CABINET;
  const k = pixelScale(ctx);
  const bodyLight = mixColor(p.body, '#ffffff', 0.28);

  // Chute front: tinted glass with neon edges and a down arrow.
  const cw = C.chuteRight - C.chuteLeft;
  const ch = C.glassBottom - C.chuteTop;
  const chuteGlass = ctx.createLinearGradient(0, C.chuteTop, 0, C.glassBottom);
  chuteGlass.addColorStop(0, withAlpha(p.glow, 0.2));
  chuteGlass.addColorStop(1, withAlpha(p.glow, 0.08));
  ctx.fillStyle = chuteGlass;
  ctx.fillRect(C.chuteLeft, C.chuteTop, cw, ch);
  ctx.beginPath();
  ctx.ellipse(C.chuteLeft + cw / 2, C.chuteTop, cw / 2, 0.028, 0, 0, Math.PI);
  ctx.lineWidth = 0.014;
  ctx.strokeStyle = p.trim;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(C.chuteLeft, C.chuteTop);
  ctx.lineTo(C.chuteLeft, C.glassBottom);
  ctx.moveTo(C.chuteRight, C.chuteTop);
  ctx.lineTo(C.chuteRight, C.glassBottom);
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = p.trim;
  ctx.stroke();
  // Sheen on the chute glass.
  ctx.beginPath();
  ctx.moveTo(C.chuteLeft + 0.03, C.chuteTop + 0.05);
  ctx.lineTo(C.chuteLeft + 0.07, C.chuteTop + 0.05);
  ctx.lineTo(C.chuteLeft + 0.05, C.glassBottom - 0.02);
  ctx.lineTo(C.chuteLeft + 0.03, C.glassBottom - 0.02);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fill();
  const ax = C.chuteLeft + cw / 2;
  const ay = C.chuteTop + ch * 0.55;
  ctx.beginPath();
  ctx.moveTo(ax - 0.055, ay - 0.03);
  ctx.lineTo(ax, ay + 0.03);
  ctx.lineTo(ax + 0.055, ay - 0.03);
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = withAlpha(p.glow, 0.9);
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 0.03 * k;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 0.007;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.stroke();

  // Glass sheen: two diagonal streaks.
  ctx.save();
  ctx.beginPath();
  ctx.rect(C.glassLeft, C.glassTop, C.glassRight - C.glassLeft, C.glassBottom - C.glassTop);
  ctx.clip();
  for (const [x, w, a] of [
    [-0.5, 0.16, 0.07],
    [-0.25, 0.05, 0.06],
    [0.45, 0.08, 0.04],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, C.glassTop);
    ctx.lineTo(x + w, C.glassTop);
    ctx.lineTo(x + w - 0.5, C.glassBottom);
    ctx.lineTo(x - 0.5, C.glassBottom);
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.fill();
  }
  ctx.restore();

  // Cabinet silhouette (pillars, header, deck, front panel) with a dark outline.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(C.left, C.top, C.right - C.left, C.bottom - C.top, [0.14, 0.14, 0.03, 0.03]);
  ctx.rect(C.glassRight, C.glassTop, C.glassLeft - C.glassRight, C.glassBottom - C.glassTop);
  ctx.fillStyle = p.outline;
  ctx.shadowColor = withAlpha(p.glow, 0.55);
  ctx.shadowBlur = 0.06 * k;
  ctx.fill('evenodd');
  ctx.restore();
  const inset = 0.012;

  // Pillars (rounded columns).
  for (const [x0, x1] of [
    [C.left + inset, C.glassLeft],
    [C.glassRight, C.right - inset],
  ] as const) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, p.bodyDark);
    g.addColorStop(0.45, bodyLight);
    g.addColorStop(1, p.bodyDark);
    ctx.fillStyle = g;
    ctx.fillRect(x0, C.glassTop, x1 - x0, C.glassBottom - C.glassTop);
    ctx.fillStyle = p.trim;
    ctx.fillRect(x0 === C.glassRight ? x0 : x1 - 0.012, C.glassTop, 0.012, C.glassBottom - C.glassTop);
  }

  // Header with a gold heart badge.
  ctx.beginPath();
  ctx.roundRect(
    C.left + inset,
    C.top + inset,
    C.right - C.left - inset * 2,
    C.glassTop - C.top - inset,
    [0.13, 0.13, 0, 0],
  );
  const head = ctx.createLinearGradient(0, C.top, 0, C.glassTop);
  head.addColorStop(0, bodyLight);
  head.addColorStop(1, p.bodyDark);
  ctx.fillStyle = head;
  ctx.fill();
  roundRect(ctx, -0.66, -0.915, 1.32, 0.07, 0.035);
  ctx.fillStyle = withAlpha(p.outline, 0.45);
  ctx.fill();
  ctx.fillStyle = p.trim;
  ctx.fillRect(C.left + inset, C.glassTop - 0.014, C.right - C.left - inset * 2, 0.014);
  paintBadge(p, ctx, 0, -0.885, 0.2);

  // Control deck: lit top face and a darker lip.
  ctx.beginPath();
  ctx.moveTo(C.left + inset, C.glassBottom);
  ctx.lineTo(C.right - inset, C.glassBottom);
  ctx.lineTo(C.right - inset, C.glassBottom + 0.075);
  ctx.lineTo(C.left + inset, C.glassBottom + 0.075);
  ctx.closePath();
  const deck = ctx.createLinearGradient(0, C.glassBottom, 0, C.glassBottom + 0.075);
  deck.addColorStop(0, mixColor(p.body, '#ffffff', 0.45));
  deck.addColorStop(1, p.body);
  ctx.fillStyle = deck;
  ctx.fill();
  ctx.fillStyle = p.bodyDark;
  ctx.fillRect(
    C.left + inset,
    C.glassBottom + 0.075,
    C.right - C.left - inset * 2,
    C.deckBottom - C.glassBottom - 0.075,
  );
  ctx.fillStyle = p.trim;
  ctx.fillRect(C.left + inset, C.glassBottom, C.right - C.left - inset * 2, 0.012);
  ctx.fillRect(C.left + inset, C.glassBottom + 0.072, C.right - C.left - inset * 2, 0.008);
  // Joystick base and button ring.
  ctx.beginPath();
  ctx.ellipse(STICK.x, STICK.y + 0.012, 0.055, 0.018, 0, 0, TAU);
  ctx.fillStyle = p.outline;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(BUTTON.x, BUTTON.y + 0.012, 0.07, 0.024, 0, 0, TAU);
  ctx.fillStyle = p.trim;
  ctx.fill();
  ctx.lineWidth = 0.006;
  ctx.strokeStyle = p.outline;
  ctx.stroke();

  // Front panel with candy stripes and a gold inlay.
  const panelTop = C.deckBottom;
  const panelBottom = C.bottom - 0.065;
  const panel = ctx.createLinearGradient(0, panelTop, 0, panelBottom);
  panel.addColorStop(0, p.body);
  panel.addColorStop(1, mixColor(p.body, p.bodyDark, 0.6));
  ctx.fillStyle = panel;
  ctx.fillRect(C.left + inset, panelTop, C.right - C.left - inset * 2, panelBottom - panelTop);
  ctx.save();
  ctx.beginPath();
  ctx.rect(C.left + inset, panelTop, C.right - C.left - inset * 2, panelBottom - panelTop);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  for (let x = C.left - 0.5; x < C.right; x += 0.13) {
    ctx.beginPath();
    ctx.moveTo(x, panelBottom);
    ctx.lineTo(x + 0.05, panelBottom);
    ctx.lineTo(x + 0.05 + 0.3, panelTop);
    ctx.lineTo(x + 0.3, panelTop);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  roundRect(
    ctx,
    C.left + 0.045,
    panelTop + 0.03,
    C.right - C.left - 0.09,
    panelBottom - panelTop - 0.06,
    0.04,
  );
  ctx.lineWidth = 0.01;
  ctx.strokeStyle = p.trim;
  ctx.stroke();

  // Prize door: a dark opening in a gold frame (the flap is drawn per frame).
  roundRect(ctx, C.doorLeft, C.doorTop, C.doorRight - C.doorLeft, C.doorBottom - C.doorTop, 0.04);
  const hole = ctx.createLinearGradient(0, C.doorTop, 0, C.doorBottom);
  hole.addColorStop(0, mixColor(p.screen, '#000000', 0.5));
  hole.addColorStop(1, p.screen);
  ctx.fillStyle = hole;
  ctx.fill();
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  ctx.lineWidth = 0.011;
  ctx.strokeStyle = p.trim;
  ctx.stroke();

  // Coin plate: slot and a "$" coin.
  roundRect(ctx, 0.3, 0.645, 0.36, 0.21, 0.035);
  ctx.fillStyle = p.screen;
  ctx.fill();
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  ctx.lineWidth = 0.01;
  ctx.strokeStyle = p.trim;
  ctx.stroke();
  roundRect(ctx, 0.37, 0.69, 0.032, 0.12, 0.012);
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.lineWidth = 0.006;
  ctx.strokeStyle = withAlpha(p.glow, 0.9);
  ctx.stroke();
  paintCoin(p, ctx, 0.54, 0.75, 0.075);

  // Speaker heart between the door and the plate.
  ctx.save();
  heartPath(ctx, -0.06, 0.755, 0.28);
  ctx.fillStyle = withAlpha(p.outline, 0.4);
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = withAlpha(p.trimLight, 0.55);
  for (let y = 0.63; y < 0.89; y += 0.035) {
    for (let x = -0.22; x < 0.1; x += 0.035) {
      ctx.beginPath();
      ctx.arc(x + ((y * 100) % 2 < 1 ? 0 : 0.0175), y, 0.008, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  heartPath(ctx, -0.06, 0.755, 0.28);
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = p.trim;
  ctx.stroke();

  // Plinth.
  ctx.fillStyle = p.bodyDark;
  ctx.fillRect(C.left + inset, panelBottom, C.right - C.left - inset * 2, C.bottom - inset - panelBottom);
  ctx.fillStyle = p.trim;
  ctx.fillRect(C.left + inset, panelBottom, C.right - C.left - inset * 2, 0.01);
}

/** Gold heart with a "$" coin, like the wheel's pointer. */
function paintBadge(p: GamePalette, ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.save();
  heartPath(ctx, x, y, w);
  const g = ctx.createLinearGradient(0, y - w / 2, 0, y + w / 2);
  g.addColorStop(0, p.trimLight);
  g.addColorStop(0.5, p.trim);
  g.addColorStop(1, mixColor(p.trim, p.outline, 0.3));
  ctx.fillStyle = g;
  ctx.shadowColor = withAlpha(p.outline, 0.6);
  ctx.shadowBlur = 0.02 * pixelScale(ctx);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 0.01;
  ctx.strokeStyle = p.outline;
  ctx.stroke();
  ctx.restore();
  paintCoin(p, ctx, x, y - w * 0.04, w * 0.27);
}

/** Pink coin with a "$". */
function paintCoin(p: GamePalette, ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, mixColor(p.glow, '#ffffff', 0.55));
  g.addColorStop(1, p.body);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = p.trimLight;
  ctx.stroke();
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = p.outline;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.08, 0, TAU);
  ctx.stroke();
  sticker(ctx, ['$'], x, y, r * 1.25, {
    fill: '#ffffff',
    outline: p.outline,
    family: p.display,
    stroke: 0.22,
  });
}

/** Neon tube around the inside of the glass. */
export function paintNeon(p: GamePalette, ctx: CanvasRenderingContext2D): void {
  const C = CABINET;
  const k = pixelScale(ctx);
  const d = 0.018;
  roundRect(
    ctx,
    C.glassLeft + d,
    C.glassTop + d,
    C.glassRight - C.glassLeft - d * 2,
    C.glassBottom - C.glassTop - d * 2,
    0.05,
  );
  ctx.lineWidth = 0.013;
  ctx.strokeStyle = p.glow;
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 0.045 * k;
  ctx.stroke();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 0.0045;
  ctx.strokeStyle = mixColor(p.glow, '#ffffff', 0.75);
  ctx.stroke();
}

/** Marquee bulbs around the cabinet, in chase order (header, right pillar, plinth, left pillar). */
export function lightPositions(): { x: number; y: number }[] {
  const C = CABINET;
  const lights: { x: number; y: number }[] = [];
  for (const x of [-0.72, -0.6, -0.48, -0.36, -0.24, 0.24, 0.36, 0.48, 0.6, 0.72])
    lights.push({ x, y: -0.88 });
  const pillar = (C.glassRight + C.right) / 2;
  for (let y = C.glassTop + 0.08; y < C.glassBottom - 0.02; y += 0.135) lights.push({ x: pillar, y });
  for (let x = 0.72; x > -0.73; x -= 0.18) lights.push({ x, y: C.bottom - 0.035 });
  for (let y = C.glassBottom - 0.07; y > C.glassTop; y -= 0.135) lights.push({ x: -pillar, y });
  return lights;
}
