import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { KeywordCode } from '@mythictatics/shared/contracts';
import { CatalogService } from './catalog';

/**
 * The keywords a card carries, drawn as the game's own icons in a column down the card's edge.
 *
 * The icons are the ones the keyword's own title names — see `toKeyword` — so this shows a card's
 * marks in the same pictures the rules text uses inline, rather than a second set invented here.
 * A keyword the client writes as words alone (`aura`, `descend`, the `event_*` rows) has no icon
 * and so is not in the column; the card's text and the preview's keyword panels are where those
 * are read.
 *
 * Nothing is rendered when a card has no icon-bearing keyword, which is most of them — 122 of the
 * 267 cards in 1.5.7.
 */
@Component({
  selector: 'mt-keyword-icons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (icons().length) {
      <ul class="flex flex-col items-center gap-1" aria-label="Keywords">
        @for (icon of icons(); track icon.code) {
          <li
            class="flex h-6 w-6 items-center justify-center rounded-full border border-gold/50 bg-raised shadow shadow-black/40"
            [title]="icon.title"
          >
            <img
              [src]="icon.src"
              [alt]="icon.title"
              class="h-4 w-4"
              width="56"
              height="56"
              loading="lazy"
              decoding="async"
            />
          </li>
        }
      </ul>
    }
  `,
})
export class KeywordIcons {
  private readonly catalog = inject(CatalogService);

  readonly codes = input.required<readonly KeywordCode[]>();

  protected readonly icons = computed<readonly KeywordMark[]>(() => {
    const marks: KeywordMark[] = [];
    const shown = new Set<string>();
    for (const code of this.codes()) {
      if (STAT_GLYPHS.has(code)) continue;
      const keyword = this.catalog.keyword(code);
      const src = keyword?.icon ? this.catalog.iconSrc(keyword.icon) : undefined;
      // Two keywords can share one picture — Alchemy's title ends in Celestial Medicine's icon —
      // and the same mark twice on a card would read as two different things.
      if (!keyword?.icon || !src || shown.has(keyword.icon)) continue;
      shown.add(keyword.icon);
      marks.push({ code, title: keyword.title, src });
    }
    return marks;
  });
}

/**
 * Terms whose icon is a glyph the text writes numbers with, not a mark the card carries.
 *
 * A card listing `attack_stat` only means its text says "Attack" somewhere; the card already
 * prints that number on the plate the column would sit beside, so the icon here would claim a
 * keyword the card does not have and duplicate a number it already shows.
 */
const STAT_GLYPHS = new Set<KeywordCode>(['attack_stat', 'health_stat']);

interface KeywordMark {
  code: KeywordCode;
  title: string;
  src: string;
}
