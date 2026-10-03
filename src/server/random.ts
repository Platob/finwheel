import { randomBytes } from 'node:crypto';
import { pickWeighted } from '../shared/rules.js';

/** Cryptographically secure float in [0, 1). */
export function secureRandom(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

/** Picks an index with probability proportional to its weight. Non-positive weights never win. */
export function weightedIndex(weights: readonly number[], random: () => number = secureRandom): number {
  return pickWeighted(weights, random);
}
