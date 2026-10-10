import { test, expect } from '@playwright/test';
import { open, press } from './fixtures.mjs';

test('起動するとハブが出て、武器拾いレギオンとCOMING SOONが並ぶ', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#hub')).toBeVisible();
  await expect(page.locator('#openLegion')).toContainText('武器拾いレギオン');
  await expect(page.locator('.card.soon')).toHaveCount(2);
  await page.waitForTimeout(800);   // 後ろのデモが動いてもエラーが出ない
  expect(errors).toEqual([]);
});

test('画面は縦長の比率を保って画面内に収まる', async ({ page }) => {
  await open(page);
  const vp = page.viewportSize();
  const box = await page.locator('#app').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.width / box.height).toBeCloseTo(720 / 1280, 2);
  expect(Math.max(box.width / vp.width, box.height / vp.height)).toBeGreaterThan(0.98);
});

test('メニュー: 最初はステージ1だけ遊べて、難易度とモードの選択は保存される', async ({ page }) => {
  await open(page);
  await press(page, '#openLegion');
  await expect(page.locator('#stageGrid [data-n="1"]')).toHaveClass(/next/);
  await expect(page.locator('#stageGrid [data-n="2"]')).toBeDisabled();
  await expect(page.locator('#stageGrid button')).toHaveCount(99);
  await press(page, '#diffTabs [data-diff="hard"]');
  await press(page, '#modeTabs [data-mode="endless"]');
  await expect(page.locator('#startEndless')).toBeVisible();
  await page.reload();
  await press(page, '#openLegion');
  await expect(page.locator('#diffTabs [data-diff="hard"]')).toHaveClass(/on/);
  await expect(page.locator('#endlessPane')).toBeVisible();
  await press(page, '#lmBack');
  await expect(page.locator('#hub')).toBeVisible();
});
