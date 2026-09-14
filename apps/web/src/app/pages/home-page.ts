import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { REALM_CODES } from '@mythictatics/shared/contracts';
import { MAX_DRAFTED_REALMS } from '@mythictatics/shared/domain';
import { SITE_TAGLINE } from '@mythictatics/web/shell';

@Component({
  selector: 'mt-home-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="py-12 text-center">
      <h1 class="font-display text-4xl font-bold text-gold sm:text-5xl">Build better boards.</h1>
      <p class="mx-auto mt-4 max-w-2xl text-ink-dim">{{ tagline }}.</p>
      <a
        routerLink="/builder"
        class="mt-8 inline-block rounded-md bg-gold px-5 py-2.5 font-medium text-bg"
      >
        Open the Team Builder
      </a>
    </section>

    <section class="grid gap-4 sm:grid-cols-3">
      @for (feature of features; track feature.title) {
        <article class="rounded-lg border border-line bg-panel p-5">
          <h2 class="font-display text-lg text-ink">{{ feature.title }}</h2>
          <p class="mt-2 text-sm text-ink-dim">{{ feature.body }}</p>
        </article>
      }
    </section>

    <section class="mt-12">
      <h2 class="text-sm uppercase tracking-widest text-ink-faint">Realms</h2>
      <ul class="mt-3 flex flex-wrap gap-2">
        @for (realm of realms; track realm) {
          <li
            class="rounded-full border px-3 py-1 text-sm capitalize"
            [style.border-color]="'var(--color-realm-' + realm + ')'"
            [style.color]="'var(--color-realm-' + realm + ')'"
          >
            {{ realm }}
          </li>
        }
      </ul>
    </section>
  `,
})
export class HomePage {
  protected readonly tagline = SITE_TAGLINE;
  protected readonly realms = REALM_CODES;
  protected readonly features = [
    {
      title: 'Team comps',
      body: 'Community comps with ideal boards, core units, enablers and how to pilot them.',
    },
    {
      title: 'Board builder',
      body: `Plan a 3×2 board with up to ${MAX_DRAFTED_REALMS} realms, preview turn order and targeting, and share a link.`,
    },
    {
      title: 'Codex',
      body: 'Every unit, god, spell and keyword — searchable and versioned by patch.',
    },
  ];

  constructor() {
    inject(Meta).updateTag({ name: 'description', content: `${SITE_TAGLINE}.` });
  }
}
