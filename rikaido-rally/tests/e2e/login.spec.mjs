import { test, expect } from '@playwright/test';
import { openRaw } from './fixtures.mjs';

test('最初に役割を選ぶ画面が出る', async ({ page }) => {
  const ctx = await openRaw(page);
  await expect(page.locator('#screen-login')).toBeVisible();
  await expect(page.locator('#screen-learner')).toBeHidden();
  await expect(page.locator('#screen-teacher')).toBeHidden();
  await expect(page.locator('#role-learner')).toBeVisible();
  await expect(page.locator('#role-teacher')).toBeVisible();
  // 合言葉が認証ではないことを、隠さず書いてある
  await expect(page.locator('.gate-foot')).toContainText('認証ではありません');
  expect(ctx.errors).toEqual([]);
});

test('受講者を選ぶとテストが始まる', async ({ page }) => {
  const ctx = await openRaw(page);
  await ctx.tap(page.locator('#role-learner'));
  await expect(page.locator('#screen-learner')).toBeVisible();
  await expect(page.locator('.msg.q')).toHaveCount(1);
  expect(ctx.errors).toEqual([]);
});

test('講師は合言葉を決めてから入る。二度目は同じ合言葉が要る', async ({ page }) => {
  const ctx = await openRaw(page);
  await ctx.tap(page.locator('#role-teacher'));
  await expect(page.locator('#passcode-form')).toBeVisible();
  await expect(page.locator('#passcode-note')).toContainText('まだ合言葉が決まっていません');

  await page.fill('#passcode', 'あいことば');
  await ctx.tap(page.locator('#passcode-form button[type="submit"]'));
  await expect(page.locator('#screen-teacher')).toBeVisible();

  // 入り直すと、こんどは合言葉を聞かれる
  await ctx.tap(page.locator('#screen-teacher [data-go="login"]'));
  await ctx.tap(page.locator('#role-teacher'));
  await page.fill('#passcode', 'ちがう');
  await ctx.tap(page.locator('#passcode-form button[type="submit"]'));
  await expect(page.locator('#passcode-note')).toContainText('合言葉が違います');
  await expect(page.locator('#screen-teacher')).toBeHidden();

  await page.fill('#passcode', 'あいことば');
  await ctx.tap(page.locator('#passcode-form button[type="submit"]'));
  await expect(page.locator('#screen-teacher')).toBeVisible();
  expect(ctx.errors).toEqual([]);
});

test('画面は明るい地の色で出る', async ({ page }) => {
  await openRaw(page);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g).map(Number);
  // 明るさ（知覚輝度）が十分あること。暗いテーマに戻ったら落ちる
  expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeGreaterThan(200);
});
