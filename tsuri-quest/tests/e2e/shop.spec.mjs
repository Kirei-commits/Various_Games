import { test, expect } from '@playwright/test';
import { open, tap, grant, stateOf, waitPhase } from './fixtures.mjs';

test.beforeEach(async ({ page }) => {
  await open(page);
  await page.locator('#tab-shop').click();
});

test('ポイントが足りないときは買えない', async ({ page }) => {
  await expect(page.locator('[data-buy="jig"][data-count="1"]')).toBeDisabled();
  await expect(page.locator('#upgrade-rod')).toBeDisabled();
  await expect(page.locator('#upgrade-line')).toBeDisabled();
});

test('エサを買うと所持数が増え、ポイントが減る', async ({ page }) => {
  await grant(page, 1000);
  await page.locator('#tab-shop').click();
  await page.locator('[data-buy="jig"][data-count="10"]').click();

  const st = await stateOf(page);
  const cost = await page.evaluate(() => window.FQ.Gear.lure('jig').cost);
  expect(st.lures.jig).toBe(10);
  expect(st.coins).toBe(1000 - cost * 10);
  await expect(page.locator('[data-lure="jig"] .own')).toHaveText('所持 10');
});

test('買ったエサを装備でき、キャストごとに1つ減る', async ({ page }) => {
  await grant(page, 1000);
  await page.locator('#tab-shop').click();
  await page.locator('[data-buy="shrimp"][data-count="1"]').click();
  await page.locator('[data-equip="shrimp"]').click();

  await expect(page.locator('[data-equip="shrimp"]')).toHaveText('装備中');
  await expect(page.locator('#hint')).toContainText('オキアミ（残り1）');

  await tap(page);                     // キャスト
  await waitPhase(page, 'waiting');
  const st = await stateOf(page);
  expect(st.lures.shrimp).toBe(0);
  // 使い切ったら素エサへ自動的に戻る
  await expect(page.locator('#hint')).toContainText('素エサ');
});

test('持っていないエサは装備できない', async ({ page }) => {
  await expect(page.locator('[data-equip="chum"]')).toBeDisabled();
  await expect(page.locator('[data-equip="none"]')).toBeDisabled(); // すでに装備中
});

test('竿を強化すると表示と性能が変わる', async ({ page }) => {
  await grant(page, 5000);
  await page.locator('#tab-shop').click();
  await page.locator('#upgrade-rod').click();

  expect((await stateOf(page)).rod).toBe(2);
  await expect(page.locator('#hint')).toContainText('グラス竿');
  await expect(page.locator('#rod-upgrade .up-now h3')).toContainText('グラス竿');
});

test('糸を強化すると危険域が狭くなる', async ({ page }) => {
  const danger = () => page.locator('#tension-danger').evaluate((el) => parseFloat(el.style.width));
  const before = await danger();
  await grant(page, 5000);
  await page.locator('#tab-shop').click();
  await page.locator('#upgrade-line').click();
  expect(await danger()).toBeLessThan(before);
});

test('最大まで強化すると打ち止めになり、実績が解除される', async ({ page }) => {
  await grant(page, 20000);
  await page.locator('#tab-shop').click();
  for (const kind of ['rod', 'line']) {
    for (let i = 0; i < 4; i++) await page.locator('#upgrade-' + kind).click();
  }
  await expect(page.locator('#rod-upgrade .maxed')).toBeVisible();
  await expect(page.locator('#line-upgrade .maxed')).toBeVisible();

  const st = await stateOf(page);
  expect(st.rod).toBe(5);
  expect(st.line).toBe(5);
  expect(st.achievements).toContain('gear_max');

  await page.locator('#tab-achievements').click();
  await expect(page.locator('[data-ach="gear_max"]')).toHaveClass(/done/);
});
