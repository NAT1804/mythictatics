import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { REALMS_IN_GAME_ORDER } from '@mythictatics/shared/domain';
import { SITE_TAGLINE } from '@mythictatics/web/shell';

/** How far from the ring's centre a realm sits, as a percentage of the ring's width. */
const ORBIT_RADIUS = 41;

/**
 * Where the game's realm icons are served from. Written out rather than read off the dataset's
 * icon table (as `RealmIcon` does) because this page is prerendered and must not wait on, or
 * statically pull in, the lazily loaded card catalog. The dataset tests hash every icon, so the
 * paths cannot drift without them failing.
 */
const REALM_ICON_DIR = 'images/icons/description';

@Component({
  selector: 'mt-home-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="py-12 text-center">
      <h1 class="font-display text-4xl font-bold text-gold sm:text-5xl">Build better boards.</h1>
      <p class="mx-auto mt-4 max-w-2xl text-ink-dim">{{ tagline }}.</p>
      <div class="mt-8 flex flex-wrap justify-center gap-3">
        <a routerLink="/builder" class="rounded-md bg-gold px-5 py-2.5 font-medium text-bg">
          Open the Team Builder
        </a>
        <a
          routerLink="/comps"
          class="rounded-md border border-gold/60 px-5 py-2.5 font-medium text-gold hover:bg-gold/10"
        >
          Browse Team Comps
        </a>
      </div>
    </section>

    <!--
      The realms, circling for as long as the page is open. Each one opens the collection on that
      realm. The ring stops while a pointer or keyboard focus is inside it, so a realm never slides
      out from under a click, and it holds still for anyone who asks for reduced motion.

      The ring turns one way and every realm turns back the other way just as fast, which is what
      keeps the icons and names upright all the way round.

    -->
    <section class="mt-4" aria-labelledby="realms-heading">
      <h2 id="realms-heading" class="text-center font-display text-2xl text-gold">The Realms</h2>
      <p class="mt-1 text-center text-sm text-ink-dim">
        Pick a realm to browse its patron gods, units and spells.
      </p>

      <div class="group relative mx-auto mt-6 aspect-square w-full max-w-md">
        <div
          class="absolute inset-[9%] rounded-full border border-gold/25 shadow-[inset_0_0_60px_rgba(212,169,58,0.08)]"
          aria-hidden="true"
        ></div>
        <div
          class="absolute inset-[24%] animate-[spin_90s_linear_infinite_reverse] rounded-full border border-dashed border-gold/20 motion-reduce:animate-none"
          aria-hidden="true"
        ></div>

        <a
          routerLink="/collection"
          class="absolute inset-[31%] flex flex-col items-center justify-center rounded-full border border-gold/40 bg-[radial-gradient(circle,rgba(212,169,58,0.18),transparent_70%)] text-center transition-colors hover:border-gold"
        >
          <span class="font-display text-lg font-semibold text-gold sm:text-xl">Collection</span>
          <span class="mt-0.5 text-[11px] text-ink-faint">{{ orbit.length }} realms</span>
        </a>

        <ul
          class="absolute inset-0 animate-[spin_48s_linear_infinite] group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused] motion-reduce:animate-none"
          data-testid="realm-orbit"
        >
          @for (node of orbit; track node.code) {
            <li
              class="absolute -translate-x-1/2 -translate-y-1/2"
              [style.left.%]="node.x"
              [style.top.%]="node.y"
            >
              <a
                routerLink="/collection"
                [queryParams]="{ realm: node.code }"
                class="flex animate-[spin_48s_linear_infinite_reverse] flex-col items-center gap-1 group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused] motion-reduce:animate-none"
                [attr.data-realm]="node.code"
              >
                <span
                  class="flex h-12 w-12 items-center justify-center rounded-full border-2 bg-panel shadow-lg shadow-black/50 transition-transform duration-200 hover:scale-115 sm:h-16 sm:w-16"
                  [style.border-color]="node.color"
                  [style.box-shadow]="'0 0 18px ' + node.glow"
                >
                  <img
                    [src]="node.icon"
                    alt=""
                    class="h-7 w-7 object-contain sm:h-9 sm:w-9"
                    decoding="async"
                    draggable="false"
                  />
                </span>
                <span
                  class="rounded-full bg-bg/80 px-1.5 text-[11px] font-medium capitalize sm:text-xs"
                  [style.color]="node.color"
                  >{{ node.code }}</span
                >
              </a>
            </li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class HomePage {
  protected readonly tagline = SITE_TAGLINE;

  /** Each realm's place on the ring, starting at the top and running clockwise in game order. */
  protected readonly orbit = REALMS_IN_GAME_ORDER.map((code, index, all) => {
    const angle = (index / all.length) * 2 * Math.PI - Math.PI / 2;
    return {
      code,
      icon: `${REALM_ICON_DIR}/icon_${code}.png`,
      x: 50 + ORBIT_RADIUS * Math.cos(angle),
      y: 50 + ORBIT_RADIUS * Math.sin(angle),
      color: `var(--color-realm-${code})`,
      glow: `color-mix(in srgb, var(--color-realm-${code}) 35%, transparent)`,
    };
  });

  constructor() {
    inject(Meta).updateTag({ name: 'description', content: `${SITE_TAGLINE}.` });
  }
}
