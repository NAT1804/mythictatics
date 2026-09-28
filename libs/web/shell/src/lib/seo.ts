import { DOCUMENT } from '@angular/common';
import {
  inject,
  Injectable,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import {
  TitleStrategy,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from './site';

/** The link preview for a page that has no picture of its own. */
const DEFAULT_IMAGE = 'brand/icon-512.png';

/** Where a search result cuts a description off. */
const DESCRIPTION_LENGTH = 160;

/** A schema.org object, written into the page as JSON-LD. */
export type StructuredData = Record<string, unknown>;

/** What a page tells search engines and link previews about itself. */
export interface PageMeta {
  /** The whole tab title, site name included. */
  title: string;
  description: string;
  /** The route's path. A query string is dropped: `?d=` boards and filters are not pages. */
  path: string;
  /** Root-relative or absolute. Defaults to the site icon. */
  image?: string;
  /** Kept out of search results, and given no canonical link (the 404 page, an unknown comp). */
  noindex?: boolean;
  structuredData?: StructuredData;
}

/**
 * What a route can put in its `data` for the head. A page whose meta depends on what it loads
 * (a comp) calls `Seo.set` itself once it knows.
 */
export interface SeoRouteData {
  description?: string;
  noindex?: boolean;
  structuredData?: StructuredData;
}

/** A root-relative path or URL, made absolute on the canonical origin. */
export function absoluteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, `${SITE_URL}/`).href;
}

/** Collapses whitespace and clips text to what a search result shows, on a word boundary. */
export function clipDescription(text: string, max = DESCRIPTION_LENGTH): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/**
 * Owns everything in `<head>` that search engines and link previews read: title, description,
 * canonical link, robots, Open Graph, Twitter card and JSON-LD.
 *
 * It runs during prerendering, which is what puts the tags in the HTML a crawler receives, and
 * again on every client-side navigation so the head never describes the previous page.
 */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  set(page: PageMeta): void {
    const url = absoluteUrl(page.path.split(/[?#]/)[0] || '/');
    const image = absoluteUrl(page.image ?? DEFAULT_IMAGE);

    this.title.setTitle(page.title);
    for (const [name, content] of [
      ['description', page.description],
      ['twitter:card', 'summary'],
    ]) {
      this.meta.updateTag({ name, content });
    }
    for (const [property, content] of [
      ['og:type', 'website'],
      ['og:site_name', SITE_NAME],
      ['og:locale', 'en_US'],
      ['og:title', page.title],
      ['og:description', page.description],
      ['og:url', url],
      ['og:image', image],
    ]) {
      this.meta.updateTag({ property, content });
    }

    if (page.noindex) {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
      this.canonical()?.remove();
    } else {
      this.meta.removeTag('name="robots"');
      (this.canonical() ?? this.append('link', { rel: 'canonical' })).setAttribute('href', url);
    }

    const script = this.document.head.querySelector('script[type="application/ld+json"]');
    if (page.structuredData) {
      // `<` escaped so no string in the data can close the script element early.
      const json = JSON.stringify({ '@context': 'https://schema.org', ...page.structuredData });
      (script ?? this.append('script', { type: 'application/ld+json' })).textContent = json.replace(
        /</g,
        '\\u003c',
      );
    } else {
      script?.remove();
    }
  }

  private canonical(): Element | null {
    return this.document.head.querySelector('link[rel="canonical"]');
  }

  private append(tag: string, attributes: Record<string, string>): Element {
    const element = this.document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    this.document.head.appendChild(element);
    return element;
  }
}

/**
 * Route `title` becomes "Page · Mythic Tatics"; routes without one get the site tagline. The rest
 * of the head comes from the route's `data` (see `SeoRouteData`).
 */
@Injectable()
export class SiteTitleStrategy extends TitleStrategy {
  private readonly seo = inject(Seo);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    const data = leaf(snapshot.root).data as SeoRouteData;
    this.seo.set({
      title: pageTitle ? `${pageTitle} · ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`,
      description: data.description ?? `${SITE_TAGLINE}.`,
      path: snapshot.url,
      noindex: data.noindex,
      structuredData: data.structuredData,
    });
  }
}

function leaf(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  return route.firstChild ? leaf(route.firstChild) : route;
}

export function provideShell(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: TitleStrategy, useClass: SiteTitleStrategy }]);
}
