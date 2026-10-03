import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigSchema } from '../../shared/schema.js';
import { SETTLE_MS, WheelEngine } from '../engine.js';
import { TwitchBot, type ChatConnection } from './bot.js';
import type { ChatMessage } from './irc.js';

class FakeConnection extends EventEmitter implements ChatConnection {
  readonly said: string[] = [];
  constructor(readonly canChat = true) {
    super();
  }
  connect() {
    this.emit('state', 'connected', 'Connected');
  }
  disconnect() {}
  say(text: string) {
    this.said.push(text);
  }
}

function chat(text: string, patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm',
    channel: 'finchan',
    login: 'viewer',
    displayName: 'Viewer',
    text,
    badges: new Set(),
    isBroadcaster: false,
    isModerator: false,
    isVip: false,
    isSubscriber: false,
    rewardId: null,
    bits: 0,
    ...patch,
  };
}

function setup(settings: Record<string, unknown> = {}) {
  const config = ConfigSchema.parse({
    activeWheelId: 'main',
    wheels: [
      {
        id: 'main',
        name: 'Main',
        spinsPerTurn: 1,
        prizes: [{ id: 'five', label: '$5', weight: 1, cash: 5 }],
      },
      { id: 'vip', name: 'VIP', prizes: [{ id: 'x', label: 'X', weight: 1 }] },
    ],
    settings: {
      spin: { autoAdvanceQueue: false },
      twitch: { channel: 'finchan', ...settings },
      raffle: { subscriberTickets: 2 },
    },
  });
  let now = 1_000_000;
  const engine = new WheelEngine({ config, random: () => 0.5 });
  const connection = new FakeConnection();
  const bot = new TwitchBot({ engine, createConnection: () => connection, now: () => now });
  bot.start();
  return { engine, bot, connection, advance: (ms: number) => (now += ms) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('TwitchBot', () => {
  it('connects to the configured channel', () => {
    const { bot } = setup();
    expect(bot.getStatus()).toMatchObject({ state: 'connected', channel: 'finchan', canChat: true });
  });

  it('enters viewers in an open raffle, with subscriber tickets', () => {
    const { engine, bot } = setup();
    bot.handleMessage(chat('!join'));
    expect(engine.snapshot().raffle.entrants).toHaveLength(0);
    engine.openRaffle();
    bot.handleMessage(chat('!join'));
    bot.handleMessage(chat('!JOIN please', { login: 'sub', displayName: 'Sub', isSubscriber: true }));
    expect(engine.snapshot().raffle).toMatchObject({ totalTickets: 3 });
  });

  it('lets moderators queue spins with a player, spin count and wheel', () => {
    const { engine, bot } = setup();
    bot.handleMessage(chat('!spin @Ana 5 vip', { isModerator: true }));
    expect(engine.snapshot().queue[0]).toMatchObject({
      player: 'Ana',
      spins: 5,
      wheelId: 'vip',
      source: 'chat',
    });
    bot.handleMessage(chat('!spin', { isModerator: true, displayName: 'Mod' }));
    expect(engine.snapshot().queue[1]).toMatchObject({ player: 'Mod', wheelId: 'main' });
  });

  it('applies the spin permission and per-viewer cooldown', () => {
    const { engine, bot, advance } = setup({ spinPermission: 'everyone', spinCooldownSec: 60 });
    bot.handleMessage(chat('!spin @SomeoneElse 9'));
    expect(engine.snapshot().queue).toMatchObject([{ player: 'Viewer' }]);
    engine.clearQueue();
    bot.handleMessage(chat('!spin'));
    expect(engine.snapshot().queue).toHaveLength(0);
    advance(61_000);
    bot.handleMessage(chat('!spin'));
    expect(engine.snapshot().queue).toHaveLength(1);
  });

  it('ignores viewers below the required role', () => {
    const { engine, bot } = setup({ spinPermission: 'subscriber' });
    bot.handleMessage(chat('!spin'));
    bot.handleMessage(chat('!raffle open'));
    expect(engine.snapshot().queue).toHaveLength(0);
    expect(engine.isRaffleOpen()).toBe(false);
  });

  it('maps channel-point rewards and remembers unmapped ones', () => {
    const { engine, bot } = setup({ rewards: [{ rewardId: 'r-1', wheelId: 'vip' }] });
    bot.handleMessage(chat('hi', { rewardId: 'r-1' }));
    expect(engine.snapshot().queue[0]).toMatchObject({ wheelId: 'vip', source: 'reward' });
    bot.handleMessage(chat('hello', { rewardId: 'r-2', displayName: 'Bo' }));
    expect(bot.getStatus().unmappedRewards).toMatchObject([{ rewardId: 'r-2', user: 'Bo' }]);
  });

  it('turns big enough cheers into spins', () => {
    const { engine, bot } = setup({ bits: { enabled: true, minimum: 100 } });
    bot.handleMessage(chat('cheer50', { bits: 50 }));
    bot.handleMessage(chat('cheer100', { bits: 100 }));
    expect(engine.snapshot().queue).toMatchObject([{ source: 'bits', player: 'Viewer' }]);
  });

  it('announces raffle events and money payouts', () => {
    const { engine, bot, connection } = setup();
    bot.handleMessage(chat('!raffle open', { isBroadcaster: true }));
    expect(connection.said.at(-1)).toContain('!join');
    engine.requestSpin({ player: 'Ana', source: 'manual' });
    vi.advanceTimersByTime(engine.snapshot().spin!.durationMs + SETTLE_MS);
    expect(connection.said.at(-1)).toBe('💰 @Ana walks away with $5!');
  });
});
