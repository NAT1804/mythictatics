import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { BoardGrid } from './board-grid';
import { BuilderStore } from './builder-store';
import { CardPreview, CardPreviewDialog } from './card-preview';
import { CatalogService } from './catalog';
import { DragGhost } from './drag-ghost';
import { DragService } from './drag';
import { GodPicker } from './god-picker';
import { PatronCard } from './patron-card';
import { RealmPicker } from './realm-picker';
import { UnitPool } from './unit-pool';

/**
 * The builder screen, in two columns split 6/4: the build on the left, the units to fill it with
 * on the right.
 *
 * The left column reads top to bottom in the order a run is decided — patron god, then the realms
 * it leaves you, then the board those realms can fill.
 *
 * ## The page scrolls, and the units stay put
 *
 * It used to not scroll: the route asked the shell to pin it to the viewport and the unit list was
 * the only thing on screen that moved. That bought the board and the pool being in view together,
 * and it cost every part of the page its natural size — the god picker in particular, which had
 * twenty-one gods to show in a sideways strip and a Power description clipped to two lines.
 *
 * So the page flows now, and the one thing worth keeping is bought a cheaper way: the unit column
 * is `sticky`, capped to the viewport and scrolling inside itself, so it stays reachable however
 * far down the left column you are. Dragging still wants a slot and a tile in view at once; where
 * they are not, the preview's "Place on the board" is the path that does not need both.
 */
@Component({
  selector: 'mt-builder-page',
  imports: [BoardGrid, CardPreviewDialog, DragGhost, GodPicker, PatronCard, RealmPicker, UnitPool],
  providers: [BuilderStore, CardPreview, DragService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl font-bold text-gold">Team Builder</h1>
        <p class="mt-1 max-w-2xl text-sm text-ink-dim">
          Pick a patron god, the realms it leaves you, and the board to fill them with. Share the
          build with a link, or start from one of the community comps.
        </p>
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
      <div class="mt-4 grid items-start gap-4 lg:grid-cols-10">
        <!-- 6: the build, read top to bottom. One panel rather than three: the three steps are
             one decision, and a border between each of them would say otherwise. -->
        <section class="flex min-w-0 flex-col lg:col-span-6" aria-label="Build">
          <div class="flex flex-col gap-3 rounded-lg border border-line bg-panel p-3">
            <mt-god-picker />
            <mt-realm-picker class="border-t border-line pt-3" />

            <div
              class="flex flex-col gap-2 border-t border-line pt-3"
              aria-label="Board"
              data-testid="board-panel"
            >
              <!-- The two actions act on the board, so they sit on its heading rather than on the
                   page's — near what they change, and out of the way of the title. -->
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="font-display text-lg text-gold">Board</h2>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:border-gold hover:text-gold"
                    (click)="copyLink()"
                  >
                    {{ copied() ? 'Link copied' : 'Copy link' }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:border-red-400 hover:text-red-300 disabled:opacity-40"
                    [disabled]="!store.placedCount()"
                    (click)="store.clearBoard()"
                  >
                    Clear board
                  </button>
                </div>
              </div>
              <mt-board-grid />
              <!-- The chosen god sits under the board it acts on, and is dragged from here onto
                   the unit it comes down on. -->
              <mt-patron-card />
            </div>
          </div>
        </section>

        <!-- 4: the units. Sticky and scrolling inside itself, so the list is still at hand once
             the left column has scrolled past it; its offset matches the page's top padding. -->
        <aside
          class="flex max-h-[80dvh] min-h-[24rem] min-w-0 flex-col rounded-lg border border-line bg-panel p-3 lg:sticky lg:top-4 lg:col-span-4 lg:max-h-[calc(100dvh-2rem)]"
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
      // The god goes wherever it was dropped on the board — onto a unit, which is the Descend, or
      // onto a free slot, which is the god put down first and given an ally later. Dropped clear
      // of the board it comes off.
      if (payload.kind === 'god') {
        if (slotIndex === null) this.store.recallDescend();
        else this.store.descendOnto(slotIndex);
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
