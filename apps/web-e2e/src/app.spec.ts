import { expect, test } from '@playwright/test';

test('home page is prerendered with the site title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/^Mythic Tatics — /);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Build better boards.');
});

test('builder loads a Codex share link', async ({ page }) => {
  await page.goto('/builder?d=ASEEiRMCOTAB');
  // The link carries a Rank 3 Sumerian Scholar in the first slot, and `m12345`, which no dataset
  // has and the builder therefore drops.
  await expect(page.getByTestId('slot-0')).toContainText('Sumerian Scholar');
  await expect(page.getByTestId('slot-5')).toHaveText('+');
});

test('the builder fits the viewport, and only its unit list scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // A draft of three realms is what fills the pool past the height of its column.
  await page.goto('/builder?r=babylon-kami-niles');
  await expect(page.getByTestId('unit-pool')).toBeVisible();

  const pageScrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
  );
  expect(pageScrolls).toBe(false);

  // The pool is the one place there is more content than room for it.
  const poolScrolls = await page
    .getByTestId('unit-pool')
    .evaluate((list) => list.scrollHeight > list.clientHeight);
  expect(poolScrolls).toBe(true);

  // The 6 column fits without scrolling: the board's back row is on screen, and the god picker
  // sits above the realms, which sit above the board.
  await expect(page.getByTestId('slot-5')).toBeInViewport({ ratio: 1 });
  const top = (id: string) =>
    page.getByTestId(id).evaluate((element) => element.getBoundingClientRect().top);
  const [god, realms, board] = [
    await top('god-picker'),
    await top('realm-picker'),
    await top('slot-0'),
  ];
  expect(god).toBeLessThan(realms);
  expect(realms).toBeLessThan(board);
});

test('the builder starts on Any, and a god can be picked above the board', async ({ page }) => {
  await page.goto('/builder');
  await expect(page.getByTestId('god-any')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('god-detail')).toContainText('Any patron god');

  await page.getByTestId('god-picker').getByRole('button', { name: 'Anu' }).click();
  await expect(page.getByTestId('god-any')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('god-detail')).toContainText('Anu');
  await expect(page).toHaveURL(/\/builder\?d=/);
});

test('comps list opens a comp, and its board opens in the builder', async ({ page }) => {
  await page.goto('/comps');
  await expect(page.getByTestId('comp-card').first()).toBeVisible();

  await page.getByTestId('comp-search').fill('sand golem');
  await page.getByTestId('comp-card').filter({ hasText: 'Death on the Nile' }).click();

  await expect(page).toHaveURL(/\/comps\/death-on-the-nile$/);
  await expect(page).toHaveTitle(/^Death on the Nile · Comps · /);
  await expect(page.getByTestId('when-to-commit')).toContainText('Sand Golem');
  await expect(page.getByTestId('comp-slot-0')).toContainText('Thoth');

  await page.getByTestId('open-in-builder').click();
  await expect(page).toHaveURL(/\/builder\?d=/);
  await expect(page.getByTestId('slot-0')).toContainText('Thoth');
});

test('a realm on the home ring opens the collection on that realm', async ({ page }) => {
  // The ring never stops turning on its own, and Playwright only clicks what holds still. Reduced
  // motion is the setting that stops it, so this also checks the ring honours that.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('realm-orbit').locator('a[data-realm="kami"]').click();

  await expect(page).toHaveURL(/\/collection\?realm=kami$/);
  await expect(page).toHaveTitle(/^Collection · /);
  await expect(page.getByTestId('realm-name')).toHaveText('Kami');
  await expect(page.getByTestId('collection-card').first()).toBeVisible();

  await page.getByTestId('tab-gods').click();
  await expect(page).toHaveURL(/realm=kami&tab=gods/);
  await expect(page.getByTestId('collection-card')).toHaveCount(1);

  await page.getByTestId('collection-card').first().click();
  await expect(page.getByTestId('card-preview')).toBeVisible();
});

test('unknown routes show the not-found page', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('404')).toBeVisible();
});
