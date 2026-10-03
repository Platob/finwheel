import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '../common/theme.css';
import './overlay.css';

import { formatMoney } from '../../shared/rules';
import { TIER_STYLES } from '../../shared/tiers';
import type { AppState, SpinResult, TurnSummary, WheelView } from '../../shared/types';
import { connect } from '../common/socket';
import { SoundBoard } from './audio';
import { Celebration } from './fx';
import { SpinMotion } from './spin-motion';
import { DISPLAY_FONT, UI_FONT } from './wheel-face';
import { WheelScene } from './wheel-scene';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
if (params.has('preview')) document.body.classList.add('preview');
const muted = params.get('mute') === '1';

const stage = $<HTMLElement>('stage');
const scene = new WheelScene($<HTMLCanvasElement>('wheel'));
const fx = new Celebration($<HTMLCanvasElement>('fx'));
const sound = new SoundBoard();

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
};

let state: AppState | null = null;
let motion: SpinMotion | null = null;
let revealedResultId: string | null = null;
let pendingReveal: SpinResult | null = null;
let bankShown = 0;
let bankTarget = 0;
let shownSummaryId: string | null = null;
let totalCount: { target: number; start: number } | null = null;
const TOTAL_COUNT_MS = 1400;

scene.onTick = (speed) => sound.tick(speed);

// ── Layout ────────────────────────────────────────────────────────────────

function layout() {
  const size = Math.min(window.innerWidth, window.innerHeight);
  const dpr = window.devicePixelRatio || 1;
  stage.style.setProperty('--u', `${size / 100}px`);
  scene.resize(size, dpr);
  fx.resize(window.innerWidth, window.innerHeight, dpr);
}
window.addEventListener('resize', layout);
layout();
void Promise.all([
  document.fonts.load(`700 40px ${DISPLAY_FONT}`),
  document.fonts.load(`900 40px ${DISPLAY_FONT}`),
  document.fonts.load(`700 20px ${UI_FONT}`),
]).then(() => scene.refresh());

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
  const now = performance.now();

  if (next.spin && next.spin.id !== motion?.spin.id) {
    const elapsed = Math.max(0, next.serverTime - next.spin.startedAt);
    motion = new SpinMotion(next.spin, now - elapsed);
    scene.setWheel(next.spin.wheel, now);
    scene.setRotation(next.spin.fromRotation, now);
    scene.setHighlight(null);
    hideResult();
    if (elapsed < 500) sound.whoosh();
  } else if (!next.spin) {
    motion = null;
    pendingReveal = null;
    scene.setWheel(next.display, now);
    scene.setRotation(next.rotation, now);
    scene.setHighlight(null);
    hideResult();
  }

  if (next.stage === 'result' && next.result && next.result.id !== revealedResultId) {
    revealedResultId = next.result.id;
    if (motion && !motion.done(now)) pendingReveal = next.result;
    else reveal(next.result, now - (motion?.startedAt ?? now) > (motion?.spin.durationMs ?? 0) + 3000);
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
  scene.setHighlight(null);
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
    scene.celebrate(3500);
    const rect = stage.getBoundingClientRect();
    const center = scene.center;
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
  ui.plaqueTitle.textContent = wheel?.name ?? '';
  ui.plaqueSub.textContent = player ? `Spinning for ${player}` : (wheel?.subtitle ?? '');

  // Bank badge for money turns
  const turn = s.turn;
  const showBank = Boolean(turn?.money);
  ui.bank.classList.toggle('is-visible', showBank);
  if (turn && showBank) {
    ui.bankEyebrow.textContent = `Bank · Spin ${turn.spinNumber} of ${turn.spinsPlanned}`;
    // A late reveal updates the bank itself, so the total never spoils the result.
    if (!pendingReveal) setBank(turn.total, s.stage !== 'spinning');
  }

  const raffle = s.raffle;
  ui.raffle.classList.toggle('is-visible', raffle.open && overlay.showRaffleBadge);
  ui.raffleKeyword.textContent = raffle.keyword;
  ui.raffleCount.textContent = `· ${raffle.entrants.length}`;

  const idle = s.stage === 'idle';
  const hasRaffleWheel = s.display.kind === 'raffle';
  stage.classList.toggle('is-off', !s.visible);
  stage.classList.toggle('is-hidden', overlay.autoHide && idle && !hasRaffleWheel);
}

function setBank(value: number, animate = true) {
  if (value === bankTarget) return;
  bankTarget = value;
  if (!animate) bankShown = value;
  ui.bank.classList.remove('is-bump');
  if (animate) {
    void ui.bank.offsetWidth;
    ui.bank.classList.add('is-bump');
  }
}

function reveal(result: SpinResult, quiet = false) {
  const spin = state?.spin;
  const index = spin ? spin.segmentIndex : -1;
  const bust = Boolean(result.money?.bust);
  scene.setHighlight(index >= 0 ? index : null, result.tier, bust);

  const isRaffle = result.kind === 'raffle';
  ui.result.dataset.tier = result.tier;
  ui.result.dataset.bust = String(bust);
  ui.resultEyebrow.textContent = bust
    ? 'Bankrupt'
    : isRaffle
      ? 'Raffle winner'
      : result.payout !== null
        ? 'Cash out'
        : result.player
          ? 'Winner'
          : 'The wheel has spoken';
  ui.resultPlayer.textContent = !isRaffle && result.player ? result.player : '';
  ui.resultPrize.textContent = result.label;
  const emptyMultiplier = result.money && !bust && result.money.multiplier > 1 && result.money.before === 0;
  ui.resultDesc.textContent = isRaffle
    ? 'Congratulations!'
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
    const delta =
      bust || before === after ? '' : multiplier !== 1 ? `×${multiplier}` : `+${money(after - before)}`;
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
  }
  if (quiet) return;

  if (bust) {
    sound.bust();
    return;
  }
  sound.win(result.tier);
  scene.celebrate(TIER_STYLES[result.tier].celebration * 1400);
  const rect = stage.getBoundingClientRect();
  const center = scene.center;
  const scale = rect.width / 1080;
  fx.burst(rect.left + center.x, rect.top + center.y - center.radius * 0.55, result.tier, scale);
}

function hideResult() {
  ui.result.classList.remove('is-visible');
  ui.bank.classList.remove('is-bust');
}

// ── Frame loop ───────────────────────────────────────────────────────────

function frame(now: number) {
  if (motion) {
    scene.setRotation(motion.rotationAt(now), now, !motion.done(now));
    if (pendingReveal && motion.done(now)) {
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
  ui.bankValue.textContent = money(Number.isInteger(bankTarget) ? Math.round(bankShown) : bankShown);
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
    ui.totalAmount.textContent = money(shown);
  }

  if (!stage.classList.contains('is-off')) scene.draw(now);
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
