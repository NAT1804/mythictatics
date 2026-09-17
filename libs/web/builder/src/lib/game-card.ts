import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Card, Rank, RichTextToken } from '@mythictatics/shared/contracts';
import { REALM_BORDER } from './realm-style';
import { RealmIcon } from './realm-icon';
import { RichText } from './rich-text';
import { TierStars } from './tier-stars';

/**
 * A card drawn the way the game draws it: Tier stars over the art, the body as a blue plate and a
 * red plate either side of the name, the rules text beneath, and the realm along the bottom.
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
    <article
      class="flex h-full flex-col overflow-hidden rounded-xl border-2 bg-panel shadow-lg"
      [class]="frame()"
    >
      <div class="relative shrink-0">
        @if (shown.image) {
          <img
            [src]="shown.image"
            [alt]="shown.name"
            class="aspect-[4/3] w-full"
            [class]="
              shown.type === 'spell'
                ? 'bg-raised object-contain px-6 pb-2 pt-6'
                : 'object-cover object-top'
            "
            decoding="async"
            draggable="false"
          />
        } @else {
          <div class="aspect-[4/3] w-full bg-raised"></div>
        }
        <mt-tier-stars
          [tier]="shown.tier"
          class="absolute inset-x-0 top-1.5 h-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
        />
      </div>

      <!-- The name plate sits over the join, with the body either side of it, as on the card. -->
      <div class="relative z-10 -mt-3.5 flex items-center justify-center px-1">
        @if (shown.type !== 'spell') {
          <span
            class="absolute left-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg bg-attack text-xs font-bold text-white"
            [title]="'Attack ' + attack()"
            >{{ attack() }}</span
          >
        }
        <span
          class="max-w-[64%] text-balance rounded-md border border-gold/40 bg-raised px-3 py-0.5 text-center font-display text-sm leading-tight text-ink"
          >{{ shown.name }}</span
        >
        @if (shown.type !== 'spell') {
          <span
            class="absolute right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg bg-health text-xs font-bold text-white"
            [title]="'Health ' + health()"
            >{{ health() }}</span
          >
        }
      </div>

      <p class="min-h-0 flex-1 overflow-hidden px-2.5 py-2 text-center text-[11px] leading-snug">
        <mt-rich-text [tokens]="text()" />
        @if (shown.type === 'spell') {
          @for (option of shown.options; track $index) {
            <span class="mt-1 block rounded border border-line px-1.5 py-0.5">
              <mt-rich-text [tokens]="option" />
            </span>
          }
        }
      </p>

      <div
        class="flex shrink-0 items-center justify-center gap-1.5 border-t border-line bg-raised py-1"
      >
        <mt-realm-icon [realm]="shown.realm ?? 'neutral'" class="h-4 w-4" />
        <!-- A spell with no realm is a Sanctum spell, which every realm can be offered. -->
        <span class="text-[11px] capitalize text-ink-dim">{{ shown.realm ?? 'sanctum' }}</span>
      </div>
    </article>
  `,
})
export class GameCard {
  readonly card = input.required<Card>();
  /** Which Rank a unit is shown at. Ignored for a god, whose body does not rank up. */
  readonly rank = input<Rank>(0);

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

  protected readonly frame = computed(() => {
    const realm = this.card().realm;
    return realm ? REALM_BORDER[realm] : 'border-line';
  });
}
