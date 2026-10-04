import { createReadStream, existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AppState, Notice, ServerMessage, SpinSource, TwitchStatus } from '../shared/types.js';
import { runCommand } from './commands.js';
import { EngineError, type WheelEngine } from './engine.js';
import { MAX_MEDIA_BYTES, MediaError, MediaStore, mediaTypeOf } from './media.js';
import type { Security } from './security.js';
import { serveStatic } from './static.js';

const MAX_BODY_BYTES = 1024 * 1024;
const BROADCAST_DELAY_MS = 16;
const HEARTBEAT_MS = 30_000;

export interface TwitchStatusSource {
  getStatus(): TwitchStatus;
  on(event: 'status', listener: () => void): unknown;
  off(event: 'status', listener: () => void): unknown;
}

export interface AppOptions {
  engine: WheelEngine;
  twitch: TwitchStatusSource;
  security: Security;
  /** Folder with the built overlay and dock (dist/web). */
  webRoot: string;
  /** Folder for uploaded images (<data>/media). */
  mediaDir: string;
  version: string;
}

interface Client {
  socket: WebSocket;
  control: boolean;
  alive: boolean;
}

export interface App {
  server: Server;
  close(): Promise<void>;
}

export function createApp({ engine, twitch, security, webRoot, mediaDir, version }: AppOptions): App {
  const media = new MediaStore(mediaDir);
  const clients = new Set<Client>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY_BYTES });
  let broadcastTimer: ReturnType<typeof setTimeout> | null = null;

  const buildState = (control: boolean): AppState => ({
    ...engine.snapshot(),
    twitch: twitch.getStatus(),
    serverTime: Date.now(),
    readOnly: !control,
  });

  const send = (client: Client, message: ServerMessage) => {
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(message));
  };

  const broadcastState = () => {
    broadcastTimer = null;
    const payloads = new Map<boolean, string>();
    for (const client of clients) {
      let payload = payloads.get(client.control);
      if (!payload) {
        payload = JSON.stringify({
          type: 'state',
          state: buildState(client.control),
        } satisfies ServerMessage);
        payloads.set(client.control, payload);
      }
      if (client.socket.readyState === client.socket.OPEN) client.socket.send(payload);
    }
  };

  const scheduleBroadcast = () => {
    broadcastTimer ??= setTimeout(broadcastState, BROADCAST_DELAY_MS);
  };

  const notifyControllers = (notice: Notice) => {
    for (const client of clients) if (client.control) send(client, { type: 'notice', notice });
  };

  engine.on('change', scheduleBroadcast);
  engine.on('notice', notifyControllers);
  twitch.on('status', scheduleBroadcast);

  const execute = (raw: unknown, source: SpinSource): Notice | null => {
    try {
      return runCommand(engine, raw, source);
    } catch (error) {
      if (error instanceof EngineError) throw error;
      console.error('[finwheel] Command failed:', error);
      throw new EngineError('Unexpected server error, see the server log');
    }
  };

  // ── HTTP ──────────────────────────────────────────────────────────────

  const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const verdict = security.checkRequest(req);
    if (!verdict.ok) return sendJson(res, verdict.status, { ok: false, error: verdict.reason });

    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;

    if (pathname === '/api/health') return sendJson(res, 200, { ok: true, name: 'finwheel', version });
    if (pathname === '/api/state' && req.method === 'GET') {
      return sendJson(res, 200, buildState(security.hasControl(req, url)));
    }
    if (pathname === '/api/command') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Use POST' });
      if (!req.headers['content-type']?.startsWith('application/json')) {
        return sendJson(res, 415, { ok: false, error: 'Content-Type must be application/json' });
      }
      if (!security.hasControl(req, url))
        return sendJson(res, 401, { ok: false, error: 'Missing or bad token' });
      const raw = await readBody(req, MAX_BODY_BYTES);
      if (!raw) return sendJson(res, 413, { ok: false, error: 'Request body too large' });
      let body: unknown;
      try {
        body = JSON.parse(raw.toString('utf8') || '{}');
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: (error as Error).message });
      }
      try {
        return sendJson(res, 200, { ok: true, notice: execute(body, 'api') });
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: (error as Error).message });
      }
    }
    if (pathname === '/api/media') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Use POST' });
      if (!security.hasControl(req, url))
        return sendJson(res, 401, { ok: false, error: 'Missing or bad token' });
      const type = mediaTypeOf(req.headers['content-type']);
      if (!type) return sendJson(res, 415, { ok: false, error: 'Upload a JPEG, PNG, WebP or GIF image' });
      const data = await readBody(req, MAX_MEDIA_BYTES);
      if (!data) return sendJson(res, 413, { ok: false, error: 'Images are limited to 8 MB' });
      try {
        return sendJson(res, 200, { ok: true, url: `/media/${await media.save(type, data)}` });
      } catch (error) {
        if (error instanceof MediaError) return sendJson(res, 415, { ok: false, error: error.message });
        throw error;
      }
    }
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'Not found' });

    if (req.method !== 'GET' && req.method !== 'HEAD')
      return sendJson(res, 405, { ok: false, error: 'Use GET' });
    if (pathname.startsWith('/media/')) {
      const file = await media.find(pathname.slice('/media/'.length));
      if (!file) return sendJson(res, 404, { ok: false, error: 'Not found' });
      res.writeHead(200, {
        'Content-Type': file.type,
        'Content-Length': file.size,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file.path);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
      return;
    }
    if (pathname === '/') {
      res.writeHead(302, { Location: `/dock/${url.search}` });
      return res.end();
    }

    const page = pathname.match(/^\/(overlay|dock)\/?$/)?.[1];
    if (!existsSync(webRoot)) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(
        'FinWheel web assets are not built yet.\nRun "npm run build", or use "npm run dev" and open http://localhost:5173/.',
      );
    }
    if (await serveStatic(req, res, webRoot, page ? join(page, 'index.html') : pathname)) return;
    sendJson(res, 404, { ok: false, error: 'Not found' });
  };

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error: unknown) => {
      console.error('[finwheel] Request failed:', error);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Internal error' });
      else res.destroy();
    });
  });

  // ── WebSocket ─────────────────────────────────────────────────────────

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const verdict = security.checkRequest(req);
    if (url.pathname !== '/ws' || !verdict.ok) {
      socket.write(`HTTP/1.1 ${verdict.ok ? '404 Not Found' : '403 Forbidden'}\r\nConnection: close\r\n\r\n`);
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { socket: ws, control: security.hasControl(req, url), alive: true };
      clients.add(client);
      send(client, { type: 'state', state: buildState(client.control) });

      ws.on('pong', () => (client.alive = true));
      ws.on('close', () => clients.delete(client));
      ws.on('error', () => clients.delete(client));
      ws.on('message', (data) => {
        if (!client.control) {
          return send(client, {
            type: 'notice',
            notice: { level: 'error', message: 'Read-only connection: open the dock with ?token=…' },
          });
        }
        try {
          const notice = execute(JSON.parse(data.toString()), 'manual');
          if (notice) send(client, { type: 'notice', notice });
        } catch (error) {
          send(client, { type: 'notice', notice: { level: 'error', message: (error as Error).message } });
        }
      });
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.socket.terminate();
        clients.delete(client);
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    server,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        if (broadcastTimer) clearTimeout(broadcastTimer);
        engine.off('change', scheduleBroadcast);
        engine.off('notice', notifyControllers);
        twitch.off('status', scheduleBroadcast);
        for (const client of clients) client.socket.terminate();
        wss.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

/** Reads a body of at most `limit` bytes; resolves null when it is larger (the rest is drained). */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  if (Number(req.headers['content-length']) > limit) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        return resolve(null);
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
