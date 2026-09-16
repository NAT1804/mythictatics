import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
    @if (unit(); as unit) {
      <div
        class="pointer-events-none fixed z-50 flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border-2 border-gold bg-panel opacity-90 shadow-lg"
        [style.left.px]="drag.position().x"
        [style.top.px]="drag.position().y"
        aria-hidden="true"
      >
        @if (unit.image) {
          <img [src]="unit.image" [alt]="" class="aspect-square w-full object-cover" />
        }
        <span class="truncate px-1 py-0.5 text-[11px] text-ink">{{ unit.name }}</span>
      </div>
    }
  `,
})
export class DragGhost {
  protected readonly drag = inject(DragService);
  private readonly catalog = inject(CatalogService);

  protected readonly unit = computed(() => {
    const payload = this.drag.payload();
    return payload ? this.catalog.unit(payload.unitId) : undefined;
  });
}
