import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { plainText } from '@mythictatics/shared/domain';
import { PatronPortrait } from './patron-portrait';
import { BuilderStore } from './builder-store';
import { CardPreview } from './card-preview';
import { CatalogService } from './catalog';
import { RealmIcon } from './realm-icon';
import { RichText } from './rich-text';

/**
 * Picking the patron god: every god in one row of tiles, with "Any" first.
 *
 * A row rather than a carousel, so the choice reads like the collection's grid — twenty gods fit
 * in a strip that scrolls sideways, and the one you have is always framed. "Any" is the default
 * and a real choice, not the absence of one: plenty of comps do not depend on a god's Power, and a
 * comp opened from the sheet without a patron lands on it.
 *
 * The Power sits under the row rather than behind a tap: it is the reason to take one god over
 * another. The Descend body, the Descend Condition and the keyword glossary are in the preview.
 */
@Component({
  selector: 'mt-god-picker',
  imports: [PatronPortrait, RealmIcon, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-col' },
  template: `
    <!-- On a screen that does not scroll, a heading on its own line is a line the board does
         not get, so on a wide screen the heading stands beside the row instead of above it. -->
    <div
      class="flex flex-wrap items-baseline gap-x-2 gap-y-1 lg:flex-nowrap lg:items-start lg:gap-3"
    >
      <div
        class="flex items-baseline gap-2 lg:w-16 lg:shrink-0 lg:flex-col lg:items-start lg:gap-0 lg:pt-1"
      >
        <h2 class="font-display text-lg text-gold lg:text-sm lg:leading-tight">Patron God</h2>
        <span class="text-[11px] text-ink-faint">{{ gods().length }} gods · or Any</span>
      </div>

      <div class="w-full min-w-0 lg:w-auto lg:flex-1">
        @if (gods().length) {
          <ul
            #strip
            class="relative -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1"
            aria-label="Patron god"
            data-testid="god-picker"
          >
            <!-- "Any" leads the row: it is where a build with no patron sits, not a gap at the end. -->
            <li class="w-16 shrink-0 snap-start lg:w-12">
              <button
                type="button"
                class="group block w-full rounded-lg p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                [class]="frame(!store.patronGodId())"
                [attr.aria-pressed]="!store.patronGodId()"
                [attr.data-selected]="!store.patronGodId() || null"
                aria-label="Any patron god"
                data-testid="god-any"
                (click)="store.setPatron(null)"
              >
                <mt-patron-portrait [god]="null" />
              </button>
            </li>
            @for (god of gods(); track god.id) {
              @let chosen = store.patronGodId() === god.id;
              <li class="w-16 shrink-0 snap-start lg:w-12">
                <button
                  type="button"
                  class="group block w-full rounded-lg p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                  [class]="frame(chosen)"
                  [attr.aria-pressed]="chosen"
                  [attr.data-selected]="chosen || null"
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

        <!-- What the choice gives you: the Power, and for eight gods the realm they lock. The page
         does not scroll, so a long Power is clipped here and read in full in Details. -->
        <div
          class="mt-1.5 flex items-start gap-2 rounded-md border border-line bg-bg/40 px-2 py-1.5 text-xs"
          data-testid="god-detail"
        >
          <div class="min-w-0 flex-1">
            @if (store.patron(); as god) {
              <p class="flex flex-wrap items-baseline gap-x-1.5">
                <span class="font-display text-sm text-ink">{{ god.name }}</span>
                <span class="text-gold">{{ god.powerName ?? 'God Power' }}</span>
              </p>
              <p class="line-clamp-2 leading-snug text-ink-dim" [title]="powerTitle()">
                <mt-rich-text [tokens]="god.powerText" />
              </p>
            } @else {
              <p class="font-display text-sm text-ink">Any patron god</p>
              <p class="line-clamp-2 leading-snug text-ink-dim">
                For a build that does not turn on a god's Power: no realm is locked, and nothing
                Descends.
              </p>
            }
          </div>

          @if (store.patron(); as god) {
            <div class="flex shrink-0 items-center gap-1.5">
              @if (god.realmLock) {
                <!-- Only the eight gods that lock a realm get the switch; for the rest there is
                 nothing to say, and a disabled control would only be noise. -->
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors"
                  [class]="
                    store.lockEnabled()
                      ? 'border-gold/60 bg-gold/10 text-gold'
                      : 'border-line text-ink-faint'
                  "
                  [attr.aria-pressed]="store.lockEnabled()"
                  (click)="store.toggleLock()"
                >
                  <span
                    class="flex h-3.5 w-6 shrink-0 items-center rounded-full p-0.5 transition-colors"
                    [class]="store.lockEnabled() ? 'bg-gold/70' : 'bg-line'"
                  >
                    <span
                      class="h-2.5 w-2.5 rounded-full bg-ink transition-transform"
                      [class.translate-x-2.5]="store.lockEnabled()"
                    ></span>
                  </span>
                  Realm lock
                  <mt-realm-icon [realm]="god.realm" class="h-3.5 w-3.5" />
                </button>
              }
              <button
                type="button"
                class="rounded border border-line px-2 py-1 text-[11px] text-ink-dim hover:border-gold hover:text-gold"
                data-testid="god-card"
                (click)="preview.open(god)"
              >
                Details
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class GodPicker {
  protected readonly store = inject(BuilderStore);
  protected readonly preview = inject(CardPreview);
  private readonly catalog = inject(CatalogService);
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  protected readonly gods = this.catalog.gods;

  /** The whole Power as plain text, for the hover of a description the row clips. */
  protected readonly powerTitle = computed(() => {
    const god = this.store.patron();
    return god ? plainText(god.powerText) : '';
  });

  constructor() {
    // A restored link can name a god far down the row, so the row scrolls to it. Only the strip
    // scrolls — `scrollIntoView` would drag the whole page along with it.
    afterRenderEffect(() => {
      this.store.patronGodId();
      const strip = this.strip()?.nativeElement;
      const chosen = strip?.querySelector<HTMLElement>('[data-selected]');
      if (!strip || !chosen?.parentElement || typeof strip.scrollTo !== 'function') return;
      const tile = chosen.parentElement;
      const left = tile.offsetLeft - (strip.clientWidth - tile.clientWidth) / 2;
      strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    });
  }

  protected frame(chosen: boolean): string {
    return chosen ? 'bg-gold/10 ring-2 ring-gold' : 'ring-0 hover:bg-raised/60';
  }
}
