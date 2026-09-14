import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SITE_NAME } from './site';

interface NavItem {
  label: string;
  path?: string;
}

@Component({
  selector: 'mt-shell-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh flex-col' },
  template: `
    <header class="border-b border-line bg-panel/80 backdrop-blur">
      <nav class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <a routerLink="/" class="font-display text-lg font-bold tracking-wide text-gold">{{
          siteName
        }}</a>
        <ul class="flex flex-wrap items-center gap-4 text-sm">
          @for (item of nav; track item.label) {
            <li>
              @if (item.path) {
                <a
                  [routerLink]="item.path"
                  routerLinkActive="text-gold"
                  class="text-ink-dim transition-colors hover:text-ink"
                  >{{ item.label }}</a
                >
              } @else {
                <span class="cursor-default text-ink-faint" title="Coming soon">{{
                  item.label
                }}</span>
              }
            </li>
          }
        </ul>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <router-outlet />
    </main>

    <footer class="border-t border-line px-4 py-6 text-center text-xs text-ink-faint">
      <p>
        {{ siteName }} is an unofficial fan site and is not affiliated with or endorsed by Hepxion.
        Game names and assets belong to their respective owners.
      </p>
    </footer>
  `,
})
export class ShellLayout {
  protected readonly siteName = SITE_NAME;
  protected readonly nav: NavItem[] = [
    { label: 'Comps' },
    { label: 'Builder', path: '/builder' },
    { label: 'Codex' },
    { label: 'Guides' },
  ];
}
