import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NEUTRAL_REALM, type Card, type Rank } from '@mythictatics/shared/contracts';
import { RealmIcon } from './realm-icon';
import { TierStars } from './tier-stars';

/** A body to show in place of the card's own — a slot the patron god has descended onto. */
export interface TileStats {
  attack: number;
  health: number;
}

/**
 * One card as a tile, framed the way the game's Collection screen frames it: an arched portrait
 * under a crown of Tier stars, the body as a blue and a red plate either side of the realm's
 * diamond. The collection, the unit pool, the board and the comps all draw cards with it, so a
 * card looks the same wherever it turns up.
 *
 * A spell has no body, so its left plate is its cost (when it has one) and its right is empty.
 * Unlike the game the name sits under the tile — the site is read by people still learning the
 * art, and by search engines that cannot see it.
 *
 * The hover lift and zoom key off a `group` ancestor, so the element that is clicked decides when
 * the tile reacts.
 */
@Component({
  selector: 'mt-card-tile',
  imports: [RealmIcon, TierStars],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let shown = card();
    <span class="relative block pt-3">
      <mt-tier-stars
        [tier]="shown.tier"
        class="absolute left-1/2 top-0 z-10 h-5 -translate-x-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
      />

      <span
        class="block bg-gradient-to-b from-gold-bright via-gold to-[#6e4f1d] p-[3px] shadow-lg shadow-black/40 transition-transform duration-200 [border-radius:50%_50%_0.9rem_0.9rem/34%_34%_0.9rem_0.9rem] group-hover:-translate-y-1"
      >
        <span
          class="block aspect-[4/5] overflow-hidden bg-raised [border-radius:50%_50%_0.75rem_0.75rem/33%_33%_0.75rem_0.75rem]"
        >
          @if (shown.image) {
            <img
              [src]="shown.image"
              [alt]="shown.name"
              class="h-full w-full"
              [class]="
                shown.type === 'spell'
                  ? 'object-contain p-[18%] pt-[26%]'
                  : 'object-cover object-top transition-transform duration-300 group-hover:scale-105'
              "
              loading="lazy"
              decoding="async"
              draggable="false"
            />
          }
        </span>
      </span>

      <span class="relative -mt-4 flex items-center justify-between px-0.5">
        @if (left(); as plate) {
          <span
            class="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-gold px-1 text-xs font-bold tabular-nums shadow"
            [class]="plate.tone"
            [title]="plate.label"
            >{{ plate.value }}</span
          >
        } @else {
          <span class="h-7 w-7"></span>
        }

        <span
          class="flex h-7 w-7 rotate-45 items-center justify-center rounded-[5px] border-2 border-gold bg-bg shadow"
        >
          <mt-realm-icon [realm]="shown.realm ?? neutral" class="h-4 w-4 -rotate-45" />
        </span>

        @if (right(); as plate) {
          <span
            class="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-gold px-1 text-xs font-bold tabular-nums shadow"
            [class]="plate.tone"
            [title]="plate.label"
            >{{ plate.value }}</span
          >
        } @else {
          <span class="h-7 w-7"></span>
        }
      </span>
    </span>

    @if (named()) {
      <span
        class="mt-1.5 block truncate text-center text-xs text-ink-dim transition-colors group-hover:text-gold-bright"
        >{{ shown.name }}</span
      >
    }
  `,
})
export class CardTile {
  readonly card = input.required<Card>();
  /** Which Rank a unit's body is shown at. Ignored for gods and spells. */
  readonly rank = input<Rank>(0);
  /** Shown in place of the card's own body when set. */
  readonly stats = input<TileStats | null>(null);
  /** Whether the name is written under the tile. */
  readonly named = input(true);

  protected readonly neutral = NEUTRAL_REALM;

  private readonly body = computed<TileStats | null>(() => {
    const card = this.card();
    if (card.type === 'spell') return null;
    const override = this.stats();
    if (override) return override;
    if (card.type === 'god') return { attack: card.attack, health: card.health };
    const ranked = card.ranks[Math.min(this.rank(), card.ranks.length - 1)];
    return { attack: ranked.attack, health: ranked.health };
  });

  protected readonly left = computed<Plate | null>(() => {
    const card = this.card();
    if (card.type === 'spell') {
      return card.cost === null
        ? null
        : { value: card.cost, label: `Cost ${card.cost}`, tone: 'bg-gold text-bg' };
    }
    const attack = this.body()?.attack ?? 0;
    return { value: attack, label: `Attack ${attack}`, tone: 'bg-attack text-white' };
  });

  protected readonly right = computed<Plate | null>(() => {
    const body = this.body();
    if (!body) return null;
    return { value: body.health, label: `Health ${body.health}`, tone: 'bg-health text-white' };
  });
}

interface Plate {
  value: number;
  label: string;
  tone: string;
}
