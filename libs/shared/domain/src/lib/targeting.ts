import { BOARD_COLUMNS, type Board } from '@mythictatics/shared/contracts';
import { columnOf, columnScanOrder } from './board';

/** Reason codes rather than prose so the UI can localize the explanation. */
export type TargetReason =
  'taunt-in-column' | 'nearest-taunt' | 'front-in-column' | 'back-in-column' | 'fallback-scan';

export interface TargetResult {
  index: number;
  reason: TargetReason;
}

export type KeywordCheck = (unitId: string) => boolean;

/**
 * What the targeting rule needs to know about the enemy board, slot by slot.
 *
 * Asked per slot rather than per unit id because a battle is not a board: two copies of one card
 * can differ mid-fight — one has lost its Taunt, one is Concealed and cannot be picked at all.
 */
export interface TargetBoard {
  /** Whether the slot holds a unit that can be picked as a target. */
  targetable(index: number): boolean;
  hasTaunt(index: number): boolean;
}

/**
 * Resolves which enemy slot a unit attacks, following the community-documented rules:
 * 1. A Taunt unit in the attacker's column.
 * 2. Otherwise the nearest Taunt unit (column scan, front before back).
 * 3. Otherwise the front-row, then back-row unit in the attacker's column.
 * 4. Otherwise the first occupied slot in column scan order.
 */
export function resolveTarget(
  attackerIndex: number,
  enemyBoard: Board,
  hasTaunt: KeywordCheck,
): TargetResult | null {
  return resolveTargetOn(attackerIndex, {
    targetable: (index) => enemyBoard[index] != null,
    hasTaunt: (index) => {
      const slot = enemyBoard[index];
      return slot != null && hasTaunt(slot.unitId);
    },
  });
}

/** The same rule over any board that can answer `TargetBoard` — the battle engine's, for one. */
export function resolveTargetOn(attackerIndex: number, enemy: TargetBoard): TargetResult | null {
  const column = columnOf(attackerIndex);
  const scan = columnScanOrder();
  const taunts = scan.filter((index) => enemy.targetable(index) && enemy.hasTaunt(index));

  const tauntInColumn = taunts.find((index) => columnOf(index) === column);
  if (tauntInColumn !== undefined) return { index: tauntInColumn, reason: 'taunt-in-column' };
  if (taunts.length) return { index: taunts[0], reason: 'nearest-taunt' };

  const back = column + BOARD_COLUMNS;
  if (enemy.targetable(column)) return { index: column, reason: 'front-in-column' };
  if (enemy.targetable(back)) return { index: back, reason: 'back-in-column' };

  const fallback = scan.find((index) => enemy.targetable(index));
  return fallback === undefined ? null : { index: fallback, reason: 'fallback-scan' };
}
