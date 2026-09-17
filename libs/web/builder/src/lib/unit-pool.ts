import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NEUTRAL_REALM, type RealmCode, type Tier } from '@mythictatics/shared/contracts';
import { BuilderStore } from './builder-store';
import { CardPreview } from './card-preview';
import { CardTile } from './card-tile';
import { DragSource } from './drag';
import { RealmIcon } from './realm-icon';

const TIERS: readonly Tier[] = [1, 2, 3, 4, 5, 6];

/**
 * The units the draft makes available, and the only part of the screen that scrolls.
 *
 * Tiles rather than rows, the same tiles the collection draws, so a unit looks the same in both.
 *
 * A tap opens the preview, which is where the rules text is — the same as in game. Placing is
 * therefore a drag onto a slot, or the preview's own place button for anyone on a phone.
 *
 * The filters sit outside the scroll container on purpose: a player narrowing a list should not
 * have to scroll back up to change what they narrowed it by.
 */
@Component({
  selector: 'mt-unit-pool',
  imports: [CardTile, DragSource, RealmIcon],
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
      class="-mr-1 grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-x-2 gap-y-3 overflow-y-auto pr-1 pt-2 xl:grid-cols-4"
      data-testid="unit-pool"
    >
      @for (unit of units(); track unit.id) {
        <li>
          <button
            type="button"
            class="group block w-full cursor-grab touch-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold active:cursor-grabbing"
            [mtDragSource]="{ kind: 'unit', unitId: unit.id }"
            [title]="unit.name"
            [attr.aria-label]="unit.name + ', Tier ' + unit.tier"
            [attr.data-unit]="unit.id"
            (click)="preview.open(unit, { placeable: true })"
          >
            <mt-card-tile [card]="unit" />
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
