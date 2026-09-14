import { expect, test } from '@playwright/test';

test('home page is prerendered with the site title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/^Mythic Tatics — /);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Build better boards.');
});

test('builder loads a Codex share link', async ({ page }) => {
  await page.goto('/builder?d=ASEEiRMCOTAB');
  await expect(page.getByTestId('board')).toContainText('m05001 · R3');
});

test('unknown routes show the not-found page', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('404')).toBeVisible();
});
