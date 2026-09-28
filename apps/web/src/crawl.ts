import type { Comp } from '@mythictatics/shared/contracts';
import { SITE_URL } from '@mythictatics/web/shell';

/**
 * `robots.txt` and `sitemap.xml`, answered by the Worker rather than shipped as static files: the
 * sitemap is read off the deployed `comps.json`, so a comp added to the dataset is in it without
 * anyone remembering to edit a list, and robots can tell a preview host from the real one.
 */

/** The pages that exist whatever the data says. Query strings (`?d=`, filters) are not pages. */
const STATIC_PAGES = ['/', '/comps', '/builder', '/collection'];

const CACHE_CONTROL = 'public, max-age=3600';

export type SitemapComp = Pick<Comp, 'slug' | 'updatedAt'>;

/** The crawler file a request asks for, or `null` when it asks for something else. */
export async function crawlerResponse(
  request: Request,
  fetchAsset: (url: URL) => Promise<Response>,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/robots.txt') {
    return new Response(robotsTxt(url.hostname), {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': CACHE_CONTROL },
    });
  }
  if (url.pathname === '/sitemap.xml') {
    const comps = await fetchAsset(new URL('/data/canonical/comps.json', url));
    if (!comps.ok) throw new Error(`comps.json: ${comps.status} ${comps.statusText}`);
    return new Response(sitemapXml((await comps.json()) as SitemapComp[]), {
      headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': CACHE_CONTROL },
    });
  }
  return null;
}

export function sitemapXml(comps: readonly SitemapComp[]): string {
  const entries = [
    ...STATIC_PAGES.map((path) => ({ path, lastmod: undefined as string | undefined })),
    ...comps.map((comp) => ({ path: `/comps/${comp.slug}`, lastmod: comp.updatedAt })),
  ];
  const urls = entries.map(({ path, lastmod }) => {
    const loc = `<loc>${escapeXml(new URL(path, `${SITE_URL}/`).href)}</loc>`;
    return `  <url>${loc}${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * Everything is open on the real site. A `workers.dev` host — the default deploy URL and every PR
 * preview — is closed, so a copy of the site never competes with it in search results.
 */
export function robotsTxt(host: string): string {
  if (host.endsWith('.workers.dev')) {
    return 'User-agent: *\nDisallow: /\n';
  }
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char,
  );
}
