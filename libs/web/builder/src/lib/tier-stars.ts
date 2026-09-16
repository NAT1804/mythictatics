import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Tier } from '@mythictatics/shared/contracts';
import { CatalogService } from './catalog';

/**
 * A card's Tier, drawn as the game's own row of stars.
 *
 * Tiers 3 to 5 ship three arrangements of the same star count; the first is the one the card
 * frame uses. The art is wider the higher the Tier, so it is sized by height and left to keep its
 * own aspect rather than being squeezed into a box.
 */
const TIER_SPRITE: Record<Tier, string> = {
  1: 'rarity-star_01',
  2: 'rarity-star_02',
  3: 'rarity-star_03-1',
  4: 'rarity-star_04-1',
  5: 'rarity-star_05-1',
  6: 'rarity-star_06',
};

@Component({
  selector: 'mt-tier-stars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center justify-center' },
  template: `
    @if (src(); as source) {
      <img
        [src]="source"
        [alt]="'Tier ' + tier()"
        class="h-full w-auto max-w-full object-contain"
        decoding="async"
      />
    }
  `,
})
export class TierStars {
  private readonly catalog = inject(CatalogService);

  readonly tier = input.required<Tier>();

  protected readonly src = computed(() => this.catalog.iconSrc(TIER_SPRITE[this.tier()]));
}
