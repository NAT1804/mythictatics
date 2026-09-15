import {
  NEUTRAL_REALM,
  REALM_NUMBERS,
  type Board,
  type RealmCode,
} from '@mythictatics/shared/contracts';

export const MAX_DRAFTED_REALMS = 3;

export type RealmLookup = (unitId: string) => RealmCode | undefined;

const REALM_BY_NUMBER = new Map<number, RealmCode>(
  Object.entries(REALM_NUMBERS).map(([code, number]) => [number, code as RealmCode]),
);

/**
 * A card's realm read straight off its id: `m05001` is Babylon's, `s_04001` Shenzhou's.
 *
 * Undefined where the id carries no realm — a god (`champ012`), a shared Sanctum spell
 * (`s_001`), or a number no realm uses. Every unit and every realm spell in the dataset agrees
 * with this, so nothing has to be looked up to know a unit's realm.
 */
export function realmOfCardId(cardId: string): RealmCode | undefined {
  const number = /^m(\d{2})\d{3}$/.exec(cardId) ?? /^s_(\d{2})\d{3}$/.exec(cardId);
  return number ? REALM_BY_NUMBER.get(Number(number[1])) : undefined;
}

/** Non-neutral realms present on the board, in the order they were first placed. */
export function draftedRealms(board: Board, realmOf: RealmLookup = realmOfCardId): RealmCode[] {
  const realms: RealmCode[] = [];
  for (const slot of board) {
    if (!slot) continue;
    const realm = realmOf(slot.unitId);
    if (!realm || realm === NEUTRAL_REALM || realms.includes(realm)) continue;
    realms.push(realm);
  }
  return realms;
}

/** Neutral is always legal; any other realm must fit within the 3-realm draft. */
export function isRealmAllowed(realm: RealmCode, drafted: readonly RealmCode[]): boolean {
  if (realm === NEUTRAL_REALM || drafted.includes(realm)) return true;
  return drafted.length < MAX_DRAFTED_REALMS;
}

/**
 * Whether `unitId` may go into `slotIndex`. The unit currently in that slot is
 * ignored, so replacing the last unit of a realm frees its draft spot.
 */
export function canPlaceUnit(
  board: Board,
  slotIndex: number,
  unitId: string,
  realmOf: RealmLookup = realmOfCardId,
): boolean {
  const realm = realmOf(unitId);
  if (!realm) return false;
  const others = board.map((slot, index) => (index === slotIndex ? null : slot));
  return isRealmAllowed(realm, draftedRealms(others, realmOf));
}
