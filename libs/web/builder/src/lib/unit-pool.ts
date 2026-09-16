import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NEUTRAL_REALM, type RealmCode, type Tier } from '@mythictatics/shared/contracts';
import { BuilderStore } from './builder-store';
import { CardPreview } from './card-preview';
import { DragSource } from './drag';
import { RealmIcon } from './realm-icon';
import { REALM_BORDER } from './realm-style';
import { TierStars } from './tier-stars';

const TIERS: readonly Tier[] = [1, 2, 3, 4, 5, 6];

/**
 * The units the draft makes available, and the only part of the screen that scrolls.
 *
 * Tiles rather than rows, framed the way the game frames them: Tier stars above, the body as a
 * blue and a red plate below with the realm between. At this size a name would truncate to
 * nothing useful, so the tile is the art and the numbers; the name is in the tooltip and in the
 * preview.
 *
 * A tap opens the preview, which is where the rules text is — the same as in game. Placing is
 * therefore a drag onto a slot, or the preview's own place button for anyone on a phone.
 *
 * The filters sit outside the scroll container on purpose: a player narrowing a list should not
 * have to scroll back up to change what they narrowed it by.
 */
@Component({
  selector: 'mt-unit-pool',
  imports: [DragSource, RealmIcon, TierStars],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <div class="flex items-baseline justify-between gap-2 pb-2">
      <h2 class="font-display text-sm tracking-wide text-gold">Units</h2>
      <span class="text-[11px] text-ink-faint">{{ units().length }} available</span>
    </div>

    <div class="space-y-1.5 pb-1">
      <input
        type="search"
        class="w-full rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
        placeholder="Search name or rules text…"
        [value]="store.filters().search"
        (input)="search($event)"
      />

      <div class="flex flex-wrap items-center gap-1">
        @for (realm of realmOptions(); track realm) {
          <button
            type="button"
            class="flex items-center rounded-full border p-1 transition-colors"
            [class]="
              store.filters().realm === realm
                ? 'border-gold bg-gold/10'
                : 'border-line opacity-60 hover:opacity-100'
            "
            [title]="realm"
            [attr.aria-label]="realm"
            [attr.aria-pressed]="store.filters().realm === realm"
            (click)="toggleRealm(realm)"
          >
            <mt-realm-icon [realm]="realm" class="h-4 w-4" />
          </button>
        }

        <span class="ml-auto flex items-center gap-1">
          @for (tier of tiers; track tier) {
            <button
              type="button"
              class="w-6 rounded border py-0.5 text-[10px] transition-colors"
              [class]="
                store.filters().tier === tier
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-line text-ink-dim hover:text-ink'
              "
              [attr.aria-label]="'Tier ' + tier"
              [attr.aria-pressed]="store.filters().tier === tier"
              (click)="toggleTier(tier)"
            >
              {{ tier }}
            </button>
          }
        </span>
      </div>

      @if (isFiltered()) {
        <button
          type="button"
          class="text-[11px] text-ink-faint hover:text-ink"
          (click)="store.resetFilters()"
        >
          Reset filters
        </button>
      }
    </div>

    <!-- The one scroll container on the page. -->
    <ul
      class="-mr-1 grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-x-2 gap-y-4 overflow-y-auto pr-1 pt-3 xl:grid-cols-4"
      data-testid="unit-pool"
    >
      @for (unit of units(); track unit.id) {
        <li>
          <button
            type="button"
            class="relative block w-full cursor-grab touch-none active:cursor-grabbing"
            [mtDragSource]="{ kind: 'unit', unitId: unit.id }"
            [title]="unit.name"
            [attr.aria-label]="unit.name + ', Tier ' + unit.tier"
            [attr.data-unit]="unit.id"
            (click)="preview.open(unit, { placeable: true })"
          >
            <mt-tier-stars
              [tier]="unit.tier"
              class="absolute -top-2 left-1/2 z-10 h-3.5 -translate-x-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            />
            <span
              class="block aspect-[3/4] overflow-hidden rounded-lg border-2 bg-raised"
              [class]="frame(unit.realm)"
            >
              @if (unit.image) {
                <img
                  [src]="unit.image"
                  [alt]="unit.name"
                  class="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                />
              }
            </span>
            <span
              class="pointer-events-none absolute inset-x-0 -bottom-1.5 flex items-center justify-between px-0.5"
            >
              <span
                class="flex h-5 w-5 items-center justify-center rounded-full border border-bg bg-attack text-[10px] font-bold text-white"
                >{{ unit.ranks[0].attack }}</span
              >
              <span class="rounded-full border border-bg bg-bg p-0.5">
                <mt-realm-icon [realm]="unit.realm" class="h-4 w-4" />
              </span>
              <span
                class="flex h-5 w-5 items-center justify-center rounded-full border border-bg bg-health text-[10px] font-bold text-white"
                >{{ unit.ranks[0].health }}</span
              >
            </span>
          </button>
        </li>
      } @empty {
        <li class="col-span-full px-1 py-6 text-center text-xs text-ink-faint">
          @if (!store.realms().length) {
            Draft a realm to see its units.
          } @else {
            Nothing matches these filters.
          }
        </li>
      }
    </ul>
  `,
})
export class UnitPool {
  protected readonly store = inject(BuilderStore);
  protected readonly preview = inject(CardPreview);

  protected readonly tiers = TIERS;
  protected readonly units = this.store.pool;

  /** Only realms whose units can actually appear, so the filter never offers an empty result. */
  protected readonly realmOptions = computed<readonly RealmCode[]>(() => [
    ...this.store.realms(),
    NEUTRAL_REALM,
  ]);

  protected readonly isFiltered = computed(() => {
    const { search, realm, tier } = this.store.filters();
    return !!search || !!realm || !!tier;
  });

  protected frame(realm: RealmCode): string {
    return REALM_BORDER[realm];
  }

  protected search(event: Event): void {
    this.store.setFilters({ search: (event.target as HTMLInputElement).value });
  }

  protected toggleRealm(realm: RealmCode): void {
    this.store.setFilters({ realm: this.store.filters().realm === realm ? null : realm });
  }

  protected toggleTier(tier: Tier): void {
    this.store.setFilters({ tier: this.store.filters().tier === tier ? null : tier });
  }
}
