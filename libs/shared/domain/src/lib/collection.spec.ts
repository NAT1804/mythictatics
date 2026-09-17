import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasetCard, God, Spell, Unit } from '@mythictatics/shared/contracts';
import {
  REALMS_IN_GAME_ORDER,
  collectionCards,
  toCollectionRealm,
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

  it('reads unknown query values as the defaults', () => {
    expect(toCollectionRealm('kami')).toBe('kami');
    expect(toCollectionRealm('atlantis')).toBe('niles');
    expect(toCollectionRealm(undefined)).toBe('niles');
    expect(toCollectionTab('spells')).toBe('spells');
    expect(toCollectionTab('nope')).toBe('units');
  });

  it('files every card under exactly one realm', () => {
    for (const tab of ['units', 'gods', 'spells'] as const) {
      const total = REALMS_IN_GAME_ORDER.reduce(
        (sum, realm) => sum + collectionCards(cards, tab, realm).length,
        0,
      );
      expect(total).toBe(cards[tab].length);
    }
  });

  it('files Sanctum spells with Neutral and realm spells with their realm', () => {
    const neutral = collectionCards(cards, 'spells', 'neutral');
    expect(neutral.length).toBeGreaterThan(0);
    expect(neutral.every((spell) => spell.realm === null)).toBe(true);
    expect(collectionCards(cards, 'spells', 'shenzhou').every((s) => s.realm === 'shenzhou')).toBe(
      true,
    );
  });

  it('narrows by Tier and by name or rules text', () => {
    const tierOne = collectionCards(cards, 'units', 'niles', { query: '', tier: 1 });
    expect(tierOne.length).toBeGreaterThan(0);
    expect(tierOne.every((unit) => unit.tier === 1)).toBe(true);

    const [first] = collectionCards(cards, 'units', 'niles');
    const byName = collectionCards(cards, 'units', 'niles', {
      query: first.name.toUpperCase(),
      tier: null,
    });
    expect(byName.map((unit) => unit.id)).toContain(first.id);
    expect(collectionCards(cards, 'units', 'niles', { query: 'zzzz', tier: null })).toEqual([]);
  });
});
