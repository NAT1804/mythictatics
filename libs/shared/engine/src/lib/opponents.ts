import {
  BOARD_SIZE,
  NEUTRAL_REALM,
  REALM_CODES,
  type BattleSide,
  type BattleSlot,
  type Comp,
  type Rank,
  type RealmCode,
  type Unit,
} from '@mythictatics/shared/contracts';
import { Rng } from './rng';
import type { CardLookup } from './types';

/**
 * The AI's boards, for fighting before there is anyone else to fight.
 *
 * Both kinds draw from their own `Rng`, seeded off the battle's seed, so a battle link that
 * carries the seed brings back the same opponent as well as the same fight.
 */

/** How the AI's side is levelled: every unit it fields sits at this Rank. */
export type OpponentLevel = Rank;

/** Mixed into the battle seed so the opponent's draws never shadow the battle's own. */
const OPPONENT_SALT = 0x9e3779b9;

export function opponentRng(seed: number): Rng {
  return new Rng((seed ^ OPPONENT_SALT) >>> 0);
}

/**
 * A community comp as an opponent: its ideal board at `level`. A flexible slot ("Any" in the
 * sheet) gets a random unit from the comp's realms, so it is filled the way a player would fill
 * it rather than left as a gap no real board has.
 */
export function compOpponent(
  comp: Comp,
  cards: CardLookup,
  level: OpponentLevel,
  rng: Rng,
): BattleSide {
  const realms: RealmCode[] = [...comp.realms, NEUTRAL_REALM];
  const pool = cards.units.filter((unit) => realms.includes(unit.realm) && unit.tier <= 4);
  const board: (BattleSlot | null)[] = comp.idealBoard.map((slot) => {
    if (slot && cards.unit(slot.unitId)) return { unitId: slot.unitId, rank: level };
    const filler = rng.pick(pool);
    return filler ? { unitId: filler.id, rank: level } : null;
  });
  const patronGodId = comp.patronGodIds.find((id) => cards.god(id)) ?? null;
  return { board, patronGodId, descendSlot: patronGodId ? strongestSlot(board, cards) : null };
}

/**
 * A board drawn at random the way a run would draw one: three realms plus Neutral, six units
 * leaning on the higher Tiers, and a patron from one of those realms who descends onto the
 * strongest of them.
 */
export function randomOpponent(cards: CardLookup, level: OpponentLevel, rng: Rng): BattleSide {
  const realms = rng.sample(
    REALM_CODES.filter((realm) => realm !== NEUTRAL_REALM),
    3,
  );
  const allowed = new Set<RealmCode>([...realms, NEUTRAL_REALM]);
  const pool = cards.units.filter((unit) => allowed.has(unit.realm));
  const board: (BattleSlot | null)[] = [];
  for (let slot = 0; slot < BOARD_SIZE; slot++) {
    const unit = weightedByTier(pool, rng);
    board.push(unit ? { unitId: unit.id, rank: level } : null);
  }
  const gods = rng.sample(
    [...new Set(realms)].flatMap((realm) => godsOf(cards, realm)),
    1,
  );
  const patronGodId = gods[0] ?? null;
  return { board, patronGodId, descendSlot: patronGodId ? strongestSlot(board, cards) : null };
}

function godsOf(cards: CardLookup, realm: RealmCode): string[] {
  return cards.gods.filter((god) => god.realm === realm).map((god) => god.id);
}

/** Tier T is T times as likely as Tier 1: a late-game board, not a turn-one one. */
function weightedByTier(pool: readonly Unit[], rng: Rng): Unit | undefined {
  const total = pool.reduce((sum, unit) => sum + unit.tier, 0);
  let roll = rng.next() * total;
  for (const unit of pool) {
    roll -= unit.tier;
    if (roll < 0) return unit;
  }
  return pool.at(-1);
}

function strongestSlot(board: readonly (BattleSlot | null)[], cards: CardLookup): number | null {
  let best: number | null = null;
  let bestScore = -1;
  board.forEach((slot, index) => {
    const unit = slot && cards.unit(slot.unitId);
    if (!slot || !unit) return;
    const stats = unit.ranks[Math.min(slot.rank, unit.ranks.length - 1)];
    const score = stats.attack + stats.health;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}
