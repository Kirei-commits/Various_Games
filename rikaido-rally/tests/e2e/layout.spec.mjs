import { test, expect } from '@playwright/test';
import { open } from './fixtures.mjs';

test('主要な操作は指で押せる大きさ（44×44px 以上）', async ({ page }) => {
  await open(page);
  const targets = ['#choices .choice', '#skip', '#bank-select', '#mode', '#m-plan summary'];
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

test('問題文と選択肢はファーストビューに入る', async ({ page }) => {
  // 4つの長い選択肢まで全部入れるのは無理なので、
  // 「問題を読んで、選び始められる」ところまでを条件にしている。
  await open(page);
  const vh = page.viewportSize().height;
  for (const sel of ['.msg.q', '#choices .choice:first-child']) {
    const box = await page.locator(sel).boundingBox();
    expect(box.y + box.height, `${sel} が画面から出ている`).toBeLessThanOrEqual(vh);
  }
});

test('選択肢と「わからない」の間に、余計な空きがない', async ({ page }) => {
  await open(page);
  const choices = await page.locator('#choices').boundingBox();
  const skip = await page.locator('#skip').boundingBox();
  expect(skip.y - (choices.y + choices.height)).toBeLessThan(40);
});

test('隠した操作は本当に隠れている（[hidden] が display に負けない）', async ({ page }) => {
  await open(page);
  await expect(page.locator('#next')).toBeHidden();
  await expect(page.locator('#finish')).toBeHidden();
  await expect(page.locator('#result')).toBeHidden();
});
