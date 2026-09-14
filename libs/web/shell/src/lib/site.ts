import {
  inject,
  Injectable,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, type RouterStateSnapshot } from '@angular/router';

export const SITE_NAME = 'Mythic Tatics';
export const SITE_TAGLINE = 'Team comps, board builder and guides for Mythic Tactics: Battleground';

/** Route `title` becomes "Page · Mythic Tatics"; routes without one get the site tagline. */
@Injectable()
export class SiteTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(
      pageTitle ? `${pageTitle} · ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`,
    );
  }
}

export function provideShell(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: TitleStrategy, useClass: SiteTitleStrategy }]);
}
