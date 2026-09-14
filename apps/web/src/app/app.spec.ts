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

  it('loads a Codex share link on the builder', async () => {
    const harness = await RouterTestingHarness.create('/builder?d=ASEEiRMCOTAB');
    const board = harness.routeNativeElement?.querySelector('[data-testid="board"]');
    expect(board?.textContent).toContain('m05001 · R3');
    expect(board?.textContent).toContain('m12345 · R2');
  });

  it('falls back to the not-found page', async () => {
    const harness = await RouterTestingHarness.create('/nope');
    expect(harness.routeNativeElement?.textContent).toContain('404');
  });
});
