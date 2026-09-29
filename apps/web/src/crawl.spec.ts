import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_URL } from '@mythictatics/web/shell';
import { crawlerResponse, robotsTxt, sitemapXml, type SitemapComp } from './crawl';

const COMPS_JSON = readFileSync(
  join(import.meta.dirname, '../../../data/canonical/comps.json'),
  'utf8',
);
const COMPS = JSON.parse(COMPS_JSON) as SitemapComp[];

describe('crawler files', () => {
  it('lists every page and every comp in the sitemap, on the canonical origin', () => {
    const xml = sitemapXml(COMPS);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/comps`,
      `${SITE_URL}/builder`,
      `${SITE_URL}/battle`,
      `${SITE_URL}/collection`,
      ...COMPS.map((comp) => `${SITE_URL}/comps/${comp.slug}`),
    ]);
    expect(xml).toContain(`<lastmod>${COMPS[0].updatedAt}</lastmod>`);
  });

  it('escapes what XML cannot carry', () => {
    expect(sitemapXml([{ slug: 'a&b', updatedAt: '2026-01-01T00:00:00Z' }])).toContain(
      `<loc>${SITE_URL}/comps/a&amp;b</loc>`,
    );
  });

  it('opens the real site to crawlers and points them at the sitemap', () => {
    expect(robotsTxt(new URL(SITE_URL).hostname)).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    );
  });

  it('closes workers.dev deploys and previews', () => {
    expect(robotsTxt('pr-12-mythictatics-web.someone.workers.dev')).toBe(
      'User-agent: *\nDisallow: /\n',
    );
  });

  it('answers the crawler files, reading the comps from the deployed assets', async () => {
    const fetchAsset = vi.fn(async () => new Response(COMPS_JSON));

    const sitemap = await crawlerResponse(new Request(`${SITE_URL}/sitemap.xml`), fetchAsset);
    expect(fetchAsset).toHaveBeenCalledWith(new URL(`${SITE_URL}/data/canonical/comps.json`));
    expect(sitemap?.headers.get('content-type')).toContain('application/xml');
    expect(await sitemap?.text()).toBe(sitemapXml(COMPS));

    const robots = await crawlerResponse(new Request(`${SITE_URL}/robots.txt`), fetchAsset);
    expect(robots?.headers.get('content-type')).toContain('text/plain');

    expect(await crawlerResponse(new Request(`${SITE_URL}/comps`), fetchAsset)).toBeNull();
  });
});
