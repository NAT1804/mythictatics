import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  BOARD_COLUMNS,
  BOARD_SIZE,
  type Card,
  type KeywordCode,
  type SideIndex,
} from '@mythictatics/shared/contracts';
import type { FighterView, ReplayView } from '@mythictatics/shared/engine';
import { CardPreview, CardTile, CatalogService } from '@mythictatics/web/builder';

interface SlotView {
  slot: number;
  fighter: FighterView | null;
  /** The card as it stands right now: its keywords are the fighter's live statuses. */
  card: Card | null;
  active: boolean;
}

/**
 * One side of the battle: its six slots, drawn with the builder's own `CardTile`.
 *
 * A tile draws a card's keywords as the frame's marks — the Taunt shield, the Ranged quiver, the
 * Safeguard aura — and the battle wants exactly those marks, only live. So the tile is handed the
 * card with its `keywords` swapped for what the fighter carries at this point in the fight: a
 * Safeguard that breaks takes its aura with it, a Conceal that is lost takes its mark, and Burn
 * shows while it lasts. Nothing about the card itself is redrawn here.
 *
 * Every slot always renders its fixed parts (`body`, `flash`, `glow`, three `float`s) whether or
 * not anyone stands in it: `BattleDirector` builds its timeline against those elements up front,
 * so they must outlive the fighters that come and go.
 *
 * The enemy board is drawn flipped — back row on top — so the two front rows face each other
 * across the middle of the screen, the way the fight is actually fought. Columns stay in order on
 * both sides: column 1 attacks column 1.
 */
@Component({
  selector: 'mt-battle-board',
  imports: [CardTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="grid gap-2 sm:gap-3"
      [style.grid-template-columns]="columns"
      [attr.aria-label]="side() === 0 ? 'Your board' : 'Enemy board'"
      role="list"
    >
      @for (view of slots(); track view.slot) {
        <div
          class="relative"
          role="listitem"
          [attr.data-fx]="side() + '-' + view.slot"
          [attr.data-testid]="'battle-slot-' + side() + '-' + view.slot"
        >
          <div data-part="body" class="relative will-change-transform">
            @if (view.fighter && view.card; as card) {
              <button
                type="button"
                class="group block w-full rounded-lg text-left transition-shadow"
                [class]="
                  view.active
                    ? 'ring-2 ring-gold-bright shadow-[0_0_18px_rgba(235,196,99,0.55)]'
                    : ''
                "
                [attr.aria-label]="
                  card.name +
                  ', ' +
                  view.fighter.attack +
                  ' Attack, ' +
                  view.fighter.health +
                  ' Health'
                "
                (click)="open(view.fighter)"
              >
                <mt-card-tile
                  [card]="card"
                  [rank]="view.fighter.rank"
                  [rankFrame]="true"
                  [stats]="{ attack: view.fighter.attack, health: view.fighter.health }"
                />
              </button>
            } @else {
              <span class="block pt-3" aria-hidden="true">
                <span
                  class="flex aspect-[4/5] items-center justify-center border border-dashed border-line/60 bg-panel/30 [border-radius:50%_50%_0.9rem_0.9rem/34%_34%_0.9rem_0.9rem]"
                ></span>
                <span class="block h-3"></span>
                <span class="mt-1.5 block h-4"></span>
              </span>
            }
          </div>
          <span
            data-part="flash"
            class="pointer-events-none absolute inset-x-[6%] bottom-[18%] top-[10%] rounded-[45%_45%_12%_12%] bg-red-500 opacity-0 mix-blend-screen"
            aria-hidden="true"
          ></span>
          <span
            data-part="glow"
            class="pointer-events-none absolute inset-x-[2%] bottom-[14%] top-[6%] rounded-[45%_45%_14%_14%] opacity-0 shadow-[0_0_24px_8px_rgba(235,196,99,0.75)] ring-2 ring-gold-bright"
            aria-hidden="true"
          ></span>
          @for (turn of floats; track turn) {
            <span
              data-part="float"
              [attr.data-float]="turn"
              class="pointer-events-none absolute left-1/2 top-[30%] z-30 -translate-x-1/2 whitespace-nowrap font-display text-lg font-bold opacity-0 [text-shadow:0_2px_4px_rgba(0,0,0,0.95)] sm:text-2xl"
              aria-hidden="true"
            ></span>
          }
        </div>
      }
    </div>
  `,
})
export class BattleBoard {
  private readonly catalog = inject(CatalogService);
  private readonly preview = inject(CardPreview);

  readonly view = input.required<ReplayView>();
  readonly side = input.required<SideIndex>();
  /** Back row on top: the enemy's board, facing the player's across the middle. */
  readonly flipped = input(false);

  protected readonly columns = `repeat(${BOARD_COLUMNS}, minmax(0, 1fr))`;
  protected readonly floats = [0, 1, 2];

  /** Cards by fighter and live keywords, so a tile is only handed a new card when either changes. */
  private readonly cards = new Map<string, Card>();

  protected readonly slots = computed<SlotView[]>(() => {
    const view = this.view();
    const board = view.boards[this.side()];
    const order = Array.from({ length: BOARD_SIZE }, (_, slot) => slot);
    const rows = this.flipped()
      ? [...order.slice(BOARD_COLUMNS), ...order.slice(0, BOARD_COLUMNS)]
      : order;
    return rows.map((slot) => {
      const uid = board[slot];
      const fighter = uid === null ? null : (view.fighters.get(uid) ?? null);
      return {
        slot,
        fighter,
        card: fighter ? this.liveCard(fighter) : null,
        active: !!fighter && view.active === fighter.uid,
      };
    });
  });

  private liveCard(fighter: FighterView): Card | null {
    const keywords: KeywordCode[] = [...fighter.statuses];
    if (fighter.burn > 0) keywords.push('burn');
    const key = `${fighter.uid}|${keywords.join(',')}`;
    const cached = this.cards.get(key);
    if (cached) return cached;
    const base = fighter.godId
      ? this.catalog.god(fighter.godId)
      : this.catalog.unit(fighter.unitId);
    if (!base) return null;
    const card = { ...base, keywords } as Card;
    this.cards.set(key, card);
    return card;
  }

  protected open(fighter: FighterView): void {
    const card = fighter.godId
      ? this.catalog.god(fighter.godId)
      : this.catalog.unit(fighter.unitId);
    if (card) this.preview.open(card, { rank: fighter.rank });
  }
}
