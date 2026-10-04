#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createApp } from './app.js';
import { WheelEngine } from './engine.js';
import { isLoopback, Security } from './security.js';
import { ConfigError, Store } from './store.js';
import { TwitchBot } from './twitch/bot.js';

function findProjectRoot(start: string): string {
  let dir = start;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
  return dir;
}

const root = findProjectRoot(import.meta.dirname);
const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const port = Number.parseInt(env.PORT ?? '4747', 10);
const host = env.HOST || '127.0.0.1';
const token = env.FINWHEEL_TOKEN?.trim() || null;
const dataDir = resolve(root, env.FINWHEEL_DATA_DIR || 'data');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

const store = new Store(dataDir, join(root, 'config', 'default.config.json'));
let engine: WheelEngine;
try {
  engine = new WheelEngine({ config: await store.loadConfig(), session: await store.loadSession() });
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`[finwheel] ${error.message}`);
    console.error('[finwheel] Fix the file or delete it to start again from the default config.');
    process.exit(1);
  }
  throw error;
}

engine.on('config', (config) => store.saveConfig(config));
engine.on('session', () => store.saveSession(() => engine.session()));
engine.on('notice', (notice) => {
  if (notice.level === 'error') console.warn(`[finwheel] ${notice.message}`);
});

const bot = new TwitchBot({ engine, username: env.TWITCH_BOT_USERNAME, token: env.TWITCH_OAUTH_TOKEN });
bot.on('status', () => {
  const { state, message } = bot.getStatus();
  if (state !== 'connecting') console.log(`[finwheel] Twitch: ${message}`);
});

const security = new Security({
  bindHost: host,
  token,
  allowedOrigins: (env.FINWHEEL_ALLOWED_ORIGINS ?? '').split(','),
});

const app = createApp({
  engine,
  twitch: bot,
  security,
  webRoot: join(root, 'dist', 'web'),
  mediaDir: join(dataDir, 'media'),
  version,
});

app.server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `[finwheel] Port ${port} is already in use. Is FinWheel already running? Set PORT to change it.`,
    );
    process.exit(1);
  }
  throw error;
});

app.server.listen(port, host, () => {
  const base = `http://${isLoopback(host) || host === '0.0.0.0' ? 'localhost' : host}:${port}`;
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  console.log(`
  ◆ FinWheel v${version}

    Overlay (Browser Source)  ${base}/overlay/
    Control dock              ${base}/dock/${query}
    Data folder               ${dataDir}
`);
  if (!isLoopback(host) && !token) {
    console.warn('[finwheel] Warning: listening on a network interface without FINWHEEL_TOKEN.');
  }
  bot.start();
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  bot.stop();
  engine.dispose();
  await Promise.all([app.close(), store.flush()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
