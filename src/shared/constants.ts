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
/** Length of a play relative to the spin duration setting (slots are snappier than a wheel). */
export const GAME_PACE: Record<(typeof GAMES)[number], number> = {
  wheel: 1,
  slots: 0.7,
  claw: 1,
  plinko: 0.85,
  gifts: 0.9,
};
