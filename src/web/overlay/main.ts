import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/lilita-one/400.css';
import '../common/theme.css';
import './overlay.css';
import './overlay-glam.css';

import { formatMoney } from '../../shared/rules';
import { TIER_STYLES } from '../../shared/tiers';
import type { ThemeId } from '../../shared/schema';
import type { AppState, SpinResult, TurnSummary, TurnView, WheelView } from '../../shared/types';
import { connect } from '../common/socket';
import { SoundBoard } from './audio';
import { Celebration } from './fx';
import { GameDirector } from './games/director';
import { getTheme, parseTheme } from './themes';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
if (params.has('preview')) document.body.classList.add('preview');
/** `?backdrop` paints the theme's backdrop behind the wheel, for scenes without one. */
if (params.has('backdrop')) document.body.classList.add('backdrop');
const muted = params.get('mute') === '1';
/** `?theme=casino` forces a look on one browser source, whatever the dock says. */
const forcedTheme = parseTheme(params.get('theme'));

const stage = $<HTMLElement>('stage');
const sound = new SoundBoard();
/** The wheel or mini-game on screen (one canvas, one stage per game type). */
const games = new GameDirector($<HTMLCanvasElement>('wheel'), getTheme(forcedTheme ?? 'glam'), sound);
const fx = new Celebration($<HTMLCanvasElement>('fx'));
document.body.dataset.theme = games.themeId;
fx.setTheme(games.themeId);

const ui = {
  plaqueTitle: $('plaque-title'),
  plaqueSub: $('plaque-sub'),
  result: $('result'),
  resultEyebrow: $('result-eyebrow'),
  resultPlayer: $('result-player'),
  resultPrize: $('result-prize'),
  resultDesc: $('result-desc'),
  resultBank: $('result-bank'),
  resultNext: $('result-next'),
  total: $('total'),
  totalEyebrow: $('total-eyebrow'),
  totalPlayer: $('total-player'),
  totalAmount: $('total-amount'),
  totalLog: $('total-log'),
  totalFoot: $('total-foot'),
  bank: $('bank'),
  bankEyebrow: $('bank-eyebrow'),
  bankValue: $('bank-value'),
  raffle: $('raffle'),
  raffleKeyword: $('raffle-keyword'),
  raffleCount: $('raffle-count'),
  headline: $('headline-title'),
  headlineText: $('headline-text'),
  headlineStatus: $('headline-status'),
  stats: $('stats'),
  statSpins: $('stat-spins'),
  statTotal: $('stat-total'),
  statTotalBox: $('stat-total-box'),
  statNext: $('stat-next'),
  statNextBox: $('stat-next-box'),
};

let state: AppState | null = null;
/** The play being animated: which spin, and when it started on the local clock. */
let playing: { id: string; startedAt: number; durationMs: number } | null = null;
let landed = true;
let revealedResultId: string | null = null;
let pendingReveal: SpinResult | null = null;
let bankShown = 0;
let bankTarget = 0;
let nextShown = 1;
/** The stat row shows how the next game starts (no turn yet), not the bank. */
let statsPreview = false;
let shownSummaryId: string | null = null;
let totalCount: { target: number; start: number } | null = null;
const TOTAL_COUNT_MS = 1400;

games.onTick = (speed) => sound.tick(speed);

// ── Layout ────────────────────────────────────────────────────────────────

function layout() {
  const size = Math.min(window.innerWidth, window.innerHeight);
  const dpr = window.devicePixelRatio || 1;
  stage.style.setProperty('--u', `${size / 100}px`);
  games.resize(size, dpr);
  fx.resize(window.innerWidth, window.innerHeight, dpr);
  fitHeadline();
}
window.addEventListener('resize', layout);
layout();

/** Redraws canvas text once the theme's web fonts are ready. */
function loadFonts() {
  const theme = games.themeId;
  void Promise.all(getTheme(theme).fonts.map((font) => document.fonts.load(font))).then(() => {
    if (games.themeId === theme) games.refresh();
  });
}
loadFonts();
document.fonts.addEventListener('loadingdone', () => fitHeadline());

function applyTheme(id: ThemeId) {
  if (id === games.themeId) return;
  games.setTheme(getTheme(id));
  fx.setTheme(id);
  document.body.dataset.theme = id;
  loadFonts();
  fitHeadline();
}

// ── Centre photos ────────────────────────────────────────────────────────

let photoKey = '';
/** A photo still loading after this long is skipped, so one dead link never holds back the others. */
const PHOTO_TIMEOUT_MS = 10_000;

/** Loads the centre photos; ones that fail or take too long to load are skipped (with a console warning). */
function applyPhotos(urls: readonly string[], seconds: number) {
  const key = JSON.stringify([urls, seconds]);
  if (key === photoKey) return;
  photoKey = key;
  void Promise.all(
    urls.map(async (url) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), PHOTO_TIMEOUT_MS);
      });
      try {
        await Promise.race([img.decode(), timeout]);
        return img;
      } catch {
        img.src = ''; // Cancels a request that is still hanging.
        console.warn(`[finwheel] Could not load centre photo ${url}`);
        return null;
      } finally {
        clearTimeout(timer);
      }
    }),
  ).then((images) => {
    if (key !== photoKey) return;
    games.setPhotos(
      images.filter((img): img is HTMLImageElement => img !== null),
      seconds,
    );
  });
}

// ── State sync ───────────────────────────────────────────────────────────

function money(value: number): string {
  return state ? formatMoney(value, state.config.settings.currency) : String(value);
}

function wheelName(id: string | null): string {
  return state?.config.wheels.find((w) => w.id === id)?.name ?? '';
}

function applyState(next: AppState) {
  state = next;
  const { overlay } = next.config.settings;
  sound.configure(overlay.sound && !muted, overlay.volume);
  applyTheme(forcedTheme ?? overlay.theme);
  applyPhotos(overlay.hubPhotos, overlay.hubPhotoSeconds);
  const now = performance.now();

  if (next.spin && next.spin.id !== playing?.id) {
    const elapsed = Math.max(0, next.serverTime - next.spin.startedAt);
    playing = { id: next.spin.id, startedAt: now - elapsed, durationMs: next.spin.durationMs };
    games.play(next.spin, playing.startedAt, now);
    games.setHighlight(null);
    landed = games.update(now);
    hideResult();
    if (elapsed < 500) sound.whoosh();
  } else if (!next.spin) {
    playing = null;
    landed = true;
    pendingReveal = null;
    games.show(next.display, next.rotation, now);
    games.setHighlight(null);
    hideResult();
  }

  if (next.stage === 'result' && next.result && next.result.id !== revealedResultId) {
    revealedResultId = next.result.id;
    if (playing && !landed) pendingReveal = next.result;
    else reveal(next.result, now - (playing?.startedAt ?? now) > (playing?.durationMs ?? 0) + 3000);
  }

  if (next.stage === 'total' && next.summary && next.summary.id !== shownSummaryId) {
    shownSummaryId = next.summary.id;
    showTotal(next.summary);
  } else if (next.stage !== 'total') {
    ui.total.classList.remove('is-visible');
    totalCount = null;
  }

  updateChrome(next);
}

/** Final screen of a multi-spin game: the total counts up, with every spin listed. */
function showTotal(summary: TurnSummary) {
  hideResult();
  games.setHighlight(null);
  ui.total.dataset.bust = String(summary.bust);
  ui.totalEyebrow.textContent = summary.bust
    ? 'Bankrupt'
    : summary.total > 0
      ? 'Total winnings'
      : 'Game over';
  ui.totalPlayer.textContent = summary.player;
  ui.totalLog.replaceChildren(
    ...summary.log.map((entry, i) => {
      const li = document.createElement('li');
      li.className = entry.bust ? 'is-bust' : '';
      li.style.animationDelay = `${200 + i * 120}ms`;
      const chip = document.createElement('span');
      chip.textContent = entry.chip;
      li.append(chip);
      return li;
    }),
  );
  const spins = summary.log.length;
  ui.totalFoot.textContent = `${spins} spin${spins === 1 ? '' : 's'}`;
  totalCount = { target: summary.total, start: performance.now() };
  ui.total.classList.add('is-visible');

  if (summary.bust || summary.total <= 0) {
    if (summary.bust) sound.bust();
    return;
  }
  setTimeout(() => {
    sound.win('legendary');
    games.celebrate(3500);
    const rect = stage.getBoundingClientRect();
    const center = games.center;
    fx.burst(rect.left + center.x, rect.top + center.y - center.radius * 0.4, 'legendary', rect.width / 1080);
  }, TOTAL_COUNT_MS * 0.85);
}

function currentWheel(): WheelView | null {
  return state?.spin?.wheel ?? state?.display ?? null;
}

function updateChrome(s: AppState) {
  const wheel = currentWheel();
  const { overlay } = s.config.settings;
  const player = s.spin?.player;
  const name = wheel?.name ?? '';
  const status = player ? `Spinning for ${player}` : (wheel?.subtitle ?? '');
  ui.plaqueTitle.textContent = name;
  ui.plaqueSub.textContent = status;
  ui.headlineStatus.textContent = status;
  if (ui.headlineText.textContent !== name) {
    setSticker(ui.headlineText, name);
    ui.headline.dataset.text = name;
    fitHeadline();
  }

  // Bank badge and stat row for money turns; before one starts, the stat row shows its first spin.
  const turn = s.turn;
  const showBank = Boolean(turn?.money);
  // A sold-out wheel ("No prizes left") cannot start a game, so it previews none.
  const playable = s.display.money && s.display.segments.length > 0;
  const spinsAhead = !turn && s.stage === 'idle' && playable ? gameSpins(s, s.display.key) : 0;
  statsPreview = spinsAhead > 0;
  ui.bank.classList.toggle('is-visible', showBank);
  ui.stats.classList.toggle('is-visible', showBank || statsPreview);
  if (statsPreview) {
    setSticker(ui.statSpins, String(spinsAhead));
    setSticker(ui.statTotal, money(0));
    setSticker(ui.statNext, '×1');
    ui.statNextBox.classList.remove('is-armed');
    nextShown = 1;
  }
  if (turn && showBank) {
    ui.bankEyebrow.textContent = `Bank · Spin ${turn.spinNumber} of ${turn.spinsPlanned}`;
    // A late reveal updates the bank itself, so the total never spoils the result.
    if (!pendingReveal) {
      setBank(turn.total, s.stage !== 'spinning');
      setTurnStats(turn);
    }
  }

  const raffle = s.raffle;
  ui.raffle.classList.toggle('is-visible', raffle.open && overlay.showRaffleBadge);
  setSticker(ui.raffleKeyword, raffle.keyword);
  ui.raffleCount.textContent = `· ${raffle.entrants.length}`;

  const idle = s.stage === 'idle';
  const hasRaffleWheel = s.display.kind === 'raffle';
  stage.classList.toggle('is-off', !s.visible);
  stage.classList.toggle('is-hidden', overlay.autoHide && idle && !hasRaffleWheel);
}

/** Spins in a game of this wheel when no count is given. */
function gameSpins(s: AppState, wheelId: string): number {
  return s.config.wheels.find((w) => w.id === wheelId)?.spinsPerTurn ?? 1;
}

function setBank(value: number, animate = true) {
  if (value === bankTarget) return;
  bankTarget = value;
  if (!animate) bankShown = value;
  bump(ui.bank, animate);
  bump(ui.statTotalBox, animate);
}

/** Restarts the `is-bump` animation of an element (or just clears it). */
function bump(el: HTMLElement, animate = true) {
  el.classList.remove('is-bump');
  if (!animate) return;
  void el.offsetWidth;
  el.classList.add('is-bump');
}

/** Text drawn with an outline: the outline layer repeats the text from `data-text`. */
function setSticker(el: HTMLElement, text: string) {
  if (el.textContent === text && el.dataset.text === text) return;
  el.textContent = text;
  el.dataset.text = text;
}

/** Spins left and the "×N next spin" boost of the stat row; the boost pops when it is armed. */
function setTurnStats(turn: TurnView) {
  const next = turn.nextMultiplier;
  setSticker(ui.statSpins, String(Math.max(0, turn.spinsPlanned - turn.spinNumber)));
  setSticker(ui.statNext, `×${next}`);
  ui.statNextBox.classList.toggle('is-armed', next > 1);
  if (next !== nextShown) bump(ui.statNextBox, next > 1);
  nextShown = next;
}

/** Shrinks the headline so long wheel names stay on one line. */
function fitHeadline() {
  const el = ui.headline;
  el.style.removeProperty('--fit');
  const max = stage.clientWidth * 0.9;
  const width = el.offsetWidth;
  if (width > max) el.style.setProperty('--fit', (max / width).toFixed(3));
}

function reveal(result: SpinResult, quiet = false) {
  const spin = state?.spin;
  const index = spin ? spin.segmentIndex : -1;
  const bust = Boolean(result.money?.bust);
  games.setHighlight(index >= 0 ? index : null, result.tier, bust);

  const isRaffle = result.kind === 'raffle';
  const boost = armedBoost(result);
  // A "×N next" slice on the last spin of a game: its boost has no spin left to multiply.
  const unusedBoost = result.payout !== null && !bust && spin?.wheel.segments[index]?.effect === 'next';
  ui.result.dataset.tier = result.tier;
  ui.result.dataset.bust = String(bust);
  ui.result.dataset.boost = String(boost > 1);
  ui.resultEyebrow.textContent = bust
    ? 'Bankrupt'
    : isRaffle
      ? 'Raffle winner'
      : result.payout !== null
        ? 'Cash out'
        : boost > 1
          ? 'Boost!'
          : result.player
            ? 'Winner'
            : 'The wheel has spoken';
  ui.resultPlayer.textContent = !isRaffle && result.player ? result.player : '';
  setSticker(ui.resultPrize, result.label);
  const emptyMultiplier = result.money && !bust && result.money.multiplier > 1 && result.money.before === 0;
  ui.resultDesc.textContent = isRaffle
    ? 'Congratulations!'
    : boost > 1
      ? result.description || `Your next spin pays ×${boost}`
      : unusedBoost
        ? 'No spins left for the boost'
        : emptyMultiplier
          ? 'Nothing in the bank to multiply yet'
          : bust && result.money?.before === 0
            ? 'Lucky break — nothing in the bank to lose'
            : result.description;

  ui.resultBank.innerHTML = '';
  if (result.money && !(bust && result.money.before === 0)) {
    const { before, after, multiplier } = result.money;
    const label = bust ? 'Lost' : result.payout !== null ? 'Final total' : 'Total';
    const amount = bust ? before : after;
    const boosted = result.money.boost > 1 ? ` · ×${result.money.boost} boost` : '';
    const delta =
      bust || before === after
        ? ''
        : multiplier !== 1
          ? `×${multiplier}`
          : `+${money(after - before)}${boosted}`;
    ui.resultBank.innerHTML = `<span>${label}</span><strong>${money(amount)}</strong>${delta ? `<em>${delta}</em>` : ''}`;
  }

  const next: string[] = [];
  if (result.extraSpins > 0) next.push(`+${result.extraSpins} free spin${result.extraSpins > 1 ? 's' : ''}`);
  if (result.followUpWheelId && result.followUpWheelId !== result.wheelKey) {
    next.push(`Next: ${wheelName(result.followUpWheelId)}`);
  } else if (result.followUpWheelId && result.extraSpins === 0) {
    next.push('Next spin coming up');
  }
  ui.resultNext.textContent = next.join(' · ');

  ui.result.classList.add('is-visible');
  if (result.money) {
    setBank(result.money.after);
    ui.bank.classList.toggle('is-bust', bust);
    ui.statTotalBox.classList.toggle('is-bust', bust);
    if (state?.turn?.money) setTurnStats(state.turn);
  }
  if (quiet) return;

  if (bust) {
    sound.bust();
    return;
  }
  sound.win(result.tier);
  games.celebrate(TIER_STYLES[result.tier].celebration * 1400);
  const rect = stage.getBoundingClientRect();
  const center = games.center;
  const scale = rect.width / 1080;
  fx.burst(rect.left + center.x, rect.top + center.y - center.radius * 0.55, result.tier, scale);
}

/**
 * Boost this result armed for the next spin (1 = none). Only "×N next" slices leave one armed (any
 * other result uses it up), and none is left when the game ends.
 */
function armedBoost(result: SpinResult): number {
  const m = result.money;
  return m && !m.bust && result.payout === null ? m.nextMultiplier : 1;
}

function hideResult() {
  ui.result.classList.remove('is-visible');
  ui.bank.classList.remove('is-bust');
  ui.statTotalBox.classList.remove('is-bust');
}

// ── Frame loop ───────────────────────────────────────────────────────────

function frame(now: number) {
  if (playing) {
    landed = games.update(now);
    if (pendingReveal && landed) {
      const result = pendingReveal;
      pendingReveal = null;
      reveal(result);
    }
  }
  if (bankShown !== bankTarget) {
    const step = Math.max(0.01, Math.abs(bankTarget - bankShown) * 0.12);
    bankShown =
      bankShown < bankTarget
        ? Math.min(bankTarget, bankShown + step)
        : Math.max(bankTarget, bankShown - step);
    if (Math.abs(bankTarget - bankShown) < 0.01) bankShown = bankTarget;
  }
  const bank = money(Number.isInteger(bankTarget) ? Math.round(bankShown) : bankShown);
  ui.bankValue.textContent = bank;
  if (!statsPreview) setSticker(ui.statTotal, bank);
  if (totalCount) {
    const t = Math.min(1, (now - totalCount.start) / TOTAL_COUNT_MS);
    const eased = 1 - (1 - t) ** 3;
    const value = totalCount.target * eased;
    const shown =
      t >= 1
        ? totalCount.target
        : Number.isInteger(totalCount.target)
          ? Math.round(value)
          : Math.round(value * 100) / 100;
    setSticker(ui.totalAmount, money(shown));
  }

  if (!stage.classList.contains('is-off')) games.draw(now);
  fx.draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

connect({
  onState: applyState,
  onStatus: (connected) => {
    if (!connected) console.warn('[finwheel] Disconnected from server, retrying…');
  },
});
