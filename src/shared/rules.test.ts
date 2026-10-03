import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyPrize,
  formatMoney,
  pickWeighted,
  simulateTurns,
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
  log: [],
  ...patch,
});
const one = () => 1;

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
    const lucky = simulateTurns(config, 'lucky-dollars', 20000, random)!;
    const high = simulateTurns(config, 'high-roller', 20000, random)!;
    const diamond = simulateTurns(config, 'diamond-table', 20000, random)!;
    expect(lucky.bustRate).toBe(0);
    expect(lucky.averagePayout).toBeGreaterThan(10);
    expect(high.averagePayout).toBeGreaterThan(lucky.averagePayout);
    expect(diamond.averagePayout).toBeGreaterThan(high.averagePayout);
    expect(high.bustRate).toBeGreaterThan(0.2);
    expect(diamond.bustRate).toBeGreaterThan(high.bustRate);
  });

  it('keeps Lucky Dollars cash slices between $2 and $10', () => {
    const lucky = config.wheels.find((w) => w.id === 'lucky-dollars')!;
    for (const p of lucky.prizes.filter((p) => p.cash > 0)) {
      expect(p.cash).toBeGreaterThanOrEqual(2);
      expect(p.cash).toBeLessThanOrEqual(10);
    }
  });
});
