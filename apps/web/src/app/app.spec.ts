import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideShell } from '@mythictatics/web/shell';
import { appRoutes } from './app.routes';

describe('app routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(appRoutes, withComponentInputBinding()), provideShell()],
    });
  });

  it('renders the home page inside the shell', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Build better boards',
    );
  });

  it('lazy-loads the builder', async () => {
    // What a share link does once it is there is the builder library's own business; this is the
    // routing, so the catalog is stubbed empty rather than served.
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve([]) }),
    );
    const harness = await RouterTestingHarness.create('/builder');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Team Builder');
    vi.unstubAllGlobals();
  });

  it('falls back to the not-found page', async () => {
    const harness = await RouterTestingHarness.create('/nope');
    expect(harness.routeNativeElement?.textContent).toContain('404');
  });
});
