import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BOARD_COLUMNS, type Board, type Unit } from '@mythictatics/shared/contracts';
import { turnOrder } from '@mythictatics/shared/domain';
import { CardPreview, CardTile, CatalogService } from '@mythictatics/web/builder';

interface SlotView {
  index: number;
  unit: Unit | undefined;
  turn: number | undefined;
}

/**
 * A comp's board, to read rather than to edit.
 *
 * It keeps the builder's picture — three columns, front row on top, the turn number in the corner —
 * so a board looks the same wherever it is shown. An empty slot is the sheet's "Any": a flexible
 * pick, not a gap, and it says so. `compact` is the comp list's copy: the same tiles, but not
 * clickable, since the whole card around it is already a link.
 */
@Component({
  selector: 'mt-comp-board',
  imports: [CardTile, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ng-template #tile let-view>
      @if (view.unit; as unit) {
        <mt-card-tile [card]="unit" />
        @if (view.turn) {
          <span
            class="pointer-events-none absolute left-0 top-0 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-gold/60 bg-bg/90 text-[11px] font-medium text-gold"
            [title]="'Attacks ' + ordinal(view.turn)"
            >{{ view.turn }}</span
          >
        }
      } @else {
        <!-- Keeps the tile's shape, so a flexible pick lines up with the units beside it. -->
        <span class="block pt-3 text-xs text-ink-faint" title="Any unit that fits the comp">
          <span
            class="flex aspect-[4/5] items-center justify-center border-2 border-dashed border-line bg-panel/40 [border-radius:50%_50%_0.9rem_0.9rem/34%_34%_0.9rem_0.9rem]"
            >Any</span
          >
          <span class="block h-3"></span>
          <span class="mt-1.5 block h-4"></span>
        </span>
      }
    </ng-template>

    <div
      class="grid"
      [class]="compact() ? 'gap-x-2 gap-y-3' : 'gap-x-3 gap-y-4'"
      [style.grid-template-columns]="columns"
    >
      @for (view of slots(); track view.index) {
        @if (compact() || !view.unit) {
          <!-- The list's thumbnail sits inside a link, so its tiles cannot be buttons of their own. -->
          <div
            class="relative"
            [attr.data-testid]="'comp-slot-' + view.index"
            [attr.title]="view.unit?.name"
          >
            <ng-container *ngTemplateOutlet="tile; context: { $implicit: view }" />
          </div>
        } @else {
          <button
            type="button"
            class="group relative block w-full rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            [attr.aria-label]="view.unit.name + ', slot ' + (view.index + 1) + ' — details'"
            [attr.data-testid]="'comp-slot-' + view.index"
            (click)="preview.open(view.unit)"
          >
            <ng-container *ngTemplateOutlet="tile; context: { $implicit: view }" />
          </button>
        }
      }
    </div>
    @if (!compact()) {
      <p class="pt-1.5 text-center text-[11px] text-ink-faint">
        Front row on top · numbers are attack order · tap a unit for its card
      </p>
    }
  `,
})
export class CompBoard {
  protected readonly preview = inject(CardPreview);
  private readonly catalog = inject(CatalogService);

  readonly board = input.required<Board>();
  readonly compact = input(false);

  protected readonly columns = `repeat(${BOARD_COLUMNS}, minmax(0, 1fr))`;

  protected readonly slots = computed<SlotView[]>(() => {
    const board = this.board();
    const turns = turnOrder(board);
    return board.map((slot, index) => ({
      index,
      unit: slot ? this.catalog.unit(slot.unitId) : undefined,
      turn: turns.get(index),
    }));
  });

  protected ordinal(turn: number): string {
    const suffix = turn === 1 ? 'st' : turn === 2 ? 'nd' : turn === 3 ? 'rd' : 'th';
    return `${turn}${suffix}`;
  }
}
