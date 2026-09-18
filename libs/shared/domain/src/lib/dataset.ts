import {
  type Card,
  type DatasetCard,
  type DatasetGod,
  type DatasetKeyword,
  type DatasetRealm,
  type DatasetSpell,
  type DatasetUnit,
  type God,
  type Keyword,
  type Localized,
  type Realm,
  type RichTextToken,
  type Spell,
  type Unit,
  type UnitRank,
} from '@mythictatics/shared/contracts';

/**
 * Turns `data/canonical/` into the `Card` shape the app renders.
 *
 * Two things happen here, and they are the reason this is a step of its own rather than
 * something the dataset builder bakes in. The dataset keeps every locale the client ships, so a
 * locale has to be chosen; and it keeps the game's own rich-text markup, so that has to be
 * parsed into tokens instead of ever reaching a template as HTML.
 */

export const DEFAULT_LOCALE = 'en';

/**
 * The locale asked for, else English, else whatever the row has — never undefined.
 *
 * A blank value counts as missing, so a locale the builder could not drop still falls through
 * instead of rendering as an empty label.
 */
export function pick(text: Localized | null | undefined, locale = DEFAULT_LOCALE): string {
  if (!text) return '';
  const candidates = [text[locale], text[DEFAULT_LOCALE], ...Object.values(text)];
  return candidates.find((value) => value && value.trim() !== '') ?? '';
}

const MARKUP = /<sprite name=([^>\s]+)\s*>|<color=[^>]*>([\s\S]*?)<\/color>|<\/?[a-z][^>]*>/gi;

/**
 * Parses the game's markup into tokens. Only two constructs carry meaning — `<sprite name=…>`
 * for an inline icon and `<color=…>…</color>` for a highlighted rules term. Anything else is a
 * tag the game renderer cares about and we do not, so it is dropped rather than shown.
 *
 * Nothing is emitted as HTML, so a stray or hostile tag in the source cannot reach the DOM.
 */
export function parseRichText(markup: string | null | undefined): RichTextToken[] {
  if (!markup) return [];

  const tokens: RichTextToken[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens.at(-1);
    // Dropping a tag can leave two text runs adjacent; keep them as one token.
    if (last?.type === 'text') last.value += value;
    else tokens.push({ type: 'text', value });
  };

  let cursor = 0;
  for (const match of markup.matchAll(MARKUP)) {
    pushText(markup.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    const [, iconName, highlighted] = match;
    if (iconName !== undefined) tokens.push({ type: 'icon', name: iconName });
    else if (highlighted !== undefined) {
      // A highlight can itself contain an icon or a nested tag.
      for (const inner of parseRichText(highlighted)) {
        if (inner.type === 'text') tokens.push({ type: 'highlight', value: inner.value });
        else tokens.push(inner);
      }
    }
  }
  pushText(markup.slice(cursor));

  return tokens;
}

/**
 * Tokens read back as readable words, for titles, search and alt text. Icons carry no words, so
 * they contribute nothing.
 *
 * This is the only place a card's text becomes a plain string. `Card` carries tokens and nothing
 * else — a second, pre-flattened copy of every line would be one more thing to keep in step.
 */
export function plainText(tokens: readonly RichTextToken[]): string {
  return tokens
    .map((token) => (token.type === 'icon' ? '' : token.value))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The game's markup stripped to readable text, in one step. */
export function toPlainText(markup: string | null | undefined): string {
  return plainText(parseRichText(markup));
}

/**
 * A URL-safe name. Diacritics are folded so a Vietnamese name still yields an ASCII slug, and
 * the card id stays the join key — this is only ever for the address bar.
 */
export function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toUnit(card: DatasetUnit, locale: string): Unit {
  const name = pick(card.name, locale);
  const ranks: UnitRank[] = card.ranks.map((rank) => ({
    rank: rank.rank,
    attack: rank.attack,
    health: rank.health,
    richText: parseRichText(pick(rank.text, locale)),
  }));

  return {
    id: card.id,
    type: 'unit',
    slug: toSlug(name),
    name,
    image: card.image,
    realm: card.realm,
    tier: card.tier,
    cost: card.cost,
    keywords: card.keywords,
    ranks,
  };
}

function toGod(card: DatasetGod, locale: string): God {
  const name = pick(card.name, locale);
  return {
    id: card.id,
    type: 'god',
    slug: toSlug(name),
    name,
    image: card.image,
    realm: card.realm,
    realmLock: card.realmLock,
    tier: card.tier,
    attack: card.stats.attack,
    health: card.stats.health,
    keywords: card.keywords,
    powerName: pick(card.power.name, locale) || null,
    powerText: parseRichText(pick(card.power.description, locale)),
    powerImage: card.power.image,
    bannerImage: card.banner.image,
    descendText: parseRichText(pick(card.descendUnit, locale)),
    descendQuestText: parseRichText(pick(card.descendQuest, locale)),
  };
}

function toSpell(card: DatasetSpell, locale: string): Spell {
  const name = pick(card.name, locale);
  return {
    id: card.id,
    type: 'spell',
    slug: toSlug(name),
    name,
    image: card.image,
    subtype: card.subtype,
    realm: card.realm,
    tier: card.tier,
    cost: card.cost,
    keywords: card.keywords,
    text: parseRichText(pick(card.description, locale)),
    // A spell without a choice gets an empty list rather than an absent field, so the UI can
    // render options the same way for every spell.
    options: (card.options ?? []).map((option) => parseRichText(pick(option, locale))),
  };
}

export function toCard(card: DatasetCard, locale = DEFAULT_LOCALE): Card {
  if (card.kind === 'unit') return toUnit(card, locale);
  if (card.kind === 'god') return toGod(card, locale);
  return toSpell(card, locale);
}

export function toKeyword(keyword: DatasetKeyword, locale = DEFAULT_LOCALE): Keyword {
  const title = pick(keyword.title, locale);
  return {
    code: keyword.key,
    // The title ships with its own icon and colour markup; the app wants the words.
    title: toPlainText(title),
    description: keyword.description ? toPlainText(pick(keyword.description, locale)) : null,
    // …and the icon that markup named, kept as a field so a keyword panel can show the same
    // picture the game does without re-parsing the title. The first sprite is the keyword's own:
    // any later one belongs to a term the title refers to, the way Alchemy's title ends in
    // Celestial Medicine's icon.
    icon: parseRichText(title).find((token) => token.type === 'icon')?.name ?? null,
  };
}

export function toRealm(realm: DatasetRealm, locale = DEFAULT_LOCALE): Realm {
  return { code: realm.code, number: realm.number, name: pick(realm.name, locale) };
}
