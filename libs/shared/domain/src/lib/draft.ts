import { NEUTRAL_REALM, type God, type RealmCode, type Unit } from '@mythictatics/shared/contracts';
import { MAX_DRAFTED_REALMS } from './realm-draft';

/**
 * Which realms a build is allowed to spend on.
 *
 * A run draws from three realms, plus Neutral, which is always available and never costs one of
 * the three. A patron god with `realmLock` spends one of those three on its own realm the moment
 * it is picked, leaving two to choose; every other god leaves all three open.
 *
 * `locked` is kept separate from `picked` rather than merged into one list because it is not the
 * player's to remove: changing it means changing patron, and the UI has to be able to say so.
 */
export interface RealmDraft {
  /** The patron god's realm, when that god locks it. Null for a god that does not. */
  locked: RealmCode | null;
  /** Realms the player chose, in the order they chose them. Never Neutral, never `locked`. */
  picked: readonly RealmCode[];
}

export const EMPTY_DRAFT: RealmDraft = { locked: null, picked: [] };

/**
 * The realm a god forces into the draft, or null where it leaves the draft alone.
 *
 * `enabled` is the builder's own switch, not a game rule: the site lets a player release the lock
 * to lay out a board the game would not deal them, which is worth having in a planning tool.
 */
export function lockedRealmOf(god: God | null | undefined, enabled = true): RealmCode | null {
  return enabled && god?.realmLock ? god.realm : null;
}

/** Every non-Neutral realm in the draft: the locked one first, then the picks in pick order. */
export function draftRealms(draft: RealmDraft): readonly RealmCode[] {
  return draft.locked ? [draft.locked, ...draft.picked] : draft.picked;
}

/** How many realms the player still has to choose. */
export function remainingPicks(draft: RealmDraft): number {
  return Math.max(0, MAX_DRAFTED_REALMS - draftRealms(draft).length);
}

export function isDraftComplete(draft: RealmDraft): boolean {
  return remainingPicks(draft) === 0;
}

/** Whether the player can still add `realm` — false for one already in, or a full draft. */
export function canPickRealm(draft: RealmDraft, realm: RealmCode): boolean {
  if (realm === NEUTRAL_REALM) return false;
  if (draftRealms(draft).includes(realm)) return false;
  return remainingPicks(draft) > 0;
}

/**
 * The draft with `realm` added, or removed if it was already picked.
 *
 * A locked realm is returned untouched: it belongs to the patron god, so dropping it is done by
 * changing god, not by clicking the realm.
 */
export function toggleRealm(draft: RealmDraft, realm: RealmCode): RealmDraft {
  if (realm === NEUTRAL_REALM || realm === draft.locked) return draft;
  if (draft.picked.includes(realm)) {
    return { ...draft, picked: draft.picked.filter((code) => code !== realm) };
  }
  return canPickRealm(draft, realm) ? { ...draft, picked: [...draft.picked, realm] } : draft;
}

/**
 * The draft re-based on a new patron god, keeping as many of the player's picks as still fit.
 *
 * A pick that the new god locks is dropped rather than counted twice, and picks past the limit
 * fall off the end — so switching from an unlocked god to a locked one loses the oldest pick that
 * no longer fits instead of silently producing a four-realm draft.
 */
export function withPatron(
  draft: RealmDraft,
  god: God | null | undefined,
  lockEnabled = true,
): RealmDraft {
  const locked = lockedRealmOf(god, lockEnabled);
  const room = MAX_DRAFTED_REALMS - (locked ? 1 : 0);
  const picked = draft.picked.filter((realm) => realm !== locked).slice(0, room);
  return { locked, picked };
}

/** Neutral is always buyable; anything else has to be one of the drafted realms. */
export function isUnitDraftable(unit: Unit, draft: RealmDraft): boolean {
  return unit.realm === NEUTRAL_REALM || draftRealms(draft).includes(unit.realm);
}
