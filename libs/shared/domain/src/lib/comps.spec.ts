import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Comp, DatasetCard } from '@mythictatics/shared/contracts';
import { CompSchema } from '@mythictatics/shared/contracts/schemas';
import { compBuilderParams, compUnitIds, filterComps, paragraphs } from './comps';
import { decodeDraftParams } from './draft-code';
import { realmOfCardId } from './realm-draft';
import { decodeShareCode } from './share-code';

const CANONICAL = join(import.meta.dirname, '../../../../../data/canonical');
const read = (name: string) => JSON.parse(readFileSync(join(CANONICAL, name), 'utf8'));

const cards: DatasetCard[] = read('cards.json');
const comps: Comp[] = read('comps.json');
const names = new Map(cards.map((card) => [card.id, card.name['en']]));
const unitName = (id: string) => names.get(id);
const byId = (id: string) => comps.find((comp) => comp.id === id)!;

describe('the comp dataset', () => {
  it('matches the comp schema, comp for comp', () => {
    for (const comp of comps) {
      const result = CompSchema.safeParse(comp);
      if (!result.success) throw new Error(`${comp.id}: ${JSON.stringify(result.error.issues)}`);
    }
    expect(comps.length).toBeGreaterThan(0);
  });

  it('names only cards the card dataset has, each of the right kind', () => {
    const kinds = new Map(cards.map((card) => [card.id, card.kind]));
    for (const comp of comps) {
      for (const id of compUnitIds(comp)) expect(kinds.get(id), `${comp.id} -> ${id}`).toBe('unit');
      for (const id of comp.patronGodIds) expect(kinds.get(id), `${comp.id} -> ${id}`).toBe('god');
    }
  });

  it('gives every comp a unique slug, which is also its id', () => {
    expect(new Set(comps.map((comp) => comp.slug)).size).toBe(comps.length);
    for (const comp of comps) expect(comp.id).toBe(comp.slug);
  });

  it('gives every comp a board and a guide to go with it', () => {
    for (const comp of comps) {
      expect(comp.idealBoard.some(Boolean), comp.id).toBe(true);
      expect(comp.howToPlay.trim(), comp.id).not.toBe('');
    }
  });
});

describe('compBuilderParams', () => {
  it('writes a link the builder reads back to the same board and patron', () => {
    const comp = byId('trojan-horse');
    const params = compBuilderParams(comp, comp.idealBoard, 'niles');
    const decoded = decodeShareCode(params['d']!);
    expect(decoded).toEqual({
      ok: true,
      build: { board: comp.idealBoard, patronGodId: comp.patronGodIds[0] },
    });
    // Ra locks Niles, so the builder takes it from the god rather than from `?r=`.
    expect(decodeDraftParams({ r: params['r'] ?? undefined }).realms).toEqual([]);
  });

  it('drafts the realms the board needs before the ones the comp merely suggests', () => {
    // Harmony drafts nothing of its own, but its board holds Olympus, Shenzhou and Yggdrasil.
    const harmony = byId('harmony');
    expect(decodeDraftParams({ r: compBuilderParams(harmony)['r'] ?? undefined }).realms).toEqual([
      'olympus',
      'shenzhou',
      'yggdrasil',
    ]);
  });

  it('never drafts more than three realms', () => {
    for (const comp of comps) {
      for (const board of [comp.idealBoard, ...comp.alternativeBoards]) {
        const realms = decodeDraftParams({ r: compBuilderParams(comp, board)['r'] ?? undefined });
        expect(realms.realms.length, comp.id).toBeLessThanOrEqual(3);
      }
    }
  });

  it('leaves the patron empty for a comp any god can play', () => {
    const decoded = decodeShareCode(compBuilderParams(byId('harmony'))['d']!);
    expect(decoded.ok && decoded.build.patronGodId).toBeNull();
  });
});

describe('filterComps', () => {
  const run = (filter: Partial<Parameters<typeof filterComps>[1]>) =>
    filterComps(
      comps,
      { difficulty: null, realm: null, query: '', ...filter },
      unitName,
      realmOfCardId,
    ).map((comp) => comp.id);

  it('lets everything through an empty filter, in order', () => {
    expect(run({})).toEqual(comps.map((comp) => comp.id));
  });

  it('filters by difficulty', () => {
    expect(run({ difficulty: 'advanced' })).toContain('giga-gilg');
    expect(run({ difficulty: 'advanced' })).not.toContain('harmony');
  });

  it('matches a realm the comp drafts or a unit on its board comes from', () => {
    expect(run({ realm: 'daehan' })).toEqual(
      expect.arrayContaining(['last-supper', 'sun-moon', 'underworld']),
    );
    expect(run({ realm: 'yggdrasil' })).toContain('harmony');
    expect(run({ realm: 'daehan' })).not.toContain('samurai');
  });

  it('searches names, guide text and unit names, ignoring case and accents', () => {
    expect(run({ query: 'PROMETHEUS' })).toEqual(expect.arrayContaining(['arsonist', 'kami-burn']));
    expect(run({ query: 'sun  moon' })).toContain('sun-moon');
    expect(run({ query: 'no such comp anywhere' })).toEqual([]);
  });
});

describe('paragraphs', () => {
  it('splits on blank lines and drops empty ones', () => {
    expect(paragraphs('One.\n\nTwo\nstill two.\n\n\n')).toEqual(['One.', 'Two\nstill two.']);
    expect(paragraphs(null)).toEqual([]);
  });
});
