/** Zod-free constants so browser bundles can import them without pulling in the schema. */
export const TIERS = ['common', 'rare', 'epic', 'legendary', 'jackpot'] as const;
export const ROLES = ['everyone', 'subscriber', 'vip', 'moderator', 'broadcaster'] as const;
export const SIZINGS = ['weight', 'equal'] as const;
/** Overlay looks: `glam` (pink & gold, default) and `casino` (emerald & gold). */
export const THEMES = ['glam', 'casino'] as const;
