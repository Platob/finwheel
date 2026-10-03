import type { Tier } from './schema.js';

export interface TierStyle {
  label: string;
  /** Accent used for gems, badges and highlights. */
  accent: string;
  /** Particle count multiplier for the win celebration. */
  celebration: number;
}

export const TIER_STYLES: Record<Tier, TierStyle> = {
  common: { label: 'Common', accent: '#c9b37e', celebration: 1 },
  rare: { label: 'Rare', accent: '#5b8def', celebration: 1.4 },
  epic: { label: 'Epic', accent: '#b06ae0', celebration: 1.9 },
  legendary: { label: 'Legendary', accent: '#f0c75e', celebration: 2.6 },
  jackpot: { label: 'Jackpot', accent: '#ffd86b', celebration: 4 },
};
