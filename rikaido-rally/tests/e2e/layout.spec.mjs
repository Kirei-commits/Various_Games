import { test, expect } from '@playwright/test';
import { open } from './fixtures.mjs';

test('主要な操作は指で押せる大きさ（44×44px 以上）', async ({ page }) => {
  await open(page);
  const targets = ['#submit', '#bank-select', '#m-plan summary'];
  for (const sel of targets) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box.height, `${sel} が低い`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${sel} が細い`).toBeGreaterThanOrEqual(44);
  }
});

test('横スクロールが出ない', async ({ page }) => {
  await open(page);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('回答欄と送信ボタンはファーストビューに入る', async ({ page }) => {
  await open(page);
  const box = await page.locator('#submit').boundingBox();
  const vh = page.viewportSize().height;
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
});

test('隠した操作は本当に隠れている（[hidden] が display に負けない）', async ({ page }) => {
  await open(page);
  await expect(page.locator('#next')).toBeHidden();
  await expect(page.locator('#finish')).toBeHidden();
  await expect(page.locator('#result')).toBeHidden();
});
