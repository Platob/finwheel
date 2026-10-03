import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { parseIrcLine, toChatMessage, nickFromPrefix, type ChatMessage } from './irc.js';

const TWITCH_IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const MAX_BACKOFF_MS = 30_000;
/** Twitch pings every ~5 minutes; treat a longer silence as a dead connection. */
const IDLE_TIMEOUT_MS = 6 * 60_000;
/** Spacing between outgoing chat messages to stay well under Twitch rate limits. */
const SAY_INTERVAL_MS = 1600;

export type ChatState = 'connecting' | 'connected' | 'error' | 'closed';

export interface ChatClientOptions {
  channel: string;
  /** Bot account; when omitted the client joins anonymously (read-only). */
  username?: string | undefined;
  token?: string | undefined;
}

interface ChatClientEvents {
  message: [ChatMessage];
  state: [ChatState, string];
}

/** Read (and optionally write) Twitch chat over the IRC WebSocket gateway. */
export class TwitchChatClient extends EventEmitter<ChatClientEvents> {
  private socket: WebSocket | null = null;
  private stopped = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly outbox: string[] = [];
  private outboxTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly channel: string;
  private readonly username: string;
  private readonly token: string | null;

  constructor(options: ChatClientOptions) {
    super();
    this.channel = options.channel.toLowerCase();
    const token = options.token?.trim();
    const authenticated = Boolean(options.username && token);
    this.username = authenticated
      ? options.username!.toLowerCase()
      : `justinfan${Math.floor(10000 + Math.random() * 80000)}`;
    this.token = authenticated ? (token!.startsWith('oauth:') ? token! : `oauth:${token}`) : null;
  }

  get canChat(): boolean {
    return this.token !== null;
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    for (const timer of [this.reconnectTimer, this.idleTimer, this.outboxTimer])
      if (timer) clearTimeout(timer);
    this.outbox.length = 0;
    this.socket?.removeAllListeners();
    this.socket?.on('error', () => {});
    this.socket?.close();
    this.socket = null;
    this.emit('state', 'closed', '');
  }

  say(text: string): void {
    if (!this.canChat) return;
    this.outbox.push(text.replace(/[\r\n]+/g, ' ').slice(0, 450));
    this.drainOutbox();
  }

  private drainOutbox(): void {
    if (this.outboxTimer || this.outbox.length === 0) return;
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(`PRIVMSG #${this.channel} :${this.outbox.shift()}`);
    this.outboxTimer = setTimeout(() => {
      this.outboxTimer = null;
      this.drainOutbox();
    }, SAY_INTERVAL_MS);
  }

  private open(): void {
    this.emit('state', 'connecting', `Connecting to #${this.channel}…`);
    const socket = new WebSocket(TWITCH_IRC_URL);
    this.socket = socket;

    socket.on('open', () => {
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      socket.send(`PASS ${this.token ?? 'SCHMOOPIIE'}`);
      socket.send(`NICK ${this.username}`);
      socket.send(`JOIN #${this.channel}`);
      this.touch();
    });
    socket.on('message', (data) => {
      this.touch();
      for (const line of data.toString().split('\r\n')) this.handleLine(line);
    });
    socket.on('error', (error) => this.emit('state', 'error', error.message));
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  private handleLine(line: string): void {
    const message = parseIrcLine(line);
    if (!message) return;
    switch (message.command) {
      case 'PING':
        this.socket?.send(`PONG :${message.params[0] ?? 'tmi.twitch.tv'}`);
        break;
      case 'JOIN':
        if (nickFromPrefix(message.prefix) === this.username) {
          this.attempts = 0;
          this.emit('state', 'connected', `Connected to #${this.channel}`);
          this.drainOutbox();
        }
        break;
      case 'NOTICE':
        if (/authentication failed|improperly formatted auth/i.test(message.params[1] ?? '')) {
          this.emit('state', 'error', 'Twitch rejected the OAuth token (check TWITCH_OAUTH_TOKEN)');
          this.stopped = true;
          this.socket?.close();
        }
        break;
      case 'RECONNECT':
        this.socket?.close();
        break;
      case 'PRIVMSG': {
        const chat = toChatMessage(message);
        if (chat) this.emit('message', chat);
        break;
      }
    }
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.socket?.terminate(), IDLE_TIMEOUT_MS);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempts++);
    this.emit('state', 'connecting', `Reconnecting in ${Math.round(delay / 1000)}s…`);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }
}
