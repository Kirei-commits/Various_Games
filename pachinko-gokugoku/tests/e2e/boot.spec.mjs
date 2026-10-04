import { test, expect } from '@playwright/test';
import { open, press } from './fixtures.mjs';

test('起動してタップするとオート打ちが始まり、球がヘソに入って変動する', async ({ page }) => {
  const errors = await open(page, { start: false });
  await expect(page.locator('#start')).toBeVisible();
  await press(page, '#start');
  await expect(page.locator('#bAuto')).toContainText('ON');
  await page.waitForFunction(() => window.__PACHI.D.meas.leftShots >= 3);
  await page.evaluate(() => window.__PACHI.setSpeed(4));
  await page.waitForFunction(() => window.__PACHI.D.totalSpins >= 1, null, { timeout: 45_000 });
  expect(errors).toEqual([]);
});

test('画面は縦横比を保って画面内に収まる', async ({ page }) => {
  await open(page, { start: false });
  const vp = page.viewportSize();
  const box = await page.locator('#stage').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.width / box.height).toBeCloseTo(720 / 1320, 2);
  // どちらかの辺はぴったり合わせる（無駄に小さくしない）
  expect(Math.max(box.width / vp.width, box.height / vp.height)).toBeGreaterThan(0.99);
});

test('オートをOFFにすると発射が止まる', async ({ page }) => {
  await open(page);
  await press(page, '#bAuto');
  await expect(page.locator('#bAuto')).toContainText('OFF');
  const a = await page.evaluate(() => window.__PACHI.D.meas.leftShots);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__PACHI.D.meas.leftShots)).toBe(a);
});
