import type { Config, Sizing, Tier } from './schema.js';

export type WheelKind = 'prize' | 'raffle';
/** `total` shows the final amount once every spin of a multi-spin money game has run. */
export type Stage = 'idle' | 'spinning' | 'result' | 'total';
export type SpinSource = 'manual' | 'chat' | 'reward' | 'bits' | 'raffle' | 'chain' | 'api';
/**
 * Main effect of a money slice, used to style it: `cash` adds money, `total` multiplies the
 * running total, `next` boosts the next spin, `spins` grants free spins.
 */
export type SlotEffect = 'cash' | 'total' | 'next' | 'spins';

/** One slice of the wheel as it is drawn. */
export interface Segment {
  id: string;
  label: string;
  description: string;
  weight: number;
  tier: Tier;
  color?: string;
  /** Bankrupt slice (drawn in a distinct "danger" style). */
  bust?: boolean;
  /** Money slices print a large amount with a small caption instead of the label. */
  amount?: string;
  caption?: string;
  /** Main effect of a money slice (absent on bankrupt, prize and raffle slices). */
  effect?: SlotEffect;
}

/** A frozen, render-ready snapshot of a wheel (prize wheel or raffle entrants). */
export interface WheelView {
  key: string;
  kind: WheelKind;
  name: string;
  subtitle: string;
  sizing: Sizing;
  /** Whether the wheel has cash / multiplier / bankrupt slices. */
  money: boolean;
  segments: Segment[];
}

/** Progress of the current player's turn (running total for money wheels). */
export interface TurnView {
  player: string;
  total: number;
  /** 1-based number of the spin being played (or just played). */
  spinNumber: number;
  /** Spins planned so far, including the current one; grows with extra spins. */
  spinsPlanned: number;
  money: boolean;
  /** Multiplier waiting for the cash of the next spin (1 = none), from "×N next" slices. */
  nextMultiplier: number;
}

/** One spin of a game, as listed on the final total screen. */
export interface TurnLogEntry {
  /** Short text for the chip: the slice amount ("$5", "×2") or its label. */
  chip: string;
  wheelName: string;
  before: number;
  after: number;
  bust: boolean;
}

export interface TurnSummary {
  id: string;
  player: string;
  total: number;
  bust: boolean;
  log: TurnLogEntry[];
}

export interface MoneyChange {
  before: number;
  after: number;
  /** Cash printed on the slice, before any boost. */
  cash: number;
  multiplier: number;
  bust: boolean;
  /** Boost from an earlier "×N next" slice applied to this spin's cash (1 = none). */
  boost: number;
  /** Boost armed for the following spin after this result (1 = none). */
  nextMultiplier: number;
}

export interface SpinView {
  id: string;
  wheel: WheelView;
  player: string | null;
  source: SpinSource;
  /** Index of the winning segment in `wheel.segments`. */
  segmentIndex: number;
  /** Rotations are expressed in turns (1 = 360°), clockwise. */
  fromRotation: number;
  toRotation: number;
  durationMs: number;
  /** Server timestamp (ms) at which the spin started. */
  startedAt: number;
  turn: TurnView | null;
}

export interface SpinResult {
  id: string;
  spinId: string;
  at: number;
  kind: WheelKind;
  wheelKey: string;
  wheelName: string;
  player: string | null;
  segmentId: string;
  label: string;
  description: string;
  tier: Tier;
  /** Wheel that will be spun next for the same player, if any. */
  followUpWheelId: string | null;
  /** Running-total change on money wheels. */
  money: MoneyChange | null;
  extraSpins: number;
  /** Final payout when this result ended a money turn. */
  payout: number | null;
}

export interface QueueItem {
  id: string;
  player: string;
  wheelId: string;
  /** Spins in this game; the wheel default when omitted. */
  spins?: number;
  source: SpinSource;
  addedAt: number;
}

export interface Entrant {
  login: string;
  displayName: string;
  tickets: number;
  joinedAt: number;
}

export interface RaffleState {
  open: boolean;
  keyword: string;
  entrants: Entrant[];
  totalTickets: number;
}

export interface SeenReward {
  rewardId: string;
  user: string;
  text: string;
  at: number;
}

export interface TwitchStatus {
  state: 'disabled' | 'connecting' | 'connected' | 'error';
  channel: string;
  canChat: boolean;
  message: string;
  /** Recent channel-point redemptions that are not mapped to a wheel yet. */
  unmappedRewards: SeenReward[];
}

export interface AppState {
  config: Config;
  stage: Stage;
  /** Manual overlay visibility toggle. */
  visible: boolean;
  /** Wheel shown on the overlay while idle. */
  display: WheelView;
  /** Resting rotation of the displayed wheel, in turns. */
  rotation: number;
  spin: SpinView | null;
  result: SpinResult | null;
  turn: TurnView | null;
  /** Final total of a multi-spin game (stage `total`). */
  summary: TurnSummary | null;
  queue: QueueItem[];
  history: SpinResult[];
  raffle: RaffleState;
  twitch: TwitchStatus;
  /** Server clock when this snapshot was serialized; lets clients join a spin mid-way. */
  serverTime: number;
  /** True when control commands need a token this client did not provide. */
  readOnly: boolean;
}

export interface Notice {
  level: 'info' | 'success' | 'error';
  message: string;
}

export type ServerMessage = { type: 'state'; state: AppState } | { type: 'notice'; notice: Notice };

export const RAFFLE_WHEEL_KEY = '@raffle';
