import type { Build, Comp, MatchSetup, Rank } from '@mythictatics/shared/contracts';
import { decodeShareCode, DRAFT_PARAM_KEYS } from '@mythictatics/shared/domain';
import {
  compOpponent,
  matchSetup,
  opponentRng,
  randomOpponent,
  sideFromBuild,
  type CardLookup,
} from '@mythictatics/shared/engine';

/**
 * What `/battle` reads off its address, and the fight it turns that into.
 *
 * The page keeps no state of its own: the player's board is the builder's own `?d=` and `ds`,
 * untouched, so a board goes from the builder to a battle and back without translation. The rest
 * is the battle's — who to fight, how strong, and the seed. With the seed in the address the link
 * *is* the replay: the same link fights the same fight, opponent draws and all.
 *
 * - `vs` — a community comp's slug, or `random` (the default).
 * - `lv` — the opponent's level, 1 to 3: the Rank every unit it fields sits at.
 * - `seed` — the battle's seed; the page picks one and writes it in when it is missing.
 */
export const BATTLE_PARAM_KEYS = {
  code: 'd',
  descend: DRAFT_PARAM_KEYS.descend,
  opponent: 'vs',
  level: 'lv',
  seed: 'seed',
} as const;

export const RANDOM_OPPONENT = 'random';

export const OPPONENT_LEVELS = [1, 2, 3] as const;
export type OpponentLevelParam = (typeof OPPONENT_LEVELS)[number];

export interface BattleQuery {
  code: string | null;
  descendSlot: number | null;
  /** A comp slug, or `RANDOM_OPPONENT`. */
  opponent: string;
  level: OpponentLevelParam;
  seed: number | null;
}

export function readBattleQuery(query: Record<string, string | undefined>): BattleQuery {
  const descend = Number(query[BATTLE_PARAM_KEYS.descend]);
  const level = Number(query[BATTLE_PARAM_KEYS.level]);
  const seed = Number(query[BATTLE_PARAM_KEYS.seed]);
  return {
    code: query[BATTLE_PARAM_KEYS.code] || null,
    descendSlot: Number.isInteger(descend) && descend >= 0 ? descend : null,
    opponent: query[BATTLE_PARAM_KEYS.opponent] || RANDOM_OPPONENT,
    level: (OPPONENT_LEVELS as readonly number[]).includes(level)
      ? (level as OpponentLevelParam)
      : 1,
    seed:
      query[BATTLE_PARAM_KEYS.seed] !== undefined &&
      Number.isInteger(seed) &&
      seed >= 0 &&
      seed <= 0xffffffff
        ? seed
        : null,
  };
}

export type Opponent = { kind: 'comp'; comp: Comp } | { kind: 'random' };

export type MatchPlan =
  | { ok: true; setup: MatchSetup; build: Build; opponent: Opponent }
  | { ok: false; reason: MatchProblem };

/**
 * - `no-board`: the address carries no board — the page offers to pick one.
 * - `bad-code`: `?d=` is not a share code this site can read.
 * - `empty-board`: it reads, but not one unit on it is in the current catalog.
 * - `no-seed`: waiting for the page to choose one.
 */
export type MatchProblem = 'no-board' | 'bad-code' | 'empty-board' | 'no-seed';

export function planMatch(
  query: BattleQuery,
  cards: CardLookup,
  comps: readonly Comp[],
): MatchPlan {
  if (!query.code) return { ok: false, reason: 'no-board' };
  const decoded = decodeShareCode(query.code, {
    isKnownUnit: (id) => !!cards.unit(id),
    isKnownGod: (id) => !!cards.god(id),
  });
  if (!decoded.ok) return { ok: false, reason: 'bad-code' };
  const build = decoded.build;
  if (!build.board.some(Boolean)) return { ok: false, reason: 'empty-board' };
  if (query.seed === null) return { ok: false, reason: 'no-seed' };

  const comp = comps.find((entry) => entry.slug === query.opponent);
  const level = (query.level - 1) as Rank;
  const rng = opponentRng(query.seed);
  const enemy = comp ? compOpponent(comp, cards, level, rng) : randomOpponent(cards, level, rng);
  return {
    ok: true,
    build,
    opponent: comp ? { kind: 'comp', comp } : { kind: 'random' },
    setup: matchSetup(query.seed, [sideFromBuild(build, query.descendSlot), enemy]),
  };
}

/**
 * A community comp as the player's own board: the share code the builder would write for it, so
 * picking a comp here is the same as opening it in the builder and pressing Battle.
 */
export function compBuild(comp: Comp): Build {
  return { board: comp.idealBoard, patronGodId: comp.patronGodIds[0] ?? null };
}
