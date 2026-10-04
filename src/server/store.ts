import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ConfigSchema, TIERS, type Config } from '../shared/schema.js';
import type { SessionData } from './engine.js';

const SOURCES = ['manual', 'chat', 'reward', 'bits', 'raffle', 'chain', 'api'] as const;

const SessionSchema = z.object({
  queue: z
    .array(
      z.object({
        id: z.string(),
        player: z.string(),
        wheelId: z.string(),
        source: z.enum(SOURCES),
        addedAt: z.number(),
      }),
    )
    .catch([]),
  history: z
    .array(
      z.object({
        id: z.string(),
        spinId: z.string(),
        at: z.number(),
        kind: z.enum(['prize', 'raffle']),
        wheelKey: z.string(),
        wheelName: z.string(),
        player: z.string().nullable(),
        segmentId: z.string(),
        label: z.string(),
        description: z.string(),
        tier: z.enum(TIERS),
        followUpWheelId: z.string().nullable(),
        money: z
          .object({
            before: z.number(),
            after: z.number(),
            cash: z.number(),
            multiplier: z.number(),
            bust: z.boolean(),
            boost: z.number().default(1),
            nextMultiplier: z.number().default(1),
          })
          .nullable()
          .default(null),
        extraSpins: z.number().default(0),
        payout: z.number().nullable().default(null),
      }),
    )
    .catch([]),
  raffle: z
    .object({
      open: z.boolean(),
      entrants: z.array(
        z.object({ login: z.string(), displayName: z.string(), tickets: z.number(), joinedAt: z.number() }),
      ),
    })
    .catch({ open: false, entrants: [] }),
});

export class ConfigError extends Error {}

/** Persists config and session JSON files with debounced, atomic writes. */
export class Store {
  readonly configPath: string;
  readonly sessionPath: string;
  private readonly pending = new Map<string, () => unknown>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly dir: string,
    private readonly defaultConfigPath: string,
    private readonly debounceMs = 250,
  ) {
    this.configPath = join(dir, 'config.json');
    this.sessionPath = join(dir, 'session.json');
  }

  async loadConfig(): Promise<Config> {
    await mkdir(this.dir, { recursive: true });
    if (!existsSync(this.configPath)) {
      const config = parseConfig(await readFile(this.defaultConfigPath, 'utf8'), this.defaultConfigPath);
      await this.write(this.configPath, config);
      return config;
    }
    return parseConfig(await readFile(this.configPath, 'utf8'), this.configPath);
  }

  async loadSession(): Promise<Partial<SessionData>> {
    try {
      return SessionSchema.parse(JSON.parse(await readFile(this.sessionPath, 'utf8')));
    } catch {
      return {};
    }
  }

  saveConfig(config: Config): void {
    this.schedule(this.configPath, () => config);
  }

  saveSession(read: () => SessionData): void {
    this.schedule(this.sessionPath, read);
  }

  /** Writes everything still pending. */
  async flush(): Promise<void> {
    for (const [path, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(path);
      this.enqueueWrite(path);
    }
    await this.chain;
  }

  private schedule(path: string, read: () => unknown): void {
    this.pending.set(path, read);
    if (this.timers.has(path)) return;
    this.timers.set(
      path,
      setTimeout(() => {
        this.timers.delete(path);
        this.enqueueWrite(path);
      }, this.debounceMs),
    );
  }

  private enqueueWrite(path: string): void {
    const read = this.pending.get(path);
    this.pending.delete(path);
    if (!read) return;
    const data = read();
    this.chain = this.chain
      .then(() => this.write(path, data))
      .catch((error: unknown) => console.error(`[finwheel] Could not write ${path}:`, error));
  }

  private async write(path: string, data: unknown): Promise<void> {
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tmp, path);
  }
}

export function parseConfig(text: string, source: string): Config {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${source} is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = ConfigSchema.safeParse(json);
  if (!parsed.success) throw new ConfigError(`${source} is invalid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
