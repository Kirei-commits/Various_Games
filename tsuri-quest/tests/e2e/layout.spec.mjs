import { test, expect } from '@playwright/test';
import { open, castToBite } from './fixtures.mjs';

test('主要な操作はスクロールせずに1画面目で見える', async ({ page }) => {
  await open(page);
  const viewport = page.viewportSize();
  for (const sel of ['#hud-level', '#scene', '#action', '#status']) {
    const box = await page.locator(sel).boundingBox();
    expect(box, `${sel} が見つからない`).not.toBeNull();
    expect(box.y + box.height, `${sel} が1画面目に収まっていない`).toBeLessThanOrEqual(viewport.height);
  }
});

test('押せるものはすべて 44×44px 以上ある', async ({ page }) => {
  await open(page);
  await page.locator('#tab-shop').click();
  const buttons = page.locator('button:visible');
  const n = await buttons.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const box = await b.boundingBox();
    const label = (await b.textContent()).trim().slice(0, 12);
    expect(box.width, `「${label}」の幅が狭い`).toBeGreaterThanOrEqual(44);
    expect(box.height, `「${label}」の高さが低い`).toBeGreaterThanOrEqual(44);
  }
});

test('横スクロールが発生しない', async ({ page }) => {
  await open(page);
  for (const tab of ['dex', 'shop', 'records', 'achievements']) {
    await page.locator('#tab-' + tab).click();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${tab} タブで横にはみ出している`).toBeLessThanOrEqual(1);
  }
});

test('ゲージはファイト中だけ出る', async ({ page }) => {
  await open(page);
  await expect(page.locator('#gauges')).toBeHidden();
  await castToBite(page);
  await expect(page.locator('#gauges')).toBeHidden();
});

test('Canvas は表示領域に合わせて解像度が設定される', async ({ page }) => {
  await open(page);
  const info = await page.locator('#scene').evaluate((c) => ({
    w: c.width, h: c.height, cssW: c.getBoundingClientRect().width, dpr: window.devicePixelRatio
  }));
  expect(info.w).toBeGreaterThan(0);
  expect(info.h).toBeGreaterThan(0);
  expect(info.w).toBeCloseTo(Math.round(info.cssW) * Math.min(info.dpr, 2), 0);
});
