import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { decodeShareCode } from '@mythictatics/shared/domain';
import { CompPage } from './comp-page';
import { CompsPage } from './comps-page';

const CANONICAL = join(import.meta.dirname, '../../../../../data/canonical');
const FILES = ['cards.json', 'keywords.json', 'realms.json', 'icons.json', 'comps.json'] as const;
const DATASET = Object.fromEntries(
  FILES.map((name) => [name, JSON.parse(readFileSync(join(CANONICAL, name), 'utf8'))]),
);

async function open(url: string): Promise<{ element: HTMLElement; settle: () => Promise<void> }> {
  const harness = await RouterTestingHarness.create(url);
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    harness.detectChanges();
  };
  await settle();
  return { element: harness.routeNativeElement as HTMLElement, settle };
}

const all = (element: HTMLElement, testId: string) =>
  Array.from(element.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`));

describe('the comps screens', () => {
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
        provideRouter(
          [
            { path: 'comps', component: CompsPage },
            { path: 'comps/:slug', component: CompPage },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('the list', () => {
    it('shows a card for every comp', async () => {
      const { element } = await open('/comps');
      expect(all(element, 'comp-card')).toHaveLength(DATASET['comps.json'].length);
      expect(element.textContent).toContain('Death on the Nile');
    });

    it('narrows the list as the player types a unit name', async () => {
      const { element, settle } = await open('/comps');
      const search = all(element, 'comp-search')[0] as HTMLInputElement;
      search.value = 'wanyudo';
      search.dispatchEvent(new Event('input'));
      await settle();

      const names = all(element, 'comp-card').map((card) => card.querySelector('h2')?.textContent);
      expect(names).toEqual(['Kami-Burn']);
    });

    it('filters by difficulty', async () => {
      const { element, settle } = await open('/comps');
      const advanced = Array.from(element.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Advanced',
      )!;
      advanced.click();
      await settle();

      const expected = DATASET['comps.json'].filter(
        (comp: { difficulty: string }) => comp.difficulty === 'advanced',
      );
      expect(all(element, 'comp-card')).toHaveLength(expected.length);
    });
  });

  describe('a comp', () => {
    it('shows its conditions, its board and how to play it', async () => {
      const { element } = await open('/comps/death-on-the-nile');

      expect(element.querySelector('h1')?.textContent).toContain('Death on the Nile');
      expect(all(element, 'when-to-commit')[0].textContent).toContain('Core units + Sand Golem');
      expect(all(element, 'comp-slot-0')[0].textContent).toContain('Thoth');
      expect(all(element, 'how-to-play')[0].querySelectorAll('p')).toHaveLength(2);
      expect(element.textContent).toContain('Enablers');
    });

    it('draws a flexible slot as "Any"', async () => {
      const { element } = await open('/comps/big-pharma');
      // Big Pharma's back row is two open picks and Avidara.
      expect(all(element, 'comp-slot-3')[0].textContent?.trim()).toBe('Any');
    });

    it('shows the patron god a comp is built for, with its Power', async () => {
      const { element } = await open('/comps/giga-gilg');
      expect(element.textContent).toContain('Nezha');
      expect(element.textContent).toContain('Wind Fire Wheel');
    });

    it('links its board into the builder', async () => {
      const { element } = await open('/comps/trojan-horse');
      const link = all(element, 'open-in-builder')[0] as HTMLAnchorElement;
      const url = new URL(link.href, 'http://localhost');
      expect(url.pathname).toBe('/builder');

      const decoded = decodeShareCode(url.searchParams.get('d')!);
      expect(decoded.ok && decoded.build.patronGodId).toBe('champ002');
    });

    it('says so when there is no comp by that name', async () => {
      const { element } = await open('/comps/not-a-comp');
      expect(all(element, 'comp-not-found')).toHaveLength(1);
    });
  });
});
