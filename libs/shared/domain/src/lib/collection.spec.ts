import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasetCard, God, Spell, Unit } from '@mythictatics/shared/contracts';
import {
  REALMS_IN_GAME_ORDER,
  collectionCards,
  toCollectionRealm,
  toCollectionSpellKind,
  toCollectionTab,
  type CollectionCards,
} from './collection';
import { toCard } from './dataset';

const CANONICAL = join(import.meta.dirname, '../../../../../data/canonical');
const dataset: DatasetCard[] = JSON.parse(readFileSync(join(CANONICAL, 'cards.json'), 'utf8'));
const mapped = dataset.map((card) => toCard(card));
const cards: CollectionCards = {
  units: mapped.filter((card): card is Unit => card.type === 'unit'),
  gods: mapped.filter((card): card is God => card.type === 'god'),
  spells: mapped.filter((card): card is Spell => card.type === 'spell'),
};

describe('the collection', () => {
  it('lists realms the way the game does, Niles first and Neutral last', () => {
    expect(REALMS_IN_GAME_ORDER[0]).toBe('niles');
    expect(REALMS_IN_GAME_ORDER.at(-1)).toBe('neutral');
    expect(REALMS_IN_GAME_ORDER).toHaveLength(8);
  });

  it('reads unknown query values as the defaults, and `all` as no scope at all', () => {
    expect(toCollectionRealm('kami')).toBe('kami');
    expect(toCollectionRealm('atlantis')).toBe('niles');
    expect(toCollectionRealm(undefined)).toBe('niles');
    expect(toCollectionRealm('all')).toBeNull();
    expect(toCollectionSpellKind('medicine')).toBe('medicine');
    expect(toCollectionSpellKind('all')).toBeNull();
    expect(toCollectionSpellKind(undefined)).toBeNull();
    expect(toCollectionTab('spells')).toBe('spells');
    expect(toCollectionTab('nope')).toBe('units');
  });

  it('files every god and unit under exactly one realm', () => {
    for (const tab of ['units', 'gods'] as const) {
      const total = REALMS_IN_GAME_ORDER.reduce(
        (sum, realm) => sum + collectionCards(cards, { tab, realm, spellKind: null }).length,
        0,
      );
      expect(total).toBe(cards[tab].length);
    }
  });

  it('browses spells by kind rather than by realm', () => {
    const sanctum = collectionCards(cards, { tab: 'spells', realm: null, spellKind: 'sanctum' });
    const medicine = collectionCards(cards, { tab: 'spells', realm: null, spellKind: 'medicine' });
    // `collectionCards` hands back `Card`, so the kind is part of what is being asserted: the
    // Spells tab may only ever yield spells, and each of them the kind that was asked for.
    expect(sanctum.every((card) => card.type === 'spell' && card.subtype === 'sanctum')).toBe(true);
    expect(medicine.every((card) => card.type === 'spell' && card.subtype === 'medicine')).toBe(
      true,
    );
    expect(sanctum.length + medicine.length).toBe(cards.spells.length);
  });

  it('shows every realm when the scope is All', () => {
    const all = collectionCards(cards, { tab: 'units', realm: null, spellKind: null });
    expect(all).toHaveLength(cards.units.length);
    expect(collectionCards(cards, { tab: 'spells', realm: null, spellKind: null })).toHaveLength(
      cards.spells.length,
    );
  });

  it('narrows by Tier and by name or rules text', () => {
    const niles = { tab: 'units', realm: 'niles', spellKind: null } as const;
    const tierOne = collectionCards(cards, niles, { query: '', tier: 1 });
    expect(tierOne.length).toBeGreaterThan(0);
    expect(tierOne.every((unit) => unit.tier === 1)).toBe(true);

    const [first] = collectionCards(cards, niles);
    const byName = collectionCards(cards, niles, { query: first.name.toUpperCase(), tier: null });
    expect(byName.map((unit) => unit.id)).toContain(first.id);
    expect(collectionCards(cards, niles, { query: 'zzzz', tier: null })).toEqual([]);
  });
});
