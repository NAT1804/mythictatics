import { Component, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { NotFoundPage } from './not-found-page';
import { Pwa } from './pwa';
import { ShellLayout } from './shell-layout';
import { clipDescription, provideShell, Seo, type SeoRouteData } from './seo';
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from './site';

@Component({ template: '' })
class BlankPage {}

describe('shell', () => {
  it('suffixes route titles with the site name', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideShell(),
        provideRouter([
          { path: '', component: BlankPage },
          { path: 'builder', title: 'Team Builder', component: BlankPage },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    const title = TestBed.inject(Title);

    await router.navigateByUrl('/builder');
    expect(title.getTitle()).toBe(`Team Builder · ${SITE_NAME}`);

    await router.navigateByUrl('/');
    expect(title.getTitle()).toMatch(new RegExp(`^${SITE_NAME} — `));
  });

  describe('head', () => {
    const head = () => document.head;
    const meta = (key: string) =>
      head().querySelector(`meta[name="${key}"], meta[property="${key}"]`)?.getAttribute('content');
    const canonical = () => head().querySelector('link[rel="canonical"]')?.getAttribute('href');
    const jsonLd = () => head().querySelector('script[type="application/ld+json"]')?.textContent;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideShell(),
          provideRouter([
            { path: '', component: BlankPage },
            {
              path: 'builder',
              title: 'Team Builder',
              data: { description: 'Plan a board.' } satisfies SeoRouteData,
              component: BlankPage,
            },
            {
              path: '**',
              title: 'Page not found',
              data: { noindex: true } satisfies SeoRouteData,
              component: BlankPage,
            },
          ]),
        ],
      });
    });

    it('describes each route, with a canonical link that drops the query string', async () => {
      await TestBed.inject(Router).navigateByUrl('/builder?d=ASEEiRMCOTAB');
      expect(meta('description')).toBe('Plan a board.');
      expect(canonical()).toBe(`${SITE_URL}/builder`);
      expect(meta('og:url')).toBe(`${SITE_URL}/builder`);
      expect(meta('og:title')).toBe(`Team Builder · ${SITE_NAME}`);
      expect(meta('og:image')).toBe(`${SITE_URL}/brand/icon-512.png`);
      expect(meta('robots')).toBeUndefined();

      await TestBed.inject(Router).navigateByUrl('/');
      expect(meta('description')).toBe(`${SITE_TAGLINE}.`);
      expect(canonical()).toBe(`${SITE_URL}/`);
    });

    it('keeps the 404 page out of the index', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/nope');
      expect(meta('robots')).toBe('noindex');
      expect(canonical()).toBeUndefined();

      await router.navigateByUrl('/builder');
      expect(meta('robots')).toBeUndefined();
      expect(canonical()).toBe(`${SITE_URL}/builder`);
    });

    it('writes structured data that cannot break out of its script element', () => {
      const seo = TestBed.inject(Seo);
      seo.set({
        title: 'T',
        description: 'D',
        path: '/comps/x',
        structuredData: { '@type': 'Thing', name: '</script><script>alert(1)</script>' },
      });
      expect(jsonLd()).not.toContain('<');
      expect(JSON.parse(jsonLd() ?? '')).toEqual({
        '@context': 'https://schema.org',
        '@type': 'Thing',
        name: '</script><script>alert(1)</script>',
      });
      expect(head().querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);

      seo.set({ title: 'T', description: 'D', path: '/' });
      expect(jsonLd()).toBeUndefined();
    });

    it('clips a description to what a search result shows, on a word', () => {
      expect(clipDescription('  short\n text ')).toBe('short text');
      const clipped = clipDescription('word '.repeat(60));
      expect(clipped.length).toBeLessThanOrEqual(160);
      expect(clipped).toMatch(/word…$/);
    });
  });

  it('renders the layout with the fan-site disclaimer', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ShellLayout);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('header')?.textContent).toContain(SITE_NAME);
    expect(element.querySelector('footer')?.textContent).toContain('not affiliated');
  });

  it('offers the browser install prompt from the header, once', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ShellLayout);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const button = () => element.querySelector<HTMLButtonElement>('[data-testid="install-app"]');
    expect(button()).toBeNull();

    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
    await fixture.whenStable();
    expect(event.defaultPrevented).toBe(true);

    button()?.click();
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await fixture.whenStable();
    expect(button()).toBeNull();
  });

  it('offers a waiting version as a reload', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ShellLayout);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="update-notice"]')).toBeNull();

    TestBed.inject(Pwa).updateReady.set(true);
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="update-notice"]')?.textContent).toContain('Reload');
  });

  it('sets a 404 status when server rendering', () => {
    const responseInit: ResponseInit = {};
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: RESPONSE_INIT, useValue: responseInit }],
    });
    TestBed.createComponent(NotFoundPage);
    expect(responseInit.status).toBe(404);
  });
});
