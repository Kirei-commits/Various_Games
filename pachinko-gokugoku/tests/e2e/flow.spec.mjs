import { test, expect } from '@playwright/test';
import { open, debug, playUntil, speed, state } from './fixtures.mjs';

test('一発大当り → 判定をボタンで押す → 10R → モード選択 → RUSH', async ({ page }) => {
  const errors = await open(page);
  await debug(page, '[data-force="battle"]');
  await speed(page, 4);
  await playUntil(page, /^大当り/);
  await expect(page.locator('#bAim')).toContainText('右打ち'); // オート右打ち切替
  await playUntil(page, /^RUSH/, { mode: 'battle' });
  const r = await page.evaluate(() => { const P = window.__PACHI; return { mode: P.M.mode, rushMode: P.M.rushMode, left: P.M.rushLeft, hist: P.D.history[0], hits: P.D.hits, balls: P.D.balls }; });
  expect(r.mode).toBe('rush');
  expect(r.rushMode).toBe('battle');
  expect(r.left).toBeGreaterThan(90);
  expect(r.hist.r).toBe(10);
  expect(r.hist.t).toBe('FEVER');
  expect(r.hits).toBe(1);
  expect(r.balls).toBeGreaterThan(1200); // 1500個の払い出し（打ち出した分を引いても残る）
  expect(errors).toEqual([]);
});

test('3R通常は昇格せずに通常へ戻る', async ({ page }) => {
  const errors = await open(page);
  await debug(page, '[data-force="regular"]');
  await speed(page, 4);
  await playUntil(page, /^大当り/);
  await playUntil(page, /^通常$/);
  // 通常に戻った直後に保留があればすぐ次の変動に入るので、状態名ではなくモードで確かめる
  const r = await page.evaluate(() => { const P = window.__PACHI; return { mode: P.M.mode, inBonus: P.M.inBonus, chain: P.M.chain, hist: P.D.history[0] }; });
  expect(r).toMatchObject({ mode: 'normal', inBonus: false, chain: 0 });
  expect(r.hist.r).toBe(3);
  expect(await state(page)).toMatch(/^通常/);
  expect(errors).toEqual([]);
});

test('一撃レバー: 5R目の前にレバーを引くと RUSH に昇格する', async ({ page }) => {
  const errors = await open(page);
  await debug(page, '[data-force="lever"]');
  await speed(page, 4);
  await playUntil(page, /一撃昇格/);
  await playUntil(page, /モード選択|^RUSH/);
  expect(await page.evaluate(() => window.__PACHI.D.history[0].t)).toBe('FEVER');
  expect(errors).toEqual([]);
});
