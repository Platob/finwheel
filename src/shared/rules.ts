/**
 * Game rules shared by the server (authoritative) and the dock (odds simulator).
 *
 * A *turn* is everything one player gets from a single request: `spinsPerTurn` spins of the
 * starting wheel, plus any extra spins and chained wheels won along the way. Cash and
 * multipliers accumulate into the turn's running total; bankrupt wipes it and ends the turn.
 * A "×N next" slice arms a boost that multiplies the cash of the player's next spin.
 */
import type { Config, Prize, Settings, Wheel } from './schema.js';
import type { SlotEffect, TurnLogEntry } from './types.js';

export interface Turn {
  player: string;
  total: number;
  /** Spins already played in this turn. */
  spins: number;
  /** Wheel ids still to spin in this turn, in order. */
  pending: string[];
  /** Whether any wheel in this turn has money mechanics (shows the bank on the overlay). */
  money: boolean;
  /** Multiplier armed for the cash of the next spin by "×N next" slices (1 = none). */
  boost: number;
  /** Every spin played so far, for the final total screen. */
  log: TurnLogEntry[];
}

export interface PrizeOutcome {
  turn: Turn;
  before: number;
  after: number;
  /** Boost used up by this spin, multiplying its cash if it had any (1 = none). */
  boost: number;
  /** True when the turn has no spins left (or hit bankrupt / the safety cap). */
  ended: boolean;
}

type Effects = Pick<Prize, 'cash' | 'multiplier' | 'nextMultiplier' | 'extraSpins' | 'bust' | 'chainWheelId'>;

export function hasMoneyEffect(
  prize: Pick<Prize, 'cash' | 'multiplier' | 'nextMultiplier' | 'bust'>,
): boolean {
  return prize.cash > 0 || prize.multiplier !== 1 || prize.nextMultiplier !== 1 || prize.bust;
}

export function isMoneyWheel(wheel: Wheel): boolean {
  return wheel.prizes.some(hasMoneyEffect);
}

export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

/** Keeps stacked boosts readable ("×2.25", not "×2.2500000000000004"). */
const roundBoost = (value: number): number => Math.round(value * 1e4) / 1e4;

/** Starts a game of `spins` spins (the wheel's default when omitted). */
export function startTurn(wheel: Wheel, player: string, spins = wheel.spinsPerTurn): Turn {
  return {
    player,
    total: 0,
    spins: 0,
    pending: Array.from({ length: Math.max(1, spins) - 1 }, () => wheel.id),
    money: isMoneyWheel(wheel),
    boost: 1,
    log: [],
  };
}

/**
 * Applies a won prize to the turn. A chained wheel plays its full `spinsPerTurn` first, then the
 * extra spins of the current wheel, then whatever was already pending.
 *
 * The total becomes `(before + cash × boost) × multiplier`. A "×N next" slice multiplies the armed
 * boost by N and keeps it for the next spin (its own cash is paid as printed); any other result
 * uses the boost up, even without cash. Bankrupt clears the total and the boost, and a boost still
 * armed when the turn ends is lost.
 */
export function applyPrize(
  turn: Turn,
  prize: Effects,
  wheelId: string,
  maxSpins: number,
  spinsPerTurn: (wheelId: string) => number,
): PrizeOutcome {
  const before = turn.total;
  const spins = turn.spins + 1;
  let after: number;
  let pending: string[];
  let boost = 1;
  let armed = 1;

  if (prize.bust) {
    after = 0;
    pending = [];
  } else {
    if (prize.nextMultiplier > 1) armed = roundBoost(turn.boost * prize.nextMultiplier);
    else boost = turn.boost;
    after = roundMoney((before + prize.cash * boost) * prize.multiplier);
    pending = [
      ...(prize.chainWheelId
        ? Array.from({ length: spinsPerTurn(prize.chainWheelId) }, () => prize.chainWheelId!)
        : []),
      ...Array.from({ length: prize.extraSpins }, () => wheelId),
      ...turn.pending,
    ];
  }
  if (spins >= maxSpins) pending = [];
  const ended = pending.length === 0;

  const next: Turn = { ...turn, total: after, spins, pending, boost: ended ? 1 : armed, log: turn.log };
  return { turn: next, before, after, boost, ended };
}

export function formatMoney(value: number, currency: Settings['currency']): string {
  const amount = Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency.position === 'before' ? `${currency.symbol}${amount}` : `${amount} ${currency.symbol}`;
}

export interface SlotText {
  /** Large value printed on the slice: "$10", "×2", "+1". */
  amount: string;
  /** Small caption next to it: "bonus spin", "total", "next", "jackpot". */
  caption: string;
}

/** What a money slice shows on the wheel, derived from its effects so it always matches the payout. */
export function slotText(
  prize: Pick<Prize, 'label' | 'cash' | 'multiplier' | 'nextMultiplier' | 'extraSpins' | 'bust'>,
  currency: Settings['currency'],
): SlotText | null {
  if (prize.bust) return null;
  const spins = prize.extraSpins;
  const spinCaption = spins > 0 ? (spins > 1 ? `${spins} bonus spins` : 'bonus spin') : '';
  const next = prize.nextMultiplier > 1 ? `×${prize.nextMultiplier}` : '';
  if (prize.cash > 0) {
    const amount = formatMoney(prize.cash, currency);
    let caption =
      spinCaption ||
      (prize.multiplier > 1 ? `×${prize.multiplier} total` : '') ||
      (next ? `${next} next` : '');
    if (!caption) {
      // Keep any extra words of the label ("$500 Jackpot" → "Jackpot").
      const rest = prize.label.replace(amount, '').replace(/^[\s+·:-]+|[\s+·:-]+$/g, '');
      caption = rest !== prize.label.trim() ? rest : '';
    }
    return { amount, caption };
  }
  if (prize.multiplier > 1) return { amount: `×${prize.multiplier}`, caption: spinCaption || 'total' };
  if (next) return { amount: next, caption: 'next' };
  if (spins > 0) return { amount: `+${spins}`, caption: spins > 1 ? 'free spins' : 'free spin' };
  return null;
}

/** Main effect of a slice, used to style it; none for bankrupt and plain prize slices. */
export function slotEffect(
  prize: Pick<Prize, 'cash' | 'multiplier' | 'nextMultiplier' | 'extraSpins' | 'bust'>,
): SlotEffect | undefined {
  if (prize.bust) return undefined;
  if (prize.cash > 0) return 'cash';
  if (prize.multiplier !== 1) return 'total';
  if (prize.nextMultiplier > 1) return 'next';
  if (prize.extraSpins > 0) return 'spins';
  return undefined;
}

/**
 * Short text for one spin on the total screen: the slice amount ("$5", "×2", "×2 next") or its
 * label. Boosted cash shows what it paid ("$14" for a $7 slice at ×2).
 */
export function logChip(
  prize: Pick<Prize, 'label' | 'cash' | 'multiplier' | 'nextMultiplier' | 'extraSpins' | 'bust'>,
  currency: Settings['currency'],
  boost = 1,
): string {
  if (prize.bust) return prize.label;
  if (prize.cash > 0 && boost !== 1) return formatMoney(roundMoney(prize.cash * boost), currency);
  const text = slotText(prize, currency);
  if (!text) return prize.label;
  return text.caption === 'next' ? `${text.amount} next` : text.amount;
}

// ── Simulation ─────────────────────────────────────────────────────────────

export interface TurnStats {
  turns: number;
  averagePayout: number;
  medianPayout: number;
  maxPayout: number;
  /** Share of turns that ended on a bankrupt slice. */
  bustRate: number;
  /** Share of turns that paid nothing. */
  zeroRate: number;
  averageSpins: number;
}

/** Picks an index with probability proportional to its weight. */
export function pickWeighted(weights: readonly number[], random: () => number): number {
  let total = 0;
  for (const w of weights) if (w > 0 && Number.isFinite(w)) total += w;
  if (total <= 0) throw new RangeError('At least one weight must be positive');
  let roll = random() * total;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!;
    if (!(w > 0) || !Number.isFinite(w)) continue;
    last = i;
    if (roll < w) return i;
    roll -= w;
  }
  return last;
}

export const availablePrizes = (wheel: Wheel): Prize[] =>
  wheel.prizes.filter((p) => p.stock === null || p.stock > 0);

/** Monte-Carlo estimate of what one game on `wheelId` pays out. Stock is not consumed. */
export function simulateTurns(
  config: Pick<Config, 'wheels' | 'settings'>,
  wheelId: string,
  turns = 20000,
  random: () => number = Math.random,
  /** Spins per game; the wheel's default when omitted. */
  spins?: number,
): TurnStats | null {
  const wheels = new Map(config.wheels.map((w) => [w.id, w]));
  const start = wheels.get(wheelId);
  if (!start || availablePrizes(start).length === 0) return null;
  const maxSpins = config.settings.spin.maxSpinsPerTurn;
  const spinsOf = (id: string) => wheels.get(id)?.spinsPerTurn ?? 1;

  const payouts: number[] = [];
  let busts = 0;
  let spinsTotal = 0;
  for (let i = 0; i < turns; i++) {
    let turn = startTurn(start, '', spins);
    let current: Wheel | undefined = start;
    let bust = false;
    while (current) {
      const prizes = availablePrizes(current);
      if (prizes.length === 0) break;
      const prize =
        prizes[
          pickWeighted(
            prizes.map((p) => p.weight),
            random,
          )
        ]!;
      const outcome = applyPrize(turn, prize, current.id, maxSpins, spinsOf);
      turn = outcome.turn;
      bust = prize.bust;
      if (outcome.ended) break;
      current = wheels.get(turn.pending.shift()!);
    }
    payouts.push(turn.total);
    spinsTotal += turn.spins;
    if (bust) busts++;
  }
  payouts.sort((a, b) => a - b);
  return {
    turns,
    averagePayout: roundMoney(payouts.reduce((a, b) => a + b, 0) / turns),
    medianPayout: payouts[Math.floor(turns / 2)]!,
    maxPayout: payouts[turns - 1]!,
    bustRate: busts / turns,
    zeroRate: payouts.filter((p) => p === 0).length / turns,
    averageSpins: spinsTotal / turns,
  };
}
