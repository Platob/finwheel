#!/usr/bin/env node
/**
 * Screenshots the built overlay in given states, against a throwaway server and data folder.
 *
 *   npm run build && node scripts/snap.mjs --out shots idle result:high-roller total raffle
 *
 * Scenarios: idle[:wheel] · spin[:wheel] · result[:wheel] · total[:wheel] · bank[:wheel] · raffle
 * Options:   --out DIR · --theme glam|casino · --size 1080 · --config file.json (wheels/settings
 *            merged into the saved config) · --photo URL (repeatable centre photos) · --no-preview
 *            --web DIR / --node DIR: use another build of the overlay (vite --outDir) or server
 *            (tsc --outDir) instead of dist/web and dist/node.
 * Needs Playwright (global install is fine) and Chromium.
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const opt = {
  out: 'shots',
  theme: '',
  size: 1080,
  config: '',
  photos: [],
  preview: true,
  web: join(root, 'dist/web'),
  node: join(root, 'dist/node'),
};
const scenarios = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--theme') opt.theme = args[++i];
  else if (a === '--size') opt.size = Number(args[++i]);
  else if (a === '--config') opt.config = args[++i];
  else if (a === '--photo') opt.photos.push(args[++i]);
  else if (a === '--no-preview') opt.preview = false;
  else if (a === '--web') opt.web = resolve(args[++i]);
  else if (a === '--node') opt.node = resolve(args[++i]);
  else scenarios.push(a);
}
if (scenarios.length === 0) scenarios.push('idle');

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const base of [root, '/opt/node22/lib/node_modules/', process.env.NODE_PATH ?? '']) {
    try {
      return createRequire(join(base, 'x.js'))('playwright');
    } catch {
      /* try the next location */
    }
  }
  return require('playwright');
}
const { chromium } = loadPlaywright();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 5000 + Math.floor(Math.random() * 3000);
const base = `http://127.0.0.1:${port}`;
const dataDir = mkdtempSync(join(tmpdir(), 'finwheel-snap-'));
// The server finds its web assets and default config from the project root it runs in, so run
// it from a throwaway root that points at the requested builds.
const runRoot = mkdtempSync(join(tmpdir(), 'finwheel-root-'));
cpSync(join(root, 'package.json'), join(runRoot, 'package.json'));
symlinkSync(join(root, 'config'), join(runRoot, 'config'));
symlinkSync(join(root, 'node_modules'), join(runRoot, 'node_modules'));
mkdirSync(join(runRoot, 'dist'));
cpSync(opt.node, join(runRoot, 'dist/node'), { recursive: true });
symlinkSync(opt.web, join(runRoot, 'dist/web'));
const server = spawn(process.execPath, [join(runRoot, 'dist/node/server/index.js')], {
  env: { ...process.env, PORT: String(port), FINWHEEL_DATA_DIR: dataDir, FINWHEEL_TOKEN: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

async function api(path, body) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (body && !json.ok) throw new Error(`${path} ${JSON.stringify(body)} → ${json.error}`);
  return json;
}
const command = (body) => api('/api/command', body);
const state = () => api('/api/state');

async function waitFor(predicate, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const s = await state();
    if (predicate(s)) return s;
    await sleep(100);
  }
  throw new Error('Timed out waiting for overlay state');
}

async function reset() {
  await command({ type: 'queue.clear' });
  for (let i = 0; i < 400; i++) {
    const s = await state();
    if (s.stage === 'idle' && !s.spin) return;
    if (s.stage === 'result' || s.stage === 'total') await command({ type: 'result.dismiss' });
    await sleep(150);
  }
  throw new Error('Could not get back to idle');
}

try {
  for (let i = 0; i < 100; i++) {
    try {
      await state();
      break;
    } catch {
      await sleep(100);
    }
  }
  const s0 = await state();
  const extra = opt.config ? JSON.parse(readFileSync(opt.config, 'utf8')) : {};
  const settings = structuredClone(s0.config.settings);
  settings.spin = { ...settings.spin, durationMs: 2500, resultHoldMs: 60000, followUpHoldMs: 1200 };
  settings.overlay = { ...settings.overlay, sound: false };
  if (opt.photos.length) settings.overlay.hubPhotos = opt.photos;
  const merge = (a, b) => {
    for (const [k, v] of Object.entries(b ?? {})) {
      a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] ?? {}, v) : v;
    }
    return a;
  };
  merge(settings, extra.settings);
  await command({ type: 'config.save', wheels: extra.wheels ?? s0.config.wheels, settings });

  mkdirSync(opt.out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: opt.size, height: opt.size } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  const query = [opt.preview ? 'preview' : '', 'mute=1', opt.theme ? `theme=${opt.theme}` : '']
    .filter(Boolean)
    .join('&');
  await page.goto(`${base}/overlay/?${query}`);
  await page.waitForTimeout(1200);

  for (const scenario of scenarios) {
    const [name, wheelArg] = scenario.split(':');
    const cfg = (await state()).config;
    const wheelId = wheelArg ?? cfg.activeWheelId;
    await reset();
    if (name !== 'raffle') await command({ type: 'raffle.clear' }).catch(() => {});
    if (name !== 'raffle') await command({ type: 'raffle.close' }).catch(() => {});
    await command({ type: 'wheel.select', wheelId });
    await page.waitForTimeout(900);

    if (name === 'idle') {
      // nothing to do
    } else if (name === 'spin') {
      await command({ type: 'spin', wheelId, player: 'VelvetViper', spins: 1 });
      await page.waitForTimeout(1100);
    } else if (name === 'result') {
      await command({ type: 'spin', wheelId, player: 'VelvetViper', spins: 1 });
      await waitFor((s) => s.stage === 'result');
      await page.waitForTimeout(3200);
    } else if (name === 'bank') {
      await command({ type: 'spin', wheelId, player: 'VelvetViper', spins: 3 });
      await waitFor((s) => s.stage === 'result' && s.turn && s.turn.spinNumber === 1);
      await page.waitForTimeout(900);
    } else if (name === 'total') {
      await command({ type: 'spin', wheelId, player: 'VelvetViper', spins: 3 });
      await waitFor((s) => s.stage === 'total', 90000);
      await page.waitForTimeout(2600);
    } else if (name === 'raffle') {
      await command({ type: 'raffle.clear' });
      await command({ type: 'raffle.open' });
      for (const n of [
        'VelvetViper',
        'GoldDigger',
        'Ana',
        'xX_Whale_Xx',
        'Moneybags99',
        'Lux',
        'PinkPanther',
        'BigTipper',
        'Coco',
        'SugarDaddy42',
        'Bambi',
        'Rex',
      ]) {
        await command({ type: 'raffle.add', name: n });
      }
      await page.waitForTimeout(1200);
    } else {
      throw new Error(`Unknown scenario "${name}"`);
    }
    const file = join(
      opt.out,
      `${scenario.replace(/[^a-z0-9-]+/gi, '_')}${opt.theme ? `.${opt.theme}` : ''}.png`,
    );
    await page.screenshot({ path: file });
    console.log('saved', file);
  }
  await browser.close();
} catch (error) {
  console.error(error);
  console.error(serverLog);
  process.exitCode = 1;
} finally {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(runRoot, { recursive: true, force: true });
}
