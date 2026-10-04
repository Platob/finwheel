import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from './store.js';

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
