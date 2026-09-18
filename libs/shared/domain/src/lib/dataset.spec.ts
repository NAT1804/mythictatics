import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REALM_CODES,
  REALM_NUMBERS,
  type Card,
  type DatasetCard,
} from '@mythictatics/shared/contracts';
import {
  DatasetCardSchema,
  DatasetIconSchema,
  DatasetKeywordSchema,
  DatasetMetaSchema,
  DatasetRealmSchema,
  CardSchema,
} from '@mythictatics/shared/contracts/schemas';
import {
  parseRichText,
  pick,
  plainText,
  toCard,
  toKeyword,
  toPlainText,
  toRealm,
  toSlug,
} from './dataset';
import { realmOfCardId } from './realm-draft';

const WORKSPACE = join(import.meta.dirname, '../../../../..');
const CANONICAL = join(WORKSPACE, 'data/canonical');
const PUBLIC_ROOT = join(WORKSPACE, 'apps/web/public');
const read = (name: string) => JSON.parse(readFileSync(join(CANONICAL, name), 'utf8'));

describe('parseRichText', () => {
  it('splits icons, highlights and plain runs', () => {
    expect(
      parseRichText(
        "<sprite name=icon_deploy><color=#D46C17>Deploy</color>: Reduce <color=#D46C17>Sanctum</color>'s cost",
      ),
    ).toEqual([
      { type: 'icon', name: 'icon_deploy' },
      { type: 'highlight', value: 'Deploy' },
      { type: 'text', value: ': Reduce ' },
      { type: 'highlight', value: 'Sanctum' },
      { type: 'text', value: "'s cost" },
    ]);
  });

  it('keeps an icon nested inside a highlight', () => {
    expect(parseRichText('<color=#fff><sprite name=icon_burn>Burn</color>')).toEqual([
      { type: 'icon', name: 'icon_burn' },
      { type: 'highlight', value: 'Burn' },
    ]);
  });

  it('drops tags it does not understand rather than emitting them', () => {
    expect(parseRichText('a<b>c</b>d')).toEqual([{ type: 'text', value: 'acd' }]);
    expect(parseRichText('<img src=x onerror=alert(1)>hi')).toEqual([
      { type: 'text', value: 'hi' },
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseRichText(null)).toEqual([]);
    expect(parseRichText('')).toEqual([]);
  });

  it('leaves {0} placeholders intact', () => {
    // The game fills these at runtime because cards in play change what a Medicine is worth, so
    // they have to survive parsing and reach the UI as written.
    expect(parseRichText('Give an ally +{0}/+{1} permanently')).toEqual([
      { type: 'text', value: 'Give an ally +{0}/+{1} permanently' },
    ]);
    expect(toPlainText('<color=#fff>Alchemy</color>: Get {0} Medicine')).toBe(
      'Alchemy: Get {0} Medicine',
    );
  });
});

describe('pick', () => {
  const text = { en: 'Scholar', 'vi-VN': 'Học giả' };

  it('takes the locale asked for, then English, then anything', () => {
    expect(pick(text, 'vi-VN')).toBe('Học giả');
    expect(pick(text, 'ko-KR')).toBe('Scholar');
    expect(pick({ 'ja-JP': '学者' }, 'ko-KR')).toBe('学者');
    expect(pick(null)).toBe('');
  });
});

describe('toSlug', () => {
  it('folds diacritics so a Vietnamese name still gives an ASCII slug', () => {
    expect(toSlug('Sumerian Scholar')).toBe('sumerian-scholar');
    expect(toSlug('Học giả Sumer')).toBe('hoc-gia-sumer');
    expect(toSlug('Đồng Vàng Cổ')).toBe('dong-vang-co');
  });
});

describe('the canonical dataset', () => {
  const cards = read('cards.json');
  const meta = read('meta.json');

  it('matches the dataset schema, card for card', () => {
    for (const card of cards) {
      const result = DatasetCardSchema.safeParse(card);
      if (!result.success) {
        throw new Error(`${card.id}: ${JSON.stringify(result.error.issues)}`);
      }
    }
    expect(cards).toHaveLength(meta.counts.cards);
  });

  it('agrees with its own metadata', () => {
    expect(DatasetMetaSchema.parse(meta)).toBeTruthy();
    for (const [kind, count] of Object.entries(meta.counts.byKind)) {
      expect(cards.filter((card: { kind: string }) => card.kind === kind)).toHaveLength(
        Number(count),
      );
    }
    // The coverage numbers are how a reader judges the dataset, so they have to be recounted
    // rather than carried over from whatever the last edit happened to leave behind.
    expect(cards.filter((card: { tier: number | null }) => card.tier != null)).toHaveLength(
      meta.coverage.tier,
    );
    expect(cards.filter((card: { cost: number | null }) => card.cost != null)).toHaveLength(
      meta.coverage.cost,
    );
  });

  it('does not carry a card it says it excluded', () => {
    const ids = new Set(cards.map((card: { id: string }) => card.id));
    for (const entry of meta.excluded ?? []) {
      expect(ids.has(entry.id), entry.id).toBe(false);
    }
  });

  it('gives every card art and a name in English and Vietnamese', () => {
    for (const card of cards) {
      expect(card.image, `${card.id} image`).toBeTruthy();
      expect(card.sprite, `${card.id} sprite`).toBeTruthy();
      expect(card.name.en, `${card.id} name.en`).toBeTruthy();
      expect(card.name['vi-VN'], `${card.id} name.vi-VN`).toBeTruthy();
    }
  });

  it('reports locale gaps rather than hiding them behind blank strings', () => {
    for (const [locale, count] of Object.entries(meta.localeCoverage)) {
      const actual = cards.filter((card: { name: Record<string, string> }) => card.name[locale]);
      expect(actual, `${locale} coverage`).toHaveLength(Number(count));
      // An absent key is how a missing translation is recorded; a blank one would be a bug.
      for (const card of cards) {
        if (locale in card.name)
          expect(card.name[locale].trim(), `${card.id}.${locale}`).not.toBe('');
      }
    }
  });

  it('only references keywords the dataset defines', () => {
    const defined = new Set(read('keywords.json').map((k: { key: string }) => k.key));
    for (const card of cards) {
      for (const keyword of card.keywords) {
        expect(defined.has(keyword), `${card.id} -> ${keyword}`).toBe(true);
      }
    }
  });

  it('validates keywords, realms and icons', () => {
    for (const keyword of read('keywords.json'))
      expect(DatasetKeywordSchema.parse(keyword)).toBeTruthy();
    for (const realm of read('realms.json')) expect(DatasetRealmSchema.parse(realm)).toBeTruthy();
    for (const icon of read('icons.json')) expect(DatasetIconSchema.parse(icon)).toBeTruthy();
  });

  it('serves exactly the art it recorded', () => {
    // The committed art is the only copy; the extraction output it came from is not kept. This
    // is what makes the dataset checkable on its own — a card whose picture was swapped, lost or
    // rebuilt from a different game version fails here.
    for (const card of cards) {
      const bytes = readFileSync(join(PUBLIC_ROOT, card.image));
      expect(createHash('sha256').update(bytes).digest('hex'), `${card.id} ${card.image}`).toBe(
        card.imageSha256,
      );
      expect(card.imageWidth, `${card.id} width`).toBeGreaterThan(0);
      expect(card.imageHeight, `${card.id} height`).toBeGreaterThan(0);
    }
  });

  it.each(['power', 'banner'])('serves the %s art it recorded, for every god', (kind) => {
    // Held to the same standard as the card art: the committed PNG is the only copy, so the hash
    // is what proves it came out of the build the dataset names.
    const gods = cards.filter((card: { kind: string }) => card.kind === 'god');
    expect(gods.length).toBeGreaterThan(0);
    for (const god of gods) {
      const art = god[kind];
      const bytes = readFileSync(join(PUBLIC_ROOT, art.image));
      expect(createHash('sha256').update(bytes).digest('hex'), `${god.id} ${art.image}`).toBe(
        art.imageSha256,
      );
    }
    // Each god's own art, never another's — the whole point of binding by the sprite's number.
    expect(
      new Set(gods.map((god: Record<string, { sprite: string }>) => god[kind].sprite)).size,
    ).toBe(gods.length);
  });

  it('has art for every icon a keyword names', () => {
    // A keyword panel renders the icon its title named, so a sprite with no art there would be a
    // silently missing picture rather than a failure.
    const sprites = new Set(read('icons.json').map((icon: { sprite: string }) => icon.sprite));
    const keywords = read('keywords.json').map((keyword: unknown) => toKeyword(keyword as never));
    const named = keywords.filter((keyword: { icon: string | null }) => keyword.icon !== null);
    expect(named.length).toBeGreaterThan(0);
    for (const keyword of named) {
      expect(sprites.has(keyword.icon), `${keyword.code} -> ${keyword.icon}`).toBe(true);
    }
  });

  it('serves every icon the dataset lists', () => {
    for (const icon of read('icons.json')) {
      const bytes = readFileSync(join(PUBLIC_ROOT, icon.image));
      expect(createHash('sha256').update(bytes).digest('hex'), icon.sprite).toBe(icon.sha256);
    }
  });

  it('has art for every Tier a card can be', () => {
    const icons = read('icons.json').filter((icon: { kind: string }) => icon.kind === 'tier');
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      expect(
        icons.some((icon: { tier: number | null }) => icon.tier === tier),
        `tier ${tier}`,
      ).toBe(true);
    }
  });

  it('keeps only the two locales the site ships', () => {
    expect(meta.locales).toEqual(['en', 'vi-VN']);
    for (const card of cards) {
      expect(Object.keys(card.name).sort(), card.id).toEqual(['en', 'vi-VN']);
    }
  });

  it('puts every god at the top Tier', () => {
    for (const card of cards.filter((c: { kind: string }) => c.kind === 'god')) {
      expect(card.tier, card.id).toBe(6);
    }
  });

  it('numbers its realms the way REALM_NUMBERS does', () => {
    // `REALM_NUMBERS` is what lets a realm be read off an id, so it is only safe while it says
    // the same thing as the dataset it was copied from.
    for (const realm of read('realms.json')) {
      expect(REALM_NUMBERS[realm.code as keyof typeof REALM_NUMBERS], realm.code).toBe(
        realm.number,
      );
    }
    expect(Object.keys(REALM_NUMBERS).sort()).toEqual([...REALM_CODES].sort());
  });

  it('lets every unit and realm spell be traced to its realm by id alone', () => {
    for (const card of cards) {
      if (card.kind === 'god') continue;
      // A shared Sanctum spell carries no realm number, and the dataset gives it no realm.
      expect(realmOfCardId(card.id) ?? null, card.id).toBe(card.realm);
    }
  });

  it('says in its metadata which fields the client did not supply', () => {
    // tier, cost, attack and health are not in the game build; the note is the only place that
    // is recorded now, so it has to keep naming them.
    for (const field of ['tier', 'cost', 'attack', 'health']) {
      expect(meta.source.note, field).toContain(field);
    }
  });
});

describe('mapping the dataset into contracts', () => {
  const cards = read('cards.json');

  it('maps every card to a valid Card', () => {
    for (const card of cards) {
      const result = CardSchema.safeParse(toCard(card));
      if (!result.success) {
        throw new Error(`${card.id}: ${JSON.stringify(result.error.issues)}`);
      }
    }
  });

  it('maps a unit with its stats, keywords and parsed text', () => {
    const scholar = toCard(cards.find((card: { id: string }) => card.id === 'm05001'));
    expect(scholar).toMatchObject({
      id: 'm05001',
      type: 'unit',
      slug: 'sumerian-scholar',
      name: 'Sumerian Scholar',
      realm: 'babylon',
      tier: 1,
      cost: 3,
    });
    if (scholar.type !== 'unit') throw new Error('expected a unit');
    expect(scholar.ranks.map((rank) => [rank.attack, rank.health])).toEqual([
      [3, 2],
      [6, 4],
      [12, 8],
    ]);
    expect(scholar.ranks[0].richText[0]).toEqual({ type: 'icon', name: 'icon_deploy' });
  });

  it('honours the locale for names and text', () => {
    const raw = cards.find((card: { id: string }) => card.id === 'm05001');
    const vietnamese = toCard(raw, 'vi-VN');
    expect(vietnamese.name).toBe('Học giả Sumer');
    if (vietnamese.type !== 'unit') throw new Error('expected a unit');
    expect(plainText(vietnamese.ranks[0].richText)).toContain('Thánh Đền');
  });

  it('reads back the plain text the client shipped, for every unit and every locale', () => {
    // `Card` keeps tokens only, so `plainText` has to reproduce what the client's own plain
    // strings say — otherwise dropping the second copy would have cost fidelity.
    for (const card of cards.filter((c: { kind: string }) => c.kind === 'unit')) {
      const unit = toCard(card);
      if (unit.type !== 'unit') throw new Error('expected a unit');
      unit.ranks.forEach((rank, index) => {
        expect(plainText(rank.richText), `${card.id} rank ${index}`).toBe(
          card.ranks[index].textPlain.en.replace(/\s+/g, ' ').trim(),
        );
      });
    }
  });

  it('carries a god body, power and descend quest across', () => {
    const poseidon = toCard(cards.find((card: { id: string }) => card.id === 'champ012'));
    if (poseidon.type !== 'god') throw new Error('expected a god');
    expect(poseidon.realm).toBe('olympus');
    expect(poseidon.tier).toBe(6);
    expect(poseidon.attack).toBeGreaterThan(0);
    expect(poseidon.powerName).toBeTruthy();
    expect(poseidon.powerImage).toBe('images/gods/powers/champ012.png');
    expect(poseidon.bannerImage).toBe('images/gods/banners/champ012.png');
    expect(poseidon.descendText.length).toBeGreaterThan(0);
    expect(poseidon.descendQuestText.length).toBeGreaterThan(0);
  });

  it('keeps the keywords a god carries in its power and passive', () => {
    const horus = toCard(cards.find((card: { id: string }) => card.id === 'champ001'));
    if (horus.type !== 'god') throw new Error('expected a god');
    expect(horus.keywords).toContain('taunt');
    // Two of the twenty gods genuinely have none; the rest must not silently lose theirs.
    const withKeywords = cards
      .filter((card: { kind: string }) => card.kind === 'god')
      .map((card: DatasetCard) => toCard(card))
      .filter((card: Card) => card.type === 'god' && card.keywords.length > 0);
    expect(withKeywords).toHaveLength(18);
  });

  it('keeps the two spell id widths and both subtypes', () => {
    const medicine = toCard(cards.find((card: { id: string }) => card.id === 's_04001'));
    if (medicine.type !== 'spell') throw new Error('expected a spell');
    expect(medicine.subtype).toBe('medicine');
    const sanctum = toCard(cards.find((card: { id: string }) => card.id === 's_001'));
    if (sanctum.type !== 'spell') throw new Error('expected a spell');
    expect(sanctum.subtype).toBe('sanctum');
  });

  it('keeps a spell realm, and leaves a shared Sanctum spell without one', () => {
    const medicine = toCard(cards.find((card: { id: string }) => card.id === 's_04001'));
    if (medicine.type !== 'spell') throw new Error('expected a spell');
    // The id carries the realm number, so dropping the realm would contradict the id itself.
    expect(medicine.realm).toBe('shenzhou');
    const sanctum = toCard(cards.find((card: { id: string }) => card.id === 's_001'));
    if (sanctum.type !== 'spell') throw new Error('expected a spell');
    expect(sanctum.realm).toBeNull();

    const realmed = cards
      .filter((card: { kind: string }) => card.kind === 'spell')
      .map((card: DatasetCard) => toCard(card))
      .filter((card: Card) => card.type === 'spell' && card.realm !== null);
    expect(realmed).toHaveLength(13);
  });

  it('parses each option of a spell that offers a choice', () => {
    const salvager = toCard(cards.find((card: { id: string }) => card.id === 's_050'));
    if (salvager.type !== 'spell') throw new Error('expected a spell');
    expect(salvager.options).toHaveLength(2);
    // Options carry the same markup as any other rules text, so they have to be tokenized too.
    expect(salvager.options[0]).toContainEqual({ type: 'highlight', value: 'Remove' });
    expect(salvager.options[1]).toContainEqual({ type: 'icon', name: 'icon_health' });

    const plain = toCard(cards.find((card: { id: string }) => card.id === 's_001'));
    if (plain.type !== 'spell') throw new Error('expected a spell');
    expect(plain.options).toEqual([]);
  });

  it('maps keywords and realms to their plain text', () => {
    const keyword = toKeyword(
      read('keywords.json').find((k: { key: string }) => k.key === 'deploy'),
    );
    expect(keyword.code).toBe('deploy');
    expect(keyword.title).not.toContain('<');
    // The title's markup names the icon the game shows beside the term; the words lose it, the
    // field keeps it.
    expect(keyword.icon).toBe('icon_deploy');
    // A keyword the client writes as words alone has none, rather than an invented sprite.
    expect(
      toKeyword(read('keywords.json').find((k: { key: string }) => k.key === 'aura')).icon,
    ).toBe(null);
    const realm = toRealm(read('realms.json').find((r: { code: string }) => r.code === 'babylon'));
    expect(realm).toEqual({ code: 'babylon', number: 5, name: 'Babylon' });
  });
});

describe('toPlainText', () => {
  it('strips markup and collapses whitespace', () => {
    expect(toPlainText('<sprite name=icon_deploy><color=#fff>Deploy</color>:  go')).toBe(
      'Deploy: go',
    );
  });
});
