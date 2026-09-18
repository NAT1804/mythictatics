import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CollectionPage } from './collection-page';

const CANONICAL = join(import.meta.dirname, '../../../../../data/canonical');
const FILES = ['cards.json', 'keywords.json', 'realms.json', 'icons.json'] as const;
const DATASET = Object.fromEntries(
  FILES.map((name) => [name, JSON.parse(readFileSync(join(CANONICAL, name), 'utf8'))]),
);
const cards: { kind: string; realm: string | null; subtype: string | null }[] =
  DATASET['cards.json'];
const countOf = (kind: string, realm: string | null) =>
  cards.filter((card) => card.kind === kind && card.realm === realm).length;

async function open(url: string) {
  const harness = await RouterTestingHarness.create(url);
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    harness.detectChanges();
  };
  await settle();
  // Only one harness may exist per test, so a test that visits a second URL navigates this one.
  // `page()` is re-read after every navigation: the route's element is a new one each time.
  const go = async (next: string) => {
    await harness.navigateByUrl(next);
    await settle();
  };
  const page = () => harness.routeNativeElement as HTMLElement;
  return { harness, element: harness.routeNativeElement as HTMLElement, settle, go, page };
}

const all = (element: HTMLElement, testId: string) =>
  Array.from(element.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`));
const one = (element: HTMLElement, testId: string) =>
  element.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

describe('the collection screen', () => {
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
          [{ path: 'collection', component: CollectionPage }],
          withComponentInputBinding(),
        ),
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('opens on Niles units, as the game does', async () => {
    const { element } = await open('/collection');
    expect(one(element, 'scope-name')?.textContent).toContain('Niles');
    expect(one(element, 'tab-units')?.getAttribute('aria-current')).toBe('page');
    expect(all(element, 'collection-card')).toHaveLength(countOf('unit', 'niles'));
  });

  it('shows the realm and tab named in the query string', async () => {
    const { element } = await open('/collection?realm=babylon&tab=gods');
    expect(one(element, 'scope-name')?.textContent).toContain('Babylon');
    expect(all(element, 'collection-card')).toHaveLength(countOf('god', 'babylon'));
  });

  it('shows every realm at once on All', async () => {
    const { element } = await open('/collection?realm=all');
    expect(one(element, 'scope-name')?.textContent).toContain('All');
    expect(all(element, 'collection-card')).toHaveLength(
      cards.filter((card) => card.kind === 'unit').length,
    );
  });

  it('browses spells by kind, not by realm', async () => {
    const { element, go, page } = await open('/collection?realm=neutral&tab=spells');
    expect(all(element, 'collection-card')).toHaveLength(
      cards.filter((card) => card.kind === 'spell').length,
    );

    await go('/collection?tab=spells&spell=medicine');
    expect(one(page(), 'scope-name')?.textContent).toContain('Medicine');
    expect(all(page(), 'collection-card')).toHaveLength(
      cards.filter((card) => card.kind === 'spell' && card.subtype === 'medicine').length,
    );
  });

  it('says so when a realm has nothing on a tab', async () => {
    const { element } = await open('/collection?realm=neutral&tab=gods');
    expect(all(element, 'collection-card')).toHaveLength(0);
    expect(element.textContent).toContain('Neutral has no patron god.');
  });

  it('switches realm from the realm chips', async () => {
    const { harness, element, settle } = await open('/collection');
    element.querySelector<HTMLElement>('a[href*="realm=kami"]')?.click();
    await settle();
    const page = harness.routeNativeElement as HTMLElement;
    expect(one(page, 'scope-name')?.textContent).toContain('Kami');
    expect(all(page, 'collection-card')).toHaveLength(countOf('unit', 'kami'));
  });

  it('narrows the grid from the filter panel', async () => {
    const { element, settle } = await open('/collection');
    const tierOne = element.querySelector<HTMLElement>('[aria-label="Tier 1"]');
    tierOne?.click();
    await settle();
    const expected = cards.filter(
      (card) =>
        card.kind === 'unit' && card.realm === 'niles' && (card as { tier?: number }).tier === 1,
    ).length;
    expect(all(element, 'collection-card')).toHaveLength(expected);
  });

  it('opens the preview for a card', async () => {
    const { element, settle } = await open('/collection');
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    all(element, 'collection-card')[0].click();
    await settle();
    expect(element.querySelector('[data-testid="card-preview"]')).not.toBeNull();
  });
});
