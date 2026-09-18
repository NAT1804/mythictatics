import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { KeywordCode } from '@mythictatics/shared/contracts';
import { CatalogService } from './catalog';
import type { FrameArt } from './frame-marks';

/**
 * The keywords a card carries, drawn as the game's own icons in a column down the card's edge.
 *
 * The icons are the ones the keyword's own title names — see `toKeyword` — so this shows a card's
 * marks in the same pictures the rules text uses inline, rather than a second set invented here.
 * A keyword the client writes as words alone (`aura`, `descend`, the `event_*` rows) has no icon
 * and so is not in the column; the card's text and the preview's keyword panels are where those
 * are read.
 *
 * The marks wear no ring of their own. The client's icons are already framed art — a shield, a
 * blade, each with its own dark outline — so a ring would be a second frame around a frame, and
 * at tile size it would eat the picture it is meant to hold. A drop shadow is what lifts them off
 * the frame art instead.
 *
 * A mark is `1em` tall and keeps its picture's own width, so whatever holds this sizes the whole
 * column with a single font-size — `CardTile` gives it a share of the card's width, and the column
 * scales with the card. The column fills its host's height and centres in it, so a card with one
 * keyword hangs it in the middle of the run rather than at the top.
 *
 * `frameArt` is how a keyword the game draws as a frame gets drawn as one here: Taunt's mark is
 * the shield the game stands a taunting unit in, in the metal of the card's Rank, rather than the
 * flat icon its rules text uses inline. Anything not named there keeps the client's own icon.
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
      <ul
        class="flex h-full flex-col items-center justify-center gap-[0.12em]"
        aria-label="Keywords"
      >
        @for (icon of icons(); track icon.code) {
          <li class="flex" [title]="icon.title">
            <img
              [src]="icon.src"
              [alt]="icon.title"
              [width]="icon.width"
              [height]="icon.height"
              class="h-[1em] w-auto drop-shadow-[0_0.05em_0.1em_rgba(0,0,0,0.85)]"
              loading="lazy"
              decoding="async"
              draggable="false"
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
  /** Frame art to draw in place of a keyword's own icon, by code. */
  readonly frameArt = input<Readonly<Partial<Record<KeywordCode, FrameArt>>>>({});

  protected readonly icons = computed<readonly KeywordMark[]>(() => {
    const marks: KeywordMark[] = [];
    const shown = new Set<string>();
    const lent = this.frameArt();
    for (const code of this.codes()) {
      if (STAT_GLYPHS.has(code)) continue;
      const title = this.catalog.keywordTitle(code);
      const art = lent[code];
      if (art) {
        marks.push({ code, title, src: art.image, width: art.width, height: art.height });
        continue;
      }
      const keyword = this.catalog.keyword(code);
      const src = keyword?.icon ? this.catalog.iconSrc(keyword.icon) : undefined;
      // Two keywords can share one picture — Alchemy's title ends in Celestial Medicine's icon —
      // and the same mark twice on a card would read as two different things.
      if (!keyword?.icon || !src || shown.has(keyword.icon)) continue;
      shown.add(keyword.icon);
      marks.push({ code, title, src, width: ICON_SIZE, height: ICON_SIZE });
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

/** Every description icon the client ships is this square. */
const ICON_SIZE = 56;

interface KeywordMark {
  code: KeywordCode;
  title: string;
  src: string;
  width: number;
  height: number;
}
