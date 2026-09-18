import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  NEUTRAL_REALM,
  type Card,
  type Rank,
  type RichTextToken,
} from '@mythictatics/shared/contracts';
import { frameOf, ringOf } from './rank-frame';
import { RealmIcon } from './realm-icon';
import { RichText } from './rich-text';
import { TierStars } from './tier-stars';

/**
 * A card at reading size, in the rectangle the game deals it in.
 *
 * `CardTile` is the same card as the arch it stands in on the board, and stops at the art; this is
 * the card itself — art, name, rules text and realm inside one body, under the crown of Tier
 * stars. The two shapes are the game's own two, and they are used the way the game uses them: the
 * arch wherever a card is being played, this wherever it is being read.
 *
 * The frame is the card's Rank, in the game's own bronze/silver/gold (see `rank-frame.ts`). That
 * is the whole of how a Rank is shown here: no badge, no number printed on the art — the metal
 * around the card is the Rank, which is how the game says it too. The Attack and Health are discs
 * threaded onto that frame and hang half outside the card, so whatever holds this component has to
 * leave them the room: see the padding the rank deck and the preview's column keep.
 *
 * The keywords a card carries are not drawn on it. They are the panels beside it in the preview —
 * the only place this card is shown — where each is a term with the game's own words under it,
 * which is more than a rail of icons down the border could say.
 *
 * A god is drawn as its Descend form, which is what the game's own card shows — the stats a god
 * carries are the body it fights with once it has come down, and the text is what it does then.
 * Its Power and its Descend Condition are not on the card in game either; they sit beside it, so
 * here they belong to the preview rather than to this component.
 */
@Component({
  selector: 'mt-game-card',
  imports: [RealmIcon, RichText, TierStars],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let shown = card();
    <article class="relative block pt-3.5">
      <mt-tier-stars
        [tier]="shown.tier"
        class="absolute left-1/2 top-0 z-20 h-5 -translate-x-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
      />

      <!-- The frame itself: the game's own card border, nine-sliced onto the card's own body (see
           rank-frame.ts). The bar width is the one number the frame scales from — the corner
           flourishes scale with it — and it is also the only part of the frame the layout is inset
           by, since the flourishes are painted over the art beneath, which is where the game puts
           them. -->
      <div
        class="card-rect rounded-[0.45rem] shadow-xl shadow-black/50 [--card-rect-bar:0.5rem]"
        [class]="frame()"
      >
        <!-- The body does not clip its children: the stat discs have to hang over the frame, and a
             hidden overflow here would cut them in half. The two children that were relying on
             that clip carry their own rounding instead — the art the top corners, the realm plate
             the bottom two. -->
        <div class="flex flex-col rounded-[0.2rem] bg-panel">
          <div class="relative shrink-0 overflow-hidden rounded-t-[0.2rem] bg-raised">
            @if (shown.image) {
              <img
                [src]="shown.image"
                [alt]="shown.name"
                class="aspect-[4/3] w-full"
                [class]="
                  shown.type === 'spell'
                    ? 'object-contain px-8 pb-2 pt-10'
                    : 'object-cover object-top'
                "
                decoding="async"
                draggable="false"
              />
            } @else {
              <div class="aspect-[4/3] w-full"></div>
            }

            <!-- The art fades into the plate rather than meeting it at a line, so the name can sit
                 over the join and still be read against whatever the art happens to be. -->
            <div
              class="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-panel to-transparent"
            ></div>
          </div>

          <!-- The name plate rides the join, with the body either side of it, as on the card.

               The two discs are threaded onto the frame rather than set inside it: -20px is half a
               32px disc plus the 4px that takes its centre from this body's edge out to the middle
               of the 8px bar, so the frame runs through each disc's middle. -->
          <div class="relative z-10 -mt-4 flex items-center justify-center px-1">
            @if (shown.type !== 'spell') {
              <span
                class="absolute left-[-20px] flex h-8 w-8 items-center justify-center rounded-full bg-attack text-sm font-bold tabular-nums text-white shadow-md shadow-black/50"
                [class]="ring()"
                [title]="'Attack ' + attack()"
                >{{ attack() }}</span
              >
            }
            <span
              class="max-w-[80%] text-balance rounded-md border border-gold/40 bg-raised px-3 py-0.5 text-center font-display text-sm leading-tight text-ink shadow"
              >{{ shown.name }}</span
            >
            @if (shown.type !== 'spell') {
              <span
                class="absolute right-[-20px] flex h-8 w-8 items-center justify-center rounded-full bg-health text-sm font-bold tabular-nums text-white shadow-md shadow-black/50"
                [class]="ring()"
                [title]="'Health ' + health()"
                >{{ health() }}</span
              >
            }
          </div>

          <!-- The rules text, on the card's own centre line and running its full width. -->
          <div class="flex-1 px-3 pb-2 pt-2.5">
            <p class="min-h-[4.5rem] text-center text-[11px] leading-snug text-ink-dim">
              <mt-rich-text [tokens]="text()" />
              @if (shown.type === 'spell') {
                @for (option of shown.options; track $index) {
                  <span class="mt-1 block rounded border border-line px-1.5 py-0.5">
                    <mt-rich-text [tokens]="option" />
                  </span>
                }
              }
            </p>
          </div>

          <div
            class="flex shrink-0 items-center justify-center gap-1.5 rounded-b-[0.2rem] border-t border-line bg-raised py-1"
          >
            <mt-realm-icon [realm]="shown.realm ?? neutral" class="h-4 w-4" />
            <!-- A spell with no realm is a Sanctum spell, which every realm can be offered. -->
            <span class="text-[11px] capitalize text-ink-dim">{{ shown.realm ?? 'sanctum' }}</span>
          </div>
        </div>
      </div>
    </article>
  `,
})
export class GameCard {
  readonly card = input.required<Card>();
  /**
   * Which Rank a unit is shown at — its body, its text and the metal of its frame. Ignored for a
   * god, whose body does not rank up, and for a spell, which has no Rank at all.
   */
  readonly rank = input<Rank>(0);

  protected readonly neutral = NEUTRAL_REALM;

  private readonly ranked = computed(() => {
    const card = this.card();
    if (card.type !== 'unit') return null;
    return card.ranks[Math.min(this.rank(), card.ranks.length - 1)];
  });

  protected readonly attack = computed(() => {
    const card = this.card();
    if (card.type === 'god') return card.attack;
    return this.ranked()?.attack ?? 0;
  });

  protected readonly health = computed(() => {
    const card = this.card();
    if (card.type === 'god') return card.health;
    return this.ranked()?.health ?? 0;
  });

  protected readonly text = computed<readonly RichTextToken[]>(() => {
    const card = this.card();
    if (card.type === 'god') return card.descendText;
    if (card.type === 'spell') return card.text;
    return this.ranked()?.richText ?? [];
  });

  protected readonly frame = computed(() => frameOf(this.card(), this.rank()));

  protected readonly ring = computed(() => ringOf(this.card(), this.rank()));
}
