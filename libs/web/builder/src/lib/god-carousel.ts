import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BuilderStore } from './builder-store';
import { CardPreview } from './card-preview';
import { CatalogService } from './catalog';
import { GameCard } from './game-card';
import { RealmIcon } from './realm-icon';
import { RichText } from './rich-text';

/**
 * Picking the patron god, one card at a time.
 *
 * A carousel rather than a grid because a god is a long read, and because there are only twenty
 * of them. Stepping through it picks the god straight away: browsing and choosing are the same
 * act here, and the realm draft keeps whichever picks still fit, so stepping past one costs
 * nothing.
 *
 * The card shows what the game's card shows — the Descend body and what it does once it lands.
 * The Power sits under it rather than behind a tap: it is the reason to take one god over
 * another, so it has to be readable while stepping through them. The Descend Condition and the
 * keyword glossary are in the preview, a tap away.
 */
@Component({
  selector: 'mt-god-carousel',
  imports: [GameCard, RealmIcon, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <div class="flex items-center justify-between gap-2 pb-2">
      <h2 class="font-display text-sm tracking-wide text-gold">Patron God</h2>
      @if (store.patron()) {
        <button
          type="button"
          class="text-xs text-ink-faint hover:text-ink"
          (click)="store.setPatron(null)"
        >
          Clear
        </button>
      }
    </div>

    <div class="flex min-h-0 shrink-0 items-center gap-1.5">
      <button
        type="button"
        class="shrink-0 rounded-md border border-line px-1.5 py-8 text-ink-dim hover:border-gold hover:text-gold disabled:opacity-30"
        [disabled]="!gods().length"
        aria-label="Previous god"
        (click)="step(-1)"
      >
        &#9664;
      </button>

      @if (current(); as god) {
        <div class="flex min-h-0 min-w-0 flex-1 flex-col items-center">
          <button
            type="button"
            class="w-full max-w-[12.5rem] rounded-xl transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            [attr.aria-label]="'Details for ' + god.name"
            data-testid="god-card"
            (click)="preview.open(god)"
          >
            <mt-game-card [card]="god" />
          </button>
          <p class="pt-1 text-[10px] text-ink-faint">
            {{ index() + 1 }}/{{ gods().length }} · tap the card for keywords
          </p>
        </div>
      } @else {
        <div class="flex-1 py-12 text-center text-xs text-ink-faint">Loading gods…</div>
      }

      <button
        type="button"
        class="shrink-0 rounded-md border border-line px-1.5 py-8 text-ink-dim hover:border-gold hover:text-gold disabled:opacity-30"
        [disabled]="!gods().length"
        aria-label="Next god"
        (click)="step(1)"
      >
        &#9654;
      </button>
    </div>

    @if (current(); as god) {
      <section class="mt-2 rounded-md border border-line bg-panel px-2 py-1.5 text-xs">
        <h3 class="font-display text-gold">{{ god.powerName ?? 'God Power' }}</h3>
        <p class="mt-0.5 leading-snug text-ink-dim">
          <mt-rich-text [tokens]="god.powerText" />
        </p>
      </section>

      @if (god.realmLock) {
        <!-- Only the eight gods that lock a realm get the switch; for the rest there is nothing
             to say, and a disabled control would only be noise. -->
        <button
          type="button"
          class="mt-2 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors"
          [class]="
            store.lockEnabled()
              ? 'border-gold/60 bg-gold/10 text-gold'
              : 'border-line bg-panel text-ink-faint'
          "
          [attr.aria-pressed]="store.lockEnabled()"
          (click)="store.toggleLock()"
        >
          <span
            class="flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors"
            [class]="store.lockEnabled() ? 'bg-gold/70' : 'bg-line'"
          >
            <span
              class="h-3 w-3 rounded-full bg-ink transition-transform"
              [class.translate-x-3]="store.lockEnabled()"
            ></span>
          </span>
          <span class="flex min-w-0 flex-1 items-center gap-1">
            Realm lock
            <mt-realm-icon [realm]="god.realm" class="h-4 w-4" />
          </span>
        </button>
      }
    }
  `,
})
export class GodCarousel {
  protected readonly store = inject(BuilderStore);
  protected readonly preview = inject(CardPreview);
  private readonly catalog = inject(CatalogService);

  protected readonly gods = this.catalog.gods;

  /** The carousel follows the chosen god, so a restored link opens on the right card. */
  protected readonly index = computed(() => {
    const id = this.store.patronGodId();
    const found = this.gods().findIndex((god) => god.id === id);
    return found < 0 ? 0 : found;
  });

  protected readonly current = computed(() => this.gods()[this.index()] ?? null);

  protected step(by: number): void {
    const gods = this.gods();
    if (!gods.length) return;
    // With no god chosen yet, the first step takes the one already on screen rather than skipping it.
    const next = this.store.patronGodId() ? (this.index() + by + gods.length) % gods.length : 0;
    this.store.setPatron(gods[next].id);
  }
}
