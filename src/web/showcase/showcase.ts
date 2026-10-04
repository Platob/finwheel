/**
 * Live wheels and games for the documentation site: one section per wheel of the default config,
 * each the real overlay stage (a wheel, the slot machine, the claw, plinko or the gifts) played in
 * the browser with the same odds and landing maths as the server. Mounts into `#fw-live`; does
 * nothing on pages without it.
 */
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/inter/700.css';
import '@fontsource/lilita-one/400.css';
import './showcase.css';

import defaultConfig from '../../../config/default.config.json';
import { GAME_PLAYS, playDuration } from '../../shared/constants';
import { computeArcs, landingRotation, type Arc } from '../../shared/geometry';
import { formatMoney, pickWeighted, simulateTurns } from '../../shared/rules';
import { ConfigSchema, type GameType, type ThemeId, type Wheel } from '../../shared/schema';
import { TIER_STYLES } from '../../shared/tiers';
import type { WheelView } from '../../shared/types';
import { prizeWheelView } from '../../shared/wheel-view';
import { SoundBoard } from '../overlay/audio';
import { Celebration } from '../overlay/fx';
import { GameDirector } from '../overlay/games/director';
import type { PlayPlan } from '../overlay/games/types';
import { getTheme } from '../overlay/themes';
import type { Framing } from '../overlay/wheel-scene';

/** Centred wheel with room for the pointer above it. */
const WHEEL_FRAMING: Framing = { centerY: 0.53, rimOuter: 0.44 };
/** Games fill the card: their play area centred (the slot machine's sign pokes out above it). */
const GAME_FRAMING: Framing = { centerY: 0.51, rimOuter: 0.45 };
/** A wheel spin; games last `playDuration` of it, like on the overlay. */
const SPIN_MS = 6500;
const AUTO_SPIN_GAP_MS = 900;
const THEME_KEY = 'finwheel-live-theme';

/** How each card talks about its game. */
const GAME_COPY: Record<
  GameType,
  { name: string; icon: string; idle: string; button: string; busy: string }
> = {
  wheel: { name: 'wheel', icon: '🎡', idle: 'Tap the wheel to spin', button: 'SPIN$', busy: 'Spinning…' },
  slots: {
    name: 'slot machine',
    icon: '🎰',
    idle: 'Tap the machine to pull the lever',
    button: 'PULL',
    busy: 'Reels spinning…',
  },
  claw: {
    name: 'claw machine',
    icon: '🕹️',
    idle: 'Tap the machine to grab a capsule',
    button: 'GRAB',
    busy: 'The claw is hunting…',
  },
  plinko: {
    name: 'plinko board',
    icon: '🪙',
    idle: 'Tap the board to drop the coin',
    button: 'DROP',
    busy: 'Bouncing…',
  },
  gifts: {
    name: 'mystery gifts',
    icon: '🎁',
    idle: 'Tap the gifts to open one',
    button: 'PICK',
    busy: 'Shuffling the gifts…',
  },
};

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
  // "3-pull games", "1-gift game".
  const games = `${wheel.spinsPerTurn}-${GAME_PLAYS[wheel.game][0]} game${wheel.spinsPerTurn === 1 ? '' : 's'}`;
  const bust = stats.bustRate > 0 ? ` · bankrupt ${Math.round(stats.bustRate * 100)}%` : '';
  return `${games}: average ${money(stats.averagePayout)} · best ${money(stats.maxPayout)}${bust}`;
}

/** One card: a wheel or a mini-game on its own canvas, played locally. */
class LiveGame {
  readonly section: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly director: GameDirector;
  private readonly result: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly view: WheelView;
  private readonly copy: (typeof GAME_COPY)[GameType];
  private readonly arcs: Arc[];
  /** The play on screen; kept after it lands so its final frame holds, as on the overlay. */
  private plan: PlayPlan | null = null;
  private landed = true;
  private rotation = 0;
  private shown = false;
  visible = false;
  played = false;

  constructor(wheel: Wheel) {
    this.view = prizeWheelView(wheel, currency);
    this.copy = GAME_COPY[this.view.game];
    this.arcs = computeArcs(
      this.view.segments.map((s) => s.weight),
      this.view.sizing,
    );
    // Start with a slice centred under the pointer, like a wheel at rest.
    const first = this.arcs[0];
    this.rotation = first ? -(first.start + first.end) / 2 : 0;

    this.section = el('section', 'fw-live-wheel');
    this.section.id = wheel.id;
    this.section.dataset.game = this.view.game;
    const header = el('header', 'fw-live-head');
    header.append(el('h2', 'fw-live-name', wheel.name));
    if (wheel.subtitle) header.append(el('p', 'fw-live-sub', wheel.subtitle));
    if (this.view.game !== 'wheel') {
      const tag = el('p', 'fw-live-tag', `${this.copy.icon} ${this.copy.name}`);
      if (wheel.command) tag.append(' · ', el('code', '', wheel.command));
      header.append(tag);
    }

    this.stage = el('div', 'fw-live-stage');
    const canvas = el('canvas', 'fw-live-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${wheel.name} ${this.copy.name}`);
    this.stage.append(canvas);
    this.stage.addEventListener('click', () => this.play());

    this.result = el('p', 'fw-live-result', this.copy.idle);
    this.result.setAttribute('aria-live', 'polite');
    this.button = el('button', 'fw-live-spin', this.copy.button);
    this.button.type = 'button';
    this.button.setAttribute('aria-label', `Play ${wheel.name}`);
    this.button.addEventListener('click', () => this.play());

    const foot = el('div', 'fw-live-foot');
    foot.append(this.result, this.button);
    this.section.append(header, this.stage, foot);
    if (this.view.money) this.section.append(el('p', 'fw-live-odds', oddsLine(wheel)));

    const game = this.view.game;
    this.director = new GameDirector(canvas, getTheme(theme), sound, {
      framing: game === 'wheel' ? WHEEL_FRAMING : GAME_FRAMING,
      game,
    });
    this.director.onTick = (speed) => sound.tick(speed);
    new ResizeObserver(() => this.resize()).observe(this.stage);
  }

  resize(): void {
    const width = this.stage.clientWidth;
    if (width <= 0) return;
    this.director.resize(width, window.devicePixelRatio || 1);
    // The stage is shown once it has a size, so its first caches are built at the right one.
    if (!this.shown) {
      this.shown = true;
      this.director.show(this.view, this.rotation, performance.now());
    }
  }

  setTheme(id: ThemeId): void {
    this.director.setTheme(getTheme(id));
  }

  refresh(): void {
    this.director.refresh();
  }

  play(): void {
    const now = performance.now();
    if (!this.shown || !this.landed || this.view.segments.length === 0) return;
    this.played = true;
    // The same draw as the server: a weighted pick, a landing angle inside the slice, a seed.
    const segmentIndex = pickWeighted(
      this.view.segments.map((s) => s.weight),
      Math.random,
    );
    const turns = 5 + Math.floor(Math.random() * 4);
    const landing = 0.12 + Math.random() * 0.76;
    const plan: PlayPlan = {
      wheel: this.view,
      segmentIndex,
      fromRotation: this.rotation,
      toRotation: landingRotation(this.rotation, this.arcs[segmentIndex]!, landing, turns),
      durationMs: Math.round(playDuration(this.view.game, SPIN_MS) * (0.92 + Math.random() * 0.16)),
      seed: Math.floor(Math.random() * 2 ** 32),
    };
    this.plan = plan;
    this.landed = false;
    this.director.play(plan, now, now);
    this.director.setHighlight(null);
    this.result.textContent = this.copy.busy;
    this.button.disabled = true;
    sound.whoosh();
  }

  frame(now: number): void {
    // A landed play off screen has nothing left to advance.
    if (this.plan && (!this.landed || this.visible)) {
      const landed = this.director.update(now);
      if (landed && !this.landed) this.land(this.plan, now);
    }
    if (this.visible && this.shown) this.director.draw(now);
  }

  private land(plan: PlayPlan, now: number): void {
    this.landed = true;
    this.rotation = plan.toRotation;
    this.button.disabled = false;
    const segment = this.view.segments[plan.segmentIndex];
    if (!segment) return;
    const bust = Boolean(segment.bust);
    this.director.setHighlight(plan.segmentIndex, segment.tier, bust, now);

    const prize = segment.amount
      ? `${segment.amount}${segment.caption ? ` ${segment.caption}` : ''}`
      : segment.label;
    this.result.replaceChildren(el('strong', '', `${segment.icon ? `${segment.icon} ` : ''}${prize}`));
    if (segment.description) this.result.append(` · ${segment.description}`);

    if (bust) {
      sound.bust();
      return;
    }
    sound.win(segment.tier);
    this.director.celebrate(TIER_STYLES[segment.tier].celebration * 1400, now);
    const rect = this.stage.getBoundingClientRect();
    const center = this.director.center;
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
  const cards = config.wheels.map((wheel) => new LiveGame(wheel));

  const loadFonts = () => {
    const id = theme;
    void Promise.all(getTheme(id).fonts.map((font) => document.fonts.load(font))).then(() => {
      if (id === theme) for (const card of cards) card.refresh();
    });
  };

  const setTheme = (id: ThemeId) => {
    if (id === theme) return;
    theme = id;
    root.dataset.theme = id;
    fx?.setTheme(id);
    for (const card of cards) card.setTheme(id);
    loadFonts();
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      // Storage can be blocked; the choice then lasts for this visit only.
    }
  };

  const grid = el('div', 'fw-live-grid');
  grid.append(...cards.map((card) => card.section));
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

  // Draw only cards on screen; each one plays by itself the first time it comes into view,
  // staggered so cards that appear together do not all land at once.
  const byElement = new Map(cards.map((card) => [card.section, card]));
  let nextAutoPlay = 0;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const card = byElement.get(entry.target as HTMLElement);
        if (!card) continue;
        card.visible = entry.isIntersecting;
        if (!reducedMotion && !card.played && entry.intersectionRatio >= 0.6) {
          card.played = true;
          const at = Math.max(performance.now() + 400, nextAutoPlay);
          nextAutoPlay = at + AUTO_SPIN_GAP_MS;
          setTimeout(() => card.play(), at - performance.now());
        }
      }
    },
    { threshold: [0, 0.6] },
  );
  for (const card of cards) observer.observe(card.section);

  const frame = (now: number) => {
    for (const card of cards) card.frame(now);
    fx?.draw(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const root = document.getElementById('fw-live');
if (root) mount(root);
