import { Component, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { NotFoundPage } from './not-found-page';
import { Pwa } from './pwa';
import { ShellLayout } from './shell-layout';
import { provideShell, SITE_NAME } from './site';

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
