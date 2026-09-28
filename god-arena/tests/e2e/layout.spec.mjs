import { test, expect } from '@playwright/test';
import { openGame, setMyHand } from './fixtures.mjs';

test('主要な操作はスクロールせずに届く位置にある', async ({ page }) => {
  await openGame(page, { opponents: '3' });
  const vh = page.viewportSize().height;
  const bar = await page.locator('.actionbar').boundingBox();
  expect(bar.y + bar.height).toBeLessThanOrEqual(vh);
});

test('押せるものは最低 44x44px ある（指で確実に押せる大きさ）', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['sword', 'woodshield', 'apple']);
  const targets = [
    ...await page.locator('.abtn:visible').all(),
    ...await page.locator('#hand .card').all(),
    ...await page.locator('#opponents .pcard').all(),
    page.locator('#btn-settings')
  ];
  for (const t of targets) {
    const box = await t.boundingBox();
    expect(box.width, await t.innerText()).toBeGreaterThanOrEqual(44);
    expect(box.height, await t.innerText()).toBeGreaterThanOrEqual(44);
  }
});

test('横スクロールが発生しない', async ({ page }) => {
  await openGame(page, { opponents: '5' });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('相手が増えてもカードが全員分出る', async ({ page }) => {
  const g = await openGame(page, { opponents: '5' });
  await expect(page.locator('#opponents .pcard')).toHaveCount(5);
  await expect(page.locator('#self .pcard')).toHaveCount(1);
});
