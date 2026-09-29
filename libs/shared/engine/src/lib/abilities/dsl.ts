import type { Rank, RealmCode, StatusCode } from '@mythictatics/shared/contracts';
import type { Battle } from '../battle';
import type { AbilityDef, Fighter, Hooks } from '../types';

/**
 * The shorthand the realm files are written in. Each card is one `AbilityDef`, its numbers read
 * off its three Ranks with `v`, so a card's entry sits next to its text and reads like it.
 */

/** The value for a Rank, from the card's three: `v(me.rank, [1, 2, 4])`. */
export function v<T>(rank: Rank, values: readonly [T, T, T]): T {
  return values[rank];
}

/** Keywords the card is born with, the same at every Rank. */
export function always(...statuses: StatusCode[]): (rank: Rank) => readonly StatusCode[] {
  return () => statuses;
}

/** Keywords the card is born with, by Rank. */
export function byRank(
  values: readonly [readonly StatusCode[], readonly StatusCode[], readonly StatusCode[]],
): (rank: Rank) => readonly StatusCode[] {
  return (rank) => values[rank];
}

export function ability(id: string, def: Omit<AbilityDef, 'id'>): AbilityDef {
  return { id, ...def };
}

/** A card whose only battle text is its keywords. */
export function keywords(id: string, ...statuses: StatusCode[]): AbilityDef {
  return { id, innate: always(...statuses) };
}

/**
 * Slay(X): fires on every X-th enemy slain. A Slay another card forces (`victim` null) fires
 * every threshold, since there is no count to be on. Either way it tells the side a Slay fired.
 */
export function slay(
  every: number,
  effect: (b: Battle, me: Fighter, victim: Fighter | null, excess: number) => void,
): NonNullable<Hooks<Fighter>['slay']> {
  return (b, me, victim, excess) => {
    if (victim && me.kills % every !== 0) return;
    b.trigger(me);
    effect(b, me, victim, excess);
    b.slayed(me);
  };
}

/** Two Slay thresholds on one card, run in order. */
export function slays(
  ...hooks: NonNullable<Hooks<Fighter>['slay']>[]
): NonNullable<Hooks<Fighter>['slay']> {
  return (b, me, victim, excess) => {
    for (const hook of hooks) hook(b, me, victim, excess);
  };
}

export function ofRealm(fighters: readonly Fighter[], realm: RealmCode): Fighter[] {
  return fighters.filter((fighter) => fighter.realm === realm);
}

/** The same card, wherever it is: "Valkyrie everywhere", "each Babi". */
export function sameCard(fighters: readonly Fighter[], unitId: string): Fighter[] {
  return fighters.filter((fighter) => fighter.unitId === unitId);
}

/** Flips a stored switch and returns which way it now points — the "switch Attack/Health" cards. */
export function alternate(me: Fighter, key = 'switch'): 0 | 1 {
  const next = me.memory.get(key) === 1 ? 0 : 1;
  me.memory.set(key, next);
  return next === 1 ? 0 : 1;
}
