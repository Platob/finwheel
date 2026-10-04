import { EventEmitter } from 'node:events';
import { normalizeCommand, wheelForCommand } from '../../shared/chat-commands.js';
import { formatMoney } from '../../shared/rules.js';
import type { Role } from '../../shared/schema.js';
import type { SpinResult, TwitchStatus } from '../../shared/types.js';
import { EngineError, type WheelEngine } from '../engine.js';
import { TwitchChatClient, type ChatState } from './client.js';
import type { ChatMessage } from './irc.js';

const ROLE_RANK: Record<Role, number> = { everyone: 0, subscriber: 1, vip: 2, moderator: 3, broadcaster: 4 };
const MAX_UNMAPPED_REWARDS = 5;

export function roleRank(message: ChatMessage): number {
  if (message.isBroadcaster) return ROLE_RANK.broadcaster;
  if (message.isModerator) return ROLE_RANK.moderator;
  if (message.isVip) return ROLE_RANK.vip;
  if (message.isSubscriber) return ROLE_RANK.subscriber;
  return ROLE_RANK.everyone;
}

export interface GameArgs {
  /** Player named by a moderator ("@viewer" or a bare name), '' when none. */
  player: string;
  spins?: number;
  wheelId?: string;
}

/**
 * Reads a moderator's game arguments, in any order: "@viewer 5 simp" names the player, the number
 * of spins (1–2 digits) and a wheel id (any case). The first other word is the player.
 */
export function parseGameArgs(args: readonly string[], wheelIds: Iterable<string>): GameArgs {
  const ids = new Map([...wheelIds].map((id) => [id.toLowerCase(), id]));
  const parsed: GameArgs = { player: '' };
  for (const arg of args) {
    const wheelId = arg.startsWith('@') ? undefined : ids.get(arg.toLowerCase());
    if (/^\d{1,2}$/.test(arg)) parsed.spins = Number(arg);
    else if (wheelId) parsed.wheelId = wheelId;
    else if (!parsed.player) parsed.player = arg.replace(/^@/, '');
  }
  return parsed;
}

export interface ChatConnection {
  readonly canChat: boolean;
  connect(): void;
  disconnect(): void;
  say(text: string): void;
  on(event: 'message', listener: (message: ChatMessage) => void): unknown;
  on(event: 'state', listener: (state: ChatState, detail: string) => void): unknown;
}

export interface TwitchBotOptions {
  engine: WheelEngine;
  username?: string | undefined;
  token?: string | undefined;
  createConnection?: (channel: string) => ChatConnection;
  now?: () => number;
}

/** Bridges Twitch chat (commands, rewards, bits) to the wheel engine and announces results. */
export class TwitchBot extends EventEmitter<{ status: [] }> {
  private readonly engine: WheelEngine;
  private readonly createConnection: (channel: string) => ChatConnection;
  private readonly now: () => number;
  private connection: ChatConnection | null = null;
  private channel = '';
  private readonly cooldowns = new Map<string, number>();
  private status: TwitchStatus = {
    state: 'disabled',
    channel: '',
    canChat: false,
    message: 'Set a Twitch channel in Settings to enable chat commands',
    unmappedRewards: [],
  };

  constructor({ engine, username, token, createConnection, now = Date.now }: TwitchBotOptions) {
    super();
    this.engine = engine;
    this.now = now;
    this.createConnection =
      createConnection ?? ((channel) => new TwitchChatClient({ channel, username, token }));

    engine.on('config', () => this.syncChannel());
    engine.on('result', (result) => this.announceResult(result));
    engine.on('raffle', (event) => this.announceRaffle(event));
  }

  getStatus(): TwitchStatus {
    return this.status;
  }

  start(): void {
    this.syncChannel();
  }

  stop(): void {
    this.connection?.disconnect();
    this.connection = null;
  }

  /** (Re)connects when the configured channel changes. */
  syncChannel(): void {
    const channel = this.engine.settings.twitch.channel;
    if (channel === this.channel) return;
    this.stop();
    this.channel = channel;
    if (!channel) {
      this.setStatus({
        state: 'disabled',
        channel: '',
        canChat: false,
        message: 'Set a Twitch channel in Settings to enable chat commands',
      });
      return;
    }
    const connection = this.createConnection(channel);
    this.connection = connection;
    connection.on('message', (message) => this.handleMessage(message));
    connection.on('state', (state, detail) => {
      if (this.connection !== connection) return;
      this.setStatus({
        state: state === 'closed' ? 'disabled' : state,
        channel,
        canChat: connection.canChat,
        message:
          state === 'connected' && !connection.canChat
            ? `${detail} (read-only: set TWITCH_BOT_USERNAME and TWITCH_OAUTH_TOKEN to announce results)`
            : detail,
      });
    });
    connection.connect();
  }

  handleMessage(message: ChatMessage): void {
    try {
      this.dispatch(message);
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
      this.engine.emit('notice', {
        level: 'error',
        message: `Chat (${message.displayName}): ${error.message}`,
      });
    }
  }

  private dispatch(message: ChatMessage): void {
    const { twitch, raffle } = this.engine.settings;

    if (message.rewardId) {
      const mapping = twitch.rewards.find((reward) => reward.rewardId === message.rewardId);
      if (mapping) {
        this.engine.enqueue({ player: message.displayName, wheelId: mapping.wheelId, source: 'reward' });
      } else {
        this.rememberReward(message);
      }
      return;
    }

    if (twitch.bits.enabled && message.bits >= twitch.bits.minimum) {
      this.engine.enqueue({
        player: message.displayName,
        wheelId: twitch.bits.wheelId || undefined,
        source: 'bits',
      });
      return;
    }

    const [word = '', ...args] = message.text.trim().split(/\s+/);
    const command = word.toLowerCase();
    const rank = roleRank(message);

    if (command === raffle.keyword.toLowerCase()) {
      this.engine.joinRaffle({
        login: message.login,
        displayName: message.displayName,
        subscriber: message.isSubscriber,
      });
      return;
    }

    if (command === '!raffle' && rank >= ROLE_RANK.moderator) {
      const action = args[0]?.toLowerCase();
      if (action === 'open') this.engine.openRaffle();
      else if (action === 'close') this.engine.closeRaffle();
      else if (action === 'draw') this.engine.drawRaffle();
      return;
    }

    // The spin command plays the active wheel (or the one a moderator names); a wheel's own
    // command ("!slots") plays that wheel. Both follow the same permission, queue and cooldown.
    const wheels = this.engine.getConfig().wheels;
    const isSpin = command === normalizeCommand(twitch.spinCommand);
    const game = isSpin ? undefined : wheelForCommand(wheels, command);
    if (!isSpin && !game) return;

    if (rank >= ROLE_RANK.moderator) {
      // Moderators pick the player, the number of spins and the wheel: !spin @viewer 5 simp
      const parsed = parseGameArgs(
        args,
        wheels.map((w) => w.id),
      );
      this.engine.enqueue({
        player: parsed.player || message.displayName,
        wheelId: game?.id ?? parsed.wheelId,
        spins: parsed.spins,
        source: 'chat',
      });
      return;
    }
    if (rank < ROLE_RANK[twitch.spinPermission]) return;
    if (this.engine.hasQueued(message.displayName)) return;
    // One cooldown per viewer for every game command, so switching commands does not skip it.
    const last = this.cooldowns.get(message.login);
    const now = this.now();
    if (last !== undefined && now - last < twitch.spinCooldownSec * 1000) return;
    this.cooldowns.set(message.login, now);
    this.engine.enqueue({ player: message.displayName, wheelId: game?.id, source: 'chat' });
  }

  private rememberReward(message: ChatMessage): void {
    const others = this.status.unmappedRewards.filter((r) => r.rewardId !== message.rewardId);
    this.setStatus({
      unmappedRewards: [
        { rewardId: message.rewardId!, user: message.displayName, text: message.text, at: this.now() },
        ...others,
      ].slice(0, MAX_UNMAPPED_REWARDS),
    });
  }

  private say(text: string): void {
    if (this.engine.settings.twitch.announceResults) this.connection?.say(text);
  }

  private announceResult(result: SpinResult): void {
    if (result.kind === 'raffle') {
      this.say(`🎟️ ${result.label} wins the raffle!`);
      return;
    }
    const who = result.player ? `@${result.player}` : 'The house';
    if (result.money) {
      // Money turns are announced once, when the turn is over.
      const money = (value: number) => formatMoney(value, this.engine.settings.currency);
      if (result.money.bust)
        this.say(`💀 ${who} hit ${result.label} and lost ${money(result.money.before)}!`);
      else if (result.payout !== null) this.say(`💰 ${who} walks away with ${money(result.payout)}!`);
      return;
    }
    const verb = result.player ? `${who} won` : 'The wheel landed on';
    this.say(`🎰 ${verb} ${result.label}!${result.followUpWheelId ? ' Spinning again…' : ''}`);
  }

  private announceRaffle(event: 'open' | 'close'): void {
    const { keyword } = this.engine.settings.raffle;
    if (event === 'open') this.say(`🎟️ The raffle is open! Type ${keyword} to enter.`);
    else
      this.say(
        `🎟️ The raffle is closed — ${this.engine.snapshot().raffle.entrants.length} entries. Good luck!`,
      );
  }

  private setStatus(patch: Partial<TwitchStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('status');
  }
}
