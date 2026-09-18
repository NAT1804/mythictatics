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
import { BOARD_SIZE, type Card, type Keyword, type Rank } from '@mythictatics/shared/contracts';
import { BuilderStore } from './builder-store';
import { CatalogService } from './catalog';
import { GameCard } from './game-card';
import { RankDeck } from './rank-deck';
import { RichText } from './rich-text';

/** A keyword the game explains, as opposed to one it only uses to colour a word. */
type ExplainedKeyword = Keyword & { description: string };

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
 * It is arranged the way the game arranges a card being looked at — the card alone on a darkened
 * screen, its terms on parchment panels beside it, and whatever belongs to the run rather than to
 * the card banded across the bottom. There is deliberately no window around any of that: a
 * bordered box of our own would put a second frame around art that is already framed, and the
 * backdrop is what says the rest of the page has stepped back.
 *
 * The panels are the client's own tooltip sprites (see `.game-panel` in `styles.css`), so a term
 * is read here off the parchment the game reads it off, in the same orange. The rules text that
 * used the term is a couple of centimetres away, which is the whole point of the arrangement:
 * nobody has to leave the builder to look a word up.
 *
 * In the builder a god's Power is deliberately not here: it has its own icon on `PatronCard`, one
 * tap away from the board it acts on, and repeating it here would make two places to keep in step.
 * Anywhere else the preview is the only place to read it, so there it is shown.
 *
 * A god also brings its banner — the tall standee the client stands it up in. This is the one
 * surface with room for it, and the one where a reader is looking at the god rather than using it.
 *
 * It is a native `<dialog>`, which brings the focus trap, the backdrop and Escape without any of
 * it being written here.
 */
@Component({
  selector: 'mt-card-preview',
  imports: [GameCard, RankDeck, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="m-auto max-h-[92dvh] max-w-[min(54rem,94vw)] overflow-visible bg-transparent p-0 backdrop:bg-bg/85 backdrop:backdrop-blur-sm"
      (close)="preview.close()"
    >
      @if (preview.target(); as target) {
        @let card = target.card;
        <!-- The stage the card stands on. It is the backdrop's own darkness for a unit or a spell,
             and a god's standee for a god: the tall picture the client stands it up in, blown up
             to fill the dialog and dimmed until it is weather rather than a picture. The banner is
             a layer of the stage rather than an image beside the card, because a god is the room
             it is being read in — and it leaves the card the middle of the dialog. -->
        <div class="relative isolate overflow-hidden rounded-2xl">
          @if (card.type === 'god') {
            <img
              [src]="card.bannerImage"
              [alt]="card.name"
              class="pointer-events-none absolute inset-0 -z-10 h-full w-full scale-110 object-cover object-top opacity-40 blur-[2px]"
              width="156"
              height="348"
              loading="lazy"
              decoding="async"
              data-testid="god-banner"
            />
            <div
              class="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-bg/60 via-bg/45 to-bg/80"
            ></div>
          }
          <div
            class="relative flex max-h-[92dvh] flex-col items-center gap-4 overflow-y-auto p-4"
            data-testid="card-preview"
          >
            <button
              type="button"
              class="absolute right-2 top-2 z-10 rounded-full border border-gold/50 bg-panel px-2 py-0.5 text-xs text-ink-dim shadow-lg shadow-black/50 hover:border-gold hover:text-gold"
              aria-label="Close"
              (click)="preview.close()"
            >
              &#10005;
            </button>

            <!-- The card and its terms, side by side as the game has them: the panels start a
               little down the card's side, level with the art rather than with the Tier stars
               above it. On a narrow screen they fall in underneath instead, still in that order
               — the card first, then what the words on it mean. -->
            <div
              class="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center"
            >
              <!-- A unit is its three Ranks, so it is drawn as the hand of them; anything else is
                 one card, drawn on its own. Both are the same arch — the deck only decides how
                 many of them there are and which is in front. -->
              <div class="w-[20rem] max-w-full shrink-0">
                @if (card.type === 'unit') {
                  <mt-rank-deck
                    [unit]="card"
                    [rank]="target.rank"
                    (rankChange)="preview.setRank($event)"
                  />
                } @else {
                  <!-- The padding is the room the stat discs need: they are threaded onto the
                     card's frame and hang half outside it. The rank deck reserves the same for
                     the hand it draws. -->
                  <div class="px-5">
                    <mt-game-card [card]="card" />
                  </div>
                }

                @if (target.placeable && store) {
                  <button
                    type="button"
                    class="mt-2 w-full rounded-md border border-gold/60 bg-panel py-1.5 text-xs text-gold shadow-lg shadow-black/40 hover:bg-raised disabled:opacity-40"
                    [disabled]="!canPlace()"
                    (click)="place(card.id)"
                  >
                    {{ canPlace() ? 'Place on the board' : 'The board is full' }}
                  </button>
                }
              </div>

              @if (keywords().length) {
                <div
                  class="w-full max-w-[20rem] space-y-2.5 text-xs leading-snug sm:w-64 sm:max-w-none sm:pt-8"
                >
                  @for (keyword of keywords(); track keyword.code) {
                    <section class="game-panel game-panel-keyword px-1 py-0.5">
                      <h3 class="flex items-center gap-1.5 font-semibold text-tip-term">
                        @if (iconSrc(keyword.icon); as source) {
                          <img
                            [src]="source"
                            alt=""
                            class="h-4 w-4 shrink-0"
                            width="56"
                            height="56"
                            loading="lazy"
                            decoding="async"
                          />
                        }
                        {{ keyword.title }}
                      </h3>
                      <p class="mt-1">{{ keyword.description }}</p>
                    </section>
                  }
                </div>
              }
            </div>

            <!-- What belongs to the god rather than to the card it is drawn on, banded across the
               bottom the way the game bands it: the Power it brings to the board, and the
               Condition that has to be met before any of this card is reached. -->
            @if (card.type === 'god') {
              <div class="w-full space-y-3 text-xs leading-snug">
                <!-- Outside the builder there is no carousel beside the preview, so the Power has
                   nowhere else to be read. -->
                @if (!store && card.powerText.length) {
                  <section class="game-panel game-panel-descend flex gap-2.5 p-1">
                    <img
                      [src]="card.powerImage"
                      [alt]="(card.powerName ?? 'Power') + ' — ' + card.name"
                      class="h-11 w-11 shrink-0 rounded-full border border-tip-head/30 bg-tip"
                      width="128"
                      height="128"
                      loading="lazy"
                      decoding="async"
                    />
                    <div class="min-w-0">
                      <h3 class="font-display text-sm font-semibold text-tip-term">
                        {{ card.powerName ?? 'Power' }}
                      </h3>
                      <p class="mt-0.5">
                        <mt-rich-text [tokens]="card.powerText" />
                      </p>
                    </div>
                  </section>
                }

                <section class="game-panel game-panel-descend px-1 pb-2 pt-1">
                  <h3
                    class="rounded-md border border-ink/20 bg-tip-head px-3 py-1 text-center font-display text-sm text-ink"
                  >
                    Descend Condition
                  </h3>
                  <p class="mt-2 px-2 text-center">
                    <mt-rich-text [tokens]="card.descendQuestText" />
                  </p>
                </section>
              </div>
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

  /**
   * The terms the card uses that the game has something to say about.
   *
   * Twenty of the client's forty-seven keywords carry no rules text at all — `Sanctum`,
   * `Start of Battle:` and `Attack` are there to colour a word in the card's own text, not to
   * explain one — and a panel holding a single word with nothing under it explains nothing. So
   * the panels are the terms that have a description, which is the set the game itself opens a
   * tooltip for.
   */
  protected readonly keywords = computed<readonly ExplainedKeyword[]>(() => {
    const target = this.preview.target();
    if (!target) return [];
    return target.card.keywords
      .map((code) => this.catalog.keyword(code))
      .filter((keyword): keyword is ExplainedKeyword => Boolean(keyword?.description));
  });

  /** A keyword the game writes as words alone, or whose art is missing, renders without one. */
  protected iconSrc(sprite: string | null): string | undefined {
    return sprite ? this.catalog.iconSrc(sprite) : undefined;
  }

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
