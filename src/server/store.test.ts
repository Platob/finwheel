import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_HUB_PHOTOS } from '../shared/constants.js';
import { ConfigSchema, MAX_WHEELS } from '../shared/schema.js';
import { addNewDefaults, Store } from './store.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'finwheel-store-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('session', () => {
  it('keeps the spin count of queued games across a restart', async () => {
    const queue = [
      { id: 'q1', player: 'ana', wheelId: 'main', spins: 5, source: 'chat', addedAt: 1 },
      { id: 'q2', player: 'bob', wheelId: 'main', source: 'manual', addedAt: 2 },
    ];
    await writeFile(join(dir, 'session.json'), JSON.stringify({ queue, history: [] }));
    const session = await new Store(dir, join(dir, 'default.json')).loadSession();
    expect(session.queue?.map((item) => item.spins)).toEqual([5, undefined]);
  });
});

const wheel = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  prizes: [{ id: 'p', label: 'P', weight: 1 }],
  ...extra,
});

function config(wheels: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return ConfigSchema.parse({ activeWheelId: (wheels[0] as { id: string }).id, wheels, ...extra });
}

describe('new default wheels', () => {
  it('remembers every default on a fresh install', async () => {
    await writeFile(join(dir, 'default.json'), JSON.stringify(config([wheel('a'), wheel('b')])));
    const loaded = await new Store(dir, join(dir, 'default.json')).loadConfig();
    expect(loaded.knownDefaults).toEqual(['a', 'b']);
  });

  it('adds defaults an existing install has never seen, once', async () => {
    await writeFile(join(dir, 'default.json'), JSON.stringify(config([wheel('a'), wheel('new')])));
    await writeFile(join(dir, 'config.json'), JSON.stringify(config([wheel('a', { name: 'Mine' })])));
    const store = new Store(dir, join(dir, 'default.json'));
    const first = await store.loadConfig();
    expect(first.wheels.map((w) => [w.id, w.name])).toEqual([
      ['a', 'Mine'],
      ['new', 'new'],
    ]);
    expect(first.knownDefaults).toEqual(['a', 'new']);
    await store.flush();
    // Deleting it afterwards sticks: it is known now.
    await writeFile(join(dir, 'config.json'), JSON.stringify({ ...first, wheels: [first.wheels[0]] }));
    expect((await store.loadConfig()).wheels.map((w) => w.id)).toEqual(['a']);
  });

  it('drops a clashing command and a chain to a missing wheel', () => {
    const saved = config([wheel('mine', { command: '!slots' })]);
    const defaults = config([
      wheel('slots', { command: '!slots' }),
      wheel('grand', { prizes: [{ id: 'g', label: 'Go', weight: 1, chainWheelId: 'gone' }] }),
      wheel('gone'),
    ]);
    const { config: merged, added } = addNewDefaults(
      { ...saved },
      { ...defaults, wheels: defaults.wheels.filter((w) => w.id !== 'gone') },
    );
    expect(added).toEqual(['slots', 'grand']);
    expect(merged.wheels.find((w) => w.id === 'slots')?.command).toBeUndefined();
    expect(merged.wheels.find((w) => w.id === 'grand')?.prizes[0]?.chainWheelId).toBeUndefined();
    expect(merged.wheels.find((w) => w.id === 'mine')?.command).toBe('!slots');
  });

  it('stops at the wheel limit and changes nothing when there is nothing new', () => {
    const many = Array.from({ length: MAX_WHEELS - 1 }, (_, i) => wheel(`w${i}`));
    const saved = config(many);
    const { added } = addNewDefaults(saved, config([wheel('x'), wheel('y')]));
    expect(added).toEqual(['x']);
    const same = config([wheel('a')], { knownDefaults: ['a'] });
    expect(addNewDefaults(same, config([wheel('a')])).config).toBe(same);
  });
});

describe('new default photos', () => {
  const withPhotos = (photos: string[], extra: Record<string, unknown> = {}) =>
    config([wheel('a')], { settings: { overlay: { hubPhotos: photos } }, knownDefaults: ['a'], ...extra });

  it('adds default centre photos an install has never been offered, once', () => {
    const saved = withPhotos(['/media/mine.jpg']);
    const { config: merged, photos } = addNewDefaults(saved, withPhotos(['/hub/a.jpg', '/hub/b.jpg']));
    expect(photos).toEqual(['/hub/a.jpg', '/hub/b.jpg']);
    expect(merged.settings.overlay.hubPhotos).toEqual(['/media/mine.jpg', '/hub/a.jpg', '/hub/b.jpg']);
    expect(merged.knownDefaultPhotos).toEqual(['/hub/a.jpg', '/hub/b.jpg']);
    // Removed afterwards: it stays removed.
    const removed = {
      ...merged,
      settings: { ...merged.settings, overlay: { ...merged.settings.overlay, hubPhotos: ['/hub/b.jpg'] } },
    };
    expect(addNewDefaults(removed, withPhotos(['/hub/a.jpg', '/hub/b.jpg'])).config).toBe(removed);
  });

  it('respects the photo limit', () => {
    const full = Array.from({ length: MAX_HUB_PHOTOS - 1 }, (_, i) => `/media/${i}.jpg`);
    const { photos } = addNewDefaults(withPhotos(full), withPhotos(['/hub/a.jpg', '/hub/b.jpg']));
    expect(photos).toEqual(['/hub/a.jpg']);
  });
});
