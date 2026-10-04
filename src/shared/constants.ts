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
