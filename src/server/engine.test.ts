import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeArcs, segmentAt } from '../shared/geometry.js';
import { ConfigSchema, type Config } from '../shared/schema.js';
import { EngineError, SETTLE_MS, WheelEngine } from './engine.js';

const prize = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id, weight: 1, ...extra });

function makeConfig(input: Record<string, unknown> = {}): Config {
  return ConfigSchema.parse({
    activeWheelId: 'main',
    wheels: [{ id: 'main', name: 'Main', prizes: [prize('a'), prize('b'), prize('c')] }],
    settings: { spin: { durationMs: 4000, resultHoldMs: 5000, followUpHoldMs: 2000 } },
    ...input,
  });
}

/** Lets the current spin finish and its result hold expire. */
function playOut(engine: WheelEngine) {
  const spin = engine.snapshot().spin!;
  vi.advanceTimersByTime(spin.durationMs + SETTLE_MS);
  const result = engine.snapshot().result!;
  vi.advanceTimersByTime(engine.settings.spin.resultHoldMs);
  return result;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('spinning', () => {
  it('runs the full lifecycle and lands on the chosen slice', () => {
    const engine = new WheelEngine({ config: makeConfig(), random: () => 0.5 });
    expect(engine.requestSpin({ player: 'ana', source: 'manual' })).toBe('started');

    const { spin, stage } = engine.snapshot();
    expect(stage).toBe('spinning');
    const arcs = computeArcs(
      spin!.wheel.segments.map((s) => s.weight),
      spin!.wheel.sizing,
    );
    expect(segmentAt(arcs, spin!.toRotation)).toBe(spin!.segmentIndex);

    vi.advanceTimersByTime(spin!.durationMs + SETTLE_MS);
    const { result, history } = engine.snapshot();
    expect(engine.getStage()).toBe('result');
    expect(result).toMatchObject({ player: 'ana', segmentId: spin!.wheel.segments[spin!.segmentIndex]!.id });
    expect(history).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(engine.getStage()).toBe('idle');
    expect(engine.snapshot().rotation).toBeCloseTo(spin!.toRotation % 1);
  });

  it('queues requests while busy and auto-advances', () => {
    const engine = new WheelEngine({ config: makeConfig(), random: () => 0.1 });
    engine.requestSpin({ player: 'ana', source: 'manual' });
    expect(engine.requestSpin({ player: 'bo', source: 'manual' })).toBe('queued');
    expect(engine.snapshot().queue.map((q) => q.player)).toEqual(['bo']);
    playOut(engine);
    expect(engine.snapshot().spin?.player).toBe('bo');
  });

  it('waits for "spin next" when auto-advance is off', () => {
    const engine = new WheelEngine({
      config: makeConfig({ settings: { spin: { autoAdvanceQueue: false } } }),
      random: () => 0.1,
    });
    engine.enqueue({ player: 'ana', source: 'chat' });
    expect(engine.getStage()).toBe('idle');
    engine.spinNext();
    expect(engine.snapshot().spin?.player).toBe('ana');
    expect(() => engine.spinNext()).toThrow(EngineError);
  });

  it('decrements stock and hides sold-out prizes', () => {
    const config = makeConfig({
      wheels: [
        {
          id: 'main',
          name: 'Main',
          prizes: [prize('only', { stock: 1 }), prize('other', { weight: 0.0001 })],
        },
      ],
    });
    const engine = new WheelEngine({ config, random: () => 0 });
    const configs: Config[] = [];
    engine.on('config', (c) => configs.push(c));
    engine.requestSpin({ source: 'manual' });
    playOut(engine);
    expect(engine.getConfig().wheels[0]!.prizes[0]!.stock).toBe(0);
    expect(engine.snapshot().display.segments.map((s) => s.id)).toEqual(['other']);
    expect(configs.length).toBeGreaterThan(0);
  });

  it('refuses unknown wheels and empty wheels', () => {
    const config = makeConfig({
      wheels: [
        { id: 'main', name: 'Main', prizes: [prize('a')] },
        { id: 'empty', name: 'Empty', prizes: [prize('gone', { stock: 0 })] },
      ],
    });
    const engine = new WheelEngine({ config });
    expect(() => engine.requestSpin({ wheelId: 'nope', source: 'manual' })).toThrow(/Unknown wheel/);
    expect(() => engine.requestSpin({ wheelId: 'empty', source: 'manual' })).toThrow(/no prizes left/);
  });
});

describe('money turns', () => {
  it('accumulates cash over spinsPerTurn and pays out at the end', () => {
    const config = makeConfig({
      wheels: [{ id: 'main', name: 'Cash', spinsPerTurn: 3, prizes: [prize('five', { cash: 5 })] }],
    });
    const engine = new WheelEngine({ config, random: () => 0.3 });
    engine.requestSpin({ player: 'ana', source: 'manual' });

    vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS);
    expect(engine.snapshot().result).toMatchObject({
      money: { before: 0, after: 5 },
      payout: null,
      followUpWheelId: 'main',
    });
    expect(engine.snapshot().turn).toMatchObject({ total: 5, spinNumber: 1, spinsPlanned: 3 });

    vi.advanceTimersByTime(2000); // follow-up hold
    expect(engine.snapshot().spin?.turn).toMatchObject({ spinNumber: 2, total: 5 });
    vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS + 2000);
    vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS);
    expect(engine.snapshot().result).toMatchObject({ payout: 15, followUpWheelId: null });

    // Once every spin has run, the total screen follows the last result.
    vi.advanceTimersByTime(2000);
    expect(engine.getStage()).toBe('total');
    expect(engine.snapshot().summary).toMatchObject({
      player: 'ana',
      total: 15,
      bust: false,
      log: [{ chip: '$5' }, { chip: '$5' }, { chip: '$5' }],
    });

    vi.advanceTimersByTime(5000);
    expect(engine.getStage()).toBe('idle');
    expect(engine.snapshot().turn).toBeNull();
    expect(engine.snapshot().summary).toBeNull();
  });

  it('plays the number of spins chosen for the game', () => {
    const config = makeConfig({
      wheels: [{ id: 'main', name: 'Cash', spinsPerTurn: 3, prizes: [prize('two', { cash: 2 })] }],
    });
    const engine = new WheelEngine({ config, random: () => 0.3 });
    engine.requestSpin({ player: 'ana', spins: 5, source: 'manual' });
    expect(engine.snapshot().spin?.turn).toMatchObject({ spinNumber: 1, spinsPlanned: 5 });
    for (let i = 0; i < 5; i++) playOutFollowUp(engine);
    expect(engine.getStage()).toBe('total');
    expect(engine.snapshot().summary).toMatchObject({ total: 10 });
    engine.dismissResult();
    expect(engine.getStage()).toBe('idle');
  });

  it('skips the total screen for a single-spin game', () => {
    const config = makeConfig({
      wheels: [{ id: 'main', name: 'Cash', prizes: [prize('two', { cash: 2 })] }],
    });
    const engine = new WheelEngine({ config, random: () => 0.3 });
    engine.requestSpin({ player: 'ana', source: 'manual' });
    playOut(engine);
    expect(engine.getStage()).toBe('idle');
  });

  it('bankrupt ends the turn immediately', () => {
    const config = makeConfig({
      wheels: [{ id: 'main', name: 'Risk', spinsPerTurn: 3, prizes: [prize('bust', { bust: true })] }],
    });
    const engine = new WheelEngine({ config, random: () => 0.3 });
    engine.requestSpin({ player: 'ana', source: 'manual' });
    vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS);
    expect(engine.snapshot().result).toMatchObject({
      money: { bust: true, after: 0 },
      payout: 0,
      followUpWheelId: null,
    });
  });

  it('chains into category wheels and carries the total', () => {
    const config = makeConfig({
      wheels: [
        { id: 'main', name: 'Grand', prizes: [prize('go', { chainWheelId: 'cash' })] },
        { id: 'cash', name: 'Cash', spinsPerTurn: 2, prizes: [prize('ten', { cash: 10 })] },
      ],
    });
    const engine = new WheelEngine({ config, random: () => 0.3 });
    engine.requestSpin({ player: 'ana', source: 'manual' });
    const first = playOutFollowUp(engine);
    expect(first.followUpWheelId).toBe('cash');
    expect(engine.snapshot().spin?.wheel.key).toBe('cash');
    expect(engine.snapshot().spin?.player).toBe('ana');
    playOutFollowUp(engine);
    vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS);
    expect(engine.snapshot().result).toMatchObject({ payout: 20 });
    expect(engine.snapshot().turn).toMatchObject({ spinNumber: 3, spinsPlanned: 3 });
  });

  it('caps runaway free spins', () => {
    const config = makeConfig({
      wheels: [{ id: 'main', name: 'Loop', prizes: [prize('again', { extraSpins: 1 })] }],
      settings: { spin: { maxSpinsPerTurn: 4, followUpHoldMs: 1000 } },
    });
    const engine = new WheelEngine({ config, random: () => 0.3 });
    engine.requestSpin({ source: 'manual' });
    vi.advanceTimersByTime(10 * 60_000);
    expect(engine.snapshot().history).toHaveLength(4);
    expect(engine.getStage()).toBe('idle');
  });
});

describe('×N next', () => {
  // random() = 0 always lands on the first slice still in stock, which scripts the order.
  const nextWheel = (spinsPerTurn: number, prizes: Record<string, unknown>[]) =>
    makeConfig({ wheels: [{ id: 'main', name: 'Boost', spinsPerTurn, prizes }] });
  const next2 = prize('next2', { label: '×2 Next', nextMultiplier: 2, stock: 1 });
  const seven = prize('seven', { label: '$7', cash: 7 });

  it('arms a boost, shows it on the turn and multiplies the next cash', () => {
    const engine = new WheelEngine({ config: nextWheel(3, [next2, seven]), random: () => 0 });
    engine.requestSpin({ player: 'ana', source: 'manual' });
    expect(engine.snapshot().spin?.turn).toMatchObject({ nextMultiplier: 1 });

    const armed = playOutFollowUp(engine);
    expect(armed).toMatchObject({
      label: '×2 Next',
      money: { before: 0, after: 0, cash: 0, multiplier: 1, boost: 1, nextMultiplier: 2, bust: false },
      payout: null,
    });
    // The boost stays on the turn while the boosted spin runs.
    expect(engine.snapshot().spin?.turn).toMatchObject({ spinNumber: 2, nextMultiplier: 2 });
    expect(engine.snapshot().turn).toMatchObject({ nextMultiplier: 2 });

    vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS);
    expect(engine.snapshot().result).toMatchObject({
      label: '$7',
      money: { before: 0, after: 14, cash: 7, boost: 2, nextMultiplier: 1 },
    });
    expect(engine.snapshot().turn).toMatchObject({ total: 14, nextMultiplier: 1 });
    vi.advanceTimersByTime(engine.settings.spin.followUpHoldMs);

    const last = playOutFollowUp(engine);
    expect(last).toMatchObject({ money: { after: 21, boost: 1 }, payout: 21 });
    expect(engine.getStage()).toBe('total');
    expect(engine.snapshot().summary).toMatchObject({
      total: 21,
      log: [
        { chip: '×2 next', before: 0, after: 0 },
        { chip: '$14', before: 0, after: 14 },
        { chip: '$7', before: 14, after: 21 },
      ],
    });
  });

  it('stacks boosts across slices', () => {
    const next3 = prize('next3', { label: '×3 Next', nextMultiplier: 3, stock: 1 });
    const engine = new WheelEngine({ config: nextWheel(3, [next2, next3, seven]), random: () => 0 });
    engine.requestSpin({ player: 'ana', source: 'manual' });
    expect(playOutFollowUp(engine).money).toMatchObject({ boost: 1, nextMultiplier: 2 });
    expect(playOutFollowUp(engine).money).toMatchObject({ boost: 1, nextMultiplier: 6 });
    expect(engine.snapshot().spin?.turn).toMatchObject({ nextMultiplier: 6 });
    expect(playOutFollowUp(engine)).toMatchObject({ money: { after: 42, boost: 6 }, payout: 42 });
  });

  it('loses a boost left when the game ends', () => {
    const engine = new WheelEngine({ config: nextWheel(1, [next2, seven]), random: () => 0 });
    engine.requestSpin({ player: 'ana', source: 'manual' });
    vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS);
    expect(engine.snapshot().result).toMatchObject({
      money: { after: 0, boost: 1, nextMultiplier: 1 },
      payout: 0,
    });
    expect(engine.snapshot().turn).toMatchObject({ nextMultiplier: 1 });
  });

  it('treats a wheel of boosts and free spins as a money wheel', () => {
    const free = prize('free', { label: 'Free Spin', extraSpins: 1 });
    const engine = new WheelEngine({ config: nextWheel(1, [next2, free]), random: () => 0 });
    expect(engine.snapshot().display.money).toBe(true);
    engine.requestSpin({ player: 'ana', source: 'manual' });
    expect(engine.snapshot().spin?.turn).toMatchObject({ money: true });
  });
});

describe('wheel views', () => {
  it('tag money slices with their main effect', () => {
    const config = makeConfig({
      wheels: [
        {
          id: 'main',
          name: 'Mixed',
          prizes: [
            prize('cash', { cash: 5 }),
            prize('total', { multiplier: 2 }),
            prize('half', { multiplier: 0.5 }),
            prize('next', { nextMultiplier: 2 }),
            prize('free', { extraSpins: 1 }),
            prize('bust', { bust: true }),
            prize('shoutout'),
          ],
        },
      ],
    });
    const engine = new WheelEngine({ config });
    const segments = engine.snapshot().display.segments;
    expect(segments.map((s) => s.effect)).toEqual([
      'cash',
      'total',
      'total',
      'next',
      'spins',
      undefined,
      undefined,
    ]);
    expect(segments[3]).toMatchObject({ amount: '×2', caption: 'next' });
    expect('effect' in segments[6]!).toBe(false);

    engine.addEntrant({ login: 'ana', displayName: 'Ana' });
    engine.openRaffle();
    expect(engine.snapshot().display.segments[0]).not.toHaveProperty('effect');
  });
});

describe('raffle', () => {
  it('only accepts chat entries while open and ignores duplicates', () => {
    const engine = new WheelEngine({
      config: makeConfig({ settings: { raffle: { subscriberTickets: 3 } } }),
    });
    expect(engine.joinRaffle({ login: 'ana', displayName: 'Ana' })).toBe(false);
    engine.openRaffle();
    expect(engine.joinRaffle({ login: 'Ana', displayName: 'Ana' })).toBe(true);
    expect(engine.joinRaffle({ login: 'ana', displayName: 'Ana' })).toBe(false);
    engine.joinRaffle({ login: 'bo', displayName: 'Bo', subscriber: true });
    expect(engine.snapshot().raffle).toMatchObject({ open: true, totalTickets: 4 });
    expect(engine.snapshot().display.kind).toBe('raffle');
  });

  it('draws a winner, removes them and spins the prize wheel for them', () => {
    const engine = new WheelEngine({
      config: makeConfig({ settings: { raffle: { prizeWheelId: 'main' } } }),
      random: () => 0.1,
    });
    engine.openRaffle();
    engine.joinRaffle({ login: 'ana', displayName: 'Ana' });
    engine.joinRaffle({ login: 'bo', displayName: 'Bo' });
    engine.drawRaffle();
    expect(engine.snapshot().spin?.wheel.kind).toBe('raffle');
    vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS);
    const result = engine.snapshot().result!;
    expect(result).toMatchObject({ kind: 'raffle', label: 'Ana', followUpWheelId: 'main' });
    expect(engine.snapshot().raffle.entrants.map((e) => e.login)).toEqual(['bo']);
    vi.advanceTimersByTime(engine.settings.spin.followUpHoldMs);
    expect(engine.snapshot().spin).toMatchObject({ player: 'Ana', source: 'raffle' });
  });

  it('refuses to draw an empty raffle or during a spin', () => {
    const engine = new WheelEngine({ config: makeConfig() });
    expect(() => engine.drawRaffle()).toThrow(/Nobody/);
    engine.addEntrant({ login: 'ana', displayName: 'Ana' });
    engine.requestSpin({ source: 'manual' });
    expect(() => engine.drawRaffle()).toThrow(/Wait/);
  });
});

function playOutFollowUp(engine: WheelEngine) {
  vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS);
  const result = engine.snapshot().result!;
  vi.advanceTimersByTime(engine.settings.spin.followUpHoldMs);
  return result;
}
