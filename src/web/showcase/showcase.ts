/**
 * Live wheels for the documentation site: one section per wheel of the default config, each a
 * real overlay wheel spun in the browser with the same odds and landing maths as the server.
 * Mounts into `#fw-live`; does nothing on pages without it.
 */
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/inter/700.css';
import '@fontsource/lilita-one/400.css';
import './showcase.css';

import defaultConfig from '../../../config/default.config.json';
import { computeArcs, landingRotation, type Arc } from '../../shared/geometry';
import { formatMoney, pickWeighted, simulateTurns } from '../../shared/rules';
import { ConfigSchema, type ThemeId, type Wheel } from '../../shared/schema';
import { TIER_STYLES } from '../../shared/tiers';
import type { WheelView } from '../../shared/types';
import { prizeWheelView } from '../../shared/wheel-view';
import { SoundBoard } from '../overlay/audio';
import { Celebration } from '../overlay/fx';
import { SpinMotion, type SpinPath } from '../overlay/spin-motion';
import { getTheme } from '../overlay/themes';
import { WheelScene, type Framing } from '../overlay/wheel-scene';

/** Centred wheel with room for the pointer above it. */
const FRAMING: Framing = { centerY: 0.53, rimOuter: 0.44 };
const SPIN_MS = 6500;
const AUTO_SPIN_GAP_MS = 900;
const THEME_KEY = 'finwheel-live-theme';

const config = ConfigSchema.parse(defaultConfig);
const currency = config.settings.currency;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const sound = new SoundBoard();
sound.configure(false, 0.5);
let fx: Celebration | null = null;
let theme: ThemeId = readTheme();

function readTheme(): ThemeId {
  try {
    return localStorage.getItem(THEME_KEY) === 'casino' ? 'casino' : 'glam';
  } catch {
    return 'glam';
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** One-line odds summary of a money wheel, from the same simulator as the dock. */
function oddsLine(wheel: Wheel): string {
  const stats = simulateTurns(config, wheel.id, 4000);
  if (!stats) return '';
  const money = (value: number) => formatMoney(value, currency);
  const games = `${wheel.spinsPerTurn}-spin game${wheel.spinsPerTurn === 1 ? '' : 's'}`;
  const bust = stats.bustRate > 0 ? ` · bankrupt ${Math.round(stats.bustRate * 100)}%` : '';
  return `${games}: average ${money(stats.averagePayout)} · best ${money(stats.maxPayout)}${bust}`;
}

class LiveWheel {
  readonly section: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly scene: WheelScene;
  private readonly result: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly view: WheelView;
  private readonly arcs: Arc[];
  private motion: SpinMotion<SpinPath> | null = null;
  private target = -1;
  private rotation = 0;
  visible = false;
  played = false;

  constructor(wheel: Wheel) {
    this.view = prizeWheelView(wheel, currency);
    this.arcs = computeArcs(
      this.view.segments.map((s) => s.weight),
      this.view.sizing,
    );
    // Start with a slice centred under the pointer, like a wheel at rest.
    const first = this.arcs[0];
    this.rotation = first ? -(first.start + first.end) / 2 : 0;

    this.section = el('section', 'fw-live-wheel');
    this.section.id = wheel.id;
    const header = el('header', 'fw-live-head');
    header.append(el('h2', 'fw-live-name', wheel.name));
    if (wheel.subtitle) header.append(el('p', 'fw-live-sub', wheel.subtitle));

    this.stage = el('div', 'fw-live-stage');
    const canvas = el('canvas', 'fw-live-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${wheel.name} wheel`);
    this.stage.append(canvas);
    this.stage.addEventListener('click', () => this.spin());

    this.result = el('p', 'fw-live-result', 'Tap the wheel to spin');
    this.result.setAttribute('aria-live', 'polite');
    this.button = el('button', 'fw-live-spin', 'SPIN$');
    this.button.type = 'button';
    this.button.setAttribute('aria-label', `Spin ${wheel.name}`);
    this.button.addEventListener('click', () => this.spin());

    const foot = el('div', 'fw-live-foot');
    foot.append(this.result, this.button);
    this.section.append(header, this.stage, foot);
    if (this.view.money) this.section.append(el('p', 'fw-live-odds', oddsLine(wheel)));

    this.scene = new WheelScene(canvas, getTheme(theme), FRAMING);
    this.scene.onTick = (speed) => sound.tick(speed);
    this.scene.setWheel(this.view);
    this.scene.setRotation(this.rotation);
    new ResizeObserver(() => this.resize()).observe(this.stage);
  }

  resize(): void {
    this.scene.resize(this.stage.clientWidth, window.devicePixelRatio || 1);
  }

  setTheme(id: ThemeId): void {
    this.scene.setTheme(getTheme(id));
  }

  refresh(): void {
    this.scene.refresh();
  }

  spin(): void {
    const now = performance.now();
    if (this.motion || this.view.segments.length === 0) return;
    this.played = true;
    const index = pickWeighted(
      this.view.segments.map((s) => s.weight),
      Math.random,
    );
    const turns = 5 + Math.floor(Math.random() * 4);
    const landing = 0.12 + Math.random() * 0.76;
    this.motion = new SpinMotion(
      {
        fromRotation: this.rotation,
        toRotation: landingRotation(this.rotation, this.arcs[index]!, landing, turns),
        durationMs: Math.round(SPIN_MS * (0.92 + Math.random() * 0.16)),
      },
      now,
    );
    this.target = index;
    this.scene.setHighlight(null);
    this.result.textContent = 'Spinning…';
    this.button.disabled = true;
    sound.whoosh();
  }

  frame(now: number): void {
    const motion = this.motion;
    if (motion) {
      const done = motion.done(now);
      this.scene.setRotation(motion.rotationAt(now), now, !done);
      if (done) this.land(motion.spin.toRotation, now);
    }
    if (this.visible) this.scene.draw(now);
  }

  private land(rotation: number, now: number): void {
    this.rotation = rotation;
    this.motion = null;
    this.button.disabled = false;
    const segment = this.view.segments[this.target];
    if (!segment) return;
    const bust = Boolean(segment.bust);
    this.scene.setHighlight(this.target, segment.tier, bust, now);

    const prize = segment.amount
      ? `${segment.amount}${segment.caption ? ` ${segment.caption}` : ''}`
      : segment.label;
    this.result.replaceChildren(el('strong', '', prize));
    if (segment.description) this.result.append(` · ${segment.description}`);

    if (bust) {
      sound.bust();
      return;
    }
    sound.win(segment.tier);
    this.scene.celebrate(TIER_STYLES[segment.tier].celebration * 1400, now);
    const rect = this.stage.getBoundingClientRect();
    const center = this.scene.center;
    fx?.burst(
      rect.left + center.x,
      rect.top + center.y - center.radius * 0.4,
      segment.tier,
      Math.max(0.45, rect.width / 1080),
    );
  }
}

function toolbar(onTheme: (id: ThemeId) => void): HTMLElement {
  const bar = el('div', 'fw-live-toolbar');
  const looks = el('div', 'fw-live-toggle');
  looks.setAttribute('role', 'group');
  looks.setAttribute('aria-label', 'Look');
  const buttons = (['glam', 'casino'] as const).map((id) => {
    const button = el('button', 'fw-live-chip', id === 'glam' ? 'Glam' : 'Casino');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(id === theme));
    button.addEventListener('click', () => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
      onTheme(id);
    });
    return button;
  });
  looks.append(...buttons);

  const soundButton = el('button', 'fw-live-chip', 'Sound off');
  soundButton.type = 'button';
  soundButton.setAttribute('aria-pressed', 'false');
  soundButton.addEventListener('click', () => {
    const on = soundButton.getAttribute('aria-pressed') !== 'true';
    soundButton.setAttribute('aria-pressed', String(on));
    soundButton.textContent = on ? 'Sound on' : 'Sound off';
    sound.configure(on, 0.5);
  });
  bar.append(looks, soundButton);
  return bar;
}

function mount(root: HTMLElement): void {
  root.dataset.theme = theme;
  const wheels = config.wheels.map((wheel) => new LiveWheel(wheel));

  const loadFonts = () => {
    const id = theme;
    void Promise.all(getTheme(id).fonts.map((font) => document.fonts.load(font))).then(() => {
      if (id === theme) for (const wheel of wheels) wheel.refresh();
    });
  };

  const setTheme = (id: ThemeId) => {
    if (id === theme) return;
    theme = id;
    root.dataset.theme = id;
    fx?.setTheme(id);
    for (const wheel of wheels) wheel.setTheme(id);
    loadFonts();
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      // Storage can be blocked; the choice then lasts for this visit only.
    }
  };

  const grid = el('div', 'fw-live-grid');
  grid.append(...wheels.map((wheel) => wheel.section));
  root.replaceChildren(toolbar(setTheme), grid);

  const fxCanvas = el('canvas', 'fw-live-fx');
  fxCanvas.setAttribute('aria-hidden', 'true');
  document.body.append(fxCanvas);
  fx = new Celebration(fxCanvas);
  fx.setTheme(theme);
  const resizeFx = () => fx?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  window.addEventListener('resize', resizeFx);
  resizeFx();
  loadFonts();

  // Draw only wheels on screen; each one spins by itself the first time it comes into view,
  // staggered so wheels that appear together do not all land at once.
  const byElement = new Map(wheels.map((wheel) => [wheel.section, wheel]));
  let nextAutoSpin = 0;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const wheel = byElement.get(entry.target as HTMLElement);
        if (!wheel) continue;
        wheel.visible = entry.isIntersecting;
        if (!reducedMotion && !wheel.played && entry.intersectionRatio >= 0.6) {
          wheel.played = true;
          const at = Math.max(performance.now() + 400, nextAutoSpin);
          nextAutoSpin = at + AUTO_SPIN_GAP_MS;
          setTimeout(() => wheel.spin(), at - performance.now());
        }
      }
    },
    { threshold: [0, 0.6] },
  );
  for (const wheel of wheels) observer.observe(wheel.section);

  const frame = (now: number) => {
    for (const wheel of wheels) wheel.frame(now);
    fx?.draw(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const root = document.getElementById('fw-live');
if (root) mount(root);
