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
  // A draft of three realms is what fills the pool past the height of its container.
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
});

test('unknown routes show the not-found page', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('404')).toBeVisible();
});
