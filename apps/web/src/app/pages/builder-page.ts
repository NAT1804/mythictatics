import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { createEmptyBoard, decodeShareCode, turnOrder } from '@mythictatics/shared/domain';

/** Placeholder until the full builder lands in P4: decodes `?d=` share links onto the board. */
@Component({
  selector: 'mt-builder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="font-display text-3xl text-gold">Team Builder</h1>
    <p class="mt-2 text-sm text-ink-dim">
      Full builder coming soon. Share links from the Codex teambuilder already load here.
    </p>

    @if (error(); as error) {
      <p class="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
        This link couldn't be loaded ({{ error }}).
      </p>
    }

    <div class="mt-6 grid max-w-md grid-cols-3 gap-3" data-testid="board">
      @for (slot of board(); track $index) {
        <div
          class="relative flex aspect-square items-center justify-center rounded-lg border border-line bg-panel text-xs text-ink-dim"
        >
          @if (slot) {
            <span class="absolute left-1.5 top-1 text-gold">{{ order().get($index) }}</span>
            <span>{{ slot.unitId }} · R{{ slot.rank + 1 }}</span>
          } @else {
            <span class="text-ink-faint">+</span>
          }
        </div>
      }
    </div>
  `,
})
export class BuilderPage {
  /** Bound from the `?d=` query param. */
  readonly d = input<string>();

  private readonly decoded = computed(() => {
    const token = this.d();
    return token ? decodeShareCode(token) : null;
  });

  protected readonly board = computed(() => {
    const result = this.decoded();
    return result?.ok ? result.build.board : createEmptyBoard();
  });
  protected readonly order = computed(() => turnOrder(this.board()));
  protected readonly error = computed(() => {
    const result = this.decoded();
    return result && !result.ok ? result.error : null;
  });
}
