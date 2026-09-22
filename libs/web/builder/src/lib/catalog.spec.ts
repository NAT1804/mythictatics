import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationRef, PLATFORM_ID, TransferState, makeStateKey } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CatalogService } from './catalog';

const CANONICAL = join(import.meta.dirname, '../../../../../data/canonical');
const FILES = ['cards.json', 'keywords.json', 'realms.json', 'icons.json'] as const;
const DATASET = Object.fromEntries(
  FILES.map((name) => [name, JSON.parse(readFileSync(join(CANONICAL, name), 'utf8'))]),
);

/** Sumerian Scholar, and the first god in the dataset. */
const UNIT = 'm05001';
const GOD = DATASET['cards.json'].find((card: { kind: string }) => card.kind === 'god').id;

/** A fetch that answers from `data/canonical/`, or one that never answers at all. */
function stubFetch(answer = true) {
  const fetch = vi.fn((input: URL | string) => {
    if (!answer) return new Promise<Response>(() => undefined);
    const name = FILES.find((file) => String(input).endsWith(file));
    return Promise.resolve({
      ok: !!name,
      status: name ? 200 : 404,
      statusText: name ? 'OK' : 'Not Found',
      json: () => Promise.resolve(name ? DATASET[name] : null),
    } as Response);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const settle = () => TestBed.inject(ApplicationRef).whenStable();

describe('the catalog', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('on the server', () => {
    beforeEach(() =>
      TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] }),
    );

    it('loads nothing for a page that is prerendered as its loading state', async () => {
      const fetch = stubFetch();
      const catalog = TestBed.inject(CatalogService);
      await settle();

      expect(fetch).not.toHaveBeenCalled();
      expect(catalog.value()).toBeUndefined();
      expect(catalog.canLookUp()).toBe(false);
      // Nothing to hand over, so the page carries no catalog at all.
      expect(JSON.parse(TestBed.inject(TransferState).toJson())).not.toHaveProperty('catalog');
    });

    it('sends the browser only the cards the page read', async () => {
      stubFetch();
      const catalog = TestBed.inject(CatalogService);
      catalog.renderOnServer();
      await settle();

      expect(catalog.unit(UNIT)?.name).toBe('Sumerian Scholar');
      catalog.god(GOD);

      const { catalog: seed } = JSON.parse(TestBed.inject(TransferState).toJson());
      expect(seed.units.map((unit: { id: string }) => unit.id)).toEqual([UNIT]);
      expect(seed.gods.map((god: { id: string }) => god.id)).toEqual([GOD]);
      // The small tables go whole, so a card opened early still has its keywords and icons.
      expect(seed.keywords).toHaveLength(DATASET['keywords.json'].length);
      expect(seed.realms).toHaveLength(DATASET['realms.json'].length);
    });
  });

  describe('in the browser', () => {
    /** Renders a page on the server that reads `UNIT`, and returns what it hands the browser. */
    async function prerenderedSeed(): Promise<unknown> {
      TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
      stubFetch();
      const server = TestBed.inject(CatalogService);
      server.renderOnServer();
      await settle();
      server.unit(UNIT);
      const { catalog } = JSON.parse(TestBed.inject(TransferState).toJson());
      TestBed.resetTestingModule();
      return catalog;
    }

    it('looks cards up in what the server sent until its own fetch lands', async () => {
      const seed = await prerenderedSeed();
      TestBed.configureTestingModule({});
      TestBed.inject(TransferState).set(makeStateKey('catalog'), seed);
      stubFetch(false);

      const catalog = TestBed.inject(CatalogService);
      expect(catalog.canLookUp()).toBe(true);
      expect(catalog.unit(UNIT)?.name).toBe('Sumerian Scholar');
      // The seed is a page's handful of cards: nothing that lists the whole catalog sees it.
      expect(catalog.value()).toBeUndefined();
      expect(catalog.units()).toEqual([]);
    });

    it('moves on to the full catalog once it is in', async () => {
      const seed = await prerenderedSeed();
      TestBed.configureTestingModule({});
      TestBed.inject(TransferState).set(makeStateKey('catalog'), seed);
      stubFetch();

      const catalog = TestBed.inject(CatalogService);
      await settle();
      expect(catalog.units().length).toBeGreaterThan(1);
      expect(catalog.god(GOD)).toBeDefined();
    });
  });
});
