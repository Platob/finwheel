/** Minimal IRCv3 parser for Twitch chat lines. */
export interface IrcMessage {
  tags: Record<string, string>;
  prefix: string | null;
  command: string;
  params: string[];
}

const TAG_ESCAPES: Record<string, string> = { ':': ';', s: ' ', '\\': '\\', r: '\r', n: '\n' };

export function unescapeTagValue(value: string): string {
  return value.replace(/\\(.?)/g, (_, char: string) => TAG_ESCAPES[char] ?? char);
}

export function parseIrcLine(line: string): IrcMessage | null {
  let rest = line.trim();
  if (!rest) return null;

  const tags: Record<string, string> = {};
  if (rest.startsWith('@')) {
    const end = rest.indexOf(' ');
    if (end < 0) return null;
    for (const pair of rest.slice(1, end).split(';')) {
      const eq = pair.indexOf('=');
      if (eq < 0) tags[pair] = '';
      else tags[pair.slice(0, eq)] = unescapeTagValue(pair.slice(eq + 1));
    }
    rest = rest.slice(end + 1).trimStart();
  }

  let prefix: string | null = null;
  if (rest.startsWith(':')) {
    const end = rest.indexOf(' ');
    if (end < 0) return null;
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1).trimStart();
  }

  const params: string[] = [];
  const trailingAt = rest.indexOf(' :');
  const head = trailingAt >= 0 ? rest.slice(0, trailingAt) : rest;
  const [command, ...middle] = head.split(' ').filter(Boolean);
  if (!command) return null;
  params.push(...middle);
  if (trailingAt >= 0) params.push(rest.slice(trailingAt + 2));

  return { tags, prefix, command: command.toUpperCase(), params };
}

export function nickFromPrefix(prefix: string | null): string {
  if (!prefix) return '';
  const bang = prefix.indexOf('!');
  return (bang >= 0 ? prefix.slice(0, bang) : prefix).toLowerCase();
}

export interface ChatMessage {
  id: string;
  channel: string;
  login: string;
  displayName: string;
  text: string;
  badges: Set<string>;
  isBroadcaster: boolean;
  isModerator: boolean;
  isVip: boolean;
  isSubscriber: boolean;
  /** Channel-point reward id (only present for rewards that ask the viewer for text). */
  rewardId: string | null;
  bits: number;
}

export function toChatMessage(message: IrcMessage): ChatMessage | null {
  if (message.command !== 'PRIVMSG' || message.params.length < 2) return null;
  const { tags } = message;
  const login = nickFromPrefix(message.prefix);
  const badges = new Set(
    (tags['badges'] ?? '')
      .split(',')
      .filter(Boolean)
      .map((badge) => badge.split('/')[0]!),
  );
  let text = message.params[1] ?? '';
  // "/me" actions arrive wrapped in CTCP ACTION markers.
  const CTCP = '\u0001';
  if (text.startsWith(`${CTCP}ACTION `) && text.endsWith(CTCP)) text = text.slice(8, -1);

  return {
    id: tags['id'] ?? '',
    channel: (message.params[0] ?? '').replace(/^#/, ''),
    login,
    displayName: tags['display-name'] || login,
    text,
    badges,
    isBroadcaster: badges.has('broadcaster'),
    isModerator: tags['mod'] === '1' || badges.has('moderator'),
    isVip: tags['vip'] === '1' || badges.has('vip'),
    isSubscriber: tags['subscriber'] === '1' || badges.has('subscriber') || badges.has('founder'),
    rewardId: tags['custom-reward-id'] || null,
    bits: Number.parseInt(tags['bits'] ?? '0', 10) || 0,
  };
}
