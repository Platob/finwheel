import { describe, expect, it } from 'vitest';
import { normalizeCommand, wheelCommandIssue, wheelForCommand } from './chat-commands.js';

const words = { spinCommand: '!spin', raffleKeyword: '!join' };
const wheels = [
  { name: 'Loser Slots', command: '!slots' },
  { name: 'Simp Drop', command: '!Drop' },
  { name: 'Broke Boi' },
];

describe('wheelCommandIssue', () => {
  it('is null for a free command or none', () => {
    expect(wheelCommandIssue(wheels, 0, words)).toBeNull();
    expect(wheelCommandIssue(wheels, 2, words)).toBeNull();
    expect(wheelCommandIssue([{ name: 'A', command: ' !Claw ' }], 0, words)).toBeNull();
  });

  it('explains the format', () => {
    for (const command of ['', 'slots', '!', '!a b', `!${'a'.repeat(25)}`]) {
      expect(wheelCommandIssue([{ name: 'A', command }], 0, words)).toMatch(/^Use "!"/);
    }
  });

  it('names what already uses the word', () => {
    const one = (command: string, w = words) =>
      wheelCommandIssue([...wheels, { name: 'New', command }], 3, w);
    expect(one('!DROP')).toBe('"!drop" is already used by "Simp Drop"');
    expect(one('!spin')).toBe('"!spin" is already the spin command');
    expect(one('!play', { spinCommand: ' !Play', raffleKeyword: '!join' })).toBe(
      '"!play" is already the spin command',
    );
    expect(one('!join')).toBe('"!join" is already the raffle keyword');
    expect(one('!raffle')).toBe('"!raffle" is the moderators\' raffle command');
  });
});

describe('wheelForCommand', () => {
  it('finds the wheel of a chat word, in any case', () => {
    expect(wheelForCommand(wheels, '!SLOTS')?.name).toBe('Loser Slots');
    expect(wheelForCommand(wheels, '!drop')?.name).toBe('Simp Drop');
    expect(wheelForCommand(wheels, '!claw')).toBeUndefined();
    expect(wheelForCommand(wheels, '')).toBeUndefined();
  });

  it('normalizes like chat', () => {
    expect(normalizeCommand('  !Gift ')).toBe('!gift');
  });
});
