import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * A pointer drag from the middle of one element to the middle of another.
 *
 * `hover()` rather than a move to a measured point, because it scrolls the handle into view first
 * and `page.mouse` works in viewport coordinates: on a page taller than the window, a raw
 * `boundingBox()` y can sit below the viewport, and the press then lands on nothing at all. The
 * target is measured only after that scroll has happened, and the caller is responsible for a
 * viewport tall enough to hold both ends at once — a mid-drag scroll would move the target out
 * from under the pointer.
 *
 * The move is stepped because the builder only treats a press as a drag once it has travelled
 * past a threshold, which is what keeps a plain click meaning "select".
 */
async function drag(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  await from.hover();
  await page.mouse.down();
  const box = await to.boundingBox();
  if (!box) throw new Error('drag target is not laid out');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

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

test('the builder page scrolls, and the unit list sticks with it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // A draft of three realms is what fills the pool past the height of its column.
  await page.goto('/builder?r=babylon-kami-niles');
  await expect(page.getByTestId('unit-pool')).toBeVisible();

  // The build column reads in the order a run is decided, whatever its height.
  const top = (id: string) =>
    page.getByTestId(id).evaluate((element) => element.getBoundingClientRect().top);
  const [god, realms, board] = [
    await top('god-picker'),
    await top('realm-picker'),
    await top('slot-0'),
  ];
  expect(god).toBeLessThan(realms);
  expect(realms).toBeLessThan(board);

  // The pool holds more units than fit, and scrolls inside its own column rather than stretching
  // the page to the length of the list.
  const poolScrolls = await page
    .getByTestId('unit-pool')
    .evaluate((list) => list.scrollHeight > list.clientHeight);
  expect(poolScrolls).toBe(true);

  // Scrolling the page down to the board leaves the units in view: the column is sticky, which is
  // what replaced pinning the whole screen.
  await page.getByTestId('slot-5').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('slot-5')).toBeInViewport();
  await expect(page.getByTestId('unit-pool')).toBeInViewport();
});

test('the builder starts on Any, and picking a god brings up its card', async ({ page }) => {
  await page.goto('/builder');
  await expect(page.getByTestId('god-any')).toHaveAttribute('aria-pressed', 'true');
  // With no patron there is no card to show — the picker is the only thing asking.
  await expect(page.getByTestId('patron-card')).toHaveCount(0);

  await page.getByTestId('god-picker').getByRole('button', { name: 'Anu' }).click();
  await expect(page.getByTestId('god-any')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('patron-card')).toContainText('Anu');
  await expect(page).toHaveURL(/\/builder\?d=/);

  // The Power is behind its icon: closed until asked for, and dismissed by Escape.
  await expect(page.getByTestId('power-tooltip')).toHaveCount(0);
  await page.getByTestId('power-toggle').click();
  await expect(page.getByTestId('power-tooltip')).toBeVisible();
  await expect(page.getByTestId('power-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('power-tooltip')).toHaveCount(0);
});

test('the god card is dragged onto a unit to Descend it', async ({ page }) => {
  // Tall enough that the board and the god's card below it are on screen together, which is what
  // the gesture needs — and what the layout is meant to give it.
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A Rank 3 Sumerian Scholar in slot 0.
  await page.goto('/builder?d=ASEEiRMCOTAB');
  await page.getByTestId('god-picker').getByRole('button', { name: 'Anu' }).click();
  await expect(page.getByTestId('patron-card')).toContainText('Drag this card');

  await drag(page, page.getByTestId('patron-grip'), page.getByTestId('slot-0'));

  // The slot is now the god's card, covering the unit, and carrying the summed body.
  await expect(page.getByTestId('slot-god-0')).toBeVisible();
  await expect(page.getByTestId('slot-0')).toContainText('Anu');
  await expect(page.getByTestId('slot-0')).toContainText('22');
  // The Rank badge still belongs to the unit underneath.
  await expect(page.getByTestId('slot-rank-0')).toHaveText('R3');

  // The card states the sum instead of explaining how to get there: 12/8 plus Anu's 10/10.
  await expect(page.getByTestId('patron-card')).toContainText('Descended onto');
  await expect(page.getByTestId('patron-card')).toContainText('Sumerian Scholar');
  await expect(page.getByTestId('patron-card')).toContainText('22/18');

  // The unit the god covered is one button away, and that button is the only way back to it.
  await page.getByTestId('base-card').click();
  await expect(page.getByTestId('card-preview')).toContainText('Sumerian Scholar');
  await page.keyboard.press('Escape');

  // Dragged clear of the board it comes back off.
  await drag(page, page.getByTestId('patron-grip'), page.getByTestId('god-picker'));
  await expect(page.getByTestId('patron-card')).toContainText('Drag this card');
  await expect(page.getByTestId('base-card')).toHaveCount(0);
  await expect(page.getByTestId('slot-0')).toContainText('Sumerian Scholar');
});

test('the god can hold a free slot on its own, with no unit under it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/builder');
  await page.getByTestId('god-picker').getByRole('button', { name: 'Anu' }).click();

  // Slot 3 is empty, and the god goes there anyway — a patron put down before its ally is chosen.
  await drag(page, page.getByTestId('patron-grip'), page.getByTestId('slot-3'));
  await expect(page.getByTestId('slot-god-3')).toBeVisible();
  await expect(page.getByTestId('patron-card')).toContainText('no ally under it yet');
  // No sum is claimed while there is nothing to add to.
  await expect(page.getByTestId('patron-card')).not.toContainText('Descended onto');
});

test('the god card opens its details, banner and all, with no separate button', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/builder');
  await page.getByTestId('god-picker').getByRole('button', { name: 'Ra' }).click();
  await expect(page.getByTestId('patron-card')).toBeVisible();

  await page.getByTestId('patron-grip').click();
  await expect(page.getByTestId('card-preview')).toBeVisible();
  await expect(page.getByTestId('god-banner')).toBeVisible();
  await expect(page.getByTestId('card-preview')).toContainText('Descend Condition');
});

test('a unit detail is a hand of its Ranks, swiped through', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/builder?d=ASEEiRMCOTAB&r=babylon-kami-niles');

  await page.getByTestId('unit-pool').getByRole('button').first().click();
  const deck = page.getByTestId('rank-deck');
  await expect(deck).toHaveAttribute('aria-label', /Rank 1 of 3/);

  // Right to left over the hand, which is what brings the next card forward. The move is stepped
  // past the threshold in one press, the way a thumb crosses a card.
  const box = (await deck.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.7, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, y, { steps: 12 });

  // Mid-drag, with the hand as far over as it goes. The attack and health plates are threaded
  // onto the card's frame and hang off it, so this is the moment they reach furthest past the
  // card — and the dialog clips whatever leaves it. Nothing may leave it.
  const dragged = await page
    .getByTestId('card-preview')
    .evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(dragged[0]).toBe(dragged[1]);

  await page.mouse.up();
  await expect(deck).toHaveAttribute('aria-label', /Rank 2 of 3/);

  // And back the other way.
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, y, { steps: 12 });
  await page.mouse.up();
  await expect(deck).toHaveAttribute('aria-label', /Rank 1 of 3/);

  // The pips are the same control for anyone not swiping.
  await page.getByRole('button', { name: 'Rank 3', exact: true }).click();
  await expect(deck).toHaveAttribute('aria-label', /Rank 3 of 3/);
});

test('editing the board does not throw the page back to the top', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  // Every edit rewrites the share link. While that was done as a router navigation, the router's
  // scroll restoration yanked the window to 0,0 on each one.
  await page.goto('/builder?d=ASEEiRMCOTAB&r=babylon-kami-niles');
  await expect(page.getByTestId('slot-0')).toContainText('Sumerian Scholar');

  await page.getByTestId('slot-5').scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  await page.getByTestId('slot-rank-0').click();
  await expect(page).toHaveURL(/\/builder\?d=/);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
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
  await expect(page.getByTestId('scope-name')).toHaveText('Kami');
  await expect(page.getByTestId('collection-card').first()).toBeVisible();

  await page.getByTestId('tab-gods').click();
  await expect(page).toHaveURL(/realm=kami&tab=gods/);
  await expect(page.getByTestId('collection-card')).toHaveCount(1);

  // All is a realm chip of its own: one realm's units, then every realm's.
  await page.getByTestId('tab-units').click();
  await expect(page.getByTestId('scope-name')).toHaveText('Kami');
  const kamiUnits = await page.getByTestId('collection-card').count();
  await page.locator('[data-realm="all"]').click();
  await expect(page).toHaveURL(/realm=all/);
  await expect(page.getByTestId('scope-name')).toHaveText('All');
  expect(await page.getByTestId('collection-card').count()).toBeGreaterThan(kamiUnits);

  // The Spells tab browses by kind instead: the twelve Shenzhou Medicines.
  await page.getByTestId('tab-spells').click();
  await page.locator('[data-spell="medicine"]').click();
  await expect(page).toHaveURL(/spell=medicine/);
  await expect(page.getByTestId('scope-name')).toHaveText('Medicine');
  await expect(page.getByTestId('collection-card')).toHaveCount(12);

  await page.getByTestId('collection-card').first().click();
  await expect(page.getByTestId('card-preview')).toBeVisible();
});

test('unknown routes show the not-found page', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('404')).toBeVisible();
});
