import {
  REALM_CODES,
  REALM_NUMBERS,
  SPELL_SUBTYPES,
  type Card,
  type God,
  type RealmCode,
  type Spell,
  type SpellSubtype,
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

export const DEFAULT_COLLECTION_TAB: CollectionTab = 'units';

/** The query-string value for "every one of them", on either axis. */
export const COLLECTION_ALL = 'all';

export interface CollectionCards {
  units: readonly Unit[];
  gods: readonly God[];
  spells: readonly Spell[];
}

/**
 * What the screen is browsing, before the search box and the Tier buttons narrow it.
 *
 * The two axes do not overlap: gods and units are browsed by realm, spells by kind. A spell's
 * realm is not worth browsing by — fifty of the game's sixty-three belong to none, and all but
 * one of the rest are Shenzhou Medicines, which `spellKind` already names.
 */
export interface CollectionScope {
  tab: CollectionTab;
  /** The realm the Patron God and Units tabs show; null is every realm. */
  realm: RealmCode | null;
  /** The kind of spell the Spells tab shows; null is both kinds. */
  spellKind: SpellSubtype | null;
}

export interface CollectionFilter {
  query: string;
  tier: Tier | null;
}

export const EMPTY_COLLECTION_FILTER: CollectionFilter = { query: '', tier: null };

/**
 * A query-string value read as a realm: anything that is not a realm — `all`, a missing value,
 * anything unrecognised — is every realm.
 */
export function toCollectionRealm(value: string | null | undefined): RealmCode | null {
  return (REALM_CODES as readonly string[]).includes(value ?? '') ? (value as RealmCode) : null;
}

/** A query-string value read as a kind of spell; anything unrecognised is both kinds. */
export function toCollectionSpellKind(value: string | null | undefined): SpellSubtype | null {
  return (SPELL_SUBTYPES as readonly string[]).includes(value ?? '')
    ? (value as SpellSubtype)
    : null;
}

export function toCollectionTab(value: string | null | undefined): CollectionTab {
  return (COLLECTION_TABS as readonly string[]).includes(value ?? '')
    ? (value as CollectionTab)
    : DEFAULT_COLLECTION_TAB;
}

/** The cards one tab shows in scope, narrowed by name/rules text and Tier. */
export function collectionCards(
  cards: CollectionCards,
  scope: CollectionScope,
  filter: CollectionFilter = EMPTY_COLLECTION_FILTER,
): Card[] {
  const words = normalize(filter.query).split(' ').filter(Boolean);
  const source: readonly Card[] = cards[scope.tab];

  return source.filter((card) => {
    if (!inScope(card, scope)) return false;
    if (filter.tier !== null && card.tier !== filter.tier) return false;
    if (!words.length) return true;
    const haystack = normalize(`${card.name} ${plainText(rulesOf(card))}`);
    return words.every((word) => haystack.includes(word));
  });
}

function inScope(card: Card, scope: CollectionScope): boolean {
  if (card.type === 'spell') return !scope.spellKind || card.subtype === scope.spellKind;
  return !scope.realm || card.realm === scope.realm;
}

function rulesOf(card: Card) {
  if (card.type === 'unit') return card.ranks.flatMap((rank) => rank.richText);
  if (card.type === 'god') return [...card.powerText, ...card.descendText];
  return [...card.text, ...card.options.flat()];
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
