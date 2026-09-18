import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { RichTextToken } from '@mythictatics/shared/contracts';
import { CatalogService } from './catalog';

/**
 * Card text, rendered from tokens.
 *
 * The contract keeps card text as `RichTextToken[]` and never as an HTML string, which is what
 * keeps the game's own markup out of the DOM. This component is the other half of that: it
 * switches on the token type and binds values as text, so there is no path from a card's rules
 * text to `innerHTML`.
 *
 * `{0}` placeholders are left exactly as written — the game computes those numbers at runtime.
 *
 * A highlighted term takes its colour from the surface it landed on rather than from here:
 * `.rich-highlight` in `styles.css` is gold on the site's dark panels and the game's own orange
 * on the parchment of a `.game-panel`, which is the same term in the same two colours the game
 * writes it in.
 */
@Component({
  selector: 'mt-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline' },
  template: `
    @for (token of tokens(); track $index) {
      @switch (token.type) {
        @case ('text') {
          <span>{{ token.value }}</span>
        }
        @case ('highlight') {
          <span class="rich-highlight">{{ token.value }}</span>
        }
        @case ('icon') {
          @if (src(token.name); as source) {
            <img
              [src]="source"
              [alt]="token.name"
              class="mx-0.5 inline-block h-[1em] w-[1em] align-[-0.12em]"
              loading="lazy"
              decoding="async"
            />
          }
        }
      }
    }
  `,
})
export class RichText {
  private readonly catalog = inject(CatalogService);

  readonly tokens = input.required<readonly RichTextToken[]>();

  /** An icon the dataset has no art for renders as nothing rather than as a broken image. */
  protected src(sprite: string): string | undefined {
    return this.catalog.iconSrc(sprite);
  }
}
