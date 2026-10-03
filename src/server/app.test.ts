import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
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
    version: 'test',
  });
  await new Promise<void>((resolve) => app!.server.listen(0, '127.0.0.1', resolve));
  return { engine, port: (app.server.address() as AddressInfo).port };
}

function call(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end(options.body);
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
