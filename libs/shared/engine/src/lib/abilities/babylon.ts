import type { AbilityDef } from '../types';
import { ability, always, keywords, v } from './dsl';

/**
 * Babylon: a shop realm. Its text is about deploying and selling, which happens between battles,
 * so in a fight most of it is the body the shop built — the few below are what is left.
 */
export const BABYLON: readonly AbilityDef[] = [
  keywords('m05008', 'taunt'),
  ability('m05014', {
    // Gilgamesh — Safeguard. Double Strike. Whenever this gains stats, add +X/+Y to that amount.
    innate: always('safeguard', 'double_strike'),
    gainBonus: (rank) => [v(rank, [2, 4, 8]), v(rank, [1, 2, 4])],
  }),
  keywords('m05015', 'ranged'),
];
