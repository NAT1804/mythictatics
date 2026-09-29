import { expect, test } from '@playwright/test';

const SITE_URL = 'https://mythictatics.click';

test('a prerendered comp carries its own description, canonical link and preview', async ({
  request,
}) => {
  // The HTML a crawler receives, without running a script.
  const response = await request.get('/comps/giga-gilg', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('<title>Giga Gilg · Comps · Mythic Tatics</title>');
  expect(html).toMatch(/<meta name="description" content="Giga Gilg: an advanced [^"]+">/);
  expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/comps/giga-gilg">`);
  expect(html).toMatch(new RegExp(`<meta property="og:image" content="${SITE_URL}/images/`));
  expect(html).toContain('"@type":"BreadcrumbList"');
});

test('pages are served at the URL their canonical link names, without a redirect', async ({
  request,
}) => {
  for (const path of ['/comps', '/builder', '/collection', '/comps/harmony']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
    expect(await response.text(), path).toContain(
      `<link rel="canonical" href="${SITE_URL}${path}">`,
    );
  }
});

test('the head follows client-side navigation', async ({ page }) => {
  await page.goto('/comps');
  await page
    .getByRole('link', { name: /Harmony/ })
    .first()
    .click();
  await expect(page).toHaveTitle('Harmony · Comps · Mythic Tatics');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${SITE_URL}/comps/harmony`,
  );

  await page.goto('/nope');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test('the Worker serves a sitemap with every comp, and robots points at it', async ({
  request,
}) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('application/xml');
  const xml = await sitemap.text();
  expect(xml).toContain(`<loc>${SITE_URL}/comps</loc>`);
  expect(xml).toContain(`<loc>${SITE_URL}/comps/giga-gilg</loc>`);

  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
});
