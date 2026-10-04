/** Zod-free constants so browser bundles can import them without pulling in the schema. */
export const TIERS = ['common', 'rare', 'epic', 'legendary', 'jackpot'] as const;
export const ROLES = ['everyone', 'subscriber', 'vip', 'moderator', 'broadcaster'] as const;
export const SIZINGS = ['weight', 'equal'] as const;
/** Overlay looks: `glam` (pink & gold, default) and `casino` (emerald & gold). */
export const THEMES = ['glam', 'casino'] as const;
/** Centre photos: at most this many, each an http(s) URL or a path on this server ("/media/…"). */
export const MAX_HUB_PHOTOS = 12;
export const MAX_PHOTO_URL = 500;
/** "//host" is a URL on another site, not a path. */
export const PHOTO_URL = /^(https?:\/\/|\/(?!\/))\S+$/i;
/** How a wheel's prizes are played on the overlay: the classic wheel or one of the mini-games. */
export const GAMES = ['wheel', 'slots', 'claw', 'plinko', 'gifts'] as const;
/** What one play of each game is called on screen, singular and plural ("pull", "pulls"). */
export const GAME_PLAYS: Record<(typeof GAMES)[number], readonly [one: string, many: string]> = {
  wheel: ['spin', 'spins'],
  slots: ['pull', 'pulls'],
  claw: ['grab', 'grabs'],
  plinko: ['drop', 'drops'],
  gifts: ['gift', 'gifts'],
};
/** Length of a play relative to the spin duration setting (slots are snappier than a wheel). */
export const GAME_PACE: Record<(typeof GAMES)[number], number> = {
  wheel: 1,
  slots: 0.7,
  claw: 1,
  plinko: 0.85,
  gifts: 0.9,
};
/**
 * Longest play of a game, whatever the spin duration setting: a plinko coin bounces down in a few
 * seconds, so a longer play would only leave it hanging at the top.
 */
export const GAME_MAX_MS: Partial<Record<(typeof GAMES)[number], number>> = { plinko: 10_000 };

/** How long a play of `game` lasts for the spin duration setting (before the server's ±8 % jitter). */
export function playDuration(game: (typeof GAMES)[number], spinDurationMs: number): number {
  return Math.min(spinDurationMs * GAME_PACE[game], GAME_MAX_MS[game] ?? Infinity);
}
