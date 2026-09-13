/**
 * のんびりモードの農園は閉じても残る。
 * 「3分チャレンジで遊んだら育てた農園が消えていた」が起きないことを見張る。
 */
import { test, expect } from '@playwright/test';
import { openFarm } from './fixtures.mjs';

/** いま遊んでいる農園を保存する（本体は3秒ごとに自動で保存している） */
const saveNow = (page) => page.evaluate(() => window.GF.Store.saveFarm(window.GF.game.state));

test('閉じて開き直すと、続きから遊べる', async ({ page }) => {
  const g = await openFarm(page);
  await g.tap(page.locator('.card[data-act="seed"][data-id="carrot"]'));
  await g.tap(page.locator('#btn-harvest'));
  await page.evaluate(() => window.GF.Engine.store(window.GF.game.state, 'corn', 5));
  const before = await g.state();
  await saveNow(page);

  // fresh を外して開き直す（実際に閉じて開いたときと同じ道）
  await page.goto('/?seed=7&speed=8&sound=off&help=off');
  await expect(page.locator('#fields .field')).toHaveCount(12);

  const after = await page.evaluate(() => JSON.parse(JSON.stringify(window.GF.game.state)));
  expect(after.barn.corn).toBe(5);
  expect(after.fields.filter((f) => f.crop === 'carrot').length).toBe(before.fieldsOwned);
  await expect(page.locator('#ticker')).toContainText('おかえり');
});

test('3分チャレンジで遊んでも、のんびりモードの農園は消えない', async ({ page }) => {
  const g = await openFarm(page);
  await page.evaluate(() => window.GF.Engine.store(window.GF.game.state, 'pumpkin', 3));
  await saveNow(page);

  // チャレンジへ行って、戻ってくる
  await page.evaluate(() => window.GF.startGame('rush'));
  expect((await g.state()).barn.pumpkin).toBe(undefined);
  await page.evaluate(() => window.GF.enterFree());

  const back = await g.state();
  expect(back.mode).toBe('free');
  expect(back.barn.pumpkin).toBe(3);
});

test('「はじめから」を選んだときは、ちゃんと消える', async ({ page }) => {
  const g = await openFarm(page);
  await page.evaluate(() => window.GF.Engine.store(window.GF.game.state, 'pumpkin', 3));
  await saveNow(page);

  await page.evaluate(() => { window.GF.Store.clearFarm(); window.GF.startGame('free'); });
  const fresh = await g.state();
  expect(fresh.barn.pumpkin).toBe(undefined);
  expect(fresh.coins).toBe(30);
});

test('壊れた保存が残っていても起動できる', async ({ page }) => {
  await openFarm(page);
  await page.evaluate(() => {
    try { localStorage.setItem(window.GF.Store.FARM_KEY, '{こわれている'); } catch (e) { /* noop */ }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=7&speed=8&sound=off&help=off');
  await expect(page.locator('#fields .field')).toHaveCount(12);
  expect((await page.evaluate(() => window.GF.game.state.coins))).toBe(30);
  expect(errors).toEqual([]);
});
