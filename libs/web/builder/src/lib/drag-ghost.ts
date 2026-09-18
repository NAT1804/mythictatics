import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { Card } from '@mythictatics/shared/contracts';
import { CatalogService } from './catalog';
import { DragService } from './drag';

/**
 * The card that follows the pointer during a drag.
 *
 * It is fixed to the viewport and `pointer-events-none`, which is what lets the hit test under it
 * find the slot rather than the ghost itself.
 */
@Component({
  selector: 'mt-drag-ghost',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (card(); as card) {
      <div
        class="pointer-events-none fixed z-50 flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border-2 border-gold bg-panel opacity-90 shadow-lg"
        [style.left.px]="drag.position().x"
        [style.top.px]="drag.position().y"
        aria-hidden="true"
      >
        @if (card.image) {
          <img [src]="card.image" [alt]="" class="aspect-square w-full object-cover" />
        }
        <span class="truncate px-1 py-0.5 text-[11px] text-ink">{{ card.name }}</span>
      </div>
    }
  `,
})
export class DragGhost {
  protected readonly drag = inject(DragService);
  private readonly catalog = inject(CatalogService);

  /**
   * Whatever is being dragged: a unit from the pool or the board, or the patron god itself.
   *
   * A slot the god has descended onto carries its `godId`, and the ghost shows that card — the
   * slot itself shows the god, and a tile that changed into the unit underneath the moment it was
   * picked up would read as having grabbed the wrong thing.
   */
  protected readonly card = computed<Card | undefined>(() => {
    const payload = this.drag.payload();
    if (!payload) return undefined;
    if (payload.kind === 'god') return this.catalog.god(payload.godId);
    const god =
      payload.kind === 'slot' && payload.godId ? this.catalog.god(payload.godId) : undefined;
    return god ?? this.catalog.unit(payload.unitId);
  });
}
