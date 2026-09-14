import { NEUTRAL_REALM, type Board, type RealmCode } from '@mythictatics/shared/contracts';

export const MAX_DRAFTED_REALMS = 3;

export type RealmLookup = (unitId: string) => RealmCode | undefined;

/** Non-neutral realms present on the board, in the order they were first placed. */
export function draftedRealms(board: Board, realmOf: RealmLookup): RealmCode[] {
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
  realmOf: RealmLookup,
): boolean {
  const realm = realmOf(unitId);
  if (!realm) return false;
  const others = board.map((slot, index) => (index === slotIndex ? null : slot));
  return isRealmAllowed(realm, draftedRealms(others, realmOf));
}
