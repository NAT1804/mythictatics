import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { BoardGrid } from './board-grid';
import { BuilderStore } from './builder-store';
import { CardPreview, CardPreviewDialog } from './card-preview';
import { CatalogService } from './catalog';
import { DescendPanel } from './descend-panel';
import { DragGhost } from './drag-ghost';
import { DragService } from './drag';
import { GodCarousel } from './god-carousel';
import { RealmPicker } from './realm-picker';
import { UnitPool } from './unit-pool';

type Pane = 'god' | 'board' | 'units';

/**
 * The builder screen: patron god, realm draft, unit pool and board, all on one screen at once.
 *
 * ## Why the page does not scroll
 *
 * Laying out a board is a comparison task — you place a unit and immediately look at what it did
 * to the rest of the board. A page that scrolls breaks that loop, so the frame is pinned to the
 * viewport (a flex column all the way down, `min-h-0` on every child so they may shrink) and the
 * only scroll container on the screen is the unit list. Everything else either fits or is told to
 * fit: the board sizes off its own grid, the god's rules text clips rather than pushing the rail
 * taller.
 *
 * Below `lg` there is not enough room for three columns side by side, and stacking them would
 * reintroduce the page scroll. So the three become tabs — still one screen, still no page scroll.
 */
@Component({
  selector: 'mt-builder-page',
  imports: [
    BoardGrid,
    CardPreviewDialog,
    DescendPanel,
    DragGhost,
    GodCarousel,
    RealmPicker,
    UnitPool,
  ],
  providers: [BuilderStore, CardPreview, DragService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    @if (catalog.error()) {
      <div class="m-auto max-w-sm text-center">
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
      <!-- Toolbar -->
      <div class="flex shrink-0 items-center gap-2 pb-2">
        <h1 class="font-display text-lg text-gold">Team Builder</h1>
        <span class="text-[11px] text-ink-faint">{{ store.placedCount() }}/6 placed</span>
        <span class="ml-auto flex items-center gap-2">
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
            Clear
          </button>
        </span>
      </div>

      <!-- Tabs, for the widths where three columns will not fit. -->
      <div class="flex shrink-0 gap-1 pb-2 lg:hidden">
        @for (option of panes; track option) {
          <button
            type="button"
            class="flex-1 rounded-md border px-2 py-1 text-xs capitalize"
            [class]="
              pane() === option
                ? 'border-gold bg-gold/10 text-gold'
                : 'border-line text-ink-dim hover:text-ink'
            "
            (click)="pane.set(option)"
          >
            {{ option }}
          </button>
        }
      </div>

      <div
        class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)_18rem] xl:grid-cols-[18rem_minmax(0,1fr)_20rem]"
      >
        <!-- Left rail: who you are playing, and what you may buy. -->
        <aside
          class="min-h-0 flex-col gap-3 overflow-hidden lg:flex"
          [class]="pane() === 'god' ? 'flex' : 'hidden'"
        >
          <!-- Both are draft controls, so they sit together at the top and the slack falls
               beneath them rather than between them. -->
          <mt-god-carousel class="shrink-0" />
          <mt-realm-picker class="shrink-0" />
        </aside>

        <!-- Centre: the board itself. -->
        <section
          class="min-h-0 flex-col gap-3 overflow-hidden lg:flex"
          [class]="pane() === 'board' ? 'flex' : 'hidden'"
        >
          <mt-board-grid class="min-h-0 flex-1" />
          <mt-descend-panel class="shrink-0" />
        </section>

        <!-- Right rail: the pool, and the one thing on the page that scrolls. -->
        <aside
          class="min-h-0 overflow-hidden lg:flex lg:flex-col"
          [class]="pane() === 'units' ? 'flex flex-col' : 'hidden'"
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

  protected readonly panes: readonly Pane[] = ['god', 'board', 'units'];
  protected readonly pane = signal<Pane>('board');
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
