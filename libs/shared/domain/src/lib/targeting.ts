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
  const column = columnOf(attackerIndex);
  const scan = columnScanOrder();
  const occupied = (index: number) => enemyBoard[index] != null;
  const taunts = scan.filter((index) => {
    const slot = enemyBoard[index];
    return slot != null && hasTaunt(slot.unitId);
  });

  const tauntInColumn = taunts.find((index) => columnOf(index) === column);
  if (tauntInColumn !== undefined) return { index: tauntInColumn, reason: 'taunt-in-column' };
  if (taunts.length) return { index: taunts[0], reason: 'nearest-taunt' };

  const back = column + BOARD_COLUMNS;
  if (occupied(column)) return { index: column, reason: 'front-in-column' };
  if (occupied(back)) return { index: back, reason: 'back-in-column' };

  const fallback = scan.find(occupied);
  return fallback === undefined ? null : { index: fallback, reason: 'fallback-scan' };
}
