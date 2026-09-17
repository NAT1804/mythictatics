import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CardPreview, CardTile, CatalogService } from '@mythictatics/web/builder';

/**
 * One of a comp's unit groups — core units, enablers, add-ons — as a row of card tiles.
 *
 * Each tile opens the card, because "which unit is this and what does it do" is the question a
 * player has when reading a comp for the first time.
 */
@Component({
  selector: 'mt-unit-list',
  imports: [CardTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <h3 class="font-display text-sm tracking-wide text-gold">{{ title() }}</h3>
    @if (hint()) {
      <p class="text-[11px] text-ink-faint">{{ hint() }}</p>
    }
    @if (units().length) {
      <ul class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-3 gap-y-4">
        @for (unit of units(); track unit.id) {
          <li>
            <button
              type="button"
              class="group block w-full rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              [attr.aria-label]="unit.name + ' — details'"
              (click)="preview.open(unit)"
            >
              <mt-card-tile [card]="unit" />
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="mt-1 text-xs text-ink-faint">None listed.</p>
    }
  `,
})
export class UnitList {
  protected readonly preview = inject(CardPreview);
  private readonly catalog = inject(CatalogService);

  readonly title = input.required<string>();
  readonly hint = input<string>('');
  readonly unitIds = input.required<readonly string[]>();

  protected readonly units = computed(() =>
    this.unitIds()
      .map((id) => this.catalog.unit(id))
      .filter((unit) => unit !== undefined),
  );
}
