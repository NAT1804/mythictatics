import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { encodeShareCode } from '@mythictatics/shared/domain';
import { RouterTestingHarness } from '@angular/router/testing';
import { BuilderPage } from './builder-page';
import { BuilderStore } from './builder-store';

const CANONICAL = join(import.meta.dirname, '../../../../../data/canonical');
const FILES = ['cards.json', 'keywords.json', 'realms.json', 'icons.json'] as const;
const DATASET = Object.fromEntries(
  FILES.map((name) => [name, JSON.parse(readFileSync(join(CANONICAL, name), 'utf8'))]),
);

/**
 * `?d=ASEEiRMCOTAB` is the Codex link the app and e2e specs have always used: patron Anu, a Rank 3
 * Sumerian Scholar in slot 0, and `m12345` — a unit no dataset has — in slot 5.
 */
const CODEX_LINK = '/builder?d=ASEEiRMCOTAB';

async function openBuilder(url = '/builder'): Promise<{
  store: BuilderStore;
  element: HTMLElement;
  settle: () => Promise<void>;
}> {
  const harness = await RouterTestingHarness.create(url);
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    harness.detectChanges();
  };
  await settle();
  const store = harness.routeDebugElement!.injector.get(BuilderStore);
  return { store, element: harness.routeNativeElement as HTMLElement, settle };
}

describe('the builder', () => {
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
      providers: [provideRouter([{ path: 'builder', component: BuilderPage }])],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('opening a share link', () => {
    it('restores the board and patron a Codex link carries', async () => {
      const { store } = await openBuilder(CODEX_LINK);

      expect(store.patron()?.name).toBe('Anu');
      expect(store.board()[0]).toEqual({ unitId: 'm05001', rank: 2 });
      // A unit the catalog does not know is dropped rather than drawn as a hole.
      expect(store.board()[5]).toBeNull();
      expect(store.placedCount()).toBe(1);
    });

    it('drafts the realms the board implies, since a Codex link carries none', async () => {
      const { store } = await openBuilder(CODEX_LINK);
      // Sumerian Scholar is Babylon, so Babylon must be in the draft or it would be pruned off
      // the board the moment the page settled.
      expect(store.realms()).toContain('babylon');
      expect(store.board()[0]).not.toBeNull();
    });

    it('renders the restored unit on the board', async () => {
      const { element } = await openBuilder(CODEX_LINK);
      expect(element.querySelector('[data-testid="slot-0"]')?.textContent).toContain(
        'Sumerian Scholar',
      );
    });
  });

  describe('the patron god', () => {
    it('offers Any, which clears the god a link carried', async () => {
      const { store, element, settle } = await openBuilder(CODEX_LINK);
      const any = element.querySelector<HTMLButtonElement>('[data-testid="god-any"]')!;
      expect(any.getAttribute('aria-pressed')).toBe('false');

      any.click();
      await settle();
      expect(store.patron()).toBeNull();
      expect(any.getAttribute('aria-pressed')).toBe('true');
      expect(element.querySelector('[data-testid="god-detail"]')?.textContent).toContain(
        'Any patron god',
      );
    });

    it('draws the god picker above the board', async () => {
      const { element } = await openBuilder();
      const picker = element.querySelector('[data-testid="god-picker"]')!;
      const board = element.querySelector('[data-testid="slot-0"]')!;
      expect(picker.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('picks a god from its tile', async () => {
      const { store, element, settle } = await openBuilder();
      element.querySelector<HTMLButtonElement>('[data-god="champ002"]')!.click();
      await settle();
      expect(store.patron()?.id).toBe('champ002');
    });
  });

  describe('the realm draft', () => {
    it('spends one realm on a god that locks it, and leaves three on one that does not', async () => {
      const { store, settle } = await openBuilder();

      store.setPatron('champ002'); // Ra, locks Niles
      await settle();
      expect(store.draft().locked).toBe('niles');
      expect(store.picksLeft()).toBe(2);

      store.setPatron('champ001'); // Horus, same realm, no lock
      await settle();
      expect(store.draft().locked).toBeNull();
      expect(store.picksLeft()).toBe(3);
    });

    it('gives the third pick back when the lock is released', async () => {
      const { store, settle } = await openBuilder();
      store.setPatron('champ002');
      await settle();

      store.toggleLock();
      expect(store.lockEnabled()).toBe(false);
      expect(store.picksLeft()).toBe(3);
      expect(store.realms()).toEqual([]);
    });

    it('offers only drafted realms and Neutral in the pool', async () => {
      const { store, settle } = await openBuilder();
      store.setPatron('champ002');
      store.toggleRealm('kami');
      await settle();

      const realms = new Set(store.pool().map((unit) => unit.realm));
      expect([...realms].sort()).toEqual(['kami', 'neutral', 'niles']);
    });

    it('takes a realm’s units off the board when the realm is dropped', async () => {
      const { store, settle } = await openBuilder();
      store.toggleRealm('kami');
      await settle();
      const kami = store.pool().find((unit) => unit.realm === 'kami')!;
      store.place(kami.id, 0);
      expect(store.placedCount()).toBe(1);

      expect(store.unitsOnBoardFrom('kami')).toBe(1);
      store.toggleRealm('kami');
      expect(store.board()[0]).toBeNull();
    });

    it('refuses to place a unit from a realm that was never drafted', async () => {
      const { store, settle } = await openBuilder();
      store.toggleRealm('kami');
      await settle();
      store.place('m05001', 0); // Babylon
      expect(store.board()[0]).toBeNull();
    });
  });

  describe('the pool filters', () => {
    it('narrows by Tier and by name', async () => {
      const { store, settle } = await openBuilder();
      store.toggleRealm('babylon');
      await settle();

      store.setFilters({ tier: 1 });
      expect(store.pool().every((unit) => unit.tier === 1)).toBe(true);

      store.setFilters({ tier: null, search: 'sumerian scholar' });
      expect(store.pool().map((unit) => unit.id)).toContain('m05001');

      store.setFilters({ search: 'a name no card has' });
      expect(store.pool()).toEqual([]);
    });
  });

  describe('the board', () => {
    it('swaps two units rather than overwriting one', async () => {
      const { store, settle } = await openBuilder();
      store.toggleRealm('babylon');
      await settle();
      const [one, other] = store.pool();
      store.place(one.id, 0);
      store.place(other.id, 3);

      store.move(0, 3);
      expect(store.board()[0]?.unitId).toBe(other.id);
      expect(store.board()[3]?.unitId).toBe(one.id);
    });

    it('numbers the slots in attack order', async () => {
      const { store, settle } = await openBuilder();
      store.toggleRealm('babylon');
      await settle();
      const [one, other] = store.pool();
      store.place(one.id, 4);
      store.place(other.id, 1);
      expect([...store.turnOrder()]).toEqual([
        [1, 1],
        [4, 2],
      ]);
    });

    it('cycles a unit through the Ranks it actually has', async () => {
      const { store, settle } = await openBuilder();
      store.toggleRealm('babylon');
      await settle();
      store.place('m05001', 0);
      const ranks = store.pool().find((unit) => unit.id === 'm05001')!.ranks.length;

      for (let step = 1; step <= ranks; step++) store.cycleRank(0);
      expect(store.board()[0]?.rank).toBe(0);
    });
  });

  describe('descend', () => {
    it('lands on a unit, adds the god’s body to it, and shows both halves', async () => {
      const { store, settle } = await openBuilder();
      store.setPatron('champ002'); // Ra
      await settle();
      store.place('m01001', 0);
      store.toggleDescend(0);

      const descend = store.descend()!;
      const base = store.pool().find((unit) => unit.id === 'm01001')!.ranks[0];
      expect(descend.baseAttack).toBe(base.attack);
      expect(descend.attack).toBe(base.attack + store.patron()!.attack);
      expect(descend.health).toBe(base.health + store.patron()!.health);
    });

    it('follows the unit it came down on when the board is rearranged', async () => {
      const { store, settle } = await openBuilder();
      store.setPatron('champ002');
      await settle();
      store.place('m01001', 0);
      store.toggleDescend(0);

      store.move(0, 4);
      expect(store.descendSlot()).toBe(4);
      expect(store.descend()?.base.id).toBe('m01001');
    });

    it('comes back off the board when its unit is removed', async () => {
      const { store, settle } = await openBuilder();
      store.setPatron('champ002');
      await settle();
      store.place('m01001', 2);
      store.toggleDescend(2);

      store.remove(2);
      expect(store.descendSlot()).toBeNull();
      expect(store.descend()).toBeNull();
    });

    it('has nowhere to land while the board is empty', async () => {
      const { store, settle } = await openBuilder();
      store.setPatron('champ002');
      await settle();
      store.toggleDescend(0);
      expect(store.descendSlot()).toBeNull();
    });
  });

  describe('the URL', () => {
    it('writes the board into ?d= and the draft into parameters of its own', async () => {
      const { store, settle } = await openBuilder();
      store.setPatron('champ002');
      store.toggleRealm('kami');
      await settle();
      store.place('m01001', 1);
      await settle();

      const url = TestBed.inject(Router).url;
      // `?d=` stays exactly what the Codex teambuilder would write for this board.
      expect(url).toContain(
        `d=${encodeShareCode({ board: store.board(), patronGodId: 'champ002' })}`,
      );
      // The locked realm is not written — it is read back off the god.
      expect(url).toContain('r=kami');
      expect(url).not.toContain('lock=');
    });

    it('reads back a board it wrote', async () => {
      const code = encodeShareCode({
        board: [null, { unitId: 'm01001', rank: 0 }, null, null, null, null],
        patronGodId: 'champ002',
      });
      const { store } = await openBuilder(`/builder?d=${code}&r=kami`);

      expect(store.board()[1]).toEqual({ unitId: 'm01001', rank: 0 });
      expect(store.patron()?.id).toBe('champ002');
      expect(store.realms()).toEqual(['niles', 'kami']);
    });
  });
});
