import type { Board, God, Rank, Unit } from '@mythictatics/shared/contracts';

/**
 * Descend: the patron god comes down onto a unit already on the board.
 *
 * The god does not take a seventh seat — it lands on one of the six and consumes it. The board
 * keeps its shape, the slot keeps its place in the turn order, and the consumed unit is still
 * what decides which column the god fights in.
 *
 * ## The stat rule, and why it is one function
 *
 * The game states it on the Patron God screen: "Patron God can Descend on any ally, consuming
 * their stats and effect." So the god keeps its own body — the `attack`/`health` a god carries is
 * the one it fights with once it has come down — and adds the stats of the ally it consumed,
 * whose effect it keeps too. `descendPreview` is deliberately the only place that sum is
 * computed, so a rule change is a change here and nowhere else.
 */
export interface DescendPreview {
  god: God;
  base: Unit;
  /** The Rank the base unit is sitting at, which is where its half of the stats comes from. */
  rank: Rank;
  baseAttack: number;
  baseHealth: number;
  attack: number;
  health: number;
}

/** The slot a god has descended onto, or null. Out-of-range and empty slots read as null. */
export function descendTarget(board: Board, slotIndex: number | null): number | null {
  if (slotIndex === null || slotIndex < 0 || slotIndex >= board.length) return null;
  return board[slotIndex] ? slotIndex : null;
}

/** A god can only land on a slot that already holds a unit. */
export function canDescendOnto(board: Board, slotIndex: number): boolean {
  return descendTarget(board, slotIndex) !== null;
}

/**
 * What the slot shows once the god has landed on it: both halves of the body, and the total.
 *
 * Both halves are kept rather than just the sum so the UI can show where the numbers came from —
 * a player reading a 34/27 slot needs to see which part is the god.
 */
export function descendPreview(god: God, base: Unit, rank: Rank): DescendPreview {
  const stats = base.ranks[Math.min(rank, base.ranks.length - 1)];
  return {
    god,
    base,
    rank,
    baseAttack: stats.attack,
    baseHealth: stats.health,
    attack: stats.attack + god.attack,
    health: stats.health + god.health,
  };
}
