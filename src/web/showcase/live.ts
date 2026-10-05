/**
 * The live wheels and games behind every `.fw-live` mount point: each card is the real overlay stage
 * (a wheel, the slot machine, the claw, plinko or the gifts) played in the browser with the same odds
 * and landing maths as the server. Loaded by showcase.ts only on pages that have a mount point.
 *
 * One page-wide state serves every mount: one frame loop, one IntersectionObserver, one celebration
 * canvas, one sound board and one look (Glam or Casino) that every toolbar and card follows.
 */
import defaultConfig from '../../../config/default.config.json';
import { GAME_PLAYS, playDuration } from '../../shared/constants';
import { computeArcs, landingRotation, type Arc } from '../../shared/geometry';
import { formatMoney, isMoneyWheel, pickWeighted, simulateTurns } from '../../shared/rules';
import { ConfigSchema, type Config, type GameType, type ThemeId, type Wheel } from '../../shared/schema';
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
/** Games simulated for a card's odds line (the dock's estimate uses more). */
const ODDS_GAMES = 4000;
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

/** Headings of the full showcase (a mount point without `data-wheels`), in page order. */
type Group = 'money' | 'games' | 'prizes';
const GROUPS: readonly { id: Group; title: string }[] = [
  { id: 'money', title: 'Money wheels' },
  { id: 'games', title: 'Games' },
  { id: 'prizes', title: 'Prize wheels' },
];

function groupOf(wheel: Wheel): Group {
  if (wheel.game !== 'wheel') return 'games';
  return isMoneyWheel(wheel) ? 'money' : 'prizes';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function readTheme(): ThemeId {
  try {
    return localStorage.getItem(THEME_KEY) === 'casino' ? 'casino' : 'glam';
  } catch {
    return 'glam';
  }
}

function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}

/** The element the URL's #fragment names, if any. */
function fragmentTarget(): HTMLElement | null {
  try {
    return location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  } catch {
    return null; // A malformed %-escape.
  }
}

interface CardOptions {
  /** Give the card's section the wheel id, for deep links like `/#whale`. */
  anchor: boolean;
  /** Where the "Slices & odds" link points (`${details}#${wheel.id}`); none when empty. */
  details: string;
}

interface Toolbar {
  looks: Map<ThemeId, HTMLButtonElement>;
  sound: HTMLButtonElement;
}

/** One card: a wheel or a mini-game on its own canvas, played locally. */
class LiveGame {
  readonly section: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly director: GameDirector;
  private readonly result: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly odds: HTMLElement | null = null;
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

  constructor(
    private readonly page: Showcase,
    private readonly wheel: Wheel,
    options: CardOptions,
  ) {
    this.view = prizeWheelView(wheel, page.currency);
    this.copy = GAME_COPY[this.view.game];
    this.arcs = computeArcs(
      this.view.segments.map((s) => s.weight),
      this.view.sizing,
    );
    // Start with a slice centred under the pointer, like a wheel at rest.
    const first = this.arcs[0];
    this.rotation = first ? -(first.start + first.end) / 2 : 0;

    this.section = el('section', 'fw-live-wheel');
    if (options.anchor) this.section.id = wheel.id;
    this.section.dataset.game = this.view.game;
    const header = el('header', 'fw-live-head');
    header.append(el('h3', 'fw-live-name', wheel.name));
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
    if (this.view.money) {
      // Filled when the card first comes into view: the simulation is the costly part of a card.
      this.odds = el('p', 'fw-live-odds', ' ');
      this.section.append(this.odds);
    }
    if (options.details) {
      const more = el('p', 'fw-live-more');
      const link = el('a', 'fw-live-details', 'Slices & odds');
      link.href = `${options.details}#${wheel.id}`;
      link.setAttribute('aria-label', `${wheel.name}: slices and odds`);
      more.append(link);
      this.section.append(more);
    }

    const game = this.view.game;
    this.director = new GameDirector(canvas, getTheme(page.theme), page.sound, {
      framing: game === 'wheel' ? WHEEL_FRAMING : GAME_FRAMING,
      game,
    });
    this.director.onTick = (speed) => page.sound.tick(speed);
    new ResizeObserver(() => this.resize()).observe(this.stage);
  }

  /** One-line odds summary of a money wheel, from the same simulator as the dock. */
  fillOdds(): void {
    if (!this.odds || this.odds.textContent !== ' ') return;
    const { wheel, page } = this;
    const stats = simulateTurns(page.config, wheel.id, ODDS_GAMES);
    if (!stats) {
      this.odds.remove();
      return;
    }
    const money = (value: number) => formatMoney(value, page.currency);
    // "3-pull games", "1-gift game".
    const games = `${wheel.spinsPerTurn}-${GAME_PLAYS[wheel.game][0]} game${wheel.spinsPerTurn === 1 ? '' : 's'}`;
    const bust = stats.bustRate > 0 ? ` · bankrupt ${Math.round(stats.bustRate * 100)}%` : '';
    this.odds.textContent = `${games}: average ${money(stats.averagePayout)} · best ${money(stats.maxPayout)}${bust}`;
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
    this.page.wake();
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
    this.page.sound.whoosh();
    this.page.wake();
  }

  /** Advances and draws one frame; false once the card has nothing left to animate. */
  frame(now: number): boolean {
    // A landed play off screen has nothing left to advance.
    if (this.plan && (!this.landed || this.visible)) {
      const landed = this.director.update(now);
      if (landed && !this.landed) this.land(this.plan, now);
    }
    if (this.visible && this.shown) this.director.draw(now);
    return this.visible || !this.landed;
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
      this.page.sound.bust();
      return;
    }
    this.page.sound.win(segment.tier);
    this.director.celebrate(TIER_STYLES[segment.tier].celebration * 1400, now);
    const rect = this.stage.getBoundingClientRect();
    const center = this.director.center;
    this.page.burst(
      rect.left + center.x,
      rect.top + center.y - center.radius * 0.4,
      segment.tier,
      Math.max(0.45, rect.width / 1080),
    );
  }
}

/** Everything the mount points of one page share. */
class Showcase {
  readonly config: Config = ConfigSchema.parse(defaultConfig);
  readonly currency = this.config.settings.currency;
  readonly sound = new SoundBoard();
  theme: ThemeId = readTheme();
  private soundOn = false;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly roots: HTMLElement[] = [];
  private readonly cards: LiveGame[] = [];
  private readonly byElement = new Map<Element, LiveGame>();
  private readonly toolbars: Toolbar[] = [];
  private readonly wheels = new Map(this.config.wheels.map((wheel) => [wheel.id, wheel]));
  private fx: Celebration | null = null;
  private nextAutoPlay = 0;
  private running = false;

  constructor() {
    this.sound.configure(false, 0.5);
  }

  mount(roots: readonly HTMLElement[]): void {
    for (const root of roots) this.mountRoot(root);
    if (this.cards.length === 0) return;

    const fxCanvas = el('canvas', 'fw-live-fx');
    fxCanvas.setAttribute('aria-hidden', 'true');
    document.body.append(fxCanvas);
    const fx = new Celebration(fxCanvas);
    fx.setTheme(this.theme);
    const resizeFx = () => fx.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    window.addEventListener('resize', resizeFx);
    resizeFx();
    this.fx = fx;
    this.loadFonts();

    // Draw only cards on screen; each one plays by itself the first time it comes into view,
    // staggered so cards that appear together do not all land at once.
    const observer = new IntersectionObserver((entries) => this.onIntersect(entries), {
      threshold: [0, 0.6],
    });
    for (const card of this.cards) observer.observe(card.section);

    // The cards did not exist when the browser looked for the URL's #fragment (`/#whale`).
    const target = fragmentTarget();
    if (target && this.roots.some((root) => root.contains(target))) target.scrollIntoView();
  }

  /** Restarts the frame loop if it went to sleep. */
  wake(): void {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.frame);
  }

  burst(...args: Parameters<Celebration['burst']>): void {
    this.fx?.burst(...args);
    this.wake();
  }

  private readonly frame = (now: number): void => {
    let busy = false;
    for (const card of this.cards) if (card.frame(now)) busy = true;
    if (this.fx) {
      // One more frame once the last particle is gone, so the canvas gets cleared.
      if (this.fx.active) busy = true;
      this.fx.draw(now);
      if (this.fx.active) busy = true;
    }
    if (busy) requestAnimationFrame(this.frame);
    else this.running = false;
  };

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const card = this.byElement.get(entry.target);
      if (!card) continue;
      card.visible = entry.isIntersecting;
      if (!entry.isIntersecting) continue;
      setTimeout(() => card.fillOdds(), 0);
      if (!this.reducedMotion && !card.played && entry.intersectionRatio >= 0.6) {
        card.played = true;
        const at = Math.max(performance.now() + 400, this.nextAutoPlay);
        this.nextAutoPlay = at + AUTO_SPIN_GAP_MS;
        setTimeout(() => card.play(), at - performance.now());
      }
    }
    this.wake();
  }

  private mountRoot(root: HTMLElement): void {
    this.roots.push(root);
    root.dataset.theme = this.theme;
    const parts: HTMLElement[] = [];
    if (root.hasAttribute('data-toolbar')) parts.push(this.toolbar());
    const details = root.dataset.details ?? '';
    const list = root.dataset.wheels;

    if (list === undefined) {
      // The full showcase: every default wheel, grouped. Its cards carry the wheel ids as anchors,
      // unless the page already uses an id (a heading, or an earlier showcase).
      for (const { id, title } of GROUPS) {
        const wheels = this.config.wheels.filter((wheel) => groupOf(wheel) === id);
        if (wheels.length === 0) continue;
        const block = el('div', 'fw-live-block');
        block.dataset.group = id;
        block.append(
          el('h2', 'fw-live-group', title),
          this.grid(wheels, (wheel) => ({ anchor: !document.getElementById(wheel.id), details })),
        );
        parts.push(block);
      }
    } else {
      const wheels = list
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((id) => {
          const wheel = this.wheels.get(id);
          if (!wheel) console.warn(`FinWheel live: no default wheel "${id}"`);
          return wheel ? [wheel] : [];
        });
      if (wheels.length > 0) parts.push(this.grid(wheels, () => ({ anchor: false, details })));
    }
    root.replaceChildren(...parts);
  }

  private grid(wheels: readonly Wheel[], options: (wheel: Wheel) => CardOptions): HTMLElement {
    const grid = el('div', 'fw-live-grid');
    grid.dataset.count = String(wheels.length);
    for (const wheel of wheels) {
      const card = new LiveGame(this, wheel, options(wheel));
      this.cards.push(card);
      this.byElement.set(card.section, card);
      grid.append(card.section);
    }
    return grid;
  }

  private toolbar(): HTMLElement {
    const bar = el('div', 'fw-live-toolbar');
    const looks = el('div', 'fw-live-toggle');
    looks.setAttribute('role', 'group');
    looks.setAttribute('aria-label', 'Look');
    const buttons = new Map<ThemeId, HTMLButtonElement>();
    for (const id of ['glam', 'casino'] as const) {
      const button = el('button', 'fw-live-chip', id === 'glam' ? 'Glam' : 'Casino');
      button.type = 'button';
      button.addEventListener('click', () => this.setTheme(id));
      buttons.set(id, button);
      looks.append(button);
    }

    const sound = el('button', 'fw-live-chip');
    sound.type = 'button';
    sound.addEventListener('click', () => this.setSound(!this.soundOn));
    bar.append(looks, sound);
    this.toolbars.push({ looks: buttons, sound });
    this.syncToolbars();
    return bar;
  }

  private syncToolbars(): void {
    for (const bar of this.toolbars) {
      for (const [id, button] of bar.looks) button.setAttribute('aria-pressed', String(id === this.theme));
      bar.sound.setAttribute('aria-pressed', String(this.soundOn));
      bar.sound.textContent = this.soundOn ? 'Sound on' : 'Sound off';
    }
  }

  private setSound(on: boolean): void {
    this.soundOn = on;
    this.sound.configure(on, 0.5);
    this.syncToolbars();
  }

  private setTheme(id: ThemeId): void {
    if (id === this.theme) return;
    this.theme = id;
    for (const root of this.roots) root.dataset.theme = id;
    this.fx?.setTheme(id);
    for (const card of this.cards) card.setTheme(id);
    this.syncToolbars();
    this.loadFonts();
    saveTheme(id);
    this.wake();
  }

  /** Canvas text needs the look's fonts loaded; the cards redraw their text once they are. */
  private loadFonts(): void {
    const id = this.theme;
    void Promise.all(getTheme(id).fonts.map((font) => document.fonts.load(font))).then(() => {
      if (id !== this.theme) return;
      for (const card of this.cards) card.refresh();
      this.wake();
    });
  }
}

/** Fills every mount point of the page. */
export function mount(roots: readonly HTMLElement[]): void {
  new Showcase().mount(roots);
}
