import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyPrize,
  formatMoney,
  hasMoneyEffect,
  logChip,
  pickWeighted,
  roundMoney,
  simulateTurns,
  slotEffect,
  slotText,
  startTurn,
  type Turn,
} from './rules.js';
import { ConfigSchema, PrizeSchema, WheelSchema } from './schema.js';

const prize = (input: Record<string, unknown>) =>
  PrizeSchema.parse({ id: 'p', label: 'P', weight: 1, ...input });
const usd = { symbol: '$', position: 'before' } as const;
const turn = (patch: Partial<Turn> = {}): Turn => ({
  player: 'ana',
  total: 0,
  spins: 0,
  pending: [],
  money: true,
  boost: 1,
  log: [],
  ...patch,
});
const one = () => 1;

/** Plays `prizes` in order as one turn on wheel "w", like the engine does. */
function play(start: Turn, prizes: ReturnType<typeof prize>[], maxSpins = 30) {
  let current = start;
  const outcomes = [];
  for (const p of prizes) {
    const outcome = applyPrize(current, p, 'w', maxSpins, one);
    outcomes.push(outcome);
    current = { ...outcome.turn, pending: outcome.turn.pending.slice(1) };
    if (outcome.ended) break;
  }
  return { turn: current, outcomes };
}

describe('applyPrize', () => {
  it('adds cash then applies the multiplier', () => {
    const out = applyPrize(turn({ total: 10 }), prize({ cash: 5, multiplier: 2 }), 'w', 12, one);
    expect(out.after).toBe(30);
    expect(out.before).toBe(10);
    expect(out.ended).toBe(true);
  });

  it('bankrupt wipes the total and cancels remaining spins', () => {
    const out = applyPrize(
      turn({ total: 40, pending: ['w', 'w'] }),
      prize({ bust: true, extraSpins: 2 }),
      'w',
      12,
      one,
    );
    expect(out.after).toBe(0);
    expect(out.turn.pending).toEqual([]);
    expect(out.ended).toBe(true);
  });

  it('queues the chained wheel (all its spins) before extra spins and earlier pending spins', () => {
    const out = applyPrize(
      turn({ pending: ['a'] }),
      prize({ chainWheelId: 'vault', extraSpins: 1 }),
      'here',
      12,
      (id) => (id === 'vault' ? 2 : 1),
    );
    expect(out.turn.pending).toEqual(['vault', 'vault', 'here', 'a']);
    expect(out.ended).toBe(false);
  });

  it('stops at the max spins per turn', () => {
    const out = applyPrize(turn({ spins: 4 }), prize({ extraSpins: 3 }), 'w', 5, one);
    expect(out.ended).toBe(true);
  });

  it('rounds money to cents', () => {
    expect(applyPrize(turn({ total: 7 }), prize({ multiplier: 0.5 }), 'w', 12, one).after).toBe(3.5);
  });
});

describe('×N next', () => {
  const next2 = prize({ label: '×2 Next', nextMultiplier: 2 });
  const next3 = prize({ label: '×3 Next', nextMultiplier: 3 });
  const cash = (amount: number) => prize({ label: `$${amount}`, cash: amount });

  it('arms a boost that multiplies the cash of the next spin, then uses it up', () => {
    const { turn: end, outcomes } = play(turn({ total: 5, pending: ['w', 'w', 'w'] }), [
      next2,
      cash(7),
      cash(3),
    ]);
    const [armed, boosted, plain] = outcomes;
    expect(armed).toMatchObject({ before: 5, after: 5, boost: 1, ended: false });
    expect(armed!.turn.boost).toBe(2);
    expect(boosted).toMatchObject({ before: 5, after: 19, boost: 2 });
    expect(boosted!.turn.boost).toBe(1);
    expect(plain).toMatchObject({ before: 19, after: 22, boost: 1 });
    expect(end.total).toBe(22);
  });

  it('stacks with another ×N next slice and stays armed', () => {
    const { outcomes } = play(turn({ pending: ['w', 'w', 'w'] }), [next2, next3, cash(5)]);
    expect(outcomes.map((o) => o.turn.boost)).toEqual([2, 6, 1]);
    expect(outcomes.map((o) => o.boost)).toEqual([1, 1, 6]);
    expect(outcomes[2]!.after).toBe(30);
  });

  it('is wasted by a spin without cash', () => {
    const free = prize({ label: 'Free Spin', extraSpins: 1 });
    const { outcomes } = play(turn({ total: 4, pending: ['w', 'w'] }), [next2, free, cash(5)]);
    expect(outcomes[1]).toMatchObject({ after: 4, boost: 2 });
    expect(outcomes[1]!.turn.boost).toBe(1);
    expect(outcomes[2]).toMatchObject({ after: 9, boost: 1 });
  });

  it('boosts the cash before a ×total multiplier applies', () => {
    const cashTimesTwo = prize({ label: '$5 ×2', cash: 5, multiplier: 2 });
    const totalTimesTwo = prize({ label: '×2 Total', multiplier: 2 });
    const { outcomes } = play(turn({ total: 10, pending: ['w', 'w'] }), [next2, cashTimesTwo]);
    expect(outcomes[1]).toMatchObject({ before: 10, after: 40, boost: 2 }); // (10 + 5 × 2) × 2
    // A ×total slice has no cash: it doubles the total and wastes the boost.
    const wasted = play(turn({ total: 10, pending: ['w', 'w'] }), [next2, totalTimesTwo, cash(1)]);
    expect(wasted.outcomes.map((o) => o.after)).toEqual([10, 20, 21]);
  });

  it('pays the cash of a cash + next slice as printed and multiplies the armed boost', () => {
    const cashNext = prize({ label: '$5', cash: 5, nextMultiplier: 2 });
    const { outcomes } = play(turn({ pending: ['w', 'w', 'w'] }), [next2, cashNext, cash(1)]);
    expect(outcomes[1]).toMatchObject({ after: 5, boost: 1 });
    expect(outcomes[1]!.turn.boost).toBe(4);
    expect(outcomes[2]).toMatchObject({ after: 9, boost: 4 });
  });

  it('boosts bonus-spin cash and keeps the free spins', () => {
    const cashSpin = prize({ label: '$2 + Spin', cash: 2, extraSpins: 1 });
    const out = applyPrize(turn({ boost: 3 }), cashSpin, 'w', 12, one);
    expect(out).toMatchObject({ after: 6, boost: 3, ended: false });
    expect(out.turn).toMatchObject({ boost: 1, pending: ['w'] });
  });

  it('carries over into a chained wheel', () => {
    const chainNext = prize({ label: 'Vault ×2', chainWheelId: 'vault', nextMultiplier: 2 });
    const out = applyPrize(turn(), chainNext, 'grand', 12, () => 2);
    expect(out.turn).toMatchObject({ boost: 2, pending: ['vault', 'vault'] });
  });

  it('is cleared by bankrupt', () => {
    const out = applyPrize(
      turn({ total: 30, boost: 4, pending: ['w'] }),
      prize({ bust: true }),
      'w',
      12,
      one,
    );
    expect(out).toMatchObject({ after: 0, boost: 1, ended: true });
    expect(out.turn.boost).toBe(1);
  });

  it('is lost when the turn ends with it armed', () => {
    const last = applyPrize(turn({ total: 8 }), next2, 'w', 12, one);
    expect(last).toMatchObject({ after: 8, ended: true });
    expect(last.turn.boost).toBe(1);
    // The safety cap ends the turn too.
    const capped = applyPrize(turn({ spins: 4, pending: ['w'] }), next2, 'w', 5, one);
    expect(capped.ended).toBe(true);
    expect(capped.turn.boost).toBe(1);
  });

  it('starts every turn without a boost', () => {
    const wheel = WheelSchema.parse({ id: 'w', name: 'W', prizes: [next2] });
    expect(startTurn(wheel, 'bo')).toMatchObject({ boost: 1, money: true });
  });

  it('keeps fractional stacks tidy and rounds boosted cash to cents', () => {
    const next = prize({ label: '×1.1', nextMultiplier: 1.1 });
    const { outcomes } = play(turn({ pending: ['w', 'w', 'w'] }), [next, next, cash(3)]);
    expect(outcomes[1]!.turn.boost).toBe(1.21);
    expect(outcomes[2]!.after).toBe(3.63);
  });

  it('adds boosted cash exactly as its log chip shows it', () => {
    const cases: [total: number, boost: number, cash: number][] = [
      [0.5, 1.5, 0.29],
      [3.33, 1.1, 4.85],
      [12.94, 3.375, 1],
    ];
    for (const [total, boost, amount] of cases) {
      const slice = cash(amount);
      const out = applyPrize(turn({ total, boost }), slice, 'w', 12, one);
      expect(formatMoney(roundMoney(out.after - out.before), usd)).toBe(logChip(slice, usd, boost));
    }
    expect(applyPrize(turn({ total: 0.5, boost: 1.5 }), cash(0.29), 'w', 12, one).after).toBe(0.93);
  });
});

describe('hasMoneyEffect', () => {
  it('counts cash, multipliers, ×N next and bankrupt', () => {
    expect(hasMoneyEffect(prize({ nextMultiplier: 2 }))).toBe(true);
    expect(hasMoneyEffect(prize({ cash: 1 }))).toBe(true);
    expect(hasMoneyEffect(prize({ multiplier: 0.5 }))).toBe(true);
    expect(hasMoneyEffect(prize({ bust: true }))).toBe(true);
    expect(hasMoneyEffect(prize({ extraSpins: 1 }))).toBe(false);
    expect(hasMoneyEffect(prize({}))).toBe(false);
  });
});

describe('startTurn', () => {
  it('plans spinsPerTurn spins and flags money wheels', () => {
    const wheel = WheelSchema.parse({ id: 'w', name: 'W', spinsPerTurn: 3, prizes: [prize({ cash: 2 })] });
    expect(startTurn(wheel, 'bo')).toMatchObject({ player: 'bo', pending: ['w', 'w'], money: true });
  });
});

describe('slotText', () => {
  it('prints amounts and captions from the effects', () => {
    expect(slotText(prize({ label: '$7', cash: 7 }), usd)).toEqual({ amount: '$7', caption: '' });
    expect(slotText(prize({ label: '$2 + Spin', cash: 2, extraSpins: 1 }), usd)).toEqual({
      amount: '$2',
      caption: 'bonus spin',
    });
    expect(slotText(prize({ label: '$500 Jackpot', cash: 500 }), usd)).toEqual({
      amount: '$500',
      caption: 'Jackpot',
    });
    expect(slotText(prize({ label: 'x2', multiplier: 2 }), usd)).toEqual({ amount: '×2', caption: 'total' });
    expect(slotText(prize({ label: 'Free', extraSpins: 1 }), usd)).toEqual({
      amount: '+1',
      caption: 'free spin',
    });
    expect(slotText(prize({ label: 'Bankrupt', bust: true }), usd)).toBeNull();
    expect(slotText(prize({ label: 'Shoutout' }), usd)).toBeNull();
  });

  it('prints ×N next slices', () => {
    expect(slotText(prize({ label: '×2 Next', nextMultiplier: 2 }), usd)).toEqual({
      amount: '×2',
      caption: 'next',
    });
    expect(slotText(prize({ label: '$5', cash: 5, nextMultiplier: 3 }), usd)).toEqual({
      amount: '$5',
      caption: '×3 next',
    });
    // Bonus spins and ×total take the caption first; a ×total slice keeps its own amount.
    expect(slotText(prize({ label: '$5', cash: 5, extraSpins: 1, nextMultiplier: 2 }), usd)).toEqual({
      amount: '$5',
      caption: 'bonus spin',
    });
    expect(slotText(prize({ label: 'x2', multiplier: 2, nextMultiplier: 2 }), usd)).toEqual({
      amount: '×2',
      caption: 'total',
    });
    expect(slotText(prize({ label: 'Bankrupt', bust: true, nextMultiplier: 2 }), usd)).toBeNull();
    // A shrinking total keeps its label (styled as a ×total slice), so the loss is never hidden.
    const halfNext = prize({ label: 'Half + ×2 Next', multiplier: 0.5, nextMultiplier: 2 });
    expect(slotText(halfNext, usd)).toBeNull();
    expect(slotEffect(halfNext)).toBe('total');
    expect(logChip(halfNext, usd)).toBe('Half + ×2 Next');
    expect(slotText(prize({ label: 'Wipe + ×3 Next', multiplier: 0, nextMultiplier: 3 }), usd)).toBeNull();
  });
});

describe('slotEffect', () => {
  it('names the main effect of a slice', () => {
    expect(slotEffect(prize({ cash: 5 }))).toBe('cash');
    expect(slotEffect(prize({ cash: 5, multiplier: 2, nextMultiplier: 2, extraSpins: 1 }))).toBe('cash');
    expect(slotEffect(prize({ multiplier: 2 }))).toBe('total');
    expect(slotEffect(prize({ multiplier: 0.5 }))).toBe('total');
    expect(slotEffect(prize({ multiplier: 3, nextMultiplier: 2 }))).toBe('total');
    expect(slotEffect(prize({ nextMultiplier: 2 }))).toBe('next');
    expect(slotEffect(prize({ nextMultiplier: 2, extraSpins: 1 }))).toBe('next');
    expect(slotEffect(prize({ extraSpins: 1 }))).toBe('spins');
    expect(slotEffect(prize({ bust: true, cash: 5 }))).toBeUndefined();
    expect(slotEffect(prize({ chainWheelId: 'vault' }))).toBeUndefined();
    expect(slotEffect(prize({}))).toBeUndefined();
  });
});

describe('logChip', () => {
  it('shows the slice amount, boosted cash or the label', () => {
    expect(logChip(prize({ label: '$7', cash: 7 }), usd)).toBe('$7');
    expect(logChip(prize({ label: '$7', cash: 7 }), usd, 2)).toBe('$14');
    expect(logChip(prize({ label: '$2.50', cash: 2.5 }), usd, 1.5)).toBe('$3.75');
    expect(logChip(prize({ label: '×2 Next', nextMultiplier: 2 }), usd)).toBe('×2 next');
    expect(logChip(prize({ label: '×2 Total', multiplier: 2 }), usd, 2)).toBe('×2');
    expect(logChip(prize({ label: 'Free Spin', extraSpins: 1 }), usd, 2)).toBe('+1');
    expect(logChip(prize({ label: 'Lose Half', multiplier: 0.5 }), usd)).toBe('Lose Half');
    expect(logChip(prize({ label: 'Bankrupt', bust: true }), usd, 2)).toBe('Bankrupt');
  });
});

describe('formatMoney', () => {
  it('formats with the configured symbol', () => {
    expect(formatMoney(1500, usd)).toBe('$1,500');
    expect(formatMoney(3.5, usd)).toBe('$3.50');
    expect(formatMoney(10, { symbol: '€', position: 'after' })).toBe('10 €');
  });
});

describe('pickWeighted', () => {
  it('respects weights and skips non-positive ones', () => {
    expect(pickWeighted([0, 1, 0], () => 0.99)).toBe(1);
    expect(pickWeighted([1, 3], () => 0.2)).toBe(0);
    expect(pickWeighted([1, 3], () => 0.3)).toBe(1);
    expect(() => pickWeighted([0, -1], () => 0.5)).toThrow();
  });
});

describe('default config', () => {
  const config = ConfigSchema.parse(JSON.parse(readFileSync('config/default.config.json', 'utf8')));
  let seed = 42;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  it('ships a risk ladder: higher stakes pay more on average but bust more often', () => {
    const lucky = simulateTurns(config, 'broke-boi', 20000, random)!;
    const high = simulateTurns(config, 'simp', 20000, random)!;
    const diamond = simulateTurns(config, 'whale', 20000, random)!;
    expect(lucky.bustRate).toBe(0);
    expect(lucky.averagePayout).toBeGreaterThan(10);
    expect(high.averagePayout).toBeGreaterThan(lucky.averagePayout);
    expect(diamond.averagePayout).toBeGreaterThan(high.averagePayout);
    expect(high.bustRate).toBeGreaterThan(0.2);
    expect(diamond.bustRate).toBeGreaterThan(high.bustRate);
  });

  it('ships a ×2 Next slice on Broke Boi Wheel', () => {
    const lucky = config.wheels.find((w) => w.id === 'broke-boi')!;
    expect(lucky.prizes.find((p) => p.id === 'x2b')).toMatchObject({
      label: '×2 Next',
      multiplier: 1,
      nextMultiplier: 2,
      tier: 'epic',
    });
  });

  it('simulates ×N next boosts', () => {
    const wheel = (prizes: Record<string, unknown>[]) =>
      ConfigSchema.parse({
        activeWheelId: 'w',
        wheels: [{ id: 'w', name: 'W', spinsPerTurn: 2, prizes }],
      });
    const plain = wheel([{ id: 'c', label: '$10', weight: 1, cash: 10 }]);
    const boosted = wheel([
      { id: 'c', label: '$10', weight: 1, cash: 10 },
      { id: 'n', label: '×2 Next', weight: 1, nextMultiplier: 2 },
    ]);
    expect(simulateTurns(plain, 'w', 100, random)).toMatchObject({ averagePayout: 20, maxPayout: 20 });
    // Two spins, each a quarter of the time: $10 + $10, ×2 then $20, $10 then a lost boost, or nothing.
    const stats = simulateTurns(boosted, 'w', 20000, random)!;
    expect(stats.maxPayout).toBe(20);
    expect(stats.zeroRate).toBeGreaterThan(0.23);
    expect(stats.zeroRate).toBeLessThan(0.27);
    expect(stats.averagePayout).toBeGreaterThan(12);
    expect(stats.averagePayout).toBeLessThan(13);
    // Three spins: the best game stacks ×2 twice, then lands $10 × 4.
    expect(simulateTurns(boosted, 'w', 20000, random, 3)!.maxPayout).toBe(40);
  });

  it('keeps Broke Boi Wheel cash slices between $2 and $10', () => {
    const lucky = config.wheels.find((w) => w.id === 'broke-boi')!;
    for (const p of lucky.prizes.filter((p) => p.cash > 0)) {
      expect(p.cash).toBeGreaterThanOrEqual(2);
      expect(p.cash).toBeLessThanOrEqual(10);
    }
  });
});
