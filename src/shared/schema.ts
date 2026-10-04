import { z } from 'zod';
import { WHEEL_COMMAND, WHEEL_COMMAND_FORMAT, wheelCommandIssue } from './chat-commands.js';
import {
  GAMES,
  MAX_HUB_PHOTOS,
  MAX_PHOTO_URL,
  PHOTO_URL,
  ROLES,
  SIZINGS,
  THEMES,
  TIERS,
} from './constants.js';

export { GAMES, ROLES, SIZINGS, THEMES, TIERS };

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Use only letters, numbers, "-" and "_"');

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a #rrggbb color');

const photoUrl = z
  .string()
  .trim()
  .max(MAX_PHOTO_URL)
  .regex(PHOTO_URL, 'Use an uploaded photo or an http(s):// image URL');

export const PrizeSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(48),
  description: z.string().trim().max(140).default(''),
  /** Relative odds. A prize with weight 2 is twice as likely as one with weight 1. */
  weight: z.number().positive().max(1_000_000),
  /** Remaining quantity. `null` means unlimited; prizes at 0 are removed from the wheel. */
  stock: z.number().int().min(0).nullable().default(null),
  tier: z.enum(TIERS).default('common'),
  color: hexColor.optional(),
  /** Emoji or short symbol shown by the mini-games (slot reels, claw capsules, gifts). */
  icon: z.string().trim().min(1).max(8).optional(),
  /** When won, immediately spin this other wheel for the same player (category → prize flow). */
  chainWheelId: idSchema.optional(),
  /** Cash added to the player's running total for this turn. */
  cash: z.number().min(0).max(1_000_000).default(0),
  /** Multiplies the running total after adding `cash` (2 = double, 0.5 = lose half). */
  multiplier: z.number().min(0).max(1000).default(1),
  /** Multiplies the cash won on the player's next spin (2 = "×2 next"). Stacks with another boost. */
  nextMultiplier: z.number().min(1).max(100).default(1),
  /** Free re-spins of the same wheel added to the turn. */
  extraSpins: z.number().int().min(0).max(10).default(0),
  /** Bankrupt: the running total is lost and the turn ends immediately. */
  bust: z.boolean().default(false),
});

export const WheelSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(40),
  subtitle: z.string().trim().max(60).default(''),
  /** `weight`: slice size matches the odds. `equal`: every slice has the same size. */
  sizing: z.enum(SIZINGS).default('weight'),
  /** Default number of spins in a game; the dock or chat can choose another count per game. */
  spinsPerTurn: z.number().int().min(1).max(20).default(1),
  /** How the prizes are played on the overlay: a wheel or a mini-game (slots, claw, plinko, gifts). */
  game: z.enum(GAMES).default('wheel'),
  /**
   * Chat command that starts a game on this wheel (e.g. "!slots"), with the same permission,
   * cooldown and moderator arguments as the spin command. Unique; never a word the bot already uses.
   */
  command: z.string().trim().toLowerCase().regex(WHEEL_COMMAND, WHEEL_COMMAND_FORMAT).optional(),
  prizes: z.array(PrizeSchema).max(64),
});

export const RewardMappingSchema = z.object({
  rewardId: z.string().trim().min(1).max(64),
  wheelId: idSchema,
  label: z.string().trim().max(60).default(''),
});

export const SettingsSchema = z.object({
  spin: z
    .object({
      durationMs: z.number().int().min(2000).max(30000).default(8000),
      minTurns: z.number().int().min(1).max(30).default(5),
      maxTurns: z.number().int().min(1).max(40).default(8),
      resultHoldMs: z.number().int().min(1000).max(120000).default(7000),
      /** Result display time when the same player's turn continues (extra spins, chains). */
      followUpHoldMs: z.number().int().min(1000).max(60000).default(3500),
      autoAdvanceQueue: z.boolean().default(true),
      /** Safety cap on spins in one turn (extra spins and chained wheels included). */
      maxSpinsPerTurn: z.number().int().min(1).max(100).default(30),
    })
    .prefault({}),
  currency: z
    .object({
      symbol: z.string().trim().max(4).default('$'),
      position: z.enum(['before', 'after']).default('before'),
    })
    .prefault({}),
  overlay: z
    .object({
      autoHide: z.boolean().default(false),
      sound: z.boolean().default(true),
      volume: z.number().min(0).max(1).default(0.6),
      showRaffleBadge: z.boolean().default(true),
      /** Look of the wheel and its signs. */
      theme: z.enum(THEMES).default('glam'),
      /** Photos shown in the centre of the wheel (uploaded `/media/…` files, site paths or http(s) URLs). */
      hubPhotos: z.array(photoUrl).max(MAX_HUB_PHOTOS).default([]),
      /** Seconds each centre photo stays up when there are several. */
      hubPhotoSeconds: z.number().int().min(2).max(120).default(8),
    })
    .prefault({}),
  raffle: z
    .object({
      keyword: z.string().trim().min(1).max(25).default('!join'),
      subscriberTickets: z.number().int().min(1).max(10).default(1),
      removeWinner: z.boolean().default(true),
      /** Wheel spun for the raffle winner right after the draw ('' = none). */
      prizeWheelId: z.string().trim().default(''),
    })
    .prefault({}),
  twitch: z
    .object({
      channel: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9_]{0,25}$/, 'Twitch channel names use letters, numbers and "_"')
        .default(''),
      spinCommand: z.string().trim().min(1).max(25).default('!spin'),
      spinPermission: z.enum(ROLES).default('moderator'),
      spinCooldownSec: z.number().int().min(0).max(86400).default(60),
      announceResults: z.boolean().default(true),
      rewards: z.array(RewardMappingSchema).max(20).default([]),
      bits: z
        .object({
          enabled: z.boolean().default(false),
          minimum: z.number().int().min(1).max(1_000_000).default(500),
          wheelId: z.string().trim().default(''),
        })
        .prefault({}),
    })
    .prefault({}),
});

export const ConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    activeWheelId: idSchema,
    wheels: z.array(WheelSchema).min(1).max(32),
    settings: SettingsSchema.prefault({}),
  })
  .superRefine((cfg, ctx) => {
    const wheelIds = new Set<string>();
    const words = {
      spinCommand: cfg.settings.twitch.spinCommand,
      raffleKeyword: cfg.settings.raffle.keyword,
    };
    cfg.wheels.forEach((wheel, w) => {
      // A badly formed command is already reported by its own field.
      const clash =
        wheel.command && WHEEL_COMMAND.test(wheel.command) ? wheelCommandIssue(cfg.wheels, w, words) : null;
      if (clash) ctx.addIssue({ code: 'custom', path: ['wheels', w, 'command'], message: clash });
      if (wheelIds.has(wheel.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['wheels', w, 'id'],
          message: `Duplicate wheel id "${wheel.id}"`,
        });
      }
      wheelIds.add(wheel.id);
      const prizeIds = new Set<string>();
      wheel.prizes.forEach((prize, p) => {
        if (prizeIds.has(prize.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['wheels', w, 'prizes', p, 'id'],
            message: `Duplicate prize id "${prize.id}" in wheel "${wheel.id}"`,
          });
        }
        prizeIds.add(prize.id);
      });
    });

    const requireWheel = (id: string, path: (string | number)[]) => {
      if (!wheelIds.has(id)) ctx.addIssue({ code: 'custom', path, message: `Unknown wheel "${id}"` });
    };

    requireWheel(cfg.activeWheelId, ['activeWheelId']);
    cfg.wheels.forEach((wheel, w) =>
      wheel.prizes.forEach((prize, p) => {
        if (prize.chainWheelId) requireWheel(prize.chainWheelId, ['wheels', w, 'prizes', p, 'chainWheelId']);
      }),
    );
    const { raffle, twitch, spin } = cfg.settings;
    if (raffle.prizeWheelId) requireWheel(raffle.prizeWheelId, ['settings', 'raffle', 'prizeWheelId']);
    if (twitch.bits.wheelId) requireWheel(twitch.bits.wheelId, ['settings', 'twitch', 'bits', 'wheelId']);
    twitch.rewards.forEach((reward, r) =>
      requireWheel(reward.wheelId, ['settings', 'twitch', 'rewards', r, 'wheelId']),
    );
    if (spin.minTurns > spin.maxTurns) {
      ctx.addIssue({
        code: 'custom',
        path: ['settings', 'spin', 'maxTurns'],
        message: 'maxTurns must be greater than or equal to minTurns',
      });
    }
  });

/** Commands accepted from the dock (WebSocket) and the HTTP API (`POST /api/command`). */
export const CommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('spin'),
    wheelId: z.string().optional(),
    player: z.string().trim().max(40).optional(),
    /** Number of spins in this game (defaults to the wheel's setting). */
    spins: z.number().int().min(1).max(20).optional(),
  }),
  z.object({ type: z.literal('spinNext') }),
  z.object({
    type: z.literal('queue.add'),
    player: z.string().trim().min(1).max(40),
    wheelId: z.string().optional(),
    spins: z.number().int().min(1).max(20).optional(),
  }),
  z.object({ type: z.literal('queue.remove'), id: z.string() }),
  z.object({ type: z.literal('queue.clear') }),
  z.object({ type: z.literal('wheel.select'), wheelId: z.string() }),
  z.object({ type: z.literal('raffle.open') }),
  z.object({ type: z.literal('raffle.close') }),
  z.object({ type: z.literal('raffle.draw') }),
  z.object({ type: z.literal('raffle.clear') }),
  z.object({ type: z.literal('raffle.add'), name: z.string().trim().min(1).max(40) }),
  z.object({ type: z.literal('raffle.remove'), login: z.string() }),
  z.object({ type: z.literal('overlay.show') }),
  z.object({ type: z.literal('overlay.hide') }),
  z.object({ type: z.literal('overlay.toggle') }),
  z.object({ type: z.literal('result.dismiss') }),
  z.object({ type: z.literal('history.clear') }),
  z.object({
    type: z.literal('config.save'),
    wheels: z.array(z.unknown()).optional(),
    settings: z.unknown().optional(),
  }),
]);

export type Tier = (typeof TIERS)[number];
export type Role = (typeof ROLES)[number];
export type Sizing = (typeof SIZINGS)[number];
export type ThemeId = (typeof THEMES)[number];
export type GameType = (typeof GAMES)[number];
export type Prize = z.output<typeof PrizeSchema>;
export type Wheel = z.output<typeof WheelSchema>;
export type Settings = z.output<typeof SettingsSchema>;
export type Config = z.output<typeof ConfigSchema>;
export type Command = z.output<typeof CommandSchema>;
