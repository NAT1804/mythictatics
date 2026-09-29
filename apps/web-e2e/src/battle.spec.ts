import { expect, test } from '@playwright/test';

/**
 * The Arsonist comp at Rank 2, as the builder would write it, against the Masochist comp at level
 * 1, on a fixed seed. `libs/shared/engine/src/lib/determinism.spec.ts` fights exactly this in node
 * and pins its log to `GOLDEN_HASH`; here the browser fights it and must print the same hash.
 * The two agreeing is the engine's portability check: same seed, same log, in either runtime.
 */
const GOLDEN = '/battle?d=AT8A5QcB3AcBAgQB7wMB5AcBGScB&vs=masochist&seed=20260929';
const GOLDEN_HASH = '843cd1d7';

test('the browser fights the golden battle to the same log as node', async ({ page }) => {
  await page.goto(GOLDEN);
  await expect(page.getByTestId('battle-hash')).toHaveText(GOLDEN_HASH);
});

test('a battle plays out to a result, and can be skipped to it', async ({ page }) => {
  await page.goto(GOLDEN);
  await expect(page.getByTestId('battle-slot-0-0').getByRole('button')).toBeVisible();
  await page.getByTestId('speed-4').click();
  await page.getByTestId('skip').click();
  const result = page.getByTestId('battle-result');
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('data-winner', /^(0|1|draw)$/);
  await expect(page.getByTestId('battle-log')).toContainText('Round 1');
});

test('with no board, a community comp can be taken into a fight, and gets a seed', async ({
  page,
}) => {
  await page.goto('/battle');
  await expect(page.getByTestId('team-picker')).toBeVisible();
  await page.getByTestId('pick-harmony').click();
  await expect(page).toHaveURL(/[?&]d=[^&]+/);
  await expect(page).toHaveURL(/[?&]seed=\d+/);
  await expect(page.getByTestId('battle-hash')).toHaveText(/^[0-9a-f]{8}$/);
});

test('the builder sends its board to a battle, and the battle sends it back', async ({ page }) => {
  await page.goto('/builder?d=ASEEiRMCOTAB');
  // Wait for the builder to have restored the board, which it does before it rewrites the link.
  await expect(page.getByTestId('slot-0')).toContainText('Sumerian Scholar');
  const battle = page.getByTestId('battle-this-board');
  await expect(battle).toBeVisible();
  // The builder rewrites the link once it has dropped the unit this catalog lacks; the battle
  // takes whatever code the builder settled on.
  await expect(page).not.toHaveURL(/d=ASEEiRMCOTAB/);
  const code = new URL(page.url()).searchParams.get('d')!;
  await battle.click();
  // Leaving the builder takes a second or more for any route (it tears down every tile in the
  // pool), which under a parallel run can outlast the default wait.
  await expect(page).toHaveURL(new RegExp(`/battle\\?d=${code}`), { timeout: 15_000 });
  await expect(page.getByTestId('battle-hash')).toHaveText(/^[0-9a-f]{8}$/);
  await page.getByRole('link', { name: 'Edit team' }).click();
  await expect(page).toHaveURL(new RegExp(`/builder\\?d=${code}`));
});

test('changing the opponent re-fights with the same seed', async ({ page }) => {
  await page.goto(GOLDEN);
  await expect(page.getByTestId('battle-hash')).toHaveText(GOLDEN_HASH);
  await page.getByTestId('opponent-select').selectOption('arsonist');
  await expect(page).toHaveURL(/vs=arsonist/);
  await expect(page).toHaveURL(/seed=20260929/);
  await expect(page.getByTestId('enemy-label')).toHaveText('Arsonist');
  await expect(page.getByTestId('battle-hash')).not.toHaveText(GOLDEN_HASH);
});
