import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { computeArcs, landingRotation, mod1 } from '../shared/geometry.js';
import {
  applyPrize,
  availablePrizes,
  formatMoney,
  isMoneyWheel,
  slotText,
  startTurn,
  type Turn,
} from '../shared/rules.js';
import type { Config } from '../shared/schema.js';
import {
  RAFFLE_WHEEL_KEY,
  type AppState,
  type Entrant,
  type Notice,
  type QueueItem,
  type RaffleState,
  type SpinResult,
  type SpinSource,
  type SpinView,
  type Stage,
  type TurnSummary,
  type TurnView,
  type WheelView,
} from '../shared/types.js';
import { secureRandom, weightedIndex } from './random.js';

/** Pause between the wheel stopping and the result being revealed. */
export const SETTLE_MS = 450;
export const HISTORY_LIMIT = 100;

/** An error caused by the request (bad input, wrong timing) rather than a bug. */
export class EngineError extends Error {}

export interface SessionData {
  queue: QueueItem[];
  history: SpinResult[];
  raffle: { open: boolean; entrants: Entrant[] };
}

export type EngineSnapshot = Omit<AppState, 'twitch' | 'serverTime' | 'readOnly'>;

interface EngineEvents {
  /** Anything visible changed; clients should receive a new snapshot. */
  change: [];
  /** Config changed (edit, wheel selection, stock decrement); persist it. */
  config: [Config];
  /** Queue, raffle or history changed; persist the session. */
  session: [];
  result: [SpinResult];
  raffle: ['open' | 'close'];
  notice: [Notice];
}

export interface EngineOptions {
  config: Config;
  session?: Partial<SessionData>;
  random?: () => number;
}

export interface SpinRequest {
  wheelId?: string | undefined;
  player?: string | null | undefined;
  /** Spins in this game; the wheel's default when omitted. */
  spins?: number | undefined;
  source: SpinSource;
}

export interface EntrantInput {
  login: string;
  displayName: string;
  subscriber?: boolean;
}

export class WheelEngine extends EventEmitter<EngineEvents> {
  private config: Config;
  private readonly random: () => number;
  private stage: Stage = 'idle';
  private spin: SpinView | null = null;
  private result: SpinResult | null = null;
  private summary: TurnSummary | null = null;
  /** What happens when the result display ends (next spin, total screen, or idle). */
  private afterResult: () => void = () => this.endResult();
  private queue: QueueItem[];
  /** The current player's turn (prize wheels only). */
  private turn: Turn | null = null;
  /** A fresh turn to start before the queue (the raffle winner's prize spin). */
  private followUp: QueueItem | null = null;
  private history: SpinResult[];
  private raffleOpen: boolean;
  private readonly entrants = new Map<string, Entrant>();
  private readonly rotations = new Map<string, number>();
  private visible = true;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor({ config, session = {}, random = secureRandom }: EngineOptions) {
    super();
    this.config = config;
    this.random = random;
    this.queue = [...(session.queue ?? [])];
    this.history = [...(session.history ?? [])].slice(0, HISTORY_LIMIT);
    this.raffleOpen = session.raffle?.open ?? false;
    for (const entrant of session.raffle?.entrants ?? []) this.entrants.set(entrant.login, entrant);
  }

  get settings(): Config['settings'] {
    return this.config.settings;
  }

  getConfig(): Config {
    return this.config;
  }

  getStage(): Stage {
    return this.stage;
  }

  snapshot(): EngineSnapshot {
    const display = this.displayView();
    return {
      config: this.config,
      stage: this.stage,
      visible: this.visible,
      display,
      rotation: this.rotations.get(display.key) ?? 0,
      spin: this.spin,
      result: this.result,
      turn: this.turnView(),
      summary: this.summary,
      queue: [...this.queue],
      history: this.history,
      raffle: this.raffleState(),
    };
  }

  session(): SessionData {
    return {
      queue: this.queue,
      history: this.history,
      raffle: { open: this.raffleOpen, entrants: [...this.entrants.values()] },
    };
  }

  dispose(): void {
    this.clearTimer();
    this.removeAllListeners();
  }

  // ── Spinning ────────────────────────────────────────────────────────────

  /** Spins now when idle, otherwise queues the request. */
  requestSpin(request: SpinRequest): 'started' | 'queued' {
    const item = this.makeQueueItem(request);
    if (this.stage !== 'idle') {
      this.queue.push(item);
      this.emitSession();
      return 'queued';
    }
    this.startSpin(item);
    return 'started';
  }

  /** Adds a request to the queue; it starts right away when idle and auto-advance is on. */
  enqueue(request: SpinRequest & { player: string }): QueueItem {
    const item = this.makeQueueItem(request);
    this.queue.push(item);
    this.emitSession();
    this.pump();
    return item;
  }

  hasQueued(player: string): boolean {
    const name = player.toLowerCase();
    return this.queue.some((item) => item.player.toLowerCase() === name);
  }

  spinNext(): void {
    if (this.stage !== 'idle') throw new EngineError('A spin is already in progress');
    const next = this.queue.shift();
    if (!next) throw new EngineError('The queue is empty');
    this.emitSession();
    this.startSpin(next);
  }

  removeFromQueue(id: string): void {
    this.queue = this.queue.filter((item) => item.id !== id);
    this.emitSession();
  }

  clearQueue(): void {
    this.queue = [];
    this.emitSession();
  }

  /** Ends the result (or total) display early. */
  dismissResult(): void {
    if (this.stage === 'result') {
      this.clearTimer();
      this.afterResult();
    } else if (this.stage === 'total') {
      this.endResult();
    }
  }

  // ── Wheels & config ────────────────────────────────────────────────────

  selectWheel(wheelId: string): void {
    this.requireWheel(wheelId);
    this.config.activeWheelId = wheelId;
    this.emit('config', this.config);
    this.emit('change');
  }

  updateConfig(config: Config): void {
    this.config = config;
    this.emit('config', this.config);
    this.emit('change');
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.emit('change');
  }

  isVisible(): boolean {
    return this.visible;
  }

  clearHistory(): void {
    this.history = [];
    this.emitSession();
  }

  // ── Raffle ─────────────────────────────────────────────────────────────

  openRaffle(): void {
    if (this.raffleOpen) return;
    this.raffleOpen = true;
    this.emit('raffle', 'open');
    this.emitSession();
  }

  closeRaffle(): void {
    if (!this.raffleOpen) return;
    this.raffleOpen = false;
    this.emit('raffle', 'close');
    this.emitSession();
  }

  isRaffleOpen(): boolean {
    return this.raffleOpen;
  }

  /** Chat entry; ignored while the raffle is closed or when already entered. */
  joinRaffle(input: EntrantInput): boolean {
    if (!this.raffleOpen) return false;
    return this.addEntrant(input);
  }

  /** Adds an entrant regardless of the raffle being open (manual entry from the dock). */
  addEntrant({ login, displayName, subscriber = false }: EntrantInput): boolean {
    const key = normalizeLogin(login);
    if (!key || this.entrants.has(key)) return false;
    this.entrants.set(key, {
      login: key,
      displayName: displayName.trim().replace(/^@/, '') || key,
      tickets: subscriber ? this.settings.raffle.subscriberTickets : 1,
      joinedAt: Date.now(),
    });
    this.emitSession();
    return true;
  }

  removeEntrant(login: string): void {
    if (this.entrants.delete(normalizeLogin(login))) this.emitSession();
  }

  clearRaffle(): void {
    this.entrants.clear();
    this.emitSession();
  }

  drawRaffle(): void {
    if (this.stage !== 'idle') throw new EngineError('Wait for the current spin to finish');
    if (this.entrants.size === 0) throw new EngineError('Nobody has entered the raffle yet');
    this.startSpin(this.makeQueueItem({ wheelId: RAFFLE_WHEEL_KEY, player: '', source: 'raffle' }));
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private makeQueueItem({ wheelId, player, spins, source }: SpinRequest): QueueItem {
    const id = wheelId || this.config.activeWheelId;
    if (id !== RAFFLE_WHEEL_KEY) this.requireWheel(id);
    return {
      id: randomUUID(),
      player: (player ?? '').trim().replace(/^@/, ''),
      wheelId: id,
      ...(spins
        ? { spins: Math.min(Math.max(1, Math.round(spins)), this.settings.spin.maxSpinsPerTurn) }
        : {}),
      source,
      addedAt: Date.now(),
    };
  }

  private requireWheel(wheelId: string) {
    const wheel = this.config.wheels.find((w) => w.id === wheelId);
    if (!wheel) throw new EngineError(`Unknown wheel "${wheelId}"`);
    return wheel;
  }

  private wheelView(wheelId: string): WheelView | null {
    const wheel = this.config.wheels.find((w) => w.id === wheelId);
    if (!wheel) return null;
    return {
      key: wheel.id,
      kind: 'prize',
      name: wheel.name,
      subtitle: wheel.subtitle,
      sizing: wheel.sizing,
      money: isMoneyWheel(wheel),
      segments: availablePrizes(wheel).map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        weight: p.weight,
        tier: p.tier,
        ...(p.color ? { color: p.color } : {}),
        ...(p.bust ? { bust: true } : {}),
        ...slotText(p, this.settings.currency),
      })),
    };
  }

  private raffleView(): WheelView {
    const entrants = [...this.entrants.values()];
    const tickets = entrants.reduce((sum, e) => sum + e.tickets, 0);
    return {
      key: RAFFLE_WHEEL_KEY,
      kind: 'raffle',
      name: 'Grand Raffle',
      subtitle: `${entrants.length} ${entrants.length === 1 ? 'entrant' : 'entrants'} · ${tickets} tickets`,
      sizing: 'weight',
      money: false,
      segments: entrants.map((e) => ({
        id: e.login,
        label: e.displayName,
        description: '',
        weight: e.tickets,
        tier: 'common',
      })),
    };
  }

  private displayView(): WheelView {
    if (this.raffleOpen && this.entrants.size > 0) return this.raffleView();
    return (
      this.wheelView(this.config.activeWheelId) ??
      this.wheelView(this.config.wheels[0]!.id) ?? {
        key: 'none',
        kind: 'prize',
        name: 'FinWheel',
        subtitle: '',
        sizing: 'equal',
        money: false,
        segments: [],
      }
    );
  }

  private raffleState(): RaffleState {
    const entrants = [...this.entrants.values()];
    return {
      open: this.raffleOpen,
      keyword: this.settings.raffle.keyword,
      entrants,
      totalTickets: entrants.reduce((sum, e) => sum + e.tickets, 0),
    };
  }

  private turnView(): TurnView | null {
    const turn = this.turn;
    if (!turn) return null;
    // The spin being played is only counted in `spins` once it finishes.
    const current = this.stage === 'spinning' ? turn.spins + 1 : turn.spins;
    return {
      player: turn.player,
      total: turn.total,
      spinNumber: Math.max(1, current),
      spinsPlanned: Math.max(1, current) + turn.pending.length,
      money: turn.money,
      nextMultiplier: 1, // TODO(next-multiplier): read the boost armed on the turn
    };
  }

  /** Starts a spin. `continueTurn` keeps the current turn (extra spins and chained wheels). */
  private startSpin(item: QueueItem, continueTurn = false): void {
    const isRaffle = item.wheelId === RAFFLE_WHEEL_KEY;
    const view = isRaffle ? this.raffleView() : this.wheelView(item.wheelId);
    if (!view) throw new EngineError(`Unknown wheel "${item.wheelId}"`);
    if (view.segments.length === 0) {
      throw new EngineError(
        isRaffle ? 'Nobody has entered the raffle yet' : `"${view.name}" has no prizes left`,
      );
    }

    if (isRaffle) {
      this.turn = null;
    } else if (continueTurn && this.turn) {
      this.turn.money ||= view.money;
    } else {
      this.turn = startTurn(this.requireWheel(item.wheelId), item.player, item.spins);
    }

    const { durationMs, minTurns, maxTurns } = this.settings.spin;
    const weights = view.segments.map((s) => s.weight);
    const segmentIndex = weightedIndex(weights, this.random);
    const arc = computeArcs(weights, view.sizing)[segmentIndex]!;
    const turns = minTurns + Math.floor(this.random() * (maxTurns - minTurns + 1));
    // Stay clear of the slice edges so the pointer never sits ambiguously on a peg.
    const landing = 0.12 + this.random() * 0.76;
    const fromRotation = this.rotations.get(view.key) ?? 0;

    this.stage = 'spinning';
    this.result = null;
    this.spin = {
      id: randomUUID(),
      wheel: view,
      player: item.player || null,
      source: item.source,
      segmentIndex,
      fromRotation,
      toRotation: landingRotation(fromRotation, arc, landing, turns),
      durationMs: Math.round(durationMs * (0.92 + this.random() * 0.16)),
      startedAt: Date.now(),
      turn: this.turnView(),
    };
    this.clearTimer();
    this.timer = setTimeout(() => this.finishSpin(), this.spin.durationMs + SETTLE_MS);
    this.emit('change');
  }

  private finishSpin(): void {
    const spin = this.spin;
    if (!spin) return;
    const segment = spin.wheel.segments[spin.segmentIndex]!;
    this.rotations.set(spin.wheel.key, mod1(spin.toRotation));

    let followUpWheelId: string | null = null;
    let money: SpinResult['money'] = null;
    let extraSpins = 0;
    let payout: number | null = null;

    if (spin.wheel.kind === 'prize') {
      const prize = this.config.wheels
        .find((w) => w.id === spin.wheel.key)
        ?.prizes.find((p) => p.id === segment.id);
      if (prize && prize.stock !== null) {
        prize.stock = Math.max(0, prize.stock - 1);
        this.emit('config', this.config);
      }
      if (prize && this.turn) {
        const outcome = applyPrize(
          this.turn,
          prize,
          spin.wheel.key,
          this.settings.spin.maxSpinsPerTurn,
          (id) => this.config.wheels.find((w) => w.id === id)?.spinsPerTurn ?? 1,
        );
        this.turn = outcome.turn;
        this.turn.log = [
          ...this.turn.log,
          {
            chip: slotText(prize, this.settings.currency)?.amount ?? prize.label,
            wheelName: spin.wheel.name,
            before: outcome.before,
            after: outcome.after,
            bust: prize.bust,
          },
        ];
        extraSpins = prize.bust ? 0 : prize.extraSpins;
        if (this.turn.money) {
          money = {
            before: outcome.before,
            after: outcome.after,
            cash: prize.cash,
            multiplier: prize.multiplier,
            bust: prize.bust,
            boost: 1, // TODO(next-multiplier): boost applied to this spin
            nextMultiplier: 1, // TODO(next-multiplier): boost armed for the next spin
          };
          if (outcome.ended) payout = outcome.after;
        }
        followUpWheelId = this.turn.pending[0] ?? null;
      }
    } else {
      if (this.settings.raffle.removeWinner) this.entrants.delete(segment.id);
      const prizeWheelId = this.settings.raffle.prizeWheelId;
      if (prizeWheelId && this.wheelView(prizeWheelId)) {
        followUpWheelId = prizeWheelId;
        this.followUp = {
          id: randomUUID(),
          player: segment.label,
          wheelId: prizeWheelId,
          source: 'raffle',
          addedAt: Date.now(),
        };
      }
    }

    const result: SpinResult = {
      id: randomUUID(),
      spinId: spin.id,
      at: Date.now(),
      kind: spin.wheel.kind,
      wheelKey: spin.wheel.key,
      wheelName: spin.wheel.name,
      player: spin.player,
      segmentId: segment.id,
      label: segment.label,
      description: segment.description,
      tier: segment.tier,
      followUpWheelId,
      money,
      extraSpins,
      payout,
    };
    this.history.unshift(result);
    this.history.length = Math.min(this.history.length, HISTORY_LIMIT);

    // A multi-spin money game ends on a total screen once its last spin has been shown.
    const turn = this.turn;
    const showTotal = spin.wheel.kind === 'prize' && turn?.money && payout !== null && turn.spins > 1;

    this.stage = 'result';
    this.result = result;
    this.afterResult = showTotal ? () => this.showTotal() : () => this.endResult();
    const { resultHoldMs, followUpHoldMs } = this.settings.spin;
    this.timer = setTimeout(
      () => this.afterResult(),
      followUpWheelId || showTotal ? followUpHoldMs : resultHoldMs,
    );
    this.emit('result', result);
    this.emitSession();
  }

  private showTotal(): void {
    const turn = this.turn;
    if (!turn) return this.endResult();
    this.clearTimer();
    this.stage = 'total';
    this.result = null;
    this.summary = {
      id: randomUUID(),
      player: turn.player,
      total: turn.total,
      bust: turn.log.at(-1)?.bust ?? false,
      log: turn.log,
    };
    this.timer = setTimeout(() => this.endResult(), this.settings.spin.resultHoldMs);
    this.emit('notice', {
      level: 'success',
      message: `${turn.player || 'Player'} finished with ${formatMoney(turn.total, this.settings.currency)}`,
    });
    this.emit('change');
  }

  private endResult(): void {
    this.clearTimer();
    this.stage = 'idle';
    this.spin = null;
    this.result = null;
    this.summary = null;
    this.emit('change');
    this.pump();
  }

  /** Continues the current turn, then starts the raffle follow-up, then the queue (if auto-advance is on). */
  private pump(): void {
    while (this.stage === 'idle') {
      const turn = this.turn;
      if (turn && turn.pending.length > 0) {
        const wheelId = turn.pending.shift()!;
        const item: QueueItem = {
          id: randomUUID(),
          player: turn.player,
          wheelId,
          source: 'chain',
          addedAt: Date.now(),
        };
        this.tryStart(item, true);
        continue;
      }
      this.turn = null;

      let next = this.followUp;
      this.followUp = null;
      if (!next && this.settings.spin.autoAdvanceQueue) {
        next = this.queue.shift() ?? null;
        if (next) this.emitSession();
      }
      if (!next) {
        this.emit('change');
        return;
      }
      this.tryStart(next, false);
    }
  }

  private tryStart(item: QueueItem, continueTurn: boolean): void {
    try {
      this.startSpin(item, continueTurn);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit('notice', {
        level: 'error',
        message: `Skipped spin for ${item.player || 'anonymous'}: ${message}`,
      });
    }
  }

  private emitSession(): void {
    this.emit('session');
    this.emit('change');
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export function normalizeLogin(name: string): string {
  return name.trim().replace(/^@/, '').toLowerCase();
}
