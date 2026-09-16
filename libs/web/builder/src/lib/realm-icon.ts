import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { RealmCode } from '@mythictatics/shared/contracts';
import { CatalogService } from './catalog';

/**
 * A realm, drawn the way the game draws it.
 *
 * The art comes out of the dataset's icon table rather than a path built by hand, so a realm the
 * dataset has no icon for renders as nothing instead of a broken image. The realm's name stays in
 * `alt`, which is what keeps the icon readable to a screen reader and to a search of the page.
 */
@Component({
  selector: 'mt-realm-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 items-center justify-center' },
  template: `
    @if (src(); as source) {
      <img [src]="source" [alt]="realm()" class="h-full w-full object-contain" decoding="async" />
    }
  `,
})
export class RealmIcon {
  private readonly catalog = inject(CatalogService);

  readonly realm = input.required<RealmCode>();

  /** Realm codes and icon sprites share a name, which is what makes the lookup a lookup. */
  protected readonly src = computed(() => this.catalog.iconSrc(`icon_${this.realm()}`));
}
