import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { BuilderStore } from './builder-store';
import { CardPreview } from './card-preview';
import { CardTile } from './card-tile';
import { DragService, DragSource } from './drag';
import { RealmIcon } from './realm-icon';
import { RichText } from './rich-text';

let nextId = 0;

/**
 * The patron once it has been chosen: its card, under the board, with its Power beside it.
 *
 * The god used to be a portrait in the picker with its Power written out underneath, which put
 * the god's identity in the row you pick from and nowhere near the board it acts on. Here it is
 * the same `CardTile` the pool and the board draw, in the place the god belongs — below the
 * board, next to the slot it will come down on.
 *
 * Which is also how it gets there: the card is a drag source, and dropping it on an occupied slot
 * is the Descend. That replaces the small triangle that used to appear on a slot when hovered,
 * and it fits what Descend actually is — a god landing on one particular ally, an act with a
 * source and a target, rather than a property of a slot. Dragging it clear of the board recalls
 * it.
 *
 * The Power sits behind its own icon rather than being printed in full: under the board there is
 * a board to look at, and a paragraph of rules text beside it is read once and after that only
 * ever in the way. Clicking the icon is what asks for it.
 */
@Component({
  selector: 'mt-patron-card',
  imports: [CardTile, DragSource, RealmIcon, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (store.patron(); as god) {
      <section
        class="flex items-start gap-3 rounded-lg border px-3 py-2"
        [class]="store.descend() ? 'border-gold/60 bg-gold/5' : 'border-line bg-panel/60'"
        aria-label="Patron god"
        data-testid="patron-card"
      >
        <!-- The card itself: the handle the god is dragged onto the board by, and — since a card
             you can pick up is a card you will also tap — the way its details are opened. There
             is no separate button for that any more; the card is the button. -->
        <button
          type="button"
          class="group w-28 shrink-0 cursor-grab touch-none rounded-lg text-left active:cursor-grabbing"
          [mtDragSource]="{ kind: 'god', godId: god.id }"
          [attr.aria-label]="god.name + ' — open details, or drag onto the board'"
          [class.opacity-40]="dragging()"
          [title]="god.name + ' — tap for details, drag onto the board'"
          data-testid="patron-grip"
          (click)="preview.open(god)"
        >
          <mt-card-tile [card]="god" [rankFrame]="true" [named]="false" />
        </button>

        <div class="min-w-0 flex-1 text-xs">
          <p class="flex flex-wrap items-baseline gap-x-1.5">
            <span class="font-display text-sm text-ink">{{ god.name }}</span>
            <mt-realm-icon [realm]="god.realm" class="h-3.5 w-3.5 self-center" />
            <span class="text-ink-faint">Descend body {{ god.attack }}/{{ god.health }}</span>
          </p>

          <p class="mt-1 text-ink-dim">
            @if (store.descend(); as descend) {
              Descended onto <span class="text-ink">{{ descend.base.name }}</span> —
              <span class="font-mono text-[11px]">
                {{ descend.baseAttack }}/{{ descend.baseHealth }} + {{ god.attack }}/{{
                  god.health
                }}
                =
                <span class="text-gold-bright"
                  >{{ descend.attack }}/{{ descend.health }}</span
                > </span
              >. Drag it off the board to recall.
            } @else if (store.descendSlot() !== null) {
              On the board, with no ally under it yet. Drop a unit on its slot to Descend.
            } @else {
              Drag this card onto the board — onto a unit to Descend it, or onto a free slot to
              place the god first.
            }
          </p>

          <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
            <!-- The Power, behind its own art. Click, not hover: a tooltip that opens on the way
                 past is a tooltip that opens while you are reaching for the board. -->
            <div class="relative">
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11px] transition-colors"
                [class]="
                  open()
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-line text-ink-dim hover:border-gold hover:text-gold'
                "
                [attr.aria-expanded]="open()"
                [attr.aria-controls]="panelId"
                data-testid="power-toggle"
                (click)="toggle($event)"
              >
                <img
                  [src]="god.powerImage"
                  alt=""
                  class="h-6 w-6 rounded-full border border-gold/50 bg-raised"
                  width="128"
                  height="128"
                  decoding="async"
                />
                {{ god.powerName ?? 'God Power' }}
              </button>

              @if (open()) {
                <div
                  class="absolute bottom-full left-0 z-30 mb-1.5 w-72 max-w-[min(18rem,80vw)] rounded-lg border border-gold/50 bg-panel p-2.5 text-xs shadow-xl shadow-black/50"
                  role="tooltip"
                  [id]="panelId"
                  data-testid="power-tooltip"
                >
                  <p class="font-display text-sm text-gold">{{ god.powerName ?? 'God Power' }}</p>
                  <p class="mt-0.5 leading-snug text-ink-dim">
                    <mt-rich-text [tokens]="god.powerText" />
                  </p>
                </div>
              }
            </div>

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
                <!-- The knob travels the track's inner width less its own: a 24px track, 2px of
                     padding either side, a 10px knob, so 10px of travel.

                     Written as an arbitrary value, and it has to be. A class binding of the form
                     class.translate-x-2.5 cannot express that class at all: Angular reads the
                     name up to the next dot, so it silently applied translate-x-2 instead — 8px
                     — and the knob stopped two pixels short of the end, every time. -->
                <span
                  class="flex h-3.5 w-6 shrink-0 items-center rounded-full p-0.5 transition-colors"
                  [class]="store.lockEnabled() ? 'bg-gold/70' : 'bg-line'"
                >
                  <span
                    class="h-2.5 w-2.5 rounded-full bg-ink transition-transform duration-200"
                    [class]="store.lockEnabled() ? 'translate-x-[10px]' : 'translate-x-0'"
                  ></span>
                </span>
                Realm lock
                <mt-realm-icon [realm]="god.realm" class="h-3.5 w-3.5" />
              </button>
            }

            <!-- The unit the god came down on. Nothing of it is drawn anywhere once the god has
                 landed — not behind the card, not as a thumbnail here — because a descended slot
                 is the god, and a second face competing with it only muddles which card the slot
                 actually is. Its rules text is still what the Descend consumed, so it stays one
                 click away; the name is what says which unit that is. -->
            @if (store.descend(); as descend) {
              <button
                type="button"
                class="rounded-full border border-line px-2 py-1 text-[11px] text-ink-dim transition-colors hover:border-gold hover:text-gold"
                [attr.aria-label]="'Base card: ' + descend.base.name"
                data-testid="base-card"
                (click)="preview.open(descend.base, { rank: descend.rank })"
              >
                Base card
              </button>
            }
          </div>
        </div>
      </section>
    }
  `,
})
export class PatronCard {
  protected readonly store = inject(BuilderStore);
  protected readonly preview = inject(CardPreview);
  private readonly drag = inject(DragService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /** Unique per instance: `aria-controls` needs an id, and ids are document-wide. */
  protected readonly panelId = `patron-power-${nextId++}`;
  protected readonly open = signal(false);

  /** Whether this card is what is being dragged, so it can show it has been lifted. */
  protected readonly dragging = computed(() => this.drag.payload()?.kind === 'god');

  constructor() {
    // Escape, and a press anywhere else, close the tooltip. `pointerdown` in the capture phase
    // rather than `click`, so reaching for the board closes it as the drag starts rather than a
    // pointerup later — and so a press that turns into a drag closes it at all.
    const view = this.document.defaultView;
    if (!view) return;

    const onDown = (event: Event) => {
      if (!this.open()) return;
      const target = event.target as Element | null;
      if (!target?.closest('[data-testid="power-toggle"],[data-testid="power-tooltip"]')) {
        this.open.set(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.open.set(false);
    };

    view.addEventListener('pointerdown', onDown, true);
    view.addEventListener('keydown', onKey);
    this.destroyRef.onDestroy(() => {
      view.removeEventListener('pointerdown', onDown, true);
      view.removeEventListener('keydown', onKey);
    });
  }

  protected toggle(event: Event): void {
    event.stopPropagation();
    this.open.update((on) => !on);
  }
}
