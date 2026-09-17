import { ChangeDetectionStrategy, Component } from '@angular/core';

let nextId = 0;

/**
 * The art for "no patron god in particular".
 *
 * A comp that does not depend on a god's Power still needs something in the god's place, or an
 * empty patron reads as a build that forgot to pick one. The game has no such card, so this one is
 * drawn rather than extracted: a ring of eight points, one per realm a god can come from, around
 * an open centre. It is inline SVG in the palette's own gold, so it needs no file in the dataset
 * and cannot be mistaken for card art that shipped with the client.
 */
@Component({
  selector: 'mt-any-god-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <svg
      viewBox="0 0 100 100"
      class="h-full w-full"
      role="img"
      aria-label="Any patron god"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient [attr.id]="glowId" cx="50%" cy="46%" r="60%">
          <stop offset="0%" stop-color="#4d3a1c" />
          <stop offset="70%" stop-color="#1c160e" />
          <stop offset="100%" stop-color="#110d08" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" [attr.fill]="'url(#' + glowId + ')'" />
      <g fill="none" stroke="#d4a93a" stroke-width="1.2" opacity="0.8">
        <circle cx="50" cy="46" r="30" />
        <circle cx="50" cy="46" r="21" stroke-dasharray="2 3" opacity="0.7" />
      </g>
      <g fill="#ebc463">
        @for (angle of points; track angle) {
          <rect
            x="47.5"
            y="13.5"
            width="5"
            height="5"
            [attr.transform]="'rotate(' + angle + ' 50 46) rotate(45 50 16)'"
          />
        }
      </g>
      <text
        x="50"
        y="55"
        text-anchor="middle"
        font-family="Cinzel, Georgia, serif"
        font-size="26"
        font-weight="700"
        fill="#ebc463"
      >
        ?
      </text>
    </svg>
  `,
})
export class AnyGodArt {
  /** Unique per instance: a page can hold several of these, and SVG ids are document-wide. */
  protected readonly glowId = `any-god-glow-${nextId++}`;
  protected readonly points = [0, 45, 90, 135, 180, 225, 270, 315];
}
