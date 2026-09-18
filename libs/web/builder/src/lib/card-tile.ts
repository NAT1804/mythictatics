import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NEUTRAL_REALM, type Card, type Rank } from '@mythictatics/shared/contracts';
import { GOD_FRAME, PLAIN_FRAME, RANK_FRAME, SPELL_FRAME } from './rank-frame';
import { RealmIcon } from './realm-icon';
import { TierStars } from './tier-stars';

/** A body to show in place of the card's own — a slot the patron god has descended onto. */
export interface TileStats {
  attack: number;
  health: number;
}

/**
 * One card as a tile, framed the way the game frames it: the portrait inside the arch the game
 * stands a unit in (see `rank-frame.ts`), under a crown of Tier stars, its Attack and Health in
 * the two discs the frame draws into its foot, the realm hung between them. The collection, the
 * unit pool, the board and the comps all draw cards with it, so a card looks the same wherever it
 * turns up.
 *
 * A spell has no body and so no use for those discs; it wears the game's own spell frame, with its
 * cost and its realm under it. Unlike the game the name sits under the tile — the site is read by
 * people still learning the art, and by search engines that cannot see it.
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
    <!-- A container, because the frame is a share of the card's width (see styles.css). -->
    <span class="@container relative block pt-3">
      <mt-tier-stars
        [tier]="shown.tier"
        class="absolute left-1/2 top-0 z-10 h-5 -translate-x-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
      />

      @if (body(); as stats) {
        <!-- A unit or a god: the arch, with the game's own Attack and Health discs in its foot.
             The art is a layer under it, cut to the dome, so the frame paints over the portrait
             the way it paints over a unit on the board. -->
        <span
          class="relative block aspect-[4/5] transition-transform duration-200 group-hover:-translate-y-1"
        >
          <span class="card-arch-inner absolute inset-0 block overflow-hidden bg-raised">
            @if (shown.image) {
              <img
                [src]="shown.image"
                [alt]="shown.name"
                class="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                decoding="async"
                draggable="false"
              />
            }
          </span>

          <span [class]="frame()" aria-hidden="true"></span>

          <span class="card-arch-plate card-arch-attack" [title]="'Attack ' + stats.attack">{{
            stats.attack
          }}</span>
          <span class="card-arch-plate card-arch-health" [title]="'Health ' + stats.health">{{
            stats.health
          }}</span>

          <!-- The realm, hung on the foot bar between the two discs. -->
          <span
            class="absolute bottom-[-1cqw] left-1/2 flex h-[11cqw] w-[11cqw] -translate-x-1/2 rotate-45 items-center justify-center rounded-[18%] border border-gold bg-bg shadow"
          >
            <mt-realm-icon
              [realm]="shown.realm ?? neutral"
              class="h-[6.5cqw] w-[6.5cqw] -rotate-45"
            />
          </span>
        </span>
      } @else {
        <!-- A spell, in the game's own spell frame: a rectangle, and no discs to fill. Its cost
             and its realm hang under it, the way the discs hang in the arch's foot. -->
        <span
          class="relative block aspect-[4/5] transition-transform duration-200 group-hover:-translate-y-1"
        >
          <span class="card-frame-inner absolute inset-0 block overflow-hidden bg-raised">
            @if (shown.image) {
              <img
                [src]="shown.image"
                [alt]="shown.name"
                class="h-full w-full object-contain p-[12%] pt-[20%]"
                loading="lazy"
                decoding="async"
                draggable="false"
              />
            }
          </span>

          <span class="card-frame card-frame-spell" aria-hidden="true"></span>
        </span>

        <span class="relative -mt-4 flex items-center justify-between px-0.5">
          @if (cost(); as spent) {
            <span
              class="card-ring flex h-7 min-w-7 items-center justify-center rounded-full bg-gold px-1 text-xs font-bold tabular-nums text-bg shadow"
              [title]="'Cost ' + spent"
              >{{ spent }}</span
            >
          } @else {
            <span class="h-7 w-7"></span>
          }

          <span
            class="flex h-7 w-7 rotate-45 items-center justify-center rounded-[5px] border-2 border-gold bg-bg shadow"
          >
            <mt-realm-icon [realm]="shown.realm ?? neutral" class="h-4 w-4 -rotate-45" />
          </span>

          <span class="h-7 w-7"></span>
        </span>
      }
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
  /**
   * Whether the frame is coloured by Rank.
   *
   * Off by default, and deliberately: a card in the collection or the pool has not been bought
   * yet, so it has no Rank to show, and colouring it by `rank`'s default would paint every list
   * on the site bronze and claim something untrue. It is the board, where a unit really does sit
   * at a Rank, that asks for this.
   */
  readonly rankFrame = input(false);

  protected readonly neutral = NEUTRAL_REALM;

  protected readonly frame = computed(() => {
    const card = this.card();
    if (card.type === 'god') return GOD_FRAME;
    if (card.type === 'spell') return SPELL_FRAME;
    if (!this.rankFrame()) return PLAIN_FRAME;
    return RANK_FRAME[Math.min(this.rank(), RANK_FRAME.length - 1)];
  });

  /** The body the discs show, and so also what decides a card is drawn in the arch at all. */
  protected readonly body = computed<TileStats | null>(() => {
    const card = this.card();
    if (card.type === 'spell') return null;
    const override = this.stats();
    if (override) return override;
    if (card.type === 'god') return { attack: card.attack, health: card.health };
    const ranked = card.ranks[Math.min(this.rank(), card.ranks.length - 1)];
    return { attack: ranked.attack, health: ranked.health };
  });

  /** What a spell costs, when it has a cost at all — a Medicine is granted, not bought. */
  protected readonly cost = computed<number | null>(() => {
    const card = this.card();
    return card.type === 'spell' ? card.cost : null;
  });
}
