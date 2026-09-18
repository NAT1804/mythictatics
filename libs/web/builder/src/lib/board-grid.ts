import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { BOARD_COLUMNS, type BoardSlot, type God, type Unit } from '@mythictatics/shared/contracts';
import { BuilderStore } from './builder-store';
import { CardPreview } from './card-preview';
import { CardTile } from './card-tile';
import { CatalogService } from './catalog';
import { DragService, DragSource } from './drag';

/**
 * How long the landing holds the slot, and so the one number every part of it has to fit inside.
 *
 * The longest of them is the trailing shockwave ring — 355ms of delay and 560ms of spread — and
 * this is a little past that, because the classes are only there to start the animations and
 * taking one away early snaps its element back mid-flight.
 */
const LANDING_MS = 980;

interface SlotView {
  index: number;
  slot: BoardSlot | null;
  unit: Unit | undefined;
  attack: number;
  health: number;
  turn: number | undefined;
  /** The patron, when it is standing on this slot — with a unit under it, or on its own. */
  god: God | null;
  /** A god and a unit together: the slot is both cards, and its body is the sum. */
  isDescend: boolean;
  /** A god holding the slot with nothing under it yet. */
  isGodAlone: boolean;
}

/**
 * The board: three columns, two rows, front row first — the same order the turn counter runs in.
 *
 * The front row is drawn on top because that is the row facing the enemy, so the picture matches
 * the fight. Slot order is also attack order, which is why every occupied slot carries its turn
 * number: it is the one piece of information a player cannot read off the cards themselves.
 *
 * ## A slot has no hover layer
 *
 * There used to be a row of buttons that faded in over a tile — cycle Rank, Descend, remove. It
 * is gone. A control that only exists while the pointer is on top of it cannot be found by
 * looking, does not exist at all to a finger, and sat directly over the art it was meant to act
 * on. What is left is what the slot can say for itself: the Rank badge, which was already drawn
 * and already said the Rank, is now the button that cycles it, and everything else is a drag —
 * a unit in from the pool to place, between slots to swap, off the board to remove, and the
 * patron's own card from `PatronCard` onto a unit to Descend.
 */
@Component({
  selector: 'mt-board-grid',
  imports: [CardTile, DragSource],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center' },
  template: `
    <!-- The page scrolls now, so the board is sized by width alone and the tiles are whatever
         that makes them. The cap is what keeps three columns from stretching to the full panel on
         a wide screen, where a board tile would end up twice the unit tile it was dragged from. -->
    <div
      class="grid w-full max-w-[34rem] gap-2 lg:max-w-[29rem]"
      [class]="quakeClass()"
      [style.grid-template-columns]="columns"
    >
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
              class="relative block w-full cursor-grab rounded-lg text-left active:cursor-grabbing"
              [mtDragSource]="{
                kind: 'slot',
                index: view.index,
                unitId: unit.id,
                godId: view.isDescend ? view.god!.id : undefined,
              }"
              [attr.aria-label]="unit.name + ' in slot ' + (view.index + 1)"
              (click)="store.activateSlot(view.index)"
            >
              @if (view.isDescend && view.god; as god) {
                <!-- The god covers the unit it came down on, and carries the summed body. Only
                     the god's card is drawn: two tiles in a slot this size is two illegible
                     tiles, and half a card showing from behind another reads as a rendering
                     fault rather than as a card. What is underneath is still reachable — the
                     Rank badge is the base unit's, the turn number is its place in the order,
                     and the patron card below the board carries a Base card button to it. -->
                <span
                  class="relative block origin-bottom"
                  [class]="landingClass(view.index)"
                  [attr.data-testid]="'slot-god-' + view.index"
                >
                  <mt-card-tile
                    [card]="god"
                    [rankFrame]="true"
                    [named]="false"
                    [stats]="{ attack: view.attack, health: view.health }"
                  />
                  <span
                    class="block truncate pt-1.5 text-center text-xs text-gold-bright"
                    [title]="god.name + ' descended onto ' + unit.name"
                    >{{ god.name }}</span
                  >
                </span>
              } @else {
                <mt-card-tile [card]="unit" [rank]="view.slot!.rank" [rankFrame]="true" />
              }
            </button>

            <!-- Turn number: slot order is attack order, and nothing else on the card says so. -->
            @if (view.turn) {
              <span
                class="pointer-events-none absolute left-0 top-0 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-gold/60 bg-bg/90 text-[11px] font-medium text-gold"
                [title]="'Attacks ' + ordinal(view.turn)"
                >{{ view.turn }}</span
              >
            }

            <!-- Rank, and the control for it. There is no hover layer on a slot any more: what
                 the slot can do, it shows. The badge was already drawn here and already said the
                 Rank, so making it the button adds a control without adding anything to look at,
                 and it works the same to a finger as to a mouse. -->
            <button
              type="button"
              class="absolute right-0 top-0 z-20 flex h-6 min-w-6 items-center justify-center rounded-full border border-gold/60 bg-bg/90 px-1 text-[10px] font-medium text-gold transition-colors hover:border-gold hover:bg-gold/20"
              [title]="'Rank ' + (view.slot!.rank + 1) + ' — click to cycle'"
              [attr.aria-label]="
                unit.name + ' is Rank ' + (view.slot!.rank + 1) + ', click to cycle Rank'
              "
              [attr.data-testid]="'slot-rank-' + view.index"
              (click)="store.cycleRank(view.index)"
            >
              R{{ view.slot!.rank + 1 }}
            </button>
          } @else if (view.god; as god) {
            <!-- The patron holding a slot with nothing under it yet. Its own card, dragged on
                 like any unit, and draggable again to move or take it back off. It shows the
                 body it fights with once it has come down, which is what its card always
                 shows — there is no sum yet, and nothing here claims one. -->
            <button
              type="button"
              class="relative block w-full cursor-grab rounded-lg text-left active:cursor-grabbing"
              [mtDragSource]="{ kind: 'god', godId: god.id }"
              [attr.aria-label]="god.name + ' holding slot ' + (view.index + 1)"
              [attr.data-testid]="'slot-god-' + view.index"
              (click)="preview.open(god)"
            >
              <span class="block origin-bottom" [class]="landingClass(view.index)">
                <mt-card-tile [card]="god" [rankFrame]="true" />
              </span>
            </button>
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

          <!-- The impact, drawn once per slot rather than inside each branch: the god lands the
               same way whether it came down on an ally or onto a free slot.

               Two rings, the second a beat behind the first, because one ring reads as a circle
               appearing and two read as something spreading. They are wide ellipses, not circles
               — the shockwave runs out along the board, and a flat ring is how a ground-level
               ripple looks from where the player is sitting. The centring lives here on the outer
               span so the keyframes are free to own the transform outright. -->
          @if (view.god) {
            <span
              class="pointer-events-none absolute bottom-[12%] left-1/2 z-30 -translate-x-1/2"
              aria-hidden="true"
            >
              <span
                class="absolute left-1/2 top-1/2 block h-9 w-28 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] border-gold-bright opacity-0 shadow-[0_0_20px_5px_rgba(235,196,99,0.45)]"
                [class]="shockwaveClass(view.index, 0)"
              ></span>
              <span
                class="absolute left-1/2 top-1/2 block h-6 w-20 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-gold opacity-0"
                [class]="shockwaveClass(view.index, 1)"
              ></span>
            </span>
          }
        </div>
      }
    </div>

    <!-- Left commented out deliberately. If it comes back, this is the wording the board now
         needs: with no hover layer on a slot, dragging is the only way to place, swap or remove,
         and none of that is visible in a static picture. -->
    <!-- <p class="pt-2 text-center text-[11px] leading-relaxed text-ink-faint">
      Front row attacks first · drag a unit in to place it, between slots to swap, off the board to
      remove it · tap the R badge to cycle Rank
    </p> -->
  `,
})
export class BoardGrid {
  protected readonly store = inject(BuilderStore);
  protected readonly drag = inject(DragService);
  protected readonly preview = inject(CardPreview);
  private readonly catalog = inject(CatalogService);
  private readonly document = inject(DOCUMENT);

  protected readonly columns = `repeat(${BOARD_COLUMNS}, minmax(0, 1fr))`;

  protected readonly slots = computed<SlotView[]>(() => {
    const turns = this.store.turnOrder();
    const descend = this.store.descend();
    const descendSlot = this.store.descendSlot();
    const patron = this.store.patron();
    return this.store.board().map((slot, index) => {
      const unit = slot ? this.catalog.unit(slot.unitId) : undefined;
      const rank = unit && slot ? unit.ranks[Math.min(slot.rank, unit.ranks.length - 1)] : null;
      const here = descendSlot === index ? patron : null;
      const isDescend = !!here && !!descend;
      return {
        index,
        slot,
        unit,
        // A descended slot shows the body the god brought with it, not the unit's own; a god
        // standing on its own shows the body it fights with once it has come down.
        attack: isDescend ? descend.attack : (rank?.attack ?? 0),
        health: isDescend ? descend.health : (rank?.health ?? 0),
        turn: turns.get(index),
        god: here,
        isDescend,
        isGodAlone: !!here && !unit,
      };
    });
  });

  /**
   * The slot the patron has just been dropped on, for as long as the landing takes to play.
   *
   * Driven by `store.landing`, which fires on the drop rather than on the position: a god that is
   * merely *on* a slot — restored from a link — has not just landed there, and a page that throws
   * the board around every time it opens would wear out fast.
   */
  private readonly landedOn = signal<number | null>(null);

  constructor() {
    effect((onCleanup) => {
      const landing = this.store.landing();
      if (!landing) return;
      this.landedOn.set(landing.slot);
      const view = this.document.defaultView;
      const timer = view?.setTimeout(() => this.landedOn.set(null), LANDING_MS);
      onCleanup(() => view?.clearTimeout(timer));
    });
  }

  protected landingClass(index: number): string {
    return this.landedOn() === index
      ? 'animate-[god-landing_620ms_both] motion-reduce:animate-none'
      : '';
  }

  /**
   * One of the two rings, `ring` 0 being the wide leading one.
   *
   * The delay is what lines the ring up with the impact rather than the launch: the fall takes
   * the first 46% of `god-landing`, so the ring waits that out and then has its own 520ms to
   * spread — far more life than it had while it shared the fall's timeline and spent most of
   * its own fading.
   */
  protected shockwaveClass(index: number, ring: 0 | 1): string {
    if (this.landedOn() !== index) return '';
    return ring === 0
      ? 'animate-[god-shockwave_520ms_ease-out_285ms_both] motion-reduce:animate-none'
      : 'animate-[god-shockwave_560ms_ease-out_355ms_both] motion-reduce:animate-none';
  }

  protected quakeClass(): string {
    return this.landedOn() !== null
      ? 'animate-[god-quake_260ms_ease-in-out_290ms_both] motion-reduce:animate-none'
      : '';
  }

  protected frame(view: SlotView, over: boolean, lifted: boolean): string {
    if (over) return 'bg-gold/10 ring-2 ring-gold';
    if (lifted) return 'bg-raised ring-2 ring-gold';
    if (view.isDescend || view.isGodAlone) return 'bg-gold/5 ring-1 ring-gold/60';
    return 'ring-0';
  }

  protected ordinal(turn: number): string {
    const suffix = turn === 1 ? 'st' : turn === 2 ? 'nd' : turn === 3 ? 'rd' : 'th';
    return `${turn}${suffix}`;
  }
}
