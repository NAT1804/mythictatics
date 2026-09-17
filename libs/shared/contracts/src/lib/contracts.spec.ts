import { BoardSchema } from './board';
import { BOARD_SIZE } from './constants';
import { SpellSchema, UnitSchema } from './card';
import { CompSchema } from './comp';
import { DatasetIconSchema, DatasetUnitSchema } from './dataset';

const unit = {
  id: 'm05001',
  type: 'unit',
  slug: 'sumerian-scholar',
  name: 'Sumerian Scholar',
  image: 'images/units/babylon/m05001.png',
  realm: 'babylon',
  tier: 1,
  cost: 3,
  keywords: ['deploy'],
  ranks: [
    {
      rank: 0,
      attack: 3,
      health: 2,
      richText: [
        { type: 'icon', name: 'icon_deploy' },
        { type: 'highlight', value: 'Deploy' },
        { type: 'text', value: ": Reduce Sanctum's upgrade cost by 1" },
      ],
    },
  ],
};

describe('UnitSchema', () => {
  it('accepts a normalized unit', () => {
    expect(UnitSchema.parse(unit)).toEqual(unit);
  });

  it('rejects unknown realms and malformed ids', () => {
    expect(UnitSchema.safeParse({ ...unit, realm: 'atlantis' }).success).toBe(false);
    expect(UnitSchema.safeParse({ ...unit, id: 'champ004' }).success).toBe(false);
  });
});

describe('SpellSchema', () => {
  const spell = {
    id: 's_04001',
    type: 'spell',
    slug: 'amplification-pill',
    name: 'Amplification Pill',
    image: 'images/spells/s_04001.png',
    subtype: 'medicine',
    realm: 'shenzhou',
    tier: 1,
    // Medicine is granted by Alchemy, so a null cost here is the right answer, not a gap.
    cost: null,
    keywords: [],
    text: [{ type: 'text', value: 'Give an ally +{0}/+{1} permanently' }],
    options: [],
  };

  it('keeps the realm a spell belongs to, and allows a shared Sanctum spell to have none', () => {
    expect(SpellSchema.parse(spell)).toEqual(spell);
    expect(SpellSchema.parse({ ...spell, realm: null }).realm).toBeNull();
  });

  it('requires a tier and an options list rather than letting either go missing', () => {
    expect(SpellSchema.safeParse({ ...spell, tier: null }).success).toBe(false);
    expect(SpellSchema.safeParse({ ...spell, options: undefined }).success).toBe(false);
  });
});

describe('DatasetUnitSchema', () => {
  const row = {
    id: 'm05001',
    kind: 'unit',
    subtype: null,
    realm: 'babylon',
    sprite: 'babylon_card_character_5001',
    image: 'images/units/babylon/m05001.png',
    imageWidth: 379,
    imageHeight: 333,
    imageSha256: 'a'.repeat(64),
    keywords: ['deploy'],
    name: { en: 'Sumerian Scholar' },
    tier: 1,
    cost: 3,
    ranks: [{ rank: 0, attack: 3, health: 2, text: { en: 'x' }, textPlain: { en: 'x' } }],
  };

  it('accepts a canonical unit row', () => {
    expect(DatasetUnitSchema.safeParse(row).success).toBe(true);
  });

  // The mapping into `Card` no longer invents a 1 or a 0 for these, so a patch that drops one
  // has to fail here instead of reaching the site as a made-up number.
  it.each(['realm', 'tier', 'cost'])('rejects a unit whose %s went missing', (field) => {
    expect(DatasetUnitSchema.safeParse({ ...row, [field]: null }).success).toBe(false);
  });

  it('rejects a rank without stats', () => {
    const ranks = [{ ...row.ranks[0], attack: null }];
    expect(DatasetUnitSchema.safeParse({ ...row, ranks }).success).toBe(false);
  });
});

describe('DatasetIconSchema', () => {
  const art = {
    sprite: 'rarity-star_01',
    image: 'images/icons/tier/rarity-star_01.png',
    width: 50,
    height: 48,
    sha256: 'a'.repeat(64),
  };

  it('asks Tier art for a tier and leaves the other kinds without one', () => {
    const tierArt = { ...art, kind: 'tier', tier: 1, variant: null };
    expect(DatasetIconSchema.safeParse(tierArt).success).toBe(true);
    expect(DatasetIconSchema.safeParse({ ...art, kind: 'rank' }).success).toBe(true);
    // Tier art has to state its tier, even when the answer is null — the generic star. That is
    // the whole point of splitting by kind rather than making the field optional everywhere.
    expect(DatasetIconSchema.safeParse({ ...art, kind: 'tier' }).success).toBe(false);
  });

  it('keeps a tier off the kinds that have none', () => {
    const parsed = DatasetIconSchema.parse({ ...art, kind: 'rank', tier: 3 });
    expect(parsed).not.toHaveProperty('tier');
  });
});

describe('BoardSchema', () => {
  it('requires exactly six slots', () => {
    expect(BoardSchema.safeParse(Array(BOARD_SIZE).fill(null)).success).toBe(true);
    expect(BoardSchema.safeParse(Array(BOARD_SIZE - 1).fill(null)).success).toBe(false);
  });
});

describe('CompSchema', () => {
  it('accepts a comp with any patron god', () => {
    const result = CompSchema.safeParse({
      id: 'harmony',
      slug: 'harmony',
      name: 'Harmony',
      difficulty: 'basic',
      patronGodIds: [],
      realms: [],
      whenToCommit: 'Core units + enablers',
      idealBoard: [{ unitId: 'm05001', rank: 2 }, null, null, null, null, null],
      alternativeBoards: [],
      coreUnitIds: ['m05001'],
      enablerUnitIds: [],
      addOnUnitIds: [],
      howToPlay: 'Hybrid scaling.',
      tags: ['scaling'],
      gameVersion: '1.5.6',
      source: { type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/x' },
      updatedAt: '2026-09-14T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('leaves Neutral out of the realms, since every draft has it', () => {
    const realms = CompSchema.shape.realms;
    expect(realms.safeParse(['babylon', 'kami']).success).toBe(true);
    expect(realms.safeParse(['neutral']).success).toBe(false);
    expect(realms.safeParse(['babylon', 'kami', 'niles', 'olympus']).success).toBe(false);
  });
});
