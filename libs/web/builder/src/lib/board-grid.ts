import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BOARD_COLUMNS, type BoardSlot, type Unit } from '@mythictatics/shared/contracts';
import { BuilderStore } from './builder-store';
import { CardTile } from './card-tile';
import { CatalogService } from './catalog';
import { DragService, DragSource } from './drag';

interface SlotView {
  index: number;
  slot: BoardSlot | null;
  unit: Unit | undefined;
  attack: number;
  health: number;
  turn: number | undefined;
  isDescend: boolean;
}

/**
 * The board: three columns, two rows, front row first — the same order the turn counter runs in.
 *
 * The front row is drawn on top because that is the row facing the enemy, so the picture matches
 * the fight. Slot order is also attack order, which is why every occupied slot carries its turn
 * number: it is the one piece of information a player cannot read off the cards themselves.
 */
@Component({
  selector: 'mt-board-grid',
  imports: [CardTile, DragSource],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col items-center justify-center' },
  template: `
    <div class="grid w-full max-w-[34rem] gap-2" [style.grid-template-columns]="columns">
      @for (view of slots(); track view.index) {
        @let over = drag.overSlot() === view.index;
        @let lifted = store.selectedSlot() === view.index;
        <div
          class="group relative rounded-xl p-1 transition-colors"
          [class]="frame(view, over, lifted)"
          [attr.data-drop-slot]="view.index"
          [attr.data-testid]="'slot-' + view.index"
        >
          @if (view.unit; as unit) {
            <button
              type="button"
              class="block w-full cursor-grab rounded-lg text-left active:cursor-grabbing"
              [mtDragSource]="{ kind: 'slot', index: view.index, unitId: unit.id }"
              [attr.aria-label]="unit.name + ' in slot ' + (view.index + 1)"
              (click)="store.activateSlot(view.index)"
            >
              <mt-card-tile
                [card]="unit"
                [rank]="view.slot!.rank"
                [stats]="view.isDescend ? { attack: view.attack, health: view.health } : null"
              />
            </button>

            <!-- Turn number: slot order is attack order, and nothing else on the card says so. -->
            @if (view.turn) {
              <span
                class="pointer-events-none absolute left-0 top-0 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-gold/60 bg-bg/90 text-[11px] font-medium text-gold"
                [title]="'Attacks ' + ordinal(view.turn)"
                >{{ view.turn }}</span
              >
            }

            @if (view.isDescend && store.patron(); as god) {
              <span
                class="pointer-events-none absolute right-0 top-0 z-20 h-7 w-7 overflow-hidden rounded-full border-2 border-gold bg-bg"
                [title]="god.name + ' has descended onto ' + unit.name"
              >
                @if (god.image) {
                  <img [src]="god.image" [alt]="god.name" class="h-full w-full object-cover" />
                }
              </span>
            } @else {
              <span
                class="pointer-events-none absolute right-0 top-0 z-20 flex h-6 min-w-6 items-center justify-center rounded-full border border-gold/60 bg-bg/90 px-1 text-[10px] font-medium text-gold"
                [title]="'Rank ' + (view.slot!.rank + 1)"
                >R{{ view.slot!.rank + 1 }}</span
              >
            }

            <!-- Controls stay out of the way until the slot is hovered or focused. -->
            <span
              class="absolute inset-x-2 top-1/2 z-20 flex -translate-y-1/2 justify-center gap-1 rounded-md bg-bg/85 p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <button
                type="button"
                class="rounded border border-line px-1.5 text-[10px] text-ink-dim hover:border-gold hover:text-gold"
                title="Cycle Rank"
                (click)="store.cycleRank(view.index)"
              >
                R{{ view.slot!.rank + 1 }}
              </button>
              @if (store.patron()) {
                <button
                  type="button"
                  class="rounded border px-1.5 text-[10px]"
                  [class]="
                    view.isDescend
                      ? 'border-gold bg-gold/20 text-gold'
                      : 'border-line text-ink-dim hover:border-gold hover:text-gold'
                  "
                  title="Descend the patron god onto this unit"
                  (click)="store.toggleDescend(view.index)"
                >
                  &#9650;
                </button>
              }
              <button
                type="button"
                class="rounded border border-line px-1.5 text-[10px] text-ink-dim hover:border-red-400 hover:text-red-300"
                title="Remove"
                (click)="store.remove(view.index)"
              >
                &#10005;
              </button>
            </span>
          } @else {
            <!-- An empty slot keeps the tile's shape, so the board does not jump as it fills. -->
            <button
              type="button"
              class="block w-full pt-3 text-lg text-ink-faint hover:text-gold"
              [attr.aria-label]="'Empty slot ' + (view.index + 1)"
              (click)="store.activateSlot(view.index)"
            >
              <span
                class="flex aspect-[4/5] items-center justify-center border-2 border-dashed border-line bg-panel/40 [border-radius:50%_50%_0.9rem_0.9rem/34%_34%_0.9rem_0.9rem]"
                >+</span
              >
              <span class="block h-3"></span>
              <span class="mt-1.5 block h-4"></span>
            </button>
          }
        </div>
      }
    </div>

    <p class="pt-2 text-center text-[11px] text-ink-faint">
      Front row attacks first · drag to place, drag between slots to swap
    </p>
  `,
})
export class BoardGrid {
  protected readonly store = inject(BuilderStore);
  protected readonly drag = inject(DragService);
  private readonly catalog = inject(CatalogService);

  protected readonly columns = `repeat(${BOARD_COLUMNS}, minmax(0, 1fr))`;

  protected readonly slots = computed<SlotView[]>(() => {
    const turns = this.store.turnOrder();
    const descend = this.store.descend();
    const descendSlot = this.store.descendSlot();
    return this.store.board().map((slot, index) => {
      const unit = slot ? this.catalog.unit(slot.unitId) : undefined;
      const rank = unit && slot ? unit.ranks[Math.min(slot.rank, unit.ranks.length - 1)] : null;
      const isDescend = descendSlot === index && !!descend;
      return {
        index,
        slot,
        unit,
        // A descended slot shows the body the god brought with it, not the unit's own.
        attack: isDescend ? descend.attack : (rank?.attack ?? 0),
        health: isDescend ? descend.health : (rank?.health ?? 0),
        turn: turns.get(index),
        isDescend,
      };
    });
  });

  protected frame(view: SlotView, over: boolean, lifted: boolean): string {
    if (over) return 'bg-gold/10 ring-2 ring-gold';
    if (lifted) return 'bg-raised ring-2 ring-gold';
    if (view.isDescend) return 'bg-gold/5 ring-1 ring-gold/60';
    return 'ring-0';
  }

  protected ordinal(turn: number): string {
    const suffix = turn === 1 ? 'st' : turn === 2 ? 'nd' : turn === 3 ? 'rd' : 'th';
    return `${turn}${suffix}`;
  }
}
