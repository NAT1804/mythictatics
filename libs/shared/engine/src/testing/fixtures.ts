import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOARD_SIZE,
  type BattleEvent,
  type BattleSide,
  type BattleSlot,
  type Comp,
  type DatasetCard,
  type God,
  type Rank,
  type RealmCode,
  type StatusCode,
  type Unit,
} from '@mythictatics/shared/contracts';
import { toCard } from '@mythictatics/shared/domain';
import { createCardLookup, matchSetup, simulate } from '../lib/simulate';
import type { CardLookup } from '../lib/types';

const CANONICAL = join(import.meta.dirname, '../../../../../data/canonical');
const read = <T>(name: string): T => JSON.parse(readFileSync(join(CANONICAL, name), 'utf8')) as T;

interface Dataset {
  units: Unit[];
  gods: God[];
  comps: Comp[];
  lookup: CardLookup;
}

let dataset: Dataset | undefined;

/** The real dataset, mapped the way the site maps it. Read once per test file. */
export function datasetCards(): Dataset {
  return (dataset ??= loadDataset());
}

function loadDataset(): Dataset {
  const cards = read<DatasetCard[]>('cards.json').map((card) => toCard(card));
  const units = cards.filter((card): card is Unit => card.type === 'unit');
  const gods = cards.filter((card): card is God => card.type === 'god');
  return { units, gods, comps: read<Comp[]>('comps.json'), lookup: createCardLookup(units, gods) };
}

/**
 * A card with no text of its own, so a test can give it exactly the keywords it is about. Ids
 * from `m99001` up are nowhere in the dataset and nowhere in the ability registry.
 */
export function testUnit(
  id: number,
  attack: number,
  health: number,
  realm: RealmCode = 'neutral',
): Unit {
  return {
    id: `m99${String(id).padStart(3, '0')}`,
    type: 'unit',
    slug: `test-${id}`,
    name: `Test ${id}`,
    image: null,
    realm,
    tier: 1,
    cost: 3,
    keywords: [],
    ranks: [{ rank: 0, attack, health, richText: [] }],
  };
}

export interface TestSlot {
  unit: Unit | string;
  rank?: Rank;
  attack?: number;
  health?: number;
  statuses?: StatusCode[];
}

/** A side from a sparse list of slots: `{ 0: {...}, 3: {...} }`. */
export function side(
  slots: Record<number, TestSlot>,
  patronGodId: string | null = null,
  descendSlot: number | null = null,
): BattleSide {
  const board: (BattleSlot | null)[] = Array.from({ length: BOARD_SIZE }, () => null);
  for (const [index, slot] of Object.entries(slots)) {
    board[Number(index)] = {
      unitId: typeof slot.unit === 'string' ? slot.unit : slot.unit.id,
      rank: slot.rank ?? 0,
      ...(slot.attack !== undefined ? { attack: slot.attack } : {}),
      ...(slot.health !== undefined ? { health: slot.health } : {}),
      ...(slot.statuses ? { statuses: slot.statuses } : {}),
    };
  }
  return { board, patronGodId, descendSlot };
}

/** Fights two sides over a lookup that knows the dataset plus any test units. */
export function fight(
  sides: [BattleSide, BattleSide],
  options: { seed?: number; extra?: Unit[]; base?: CardLookup } = {},
) {
  const base = options.base ?? datasetCards().lookup;
  const extra = options.extra ?? [];
  const lookup: CardLookup = extra.length
    ? createCardLookup([...base.units, ...extra], base.gods)
    : base;
  return simulate(matchSetup(options.seed ?? 1, sides), lookup);
}

export function ofType<T extends BattleEvent['type']>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type);
}
