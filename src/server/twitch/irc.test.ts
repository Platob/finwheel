import { describe, expect, it } from 'vitest';
import { parseIrcLine, toChatMessage, unescapeTagValue } from './irc.js';

describe('parseIrcLine', () => {
  it('parses tags, prefix, command and trailing text', () => {
    const line =
      '@badge-info=;badges=moderator/1,subscriber/12;display-name=Velvet\\sViper;mod=1;subscriber=1;id=abc :velvetviper!velvetviper@velvetviper.tmi.twitch.tv PRIVMSG #finchan :!spin @Ana 5';
    const message = parseIrcLine(line)!;
    expect(message.command).toBe('PRIVMSG');
    expect(message.params).toEqual(['#finchan', '!spin @Ana 5']);
    expect(message.tags['display-name']).toBe('Velvet Viper');
    expect(toChatMessage(message)).toMatchObject({
      login: 'velvetviper',
      displayName: 'Velvet Viper',
      channel: 'finchan',
      text: '!spin @Ana 5',
      isModerator: true,
      isSubscriber: true,
      isBroadcaster: false,
      rewardId: null,
      bits: 0,
    });
  });

  it('reads channel-point rewards, bits and /me actions', () => {
    const reward = toChatMessage(
      parseIrcLine('@custom-reward-id=1234-abcd;display-name=Ana :ana!ana@ana PRIVMSG #c :lucky me')!,
    );
    expect(reward).toMatchObject({ rewardId: '1234-abcd', text: 'lucky me' });
    const cheer = toChatMessage(
      parseIrcLine('@bits=500;badges=founder/0 :bo!bo@bo PRIVMSG #c :cheer500 spin!')!,
    );
    expect(cheer).toMatchObject({ bits: 500, isSubscriber: true });
    const action = toChatMessage(parseIrcLine(':bo!bo@bo PRIVMSG #c :\u0001ACTION waves\u0001')!);
    expect(action?.text).toBe('waves');
  });

  it('handles PING and ignores blank lines', () => {
    expect(parseIrcLine('PING :tmi.twitch.tv')).toEqual({
      tags: {},
      prefix: null,
      command: 'PING',
      params: ['tmi.twitch.tv'],
    });
    expect(parseIrcLine('   ')).toBeNull();
  });

  it('unescapes tag values', () => {
    expect(unescapeTagValue('a\\sb\\:c\\\\d')).toBe('a b;c\\d');
  });
});
