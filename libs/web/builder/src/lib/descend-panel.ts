import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { RichTextToken } from '@mythictatics/shared/contracts';
import { BuilderStore } from './builder-store';
import { RichText } from './rich-text';

/**
 * Descend, shown as the sum it is.
 *
 * A god that has come down is not a seventh piece — it lands on a unit already on the board, and
 * from then on that slot is both cards at once. Two places say so: the slot itself wears the
 * god's portrait and a gold frame, and this band spells out the arithmetic, `base + god = total`.
 *
 * Showing the working rather than just the total is the point. The numbers on a descended slot
 * are the only ones on the screen a player cannot check against a card, so the band names where
 * each half came from, and repeats the effect the god consumed along with them.
 */
@Component({
  selector: 'mt-descend-panel',
  imports: [RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let god = store.patron();
    <section
      class="rounded-lg border px-3 py-2 text-xs"
      [class]="store.descend() ? 'border-gold/60 bg-gold/5' : 'border-line bg-panel/60'"
      data-testid="descend-panel"
    >
      @if (!god) {
        <p class="text-ink-faint">
          <span class="font-display text-gold">Descend</span> — needs a patron god; Any has nothing
          to bring down.
        </p>
      } @else if (store.descend(); as descend) {
        <div class="flex items-start gap-3">
          <span
            class="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-gold lg:hidden"
          >
            @if (god.image) {
              <img [src]="god.image" [alt]="god.name" class="h-full w-full object-cover" />
            }
          </span>
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-baseline gap-x-1.5">
              <span class="font-display text-gold">{{ god.name }}</span>
              <span class="text-ink-dim">descended onto</span>
              <span class="text-ink">{{ descend.base.name }}</span>
              <span class="text-ink-faint">· Rank {{ descend.rank + 1 }}</span>
            </p>
            <!-- The working, not just the answer: this slot's numbers are on no card. -->
            <p class="font-mono text-[11px] text-ink-dim">
              {{ descend.baseAttack }}/{{ descend.baseHealth }}
              <span class="text-ink-faint">base</span>
              + {{ god.attack }}/{{ god.health }}
              <span class="text-ink-faint">god</span>
              =
              <span class="text-gold-bright">{{ descend.attack }}/{{ descend.health }}</span>
            </p>
            <p class="mt-0.5 line-clamp-2 text-ink-dim lg:line-clamp-1">
              <mt-rich-text [tokens]="god.descendText" />
            </p>
            <!-- The game's wording is "consuming their stats and effect", so the effect comes
                 across with the numbers and belongs on screen next to them. -->
            @if (consumed(); as consumed) {
              <p class="mt-0.5 line-clamp-2 text-ink-faint lg:line-clamp-1">
                <span class="font-medium">Consumed effect</span> —
                <mt-rich-text [tokens]="consumed" />
              </p>
            }
          </div>
          <button
            type="button"
            class="shrink-0 rounded border border-line px-2 py-1 text-[11px] text-ink-dim hover:border-gold hover:text-gold"
            (click)="recall()"
          >
            Recall
          </button>
        </div>
      } @else {
        <div class="flex items-start gap-3">
          <span
            class="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-line lg:hidden"
          >
            @if (god.image) {
              <img [src]="god.image" [alt]="god.name" class="h-full w-full object-cover" />
            }
          </span>
          <div class="min-w-0 flex-1">
            <p class="line-clamp-2 lg:line-clamp-1">
              <span class="font-display text-gold">Descend</span>
              <span class="text-ink-dim">
                — {{ god.name }} lands on one of your allies ({{ god.attack }}/{{ god.health }}),
                consuming its stats and its effect. Use the
                <span class="text-gold">&#9650;</span> button on a slot.
              </span>
            </p>
            <p class="mt-0.5 line-clamp-2 text-ink-faint lg:line-clamp-1">
              <span class="font-medium">Unlocks:</span>&nbsp;<mt-rich-text
                [tokens]="god.descendQuestText"
              />
            </p>
          </div>
        </div>
      }
    </section>
  `,
})
export class DescendPanel {
  protected readonly store = inject(BuilderStore);

  /** The rules text of the unit the god consumed, at the Rank it was sitting at. */
  protected readonly consumed = computed<readonly RichTextToken[] | null>(() => {
    const descend = this.store.descend();
    if (!descend) return null;
    const tokens = descend.base.ranks[descend.rank]?.richText ?? [];
    return tokens.length ? tokens : null;
  });

  protected recall(): void {
    const slot = this.store.descendSlot();
    if (slot !== null) this.store.toggleDescend(slot);
  }
}
