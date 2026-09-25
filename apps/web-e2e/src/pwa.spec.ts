import { expect, test } from '@playwright/test';

test('the site is installable: a manifest with its icons', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    'manifest.webmanifest',
  );

  const response = await request.get('/manifest.webmanifest');
  expect(response.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await response.json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/', scope: '/' });

  const icons = manifest.icons as { src: string; sizes: string; purpose: string }[];
  expect(icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(
    expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
  );
  for (const icon of icons) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
});

test('once the worker has the site, the builder opens a share link offline', async ({
  context,
  page,
}) => {
  // The worker registers once the app is stable, or after 30s at the latest.
  test.setTimeout(90_000);
  await page.goto('/builder');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // A page loaded before the worker took over is not its client; the next load is, and that is
  // when the worker fetches everything it was told to prefetch.
  await page.reload();
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            !!(await caches.match(new URL('/data/canonical/cards.json', location.href).href)),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);

  await context.setOffline(true);
  await page.goto('/builder?d=ASEEiRMCOTAB');
  await expect(page.getByTestId('slot-0')).toContainText('Sumerian Scholar');

  // Prerendered pages are left to the network, so a comp never opened online is drawn in the
  // browser from the app shell and the cached dataset instead.
  await page.goto('/comps/death-on-the-nile');
  await expect(page.getByTestId('comp-slot-0')).toContainText('Thoth');
  await context.setOffline(false);
});
