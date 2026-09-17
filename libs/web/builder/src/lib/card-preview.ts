import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injectable,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { BOARD_SIZE, type Card, type Rank } from '@mythictatics/shared/contracts';
import { BuilderStore } from './builder-store';
import { CatalogService } from './catalog';
import { GameCard } from './game-card';
import { RichText } from './rich-text';

/** What the preview is currently showing, and at which Rank. */
export interface CardPreviewTarget {
  card: Card;
  rank: Rank;
  /** Set when the preview was opened from the pool, so it can offer to place the unit. */
  placeable: boolean;
}

@Injectable()
export class CardPreview {
  private readonly state = signal<CardPreviewTarget | null>(null);

  readonly target = this.state.asReadonly();

  open(card: Card, options: { rank?: Rank; placeable?: boolean } = {}): void {
    this.state.set({ card, rank: options.rank ?? 0, placeable: options.placeable ?? false });
  }

  setRank(rank: Rank): void {
    this.state.update((current) => (current ? { ...current, rank } : current));
  }

  close(): void {
    this.state.set(null);
  }
}

/**
 * The detail popup: the card itself, the Ranks it can sit at, and the terms it uses.
 *
 * In the builder a god's Power is deliberately not here: it is what decides which god you take, so
 * it belongs beside the carousel where that choice is being made, not behind a tap. Anywhere else
 * the preview is the only place to read it, so it is shown.
 *
 * It is a native `<dialog>`, which brings the focus trap, the backdrop and Escape without any of
 * it being written here. The keyword panels beside the card are the same ones the game puts there
 * — the rules text names a term and the panel says what the term means, so nobody has to leave
 * the builder to look one up.
 */
@Component({
  selector: 'mt-card-preview',
  imports: [GameCard, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="m-auto max-h-[90dvh] max-w-[min(48rem,92vw)] overflow-visible bg-transparent p-0 backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
      (close)="preview.close()"
    >
      @if (preview.target(); as target) {
        @let card = target.card;
        <div
          class="relative flex max-h-[90dvh] flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-bg p-4 sm:flex-row"
          data-testid="card-preview"
        >
          <button
            type="button"
            class="absolute right-2 top-2 z-10 rounded-full border border-line bg-panel px-2 py-0.5 text-xs text-ink-dim hover:border-gold hover:text-gold"
            aria-label="Close"
            (click)="preview.close()"
          >
            &#10005;
          </button>

          <div class="mx-auto w-56 shrink-0">
            <mt-game-card [card]="card" [rank]="target.rank" />

            @if (card.type === 'unit' && card.ranks.length > 1) {
              <div class="mt-2 flex justify-center gap-1">
                @for (rank of card.ranks; track rank.rank; let index = $index) {
                  <button
                    type="button"
                    class="rounded border px-2 py-0.5 text-[11px] transition-colors"
                    [class]="
                      target.rank === index
                        ? 'border-gold bg-gold/10 text-gold'
                        : 'border-line text-ink-dim hover:text-ink'
                    "
                    (click)="preview.setRank(rank.rank)"
                  >
                    Rank {{ index + 1 }}
                  </button>
                }
              </div>
            }

            @if (target.placeable && store) {
              <button
                type="button"
                class="mt-2 w-full rounded-md border border-gold/60 bg-gold/10 py-1.5 text-xs text-gold hover:bg-gold/20 disabled:opacity-40"
                [disabled]="!canPlace()"
                (click)="place(card.id)"
              >
                {{ canPlace() ? 'Place on the board' : 'The board is full' }}
              </button>
            }
          </div>

          <div class="min-w-0 flex-1 space-y-2 text-xs">
            <!-- Keywords first: they explain the words the card's own text just used. The Descend
                 Condition trails them, being a goal for the run rather than a reading aid. -->
            @for (keyword of keywords(); track keyword.code) {
              <section class="rounded-lg border border-line bg-panel p-2.5">
                <h3 class="font-medium text-gold-bright">{{ keyword.title }}</h3>
                @if (keyword.description) {
                  <p class="mt-0.5 text-ink-dim">{{ keyword.description }}</p>
                }
              </section>
            } @empty {
              <p class="text-ink-faint">This card uses no keywords.</p>
            }

            <!-- Outside the builder there is no carousel beside the preview, so the Power has
                 nowhere else to be read. -->
            @if (card.type === 'god' && !store && card.powerText.length) {
              <section class="rounded-lg border border-gold/40 bg-panel p-2.5">
                <h3 class="font-display text-sm text-gold">{{ card.powerName ?? 'Power' }}</h3>
                <p class="mt-0.5 text-ink-dim">
                  <mt-rich-text [tokens]="card.powerText" />
                </p>
              </section>
            }

            @if (card.type === 'god') {
              <section class="rounded-lg border border-line bg-panel p-2.5">
                <h3 class="font-display text-sm text-gold">Descend Condition</h3>
                <p class="mt-0.5 text-ink-dim">
                  <mt-rich-text [tokens]="card.descendQuestText" />
                </p>
              </section>
            }
          </div>
        </div>
      }
    </dialog>
  `,
})
export class CardPreviewDialog {
  protected readonly preview = inject(CardPreview);
  private readonly catalog = inject(CatalogService);
  /** Absent outside the builder, where a card is only ever looked at, never placed. */
  protected readonly store = inject(BuilderStore, { optional: true });
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly canPlace = computed(
    () => (this.store?.placedCount() ?? BOARD_SIZE) < BOARD_SIZE,
  );

  protected readonly keywords = computed(() => {
    const target = this.preview.target();
    if (!target) return [];
    return target.card.keywords
      .map((code) => this.catalog.keyword(code))
      .filter((keyword) => keyword !== undefined);
  });

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      const open = this.preview.target() !== null;
      if (open && !element.open) element.showModal();
      if (!open && element.open) element.close();
    });

    // Closing on a backdrop click is wired here rather than in the template: an event on the
    // `<dialog>` element itself is a click on its backdrop, which has no keyboard equivalent to
    // pair with — Escape is the dialog's own, and it arrives as `close`.
    afterNextRender(() => {
      const element = this.dialog().nativeElement;
      element.addEventListener('click', (event) => {
        if (event.target === element) this.preview.close();
      });
    });
  }

  /**
   * Placing from the preview is the path a tap has: the pool tile opens this instead of selecting,
   * so without it a phone could only fill the board by dragging.
   */
  protected place(unitId: string): void {
    this.store?.placeFirstEmpty(unitId);
    this.preview.close();
  }
}
