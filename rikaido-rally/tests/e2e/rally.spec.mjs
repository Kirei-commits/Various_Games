import { test, expect } from '@playwright/test';
import { open, answer, answerCorrectly, answerWrong, clearOne, goNext, finishAll } from './fixtures.mjs';

test('選択式で出る。キーボードの入力欄は出てこない', async ({ page }) => {
  const ctx = await open(page);
  await expect(page.locator('.msg.q')).toContainText('問題 1 / 10');
  await expect(page.locator('#choices .choice')).toHaveCount(4);
  await expect(page.locator('#answer-form')).toBeHidden();
  await expect(page.locator('#skip')).toBeVisible();
  expect(ctx.errors).toEqual([]);
});

test('正解を選ぶと、根拠と解説が開く', async ({ page }) => {
  const ctx = await open(page);
  await answerCorrectly(page, ctx);
  const ok = page.locator('.msg.ok');
  await expect(ok).toHaveCount(1);
  await expect(ok).toContainText('なぜこれが正解なのか');
  await expect(ok).toContainText('この基準にしている理由');
  await expect(ok).toContainText('出典');
  // 選んだものと正解が色分けされ、押せなくなる
  await expect(page.locator('#choices .choice.right')).toHaveCount(1);
  await expect(page.locator('#choices .choice:disabled')).toHaveCount(4);
  expect(ctx.errors).toEqual([]);
});

test('ヒントは3段。1段目から中身のある手がかりが出る', async ({ page }) => {
  const ctx = await open(page);
  const firstQid = (await ctx.session()).qid;

  await answerWrong(page, ctx);
  const first = page.locator('.msg.hint').first();
  await expect(first).toContainText('ヒント 1 / 3（手がかり）');
  // 「足りない観点が○個あります」のような足踏みヒントに戻っていないこと
  await expect(first).not.toContainText('観点が');

  await answerWrong(page, ctx);
  await expect(page.locator('.msg.hint').nth(1)).toContainText('消しました');
  await expect(page.locator('#choices .choice.gone')).toHaveCount(1);

  await answerWrong(page, ctx);
  await expect(page.locator('.msg.hint')).toHaveCount(3);
  await expect(page.locator('.msg.hint').last()).toContainText('答えは');

  const s = await ctx.session();
  expect(s.index).toBe(0);
  expect(s.qid).toBe(firstQid);
  expect(ctx.errors).toEqual([]);
});

test('わからない問題は飛ばせる。答えと解説は見せる', async ({ page }) => {
  const ctx = await open(page);
  await ctx.tap(page.locator('#skip'));

  const skipped = page.locator('.msg.skip');
  await expect(skipped).toHaveCount(1);
  await expect(skipped).toContainText('0 点');
  await expect(skipped).toContainText('解説');
  await expect(page.locator('#skip')).toBeHidden();
  await expect(page.locator('#next')).toBeVisible();

  await goNext(page, ctx);
  const s = await ctx.session();
  expect(s.index).toBe(1);
  expect(ctx.errors).toEqual([]);
});

test('10問すべて一発正解すると A になる', async ({ page }) => {
  const ctx = await open(page);
  await finishAll(page, ctx);
  await expect(page.locator('.gradebox .big')).toHaveText('A');
  const s = await ctx.session();
  expect(s.phase).toBe('result');
  expect(s.levels.length).toBe(10);
  expect(ctx.errors).toEqual([]);
});

test('飛ばした問題は結果に出て、そこから復習に入れる', async ({ page }) => {
  const ctx = await open(page);
  await ctx.tap(page.locator('#skip'));
  await goNext(page, ctx);
  for (let i = 0; i < 9; i++) await clearOne(page, ctx);

  await expect(page.locator('#result')).toContainText('飛ばした 1 問');
  await expect(page.locator('#result')).toContainText('復習');
  await ctx.tap(page.locator('#review'));

  const s = await ctx.session();
  expect(s.phase).toBe('asking');
  await expect(page.locator('#unit-title')).toContainText('復習');
  await expect(page.locator('#mode')).toHaveValue('review');
  expect(ctx.errors).toEqual([]);
});

test('レベル別を選ぶと、その段だけが出る', async ({ page }) => {
  const ctx = await open(page, { mode: 'level', level: '5' });
  await expect(page.locator('#level-pick')).toBeVisible();
  await expect(page.locator('#unit-title')).toContainText('レベル5');
  await expect(page.locator('.msg.q')).toContainText('レベル5');

  await page.selectOption('#level', '1');
  await expect(page.locator('#unit-title')).toContainText('レベル1');
  await expect(page.locator('.msg.q')).toContainText('レベル1');
  expect(ctx.errors).toEqual([]);
});

test('「キーボードで書いて答える」に切り替えると記述式になる', async ({ page }) => {
  const ctx = await open(page);
  await page.locator('#write-mode').check();
  await expect(page.locator('#answer-form')).toBeVisible();
  await expect(page.locator('#choices')).toBeHidden();

  await answer(page, await ctx.correct());
  await expect(page.locator('.msg.ok')).toContainText('なぜこの回答で正解なのか');
  expect(ctx.errors).toEqual([]);
});

test('テストを切り替えると出題が入れ替わる', async ({ page }) => {
  const ctx = await open(page);
  await page.selectOption('#bank-select', 'kuwata');
  const s = await ctx.session();
  expect(s.bankId).toBe('kuwata');
  expect(s.qid.startsWith('kw-')).toBe(true);
  expect(s.index).toBe(0);
  expect(ctx.errors).toEqual([]);
});

test('結果画面に、単元ごとの棒グラフと「つまずき」が出る', async ({ page }) => {
  const ctx = await open(page, { bank: 'kuwata' });
  for (let i = 0; i < 10; i++) {
    await answerWrong(page, ctx);           // 1回詰まってから通す
    await expect(page.locator('.msg.hint').last()).toBeVisible();
    await clearOne(page, ctx);
  }
  const result = page.locator('#result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('次に上げるならここ');

  const widths = await result.locator('.bar .fill').evaluateAll(
    (els) => els.map((e) => e.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(0);
  for (const w of widths) expect(w).toBeGreaterThan(0);

  await expect(result.locator('table.k')).not.toContainText('songs');
  expect(ctx.errors).toEqual([]);
});
