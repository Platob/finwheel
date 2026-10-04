import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfigSchema, PrizeSchema, WheelSchema } from './schema.js';

const prizes = [{ id: 'p', label: '$5', weight: 1, cash: 5 }];
const wheel = (id: string, patch: Record<string, unknown> = {}) => ({ id, name: id, prizes, ...patch });

/** Messages of a config that does not parse, as "path: message". */
function issues(input: unknown): string[] {
  const result = ConfigSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('WheelSchema', () => {
  it('plays the wheel by default, without a chat command', () => {
    const parsed = WheelSchema.parse(wheel('w'));
    expect(parsed.game).toBe('wheel');
    expect(parsed).not.toHaveProperty('command');
  });

  it('accepts the mini-games and tidies the chat command', () => {
    const parsed = WheelSchema.parse(wheel('w', { game: 'plinko', command: '  !Simp-Drop_2 ' }));
    expect(parsed).toMatchObject({ game: 'plinko', command: '!simp-drop_2' });
    expect(WheelSchema.safeParse(wheel('w', { game: 'roulette' })).success).toBe(false);
  });

  it.each(['slots', '!', '!two words', '!émoji', `!${'x'.repeat(25)}`, '!!slots', ''])(
    'rejects the chat command %j',
    (command) => {
      const result = WheelSchema.safeParse(wheel('w', { command }));
      expect(result.success).toBe(false);
      expect(result.error!.issues[0]).toMatchObject({ path: ['command'] });
    },
  );
});

describe('PrizeSchema icons', () => {
  const prize = (icon: unknown) => PrizeSchema.safeParse({ id: 'p', label: 'P', weight: 1, icon });

  it('takes an emoji or a short symbol', () => {
    expect(prize(' 🐷 ').data?.icon).toBe('🐷');
    expect(prize('👩‍👩‍👧').success).toBe(true);
    expect(prize('VIP').success).toBe(true);
  });

  it('counts code points and refuses empty or long icons', () => {
    expect(prize('💰'.repeat(8)).success).toBe(true);
    expect(prize('💰'.repeat(9)).success).toBe(false);
    expect(prize('  ').success).toBe(false);
  });
});

describe('ConfigSchema chat commands', () => {
  const config = (wheels: unknown[], twitch: Record<string, unknown> = {}, raffle = {}) => ({
    activeWheelId: 'a',
    wheels,
    settings: { twitch, raffle },
  });

  it('accepts distinct commands', () => {
    expect(
      issues(config([wheel('a', { command: '!slots' }), wheel('b', { command: '!claw' }), wheel('c')])),
    ).toEqual([]);
  });

  it('reports both wheels of a duplicate, whatever the case', () => {
    expect(issues(config([wheel('a', { command: '!slots' }), wheel('b', { command: '!SLOTS' })]))).toEqual([
      'wheels.0.command: "!slots" is already used by "b"',
      'wheels.1.command: "!slots" is already used by "a"',
    ]);
  });

  it('refuses the spin command, the raffle keyword and !raffle', () => {
    expect(issues(config([wheel('a', { command: '!spin' })]))).toEqual([
      'wheels.0.command: "!spin" is already the spin command',
    ]);
    expect(issues(config([wheel('a', { command: '!go' })], { spinCommand: ' !GO ' }))).toEqual([
      'wheels.0.command: "!go" is already the spin command',
    ]);
    expect(issues(config([wheel('a', { command: '!join' })]))).toEqual([
      'wheels.0.command: "!join" is already the raffle keyword',
    ]);
    expect(issues(config([wheel('a', { command: '!raffle' })]))).toEqual([
      'wheels.0.command: "!raffle" is the moderators\' raffle command',
    ]);
  });

  it('reports a badly formed command once', () => {
    expect(issues(config([wheel('a', { command: 'slots' }), wheel('b', { command: 'slots' })]))).toEqual([
      'wheels.0.command: Use "!" followed by letters, numbers, "-" or "_"',
      'wheels.1.command: Use "!" followed by letters, numbers, "-" or "_"',
    ]);
  });
});

describe('default config', () => {
  const raw = JSON.parse(readFileSync('config/default.config.json', 'utf8')) as unknown;

  it('parses', () => {
    expect(issues(raw)).toEqual([]);
  });

  it('ships the four mini-games with their chat commands, ids usable in chat', () => {
    const { wheels } = ConfigSchema.parse(raw);
    const games = wheels.filter((w) => w.game !== 'wheel');
    expect(games.map((w) => [w.id, w.game, w.command, w.spinsPerTurn])).toEqual([
      ['loser-slots', 'slots', '!slots', 3],
      ['loser-claw', 'claw', '!claw', 3],
      ['simp-drop', 'plinko', '!drop', 3],
      ['mystery-gifts', 'gifts', '!gift', 1],
    ]);
    for (const game of games) {
      expect(game.subtitle).not.toBe('');
      // Chat reads 1–2 digit words as a spin count, so a wheel id must not look like one.
      expect(game.id).toMatch(/^[a-z][a-z0-9-]*$/);
      for (const prize of game.prizes) expect(prize.icon, `${game.id}/${prize.id}`).toBeTruthy();
    }
  });
});
