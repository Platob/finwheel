import type { Command } from '../../shared/schema';
import type { AppState, Notice, ServerMessage } from '../../shared/types';

export interface ConnectionHandlers {
  onState(state: AppState): void;
  onNotice?(notice: Notice): void;
  onStatus?(connected: boolean): void;
}

export interface Connection {
  send(command: Command): void;
  close(): void;
}

/** Token passed to the page as ?token=… (only needed when FINWHEEL_TOKEN is set). */
export function pageToken(): string | null {
  return new URLSearchParams(location.search).get('token');
}

/** Connects to the FinWheel server and reconnects forever with a capped backoff. */
export function connect(handlers: ConnectionHandlers): Connection {
  const url = new URL('/ws', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = pageToken();
  if (token) url.searchParams.set('token', token);

  let socket: WebSocket | null = null;
  let attempt = 0;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      handlers.onStatus?.(true);
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === 'state') handlers.onState(message.state);
      else handlers.onNotice?.(message.notice);
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      handlers.onStatus?.(false);
      if (!closed) retryTimer = setTimeout(open, Math.min(5000, 400 * 2 ** attempt++));
    };
  };
  open();

  return {
    send(command) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
      else handlers.onNotice?.({ level: 'error', message: 'Not connected to the FinWheel server' });
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
