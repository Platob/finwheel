import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { request, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ConfigSchema } from '../shared/schema.js';
import type { TwitchStatus } from '../shared/types.js';
import { createApp, type App } from './app.js';
import { WheelEngine } from './engine.js';
import { Security } from './security.js';

const twitch = Object.assign(new EventEmitter(), {
  getStatus: (): TwitchStatus => ({
    state: 'disabled',
    channel: '',
    canChat: false,
    message: '',
    unmappedRewards: [],
  }),
});

let app: App | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

async function start(token: string | null = null) {
  const webRoot = mkdtempSync(join(tmpdir(), 'finwheel-web-'));
  const mediaDir = join(mkdtempSync(join(tmpdir(), 'finwheel-data-')), 'media');
  mkdirSync(join(webRoot, 'overlay'));
  writeFileSync(join(webRoot, 'overlay', 'index.html'), '<h1>overlay</h1>');
  const config = ConfigSchema.parse({
    activeWheelId: 'main',
    wheels: [{ id: 'main', name: 'Main', prizes: [{ id: 'a', label: 'A', weight: 1 }] }],
  });
  const engine = new WheelEngine({ config });
  app = createApp({
    engine,
    twitch,
    security: new Security({ bindHost: '127.0.0.1', token, allowedOrigins: [] }),
    webRoot,
    mediaDir,
    version: 'test',
  });
  await new Promise<void>((resolve) => app!.server.listen(0, '127.0.0.1', resolve));
  return { engine, mediaDir, port: (app.server.address() as AddressInfo).port };
}

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
  raw: Buffer;
}

function call(
  port: number,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    /** Sent as is, or as consecutive chunks (chunked encoding) when given an array. */
    body?: string | Buffer | Buffer[];
  } = {},
) {
  return new Promise<Reply>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: raw.toString('utf8'), raw });
          req.destroy();
        });
      },
    );
    req.on('error', reject);
    if (Array.isArray(options.body)) {
      for (const chunk of options.body) req.write(chunk);
      req.end();
    } else {
      req.end(options.body);
    }
  });
}

const json = { 'Content-Type': 'application/json' };

describe('HTTP API', () => {
  it('serves health, pages and state', async () => {
    const { port } = await start();
    expect(JSON.parse((await call(port, '/api/health')).body)).toMatchObject({ ok: true, version: 'test' });
    expect((await call(port, '/overlay')).body).toContain('overlay');
    expect(JSON.parse((await call(port, '/api/state')).body)).toMatchObject({
      stage: 'idle',
      readOnly: false,
    });
  });

  it('runs commands', async () => {
    const { port, engine } = await start();
    const res = await call(port, '/api/command', {
      method: 'POST',
      headers: json,
      body: '{"type":"spin","player":"Ana"}',
    });
    expect(res.status).toBe(200);
    expect(engine.getStage()).toBe('spinning');
    engine.dispose();
  });

  it('rejects invalid commands and non-JSON bodies', async () => {
    const { port } = await start();
    expect(
      (await call(port, '/api/command', { method: 'POST', headers: json, body: '{"type":"nope"}' })).status,
    ).toBe(400);
    expect(
      (
        await call(port, '/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: '{}',
        })
      ).status,
    ).toBe(415);
  });

  it('blocks foreign hosts (DNS rebinding) and cross-site origins', async () => {
    const { port } = await start();
    expect((await call(port, '/api/state', { headers: { Host: 'evil.example:4747' } })).status).toBe(403);
    const crossSite = await call(port, '/api/command', {
      method: 'POST',
      headers: { ...json, Origin: 'https://evil.example' },
      body: '{"type":"spin"}',
    });
    expect(crossSite.status).toBe(403);
    expect(
      (await call(port, '/api/health', { headers: { Origin: `http://localhost:${port}` } })).status,
    ).toBe(200);
  });

  it('requires the token for control when one is configured', async () => {
    const { port } = await start('s3cret');
    const body = '{"type":"overlay.toggle"}';
    expect((await call(port, '/api/command', { method: 'POST', headers: json, body })).status).toBe(401);
    expect(
      (
        await call(port, '/api/command', {
          method: 'POST',
          headers: { ...json, Authorization: 'Bearer s3cret' },
          body,
        })
      ).status,
    ).toBe(200);
    expect(JSON.parse((await call(port, '/api/state')).body).readOnly).toBe(true);
  });

  it('does not serve files outside the web root', async () => {
    const { port } = await start();
    expect((await call(port, '/..%2f..%2fetc%2fpasswd')).status).toBe(404);
  });
});

describe('media uploads', () => {
  const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n\0\0\0\rIHDR', 'latin1'), Buffer.alloc(64, 7)]);
  const jpeg = Buffer.concat([Buffer.from('\xff\xd8\xff\xe0\0\x10JFIF\0', 'latin1'), Buffer.alloc(64, 9)]);
  const upload = (
    port: number,
    type: string,
    body: Buffer | Buffer[],
    headers: Record<string, string> = {},
  ) => call(port, '/api/media', { method: 'POST', headers: { 'Content-Type': type, ...headers }, body });

  it('stores an image and serves it back with safe headers', async () => {
    const { port, mediaDir } = await start();
    const res = await upload(port, 'image/png', png);
    expect(res.status).toBe(200);
    const { ok, url } = JSON.parse(res.body) as { ok: boolean; url: string };
    expect(ok).toBe(true);
    expect(url).toMatch(/^\/media\/[0-9a-f]{24}\.png$/);
    expect(JSON.parse((await upload(port, 'image/png', png)).body).url).toBe(url);
    expect(readdirSync(mediaDir)).toHaveLength(1);

    const got = await call(port, url);
    expect(got.status).toBe(200);
    expect(got.raw).toEqual(png);
    expect(got.headers).toMatchObject({
      'content-type': 'image/png',
      'content-length': String(png.length),
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=31536000, immutable',
    });
    const head = await call(port, url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.raw.length).toBe(0);
    expect((await call(port, url, { method: 'DELETE' })).status).toBe(405);
  });

  it('requires the control token', async () => {
    const { port } = await start('s3cret');
    expect((await upload(port, 'image/png', png)).status).toBe(401);
    expect((await upload(port, 'image/png', png, { Authorization: 'Bearer nope' })).status).toBe(401);
    expect((await upload(port, 'image/png', png, { Authorization: 'Bearer s3cret' })).status).toBe(200);
    const viaQuery = await call(port, '/api/media?token=s3cret', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: jpeg,
    });
    expect(viaQuery.status).toBe(200);
    // Serving needs no token: OBS loads the photos without one.
    expect((await call(port, JSON.parse(viaQuery.body).url)).status).toBe(200);
  });

  it('accepts only real images of the declared type', async () => {
    const { port, mediaDir } = await start();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(port, 'image/svg+xml', svg)).status).toBe(415);
    expect((await upload(port, 'image/png', svg)).status).toBe(415);
    expect((await upload(port, 'image/png', jpeg)).status).toBe(415);
    expect((await upload(port, 'text/html', Buffer.from('<h1>hi</h1>'))).status).toBe(415);
    expect((await upload(port, 'image/gif', Buffer.alloc(0))).status).toBe(415);
    expect((await call(port, '/api/media')).status).toBe(405);
    expect(existsSync(mediaDir)).toBe(false);
  });

  it('refuses images over 8 MB', async () => {
    const { port } = await start();
    const declared = await upload(port, 'image/png', Buffer.alloc(0), {
      'Content-Length': String(8 * 1024 * 1024 + 1),
    });
    expect(declared.status).toBe(413);
    const megabyte = Buffer.alloc(1024 * 1024);
    const streamed = await upload(port, 'image/png', [png, ...Array<Buffer>(8).fill(megabyte)]);
    expect(streamed.status).toBe(413);
    const fits = Buffer.concat([png, Buffer.alloc(8 * 1024 * 1024 - png.length)]);
    expect((await upload(port, 'image/png', fits)).status).toBe(200);
  });

  it('serves only stored files', async () => {
    const { port, mediaDir } = await start();
    const { url } = JSON.parse((await upload(port, 'image/png', png)).body) as { url: string };
    writeFileSync(join(mediaDir, 'notes.txt'), 'secret');
    for (const path of [
      '/media/notes.txt',
      '/media/..%2f..%2fetc%2fpasswd',
      '/media/%2e%2e/notes.txt',
      `/media/${'0'.repeat(24)}.png`,
      `${url.toUpperCase().replace('/MEDIA/', '/media/')}`,
      `${url}/`,
      '/media/',
    ]) {
      expect((await call(port, path)).status, path).toBe(404);
    }
  });

  it('applies the host and origin checks', async () => {
    const { port } = await start();
    expect((await upload(port, 'image/png', png, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await upload(port, 'image/png', png, { Host: 'evil.example' })).status).toBe(403);
  });
});

describe('WebSocket', () => {
  it('sends state on connect and accepts commands', async () => {
    const { port, engine } = await start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const first = await new Promise<{ type: string }>((resolve) =>
      ws.once('message', (d) => resolve(JSON.parse(String(d)))),
    );
    expect(first.type).toBe('state');
    ws.send(JSON.stringify({ type: 'overlay.hide' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(engine.isVisible()).toBe(false);
    ws.close();
  });

  it('refuses cross-site WebSocket connections', async () => {
    const { port } = await start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'https://evil.example' });
    const outcome = await new Promise<string>((resolve) => {
      ws.once('open', () => resolve('open'));
      ws.once('error', () => resolve('rejected'));
    });
    expect(outcome).toBe('rejected');
  });
});
