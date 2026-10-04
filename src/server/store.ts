import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { wheelCommandIssue } from '../shared/chat-commands.js';
import { MAX_HUB_PHOTOS } from '../shared/constants.js';
import { ConfigSchema, MAX_WHEELS, TIERS, type Config, type Wheel } from '../shared/schema.js';
import type { SessionData } from './engine.js';

const SOURCES = ['manual', 'chat', 'reward', 'bits', 'raffle', 'chain', 'api'] as const;

const SessionSchema = z.object({
  queue: z
    .array(
      z.object({
        id: z.string(),
        player: z.string(),
        wheelId: z.string(),
        spins: z.number().int().min(1).optional(),
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
    const defaults = parseConfig(await readFile(this.defaultConfigPath, 'utf8'), this.defaultConfigPath);
    if (!existsSync(this.configPath)) {
      const config = {
        ...defaults,
        knownDefaults: defaults.wheels.map((w) => w.id),
        knownDefaultPhotos: defaults.settings.overlay.hubPhotos,
      };
      await this.write(this.configPath, config);
      return config;
    }
    const saved = parseConfig(await readFile(this.configPath, 'utf8'), this.configPath);
    const { config, added, photos } = addNewDefaults(saved, defaults);
    if (added.length > 0) console.log(`[finwheel] Added new default wheels: ${added.join(', ')}`);
    if (photos.length > 0) console.log(`[finwheel] Added default centre photos: ${photos.join(', ')}`);
    if (config !== saved) await this.write(this.configPath, config);
    return config;
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

/**
 * Brings in what an update added to the defaults, once: default wheels this install has never been
 * offered are appended (a clashing command or a chain to a missing wheel is dropped), and so are new
 * default centre photos. Wheels and photos the streamer removed stay removed; nothing they have is
 * changed. Returns the same object when there is nothing to do.
 */
export function addNewDefaults(
  saved: Config,
  defaults: Config,
): { config: Config; added: string[]; photos: string[] } {
  const known = new Set(saved.knownDefaults);
  const ids = new Set(saved.wheels.map((w) => w.id));
  const fresh = defaults.wheels.filter((w) => !known.has(w.id) && !ids.has(w.id));
  const knownDefaults = union(
    saved.knownDefaults,
    defaults.wheels.map((w) => w.id),
  );

  const savedPhotos = saved.settings.overlay.hubPhotos;
  const offered = new Set([...saved.knownDefaultPhotos, ...savedPhotos]);
  const room = Math.max(0, MAX_HUB_PHOTOS - savedPhotos.length);
  const photos = defaults.settings.overlay.hubPhotos.filter((url) => !offered.has(url)).slice(0, room);
  const knownDefaultPhotos = union(saved.knownDefaultPhotos, defaults.settings.overlay.hubPhotos);

  const unchanged =
    fresh.length === 0 &&
    photos.length === 0 &&
    knownDefaults.length === saved.knownDefaults.length &&
    knownDefaultPhotos.length === saved.knownDefaultPhotos.length;
  if (unchanged) return { config: saved, added: [], photos: [] };

  const wheels: Wheel[] = [...saved.wheels];
  for (const wheel of fresh.slice(0, Math.max(0, MAX_WHEELS - wheels.length)))
    wheels.push(structuredClone(wheel));
  const present = new Set(wheels.map((w) => w.id));
  const words = {
    spinCommand: saved.settings.twitch.spinCommand,
    raffleKeyword: saved.settings.raffle.keyword,
  };
  for (let i = saved.wheels.length; i < wheels.length; i++) {
    const wheel = wheels[i]!;
    if (wheelCommandIssue(wheels, i, words)) delete wheel.command;
    for (const prize of wheel.prizes) {
      if (prize.chainWheelId && !present.has(prize.chainWheelId)) delete prize.chainWheelId;
    }
  }
  const settings = {
    ...saved.settings,
    overlay: { ...saved.settings.overlay, hubPhotos: [...savedPhotos, ...photos] },
  };
  const merged = ConfigSchema.safeParse({ ...saved, wheels, settings, knownDefaults, knownDefaultPhotos });
  if (!merged.success) {
    console.warn('[finwheel] Could not add the new defaults:', z.prettifyError(merged.error));
    return { config: saved, added: [], photos: [] };
  }
  return { config: merged.data, added: wheels.slice(saved.wheels.length).map((w) => w.id), photos };
}

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

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
