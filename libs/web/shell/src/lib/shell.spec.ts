import { Component, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { NotFoundPage } from './not-found-page';
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

  it('sets a 404 status when server rendering', () => {
    const responseInit: ResponseInit = {};
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: RESPONSE_INIT, useValue: responseInit }],
    });
    TestBed.createComponent(NotFoundPage);
    expect(responseInit.status).toBe(404);
  });
});
