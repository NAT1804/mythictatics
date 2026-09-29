import type {
  BattleEvent,
  BattleResult,
  BattleSide,
  Build,
  God,
  MatchSetup,
  Unit,
} from '@mythictatics/shared/contracts';
import { descendTarget } from '@mythictatics/shared/domain';
import { Battle } from './battle';
import { ENGINE_VERSION } from './rules';
import type { CardLookup } from './types';

/**
 * Fights a battle. Pure: the same setup and cards give the same result, every time, anywhere.
 *
 * A setup written under other rules is refused rather than replayed wrongly — an old replay needs
 * the engine it was fought with.
 */
export function simulate(setup: MatchSetup, cards: CardLookup): BattleResult {
  if (setup.engineVersion !== ENGINE_VERSION) {
    throw new Error(`Setup is for engine ${setup.engineVersion}; this is ${ENGINE_VERSION}`);
  }
  return new Battle(setup, cards).run();
}

export function matchSetup(seed: number, sides: readonly [BattleSide, BattleSide]): MatchSetup {
  return { engineVersion: ENGINE_VERSION, seed: seed >>> 0, sides: [sides[0], sides[1]] };
}

/**
 * A builder's board as one side of a battle. The descend slot comes from its own query parameter
 * (see `draft-code.ts`); one that points at an empty slot is dropped, as the builder drops it.
 */
export function sideFromBuild(build: Build, descendSlot: number | null = null): BattleSide {
  const slot = build.patronGodId ? descendTarget(build.board, descendSlot) : null;
  return {
    board: build.board.map((entry) => (entry ? { unitId: entry.unitId, rank: entry.rank } : null)),
    patronGodId: build.patronGodId,
    descendSlot: slot,
  };
}

/**
 * The cards a battle reads, in id order whatever order they came in.
 *
 * The order is part of the rules: "a random Babylon unit" is a draw from a list, and the same
 * seed only draws the same unit from the same list. The site sorts its catalog for display and
 * node reads the dataset as it is on disk, so the lookup settles on an order of its own rather
 * than trusting either — otherwise a replay would differ between a browser and a Worker.
 */
export function createCardLookup(units: readonly Unit[], gods: readonly God[]): CardLookup {
  const sortedUnits = [...units].sort(byId);
  const sortedGods = [...gods].sort(byId);
  const unitById = new Map(sortedUnits.map((unit) => [unit.id, unit]));
  const godById = new Map(sortedGods.map((god) => [god.id, god]));
  return {
    unit: (id) => unitById.get(id),
    god: (id) => godById.get(id),
    units: sortedUnits,
    gods: sortedGods,
  };
}

function byId(one: { id: string }, two: { id: string }): number {
  return one.id < two.id ? -1 : one.id > two.id ? 1 : 0;
}

/**
 * A short fingerprint of an event log (FNV-1a over its JSON). Two runtimes that fought the same
 * setup print the same one, which is how the browser test checks it agrees with node.
 */
export function hashEvents(events: readonly BattleEvent[]): string {
  const text = JSON.stringify(events);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
