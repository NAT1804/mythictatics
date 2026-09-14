import { BoardSchema } from './board';
import { BOARD_SIZE } from './constants';
import { UnitSchema } from './card';
import { CompSchema } from './comp';

const unit = {
  id: 'm05001',
  type: 'unit',
  slug: 'sumerian-scholar',
  name: 'Sumerian Scholar',
  image: 'images/units/babylon/m05001_Sumerian_Scholar.png',
  realm: 'babylon',
  realmConfidence: 'confirmed',
  tier: 1,
  cost: 3,
  keywords: ['deploy'],
  ranks: [
    {
      rank: 0,
      attack: 3,
      health: 2,
      text: "Deploy: Reduce Sanctum's upgrade cost by 1",
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
      godPower: null,
      realms: ['neutral'],
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
});
