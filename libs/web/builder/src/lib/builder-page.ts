import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { BoardGrid } from './board-grid';
import { BuilderStore } from './builder-store';
import { CardPreview, CardPreviewDialog } from './card-preview';
import { CatalogService } from './catalog';
import { DescendPanel } from './descend-panel';
import { DragGhost } from './drag-ghost';
import { DragService } from './drag';
import { GodPicker } from './god-picker';
import { RealmPicker } from './realm-picker';
import { UnitPool } from './unit-pool';

/**
 * The builder screen, in two columns split 6/4: the build on the left, the units to fill it with
 * on the right.
 *
 * The left column reads top to bottom in the order a run is decided — patron god, then the realms
 * it leaves you, then the board those realms can fill.
 *
 * ## Why the page does not scroll
 *
 * Laying out a board is a comparison task — you place a unit and immediately look at what it did
 * to the rest of the board. A page that scrolls breaks that loop, so from `lg` up the route asks
 * the shell for its fixed layout, the frame is a flex column all the way down (`min-h-0` on every
 * child so they may shrink) and the unit list is the only scroll container on the screen. The
 * left column is told to fit instead: the draft takes what it needs, and the board sizes itself
 * off whatever height is left.
 *
 * Below `lg` there is not enough room for that, so the columns stack and the page scrolls like any
 * other; the preview's "Place on the board" is the path that does not need both in view.
 */
@Component({
  selector: 'mt-builder-page',
  imports: [
    BoardGrid,
    CardPreviewDialog,
    DescendPanel,
    DragGhost,
    GodPicker,
    RealmPicker,
    UnitPool,
  ],
  providers: [BuilderStore, CardPreview, DragService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block lg:flex lg:min-h-0 lg:flex-1 lg:flex-col' },
  template: `
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="flex items-baseline gap-3">
        <h1 class="font-display text-3xl font-bold text-gold lg:text-2xl">Team Builder</h1>
        <span class="text-xs text-ink-faint">{{ store.placedCount() }}/6 placed</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-line px-3 py-1.5 text-sm text-ink-dim hover:border-gold hover:text-gold"
          (click)="copyLink()"
        >
          {{ copied() ? 'Link copied' : 'Copy link' }}
        </button>
        <button
          type="button"
          class="rounded-md border border-line px-3 py-1.5 text-sm text-ink-dim hover:border-red-400 hover:text-red-300 disabled:opacity-40"
          [disabled]="!store.placedCount()"
          (click)="store.clearBoard()"
        >
          Clear board
        </button>
      </div>
    </header>

    @if (catalog.error()) {
      <div class="mt-10 text-center">
        <p class="text-sm text-red-300">The card data could not be loaded.</p>
        <button
          type="button"
          class="mt-3 rounded-md border border-line px-3 py-1.5 text-xs text-ink-dim hover:border-gold hover:text-gold"
          (click)="catalog.reload()"
        >
          Try again
        </button>
      </div>
    } @else {
      <div
        class="mt-4 grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-10 lg:grid-rows-[minmax(0,1fr)]"
      >
        <!-- 6: the build, read top to bottom. One panel rather than three, because on a screen
             that does not scroll every border is height the board does not get. The board takes
             whatever is left, down to the floor the panel states; a screen too short even for
             that scrolls this column rather than let the rows overlap. -->
        <section
          class="flex min-w-0 flex-col lg:col-span-6 lg:min-h-0 lg:overflow-y-auto lg:pr-1"
          aria-label="Build"
        >
          <div
            class="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-line bg-panel p-3 lg:min-h-[20rem]"
          >
            <mt-god-picker class="shrink-0" />
            <mt-realm-picker class="shrink-0 border-t border-line pt-3" />

            <div
              class="flex flex-col gap-2 border-t border-line pt-3 lg:min-h-0 lg:flex-1"
              aria-label="Board"
              data-testid="board-panel"
            >
              <h2 class="shrink-0 font-display text-lg text-gold lg:sr-only">Board</h2>
              <mt-board-grid class="lg:min-h-0 lg:flex-1" />
              <mt-descend-panel class="shrink-0" />
            </div>
          </div>
        </section>

        <!-- 4: the units, and the one thing on the page that scrolls. -->
        <aside
          class="flex h-[70dvh] min-h-[24rem] min-w-0 flex-col rounded-lg border border-line bg-panel p-3 lg:col-span-4 lg:h-auto lg:min-h-0"
        >
          <mt-unit-pool class="min-h-0 flex-1" />
        </aside>
      </div>

      <mt-drag-ghost />
      <mt-card-preview />
    }
  `,
})
export class BuilderPage {
  protected readonly store = inject(BuilderStore);
  protected readonly catalog = inject(CatalogService);
  private readonly drag = inject(DragService);
  private readonly document = inject(DOCUMENT);

  protected readonly copied = signal(false);

  constructor() {
    this.drag.onDrop((payload, slotIndex) => {
      if (payload.kind === 'unit') {
        if (slotIndex !== null) this.store.place(payload.unitId, slotIndex);
        return;
      }
      // A unit dragged clear of every slot comes off the board; that is the gesture people try.
      if (slotIndex === null) this.store.remove(payload.index);
      else this.store.move(payload.index, slotIndex);
    });
  }

  protected async copyLink(): Promise<void> {
    const url = this.document.defaultView?.location.href;
    if (!url) return;
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(url);
      this.copied.set(true);
      this.document.defaultView?.setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard access can be refused; the URL is already in the address bar either way.
      this.copied.set(false);
    }
  }
}
