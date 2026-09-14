import { ChangeDetectionStrategy, Component, inject, RESPONSE_INIT } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'mt-not-found-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="py-24 text-center">
      <p class="font-display text-6xl text-gold">404</p>
      <h1 class="mt-4 text-xl font-semibold">This page wandered off the battlefield.</h1>
      <a routerLink="/" class="mt-8 inline-block rounded-md bg-gold px-4 py-2 font-medium text-bg"
        >Back home</a
      >
    </section>
  `,
})
export class NotFoundPage {
  constructor() {
    // Only provided during server rendering.
    const responseInit = inject(RESPONSE_INIT, { optional: true });
    if (responseInit) responseInit.status = 404;
  }
}
