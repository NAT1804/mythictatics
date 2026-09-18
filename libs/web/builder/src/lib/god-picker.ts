import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PatronPortrait } from './patron-portrait';
import { BuilderStore } from './builder-store';
import { CatalogService } from './catalog';

/**
 * Picking the patron god: every god at once, with "Any" first. Nothing else.
 *
 * A grid that wraps rather than a strip that scrolls sideways. The strip was what fitted on a
 * builder pinned to the viewport, and it hid most of the twenty gods behind a gesture nothing on
 * screen advertised — with the page free to scroll, they all just fit. "Any" leads it and is a
 * real choice, not the absence of one: plenty of comps do not turn on a god's Power, and a comp
 * opened from the sheet without a patron lands there.
 *
 * What the chosen god *is* — its card, its Power, the realm it locks — is not here. This is the
 * one question this panel asks, and the answer belongs where it is acted on: `PatronCard`, under
 * the board. Keeping the consequences here meant the god you had chosen was described at the top
 * of the screen and used at the bottom of it.
 */
@Component({
  selector: 'mt-god-picker',
  imports: [PatronPortrait],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-col' },
  template: `
    <div class="flex flex-wrap items-baseline justify-between gap-x-2 pb-2">
      <h2 class="shrink-0 font-display text-lg text-gold">Patron God</h2>
      <span class="text-[11px] text-ink-faint">one Power, and one unit it can Descend onto</span>
    </div>

    @if (gods().length) {
      <ul
        class="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-1.5"
        aria-label="Patron god"
        data-testid="god-picker"
      >
        <!-- "Any" leads the grid: it is where a build with no patron sits, not a gap at the end. -->
        <li>
          <button
            type="button"
            class="group block w-full rounded-lg p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            [class]="frame(!store.patronGodId())"
            [attr.aria-pressed]="!store.patronGodId()"
            aria-label="Any patron god"
            data-testid="god-any"
            (click)="store.setPatron(null)"
          >
            <mt-patron-portrait [god]="null" />
          </button>
        </li>
        @for (god of gods(); track god.id) {
          @let chosen = store.patronGodId() === god.id;
          <li>
            <button
              type="button"
              class="group block w-full rounded-lg p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              [class]="frame(chosen)"
              [attr.aria-pressed]="chosen"
              [attr.aria-label]="god.name"
              [attr.data-god]="god.id"
              (click)="store.setPatron(god.id)"
            >
              <mt-patron-portrait [god]="god" />
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="py-10 text-center text-xs text-ink-faint">Loading gods…</p>
    }
  `,
})
export class GodPicker {
  protected readonly store = inject(BuilderStore);
  private readonly catalog = inject(CatalogService);

  protected readonly gods = this.catalog.gods;

  protected frame(chosen: boolean): string {
    return chosen ? 'bg-gold/10 ring-2 ring-gold' : 'ring-0 hover:bg-raised/60';
  }
}
