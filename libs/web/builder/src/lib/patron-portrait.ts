import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { God } from '@mythictatics/shared/contracts';
import { AnyGodArt } from './any-god';
import { RealmIcon } from './realm-icon';

/**
 * A patron god as a portrait: the game's own champion frame, the realm's diamond hung off the
 * bottom, the name beneath.
 *
 * Smaller than `CardTile` on purpose. The picker shows twenty-one of these at once, and a god's
 * numbers are not what the choice turns on — its Power is, and that is on `PatronCard` down by the
 * board, behind its own art. `null` is "Any", which is a choice of its own: no god, and so no lock
 * and no Descend.
 */
@Component({
  selector: 'mt-patron-portrait',
  imports: [AnyGodArt, RealmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let shown = god();
    <span class="@container relative block">
      <span
        class="relative block aspect-[4/5] transition-transform duration-200 group-hover:-translate-y-0.5"
      >
        <span class="card-frame-inner absolute inset-0 block overflow-hidden bg-raised">
          @if (shown) {
            @if (shown.image) {
              <img
                [src]="shown.image"
                [alt]="shown.name"
                class="h-full w-full object-cover object-top"
                loading="lazy"
                decoding="async"
                draggable="false"
              />
            }
          } @else {
            <mt-any-god-art class="h-full w-full" />
          }
        </span>

        <!-- The frame at its own weight: a bar here is the 7.78cqw the sprite itself draws, which
             is what card-frame-inner is inset by. -->
        <span
          class="card-frame card-frame-champion [--card-frame-scale:1]"
          aria-hidden="true"
        ></span>
      </span>

      <span
        class="absolute -bottom-1.5 left-1/2 flex h-5 w-5 -translate-x-1/2 rotate-45 items-center justify-center rounded-[4px] border border-gold bg-bg"
      >
        @if (shown) {
          <mt-realm-icon [realm]="shown.realm" class="h-3 w-3 -rotate-45" />
        } @else {
          <span class="-rotate-45 text-[10px] leading-none text-gold" aria-hidden="true"
            >&#10022;</span
          >
        }
      </span>
    </span>

    <span
      class="mt-2 block truncate text-center text-[10px] leading-tight text-ink-dim transition-colors group-hover:text-gold-bright"
      >{{ shown?.name ?? 'Any' }}</span
    >
  `,
})
export class PatronPortrait {
  /** The god to draw, or `null` for "Any". */
  readonly god = input.required<God | null>();
}
