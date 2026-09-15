import { test, expect } from '@playwright/test';
import { open, answer } from './fixtures.mjs';

test('採点基準は、受講者モードでは伏せ、講師モードでは開く', async ({ page }) => {
  const ctx = await open(page);
  const criteria = page.locator('#m-criteria');
  await ctx.tap(criteria.locator('summary'));
  await expect(criteria).toContainText('回答後に開示');

  await page.locator('#teacher-view').check();
  await expect(criteria).not.toContainText('回答後に開示');
  await expect(criteria).toContainText('達成基準');
  expect(ctx.errors).toEqual([]);
});

test('判定ログに、入力・正規化後の文字列・観点ごとの当たり外れが出る', async ({ page }) => {
  const ctx = await open(page);
  const log = page.locator('#m-log');
  await expect(log).toContainText('まだ回答がありません');

  await answer(page, 'ＦＡＬＳＥ です。');
  await expect(log).toContainText('正規化後');
  await expect(log).toContainText('false');       // 全角→半角・小文字化まで見えている
  await expect(log).toContainText('一致なし');
  await expect(log).toContainText('充足率');
  expect(ctx.errors).toEqual([]);
});

test('組み立てパネルに、単元の選定理由とレベルの階段が出る', async ({ page }) => {
  const ctx = await open(page);
  const plan = page.locator('#m-plan');
  await expect(plan).toContainText('単元を選ぶ規則');
  await expect(plan).toContainText('まだ一度も出していない単元を最優先する');
  await expect(plan).toContainText('2 → 3 → 4 → 5 → 5');
  await expect(plan).toContainText('この問題が選ばれた理由');
  expect(ctx.errors).toEqual([]);
});

test('評価パネルに、減点表と現在の暫定スコアと次の評価までの差が出る', async ({ page }) => {
  const ctx = await open(page);
  const grade = page.locator('#m-grade');
  await ctx.tap(grade.locator('summary'));
  await expect(grade).toContainText('1問ぶんの到達点');
  await expect(grade).toContainText('レベル重み');
  await expect(grade).toContainText('評価の境目');

  await answer(page, await ctx.model());
  await expect(grade).toContainText('点 →');
  expect(ctx.errors).toEqual([]);
});

test('状態パネルの現在地が、回答に合わせて動く', async ({ page }) => {
  const ctx = await open(page);
  const state = page.locator('#m-state');
  await ctx.tap(state.locator('summary'));
  await expect(state.locator('.flow span.now')).toHaveText('出題中');

  await answer(page, 'ちがいます');
  await expect(state.locator('.flow span.now')).toHaveText('ヒント中');

  await answer(page, await ctx.model());
  await expect(state.locator('.flow span.now')).toHaveText('正解・解説');
  expect(ctx.errors).toEqual([]);
});

test('レベルの定義と品揃えの表が出る', async ({ page }) => {
  const ctx = await open(page);
  const levels = page.locator('#m-levels');
  await ctx.tap(levels.locator('summary'));
  await expect(levels).toContainText('問われている行為');
  await expect(levels).toContainText('この問題集の品揃え');
  // 5単元ぶんの行（ヘッダ1行を足して6行）
  await expect(levels.locator('table.k').nth(1).locator('tr')).toHaveCount(6);
  expect(ctx.errors).toEqual([]);
});
