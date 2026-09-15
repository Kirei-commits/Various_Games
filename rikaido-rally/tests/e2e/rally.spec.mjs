import { test, expect } from '@playwright/test';
import { open, answer, clearOne } from './fixtures.mjs';

test('出題される。正解すると根拠と模範解答が開く', async ({ page }) => {
  const ctx = await open(page);
  await expect(page.locator('#unit-title')).not.toHaveText('—');
  await expect(page.locator('.msg.q')).toContainText('問題 1 / 5');

  await answer(page, await ctx.model());
  const ok = page.locator('.msg.ok');
  await expect(ok).toHaveCount(1);
  await expect(ok).toContainText('なぜこの回答で正解なのか');
  await expect(ok).toContainText('模範解答');
  await expect(ok).toContainText('出典');
  expect(ctx.errors).toEqual([]);
});

test('不正解では進まず、ヒントが段階的に出る', async ({ page }) => {
  const ctx = await open(page);
  const firstQid = (await ctx.session()).qid;

  for (let i = 1; i <= 5; i++) {
    await answer(page, 'ぜんぜん違うことを書きます');
    await expect(page.locator('.msg.hint')).toHaveCount(i);
    const s = await ctx.session();
    expect(s.index).toBe(0);
    expect(s.qid).toBe(firstQid);
    expect(s.hints[0]).toBe(i);
  }

  // 5段目は模範解答の開示。そのまま書けば必ず通る
  await expect(page.locator('.msg.hint').last()).toContainText('模範解答');
  await answer(page, await ctx.model());
  await expect(page.locator('.msg.ok')).toHaveCount(1);
  expect(ctx.errors).toEqual([]);
});

test('1段目のヒントは観点だけで、認める語そのものは出さない', async ({ page }) => {
  const ctx = await open(page);
  await answer(page, 'ぜんぜん違うことを書きます');
  const hint = page.locator('.msg.hint').first();
  await expect(hint).toContainText('まだ触れられていない観点');
  await expect(hint).not.toContainText('参照');
  expect(ctx.errors).toEqual([]);
});

test('5問すべて一発正解すると A になる', async ({ page }) => {
  const ctx = await open(page);
  for (let i = 0; i < 5; i++) await clearOne(page, ctx);

  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('.gradebox .big')).toHaveText('A');
  const s = await ctx.session();
  expect(s.phase).toBe('result');
  expect(s.levels.join(',')).toBe('2,3,4,5,5');
  expect(ctx.errors).toEqual([]);
});

test('結果から次のラリーへ進むと、別の単元が選ばれる', async ({ page }) => {
  const ctx = await open(page);
  const firstUnit = await page.locator('#unit-title').textContent();
  for (let i = 0; i < 5; i++) await clearOne(page, ctx);

  await ctx.tap(page.locator('#again'));
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('.msg.q')).toHaveCount(1);
  await expect(page.locator('#unit-title')).not.toHaveText(firstUnit);
  expect(ctx.errors).toEqual([]);
});

test('問題集を切り替えると出題が入れ替わる', async ({ page }) => {
  const ctx = await open(page);
  await expect(page.locator('.msg.q')).toContainText('レベル2');

  await ctx.tap(page.locator('#bank-tabs button[data-bank="kuwata"]'));
  await expect(page.locator('#bank-tabs button[data-bank="kuwata"]')).toHaveAttribute('aria-selected', 'true');
  const s = await ctx.session();
  expect(s.qid.startsWith('kw-')).toBe(true);
  expect(s.index).toBe(0);
  expect(ctx.errors).toEqual([]);
});

test('結果画面に、単元ごとの棒グラフと「詰まった観点」が出る', async ({ page }) => {
  const ctx = await open(page, { bank: 'kuwata' });
  for (let i = 0; i < 5; i++) {
    await answer(page, 'ちょっと分かりません');           // 1回詰まってから通す
    await expect(page.locator('.msg.hint').last()).toBeVisible();
    await clearOne(page, ctx);
  }
  const result = page.locator('#result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('次に上げるならここ');

  // 棒は実際に伸びている（span を block にし忘れると幅が効かない）
  const widths = await result.locator('.bar .fill').evaluateAll(
    (els) => els.map((e) => e.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(0);
  for (const w of widths) expect(w).toBeGreaterThan(0);

  // 単元は id ではなく日本語のラベルで出す
  await expect(result.locator('table.k')).not.toContainText('songs');
  expect(ctx.errors).toEqual([]);
});
