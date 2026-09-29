import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Comp, DatasetCard, God, Unit } from '@mythictatics/shared/contracts';
import { encodeShareCode, toCard } from '@mythictatics/shared/domain';
import { createCardLookup, hashEvents, replayViews, simulate } from '@mythictatics/shared/engine';
import { battleLog } from './battle-log';
import { compBuild, planMatch, readBattleQuery } from './battle-match';
import { BattlePage } from './battle-page';

const CANONICAL = join(import.meta.dirname, '../../../../../data/canonical');
const FILES = ['cards.json', 'keywords.json', 'realms.json', 'icons.json', 'comps.json'] as const;
const DATASET = Object.fromEntries(
  FILES.map((name) => [name, JSON.parse(readFileSync(join(CANONICAL, name), 'utf8'))]),
);
const cards = (DATASET['cards.json'] as DatasetCard[]).map((card) => toCard(card));
const lookup = createCardLookup(
  cards.filter((card): card is Unit => card.type === 'unit'),
  cards.filter((card): card is God => card.type === 'god'),
);
const comps = DATASET['comps.json'] as Comp[];
const arsonist = comps.find((comp) => comp.slug === 'arsonist')!;
const code = encodeShareCode(compBuild(arsonist));

describe('readBattleQuery', () => {
  it('reads the board, the opponent, its level and the seed, with defaults', () => {
    expect(readBattleQuery({ d: code, vs: 'masochist', lv: '3', seed: '42', ds: '2' })).toEqual({
      code,
      descendSlot: 2,
      opponent: 'masochist',
      level: 3,
      seed: 42,
    });
    expect(readBattleQuery({})).toEqual({
      code: null,
      descendSlot: null,
      opponent: 'random',
      level: 1,
      seed: null,
    });
  });

  it('drops values it cannot use rather than failing the page', () => {
    expect(readBattleQuery({ lv: '9', seed: '-1', ds: 'x' })).toMatchObject({
      level: 1,
      seed: null,
      descendSlot: null,
    });
  });
});

describe('planMatch', () => {
  it('asks for a board, then for a seed, then fights', () => {
    expect(planMatch(readBattleQuery({}), lookup, comps)).toEqual({
      ok: false,
      reason: 'no-board',
    });
    expect(planMatch(readBattleQuery({ d: code }), lookup, comps)).toEqual({
      ok: false,
      reason: 'no-seed',
    });
    const plan = planMatch(readBattleQuery({ d: code, seed: '5', vs: 'masochist' }), lookup, comps);
    expect(plan.ok && plan.opponent.kind === 'comp' && plan.opponent.comp.slug).toBe('masochist');
  });

  it('refuses a code it cannot read', () => {
    expect(planMatch(readBattleQuery({ d: '!!', seed: '1' }), lookup, comps)).toEqual({
      ok: false,
      reason: 'bad-code',
    });
  });

  it('brings back the same fight from the same link', () => {
    const query = readBattleQuery({ d: code, seed: '77' });
    const one = planMatch(query, lookup, comps);
    const two = planMatch(query, lookup, comps);
    if (!one.ok || !two.ok) throw new Error('expected a match');
    expect(hashEvents(simulate(one.setup, lookup).events)).toBe(
      hashEvents(simulate(two.setup, lookup).events),
    );
  });
});

describe('battleLog', () => {
  it('writes a line per round, attack and death, and ends with the result', () => {
    const plan = planMatch(readBattleQuery({ d: code, seed: '3', vs: 'masochist' }), lookup, comps);
    if (!plan.ok) throw new Error('expected a match');
    const result = simulate(plan.setup, lookup);
    const lines = battleLog(result.events, replayViews(result.events), {
      fighter: (uid, view) => lookup.unit(view.fighters.get(uid)!.unitId)!.name,
      card: (id) => id,
      status: (status) => status,
    });
    // Start of Battle texts come first (Arsonist fields Cat Archer), then the rounds.
    expect(lines.find((line) => line.tone === 'round')?.text).toBe('Round 1');
    expect(lines.findIndex((line) => line.tone === 'round')).toBeGreaterThan(0);
    expect(lines.some((line) => line.tone === 'attack' && / attacks /.test(line.text))).toBe(true);
    expect(lines.at(-1)?.tone).toBe('end');
  });
});

describe('the battle page', () => {
  async function open(url: string) {
    const harness = await RouterTestingHarness.create(url);
    const settle = async () => {
      await TestBed.inject(ApplicationRef).whenStable();
      harness.detectChanges();
    };
    await settle();
    return { element: harness.routeNativeElement as HTMLElement, settle, harness };
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', (input: URL | string) => {
      const name = FILES.find((file) => String(input).endsWith(file));
      return Promise.resolve({
        ok: !!name,
        status: name ? 200 : 404,
        statusText: name ? 'OK' : 'Not Found',
        json: () => Promise.resolve(name ? DATASET[name] : null),
      } as Response);
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'battle', component: BattlePage }], withComponentInputBinding()),
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('offers the community comps when the link carries no board', async () => {
    const { element } = await open('/battle');
    expect(element.querySelector('[data-testid="team-picker"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="pick-arsonist"]')).not.toBeNull();
  });

  it('fights the board in the link and shows the fight it will replay', async () => {
    const { element, settle } = await open(`/battle?d=${code}&vs=masochist&seed=12`);
    await settle();
    const plan = planMatch(
      readBattleQuery({ d: code, vs: 'masochist', seed: '12' }),
      lookup,
      comps,
    );
    if (!plan.ok) throw new Error('expected a match');
    const expected = hashEvents(simulate(plan.setup, lookup).events);
    expect(element.querySelector('[data-testid="battle-hash"]')?.textContent).toBe(expected);
    expect(element.querySelector('[data-testid="enemy-label"]')?.textContent?.trim()).toBe(
      'Masochist',
    );
    // Twelve slots, six a side, every one of them drawn whether or not a unit stands in it.
    expect(element.querySelectorAll('[data-fx]')).toHaveLength(12);
  });

  it('writes a seed into a link that has none', async () => {
    const { settle } = await open(`/battle?d=${code}`);
    await settle();
    expect(TestBed.inject(Router).url).toMatch(/seed=\d+/);
  });
});
