import type { AbilityDef, PatronDef } from '../types';
import { BABYLON } from './babylon';
import { DAEHAN } from './daehan';
import { DESCENDS, POWERS } from './gods';
import { KAMI } from './kami';
import { NEUTRAL } from './neutral';
import { NILES } from './niles';
import { OLYMPUS } from './olympus';
import { SHENZHOU } from './shenzhou';
import { YGGDRASIL } from './yggdrasil';

/**
 * Every card's battle text, by card id.
 *
 * A unit missing from `UNIT_ABILITIES` fights as its body alone, and the list of which ones do so
 * — and why — is `NO_BATTLE_TEXT`. A test holds the two together against the dataset, so a card
 * added in a patch cannot slip into battles silently without text.
 */
function byId<T extends { id: string }>(entries: readonly T[]): Readonly<Record<string, T>> {
  const map: Record<string, T> = {};
  for (const entry of entries) {
    if (map[entry.id]) throw new Error(`Two battle texts for ${entry.id}`);
    map[entry.id] = entry;
  }
  return map;
}

export const UNIT_ABILITIES: Readonly<Record<string, AbilityDef>> = byId([
  ...NILES,
  ...OLYMPUS,
  ...YGGDRASIL,
  ...SHENZHOU,
  ...BABYLON,
  ...KAMI,
  ...DAEHAN,
  ...NEUTRAL,
]);

export const DESCEND_ABILITIES: Readonly<Record<string, AbilityDef>> = byId(DESCENDS);

export const PATRON_POWERS: Readonly<Record<string, PatronDef>> = byId(POWERS);

export { NO_BATTLE_TEXT } from './no-battle-text';
