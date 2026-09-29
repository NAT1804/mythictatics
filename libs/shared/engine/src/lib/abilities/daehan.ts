import type { AbilityDef } from '../types';
import { keywords } from './dsl';

/**
 * Daehan: the Sanctum and the hand, both out of a battle's reach. What a Daehan board brings to a
 * fight is its stats and the one Ranged unit.
 */
export const DAEHAN: readonly AbilityDef[] = [keywords('m07008', 'ranged')];
