import { BOARD_COLUMNS, BOARD_SIZE, type Board } from '@mythictatics/shared/contracts';

export type BoardRow = 'front' | 'back';

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => null);
}

export function columnOf(slotIndex: number): number {
  return slotIndex % BOARD_COLUMNS;
}

export function rowOf(slotIndex: number): BoardRow {
  return slotIndex < BOARD_COLUMNS ? 'front' : 'back';
}

/**
 * Attack order follows slot order (front row left-to-right, then back row).
 * Returns a map of occupied slot index -> 1-based turn number.
 */
export function turnOrder(board: Board): ReadonlyMap<number, number> {
  const order = new Map<number, number>();
  board.forEach((slot, index) => {
    if (slot) order.set(index, order.size + 1);
  });
  return order;
}

/** Column-by-column, left to right; front row before back row within each column. */
export function columnScanOrder(): readonly number[] {
  const order: number[] = [];
  for (let column = 0; column < BOARD_COLUMNS; column++) {
    order.push(column, column + BOARD_COLUMNS);
  }
  return order;
}
