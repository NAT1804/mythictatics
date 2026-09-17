import {
  NEUTRAL_REALM,
  REALM_CODES,
  REALM_NUMBERS,
  type Card,
  type God,
  type RealmCode,
  type Spell,
  type Tier,
  type Unit,
} from '@mythictatics/shared/contracts';
import { plainText } from './dataset';

/**
 * The realms in the order the game lists them — by their number, Niles first and Neutral last —
 * rather than the alphabetical order `REALM_CODES` is kept in.
 */
export const REALMS_IN_GAME_ORDER: readonly RealmCode[] = [...REALM_CODES].sort(
  (one, other) => REALM_NUMBERS[one] - REALM_NUMBERS[other],
);

/** The collection's three tabs, in the order the game's own Collection screen shows them. */
export const COLLECTION_TABS = ['gods', 'units', 'spells'] as const;
export type CollectionTab = (typeof COLLECTION_TABS)[number];

export const DEFAULT_COLLECTION_REALM: RealmCode = REALMS_IN_GAME_ORDER[0];
export const DEFAULT_COLLECTION_TAB: CollectionTab = 'units';

export interface CollectionCards {
  units: readonly Unit[];
  gods: readonly God[];
  spells: readonly Spell[];
}

export interface CollectionFilter {
  query: string;
  tier: Tier | null;
}

export const EMPTY_COLLECTION_FILTER: CollectionFilter = { query: '', tier: null };

/** A query-string value read as a realm, falling back to the one the game opens on. */
export function toCollectionRealm(value: string | null | undefined): RealmCode {
  return (REALM_CODES as readonly string[]).includes(value ?? '')
    ? (value as RealmCode)
    : DEFAULT_COLLECTION_REALM;
}

export function toCollectionTab(value: string | null | undefined): CollectionTab {
  return (COLLECTION_TABS as readonly string[]).includes(value ?? '')
    ? (value as CollectionTab)
    : DEFAULT_COLLECTION_TAB;
}

/**
 * The realm a card is filed under. A Sanctum spell belongs to no realm and can be offered to any,
 * so it is filed with Neutral — the one realm every draft has.
 */
export function collectionRealmOf(card: Card): RealmCode {
  return card.realm ?? NEUTRAL_REALM;
}

/** The cards one tab shows for one realm, narrowed by name/rules text and Tier. */
export function collectionCards(
  cards: CollectionCards,
  tab: CollectionTab,
  realm: RealmCode,
  filter: CollectionFilter = EMPTY_COLLECTION_FILTER,
): Card[] {
  const words = normalize(filter.query).split(' ').filter(Boolean);
  const source: readonly Card[] = cards[tab];

  return source.filter((card) => {
    if (collectionRealmOf(card) !== realm) return false;
    if (filter.tier !== null && card.tier !== filter.tier) return false;
    if (!words.length) return true;
    const haystack = normalize(`${card.name} ${plainText(rulesOf(card))}`);
    return words.every((word) => haystack.includes(word));
  });
}

function rulesOf(card: Card) {
  if (card.type === 'unit') return card.ranks.flatMap((rank) => rank.richText);
  if (card.type === 'god') return [...card.powerText, ...card.descendText];
  return [...card.text, ...card.options.flat()];
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
