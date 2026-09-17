import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  type ActivatedRouteSnapshot,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { SITE_NAME } from './site';

interface NavItem {
  label: string;
  path?: string;
}

/**
 * Two layouts, chosen by the route.
 *
 * Most pages are documents: they flow, and the page scrolls. The builder is a workspace — it
 * pins itself to the viewport and scrolls only its unit list — and a scrolling page would fight
 * it. A route asks for that with `data: { layout: 'fixed' }`, which turns the shell itself into a
 * fixed-height column so the outlet can be told to fill exactly what is left.
 */
type Layout = 'flow' | 'fixed';

@Component({
  selector: 'mt-shell-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col',
    '[class.min-h-dvh]': "layout() === 'flow'",
    '[class.h-dvh]': "layout() === 'fixed'",
    '[class.overflow-hidden]': "layout() === 'fixed'",
  },
  template: `
    <header class="shrink-0 border-b border-line bg-panel/80 backdrop-blur">
      <nav
        class="mx-auto flex flex-wrap items-center gap-x-6 gap-y-2 px-4"
        [class]="fixed() ? 'max-w-[110rem] py-2' : 'max-w-6xl py-3'"
      >
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

    <main
      class="mx-auto w-full flex-1"
      [class]="
        fixed()
          ? 'flex min-h-0 max-w-[110rem] flex-col overflow-hidden px-3 py-3'
          : 'max-w-6xl px-4 py-8'
      "
    >
      <router-outlet />
    </main>

    <footer
      class="shrink-0 border-t border-line text-center text-ink-faint"
      [class]="fixed() ? 'px-4 py-1 text-[10px]' : 'px-4 py-6 text-xs'"
    >
      <p>
        {{ siteName }} is an unofficial fan site and is not affiliated with or endorsed by Hepxion.
        Game names and assets belong to their respective owners.
      </p>
    </footer>
  `,
})
export class ShellLayout {
  private readonly router = inject(Router);

  protected readonly siteName = SITE_NAME;
  protected readonly nav: NavItem[] = [
    { label: 'Comps', path: '/comps' },
    { label: 'Builder', path: '/builder' },
    { label: 'Collection', path: '/collection' },
    { label: 'Guides' },
  ];

  protected readonly layout = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => layoutOf(this.router.routerState.snapshot.root)),
    ),
    { initialValue: 'flow' },
  );

  protected readonly fixed = computed(() => this.layout() === 'fixed');
}

/** The deepest route that names a layout wins, so a child can opt in without the parent knowing. */
function layoutOf(route: ActivatedRouteSnapshot): Layout {
  let layout: Layout = 'flow';
  for (let current: ActivatedRouteSnapshot | null = route; current; current = current.firstChild) {
    if (current.data['layout'] === 'fixed') layout = 'fixed';
    else if (current.data['layout'] === 'flow') layout = 'flow';
  }
  return layout;
}
