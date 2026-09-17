import type { Board, Comp, CompDifficulty, RealmCode } from '@mythictatics/shared/contracts';
import { encodeDraftParams } from './draft-code';
import { draftedRealms, MAX_DRAFTED_REALMS } from './realm-draft';
import { encodeShareCode } from './share-code';

/**
 * The query string that opens a comp's board in the builder.
 *
 * `?d=` carries the board and the patron, as any builder link does. The realms go in `?r=`: the
 * ones the board itself needs come first, because the builder prunes a unit whose realm is not
 * drafted, then the comp's other realms as long as the draft still has room for them. A comp that
 * works with any patron opens with none, rather than one picked for the player.
 *
 * `lockedRealm` is the realm the patron god locks, if it does — the builder derives that one from
 * the god, so writing it into `?r=` as well would count it twice.
 */
export function compBuilderParams(
  comp: Comp,
  board: Board = comp.idealBoard,
  lockedRealm: RealmCode | null = null,
): Record<string, string | null> {
  const patronGodId = comp.patronGodIds[0] ?? null;
  const room = MAX_DRAFTED_REALMS - (lockedRealm ? 1 : 0);
  const realms: RealmCode[] = [];
  for (const realm of [...draftedRealms(board), ...comp.realms]) {
    if (realm === lockedRealm || realms.includes(realm) || realms.length >= room) continue;
    realms.push(realm);
  }

  return {
    d: encodeShareCode({ board, patronGodId }),
    ...encodeDraftParams({ realms, lockEnabled: true, descendSlot: null }),
  };
}

export interface CompFilter {
  difficulty: CompDifficulty | null;
  realm: RealmCode | null;
  /** Matched against the comp's name, its guide text and the names of every unit it uses. */
  query: string;
}

export const EMPTY_COMP_FILTER: CompFilter = { difficulty: null, realm: null, query: '' };

/** Every unit a comp names, on a board or in a list, each once. */
export function compUnitIds(comp: Comp): string[] {
  const boards = [comp.idealBoard, ...comp.alternativeBoards].flat();
  return [
    ...new Set([
      ...boards.flatMap((slot) => (slot ? [slot.unitId] : [])),
      ...comp.coreUnitIds,
      ...comp.enablerUnitIds,
      ...comp.addOnUnitIds,
    ]),
  ];
}

/**
 * The comps a filter lets through, in the order they were given.
 *
 * A realm matches a comp that drafts it, or that puts one of its units on a board — Harmony drafts
 * nothing but still wants an Olympus tech unit. Unit names come from the caller, so this stays a
 * pure function over ids.
 */
export function filterComps(
  comps: readonly Comp[],
  filter: CompFilter,
  unitName: (unitId: string) => string | undefined,
  realmOf: (unitId: string) => RealmCode | undefined,
): Comp[] {
  const words = normalize(filter.query).split(' ').filter(Boolean);

  return comps.filter((comp) => {
    if (filter.difficulty && comp.difficulty !== filter.difficulty) return false;

    const units = compUnitIds(comp);
    const drafted: readonly RealmCode[] = comp.realms;
    if (
      filter.realm &&
      !drafted.includes(filter.realm) &&
      !units.some((id) => realmOf(id) === filter.realm)
    ) {
      return false;
    }

    if (!words.length) return true;
    const haystack = normalize(
      [
        comp.name,
        comp.whenToCommit ?? '',
        comp.howToPlay,
        ...units.map((id) => unitName(id) ?? ''),
      ].join(' '),
    );
    return words.every((word) => haystack.includes(word));
  });
}

/** A comp's guide split into paragraphs, the way the sheet wrote them. */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
