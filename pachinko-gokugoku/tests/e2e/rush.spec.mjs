import { test, expect } from '@playwright/test';
import { open, debug, playUntil, press, speed } from './fixtures.mjs';

test('RUSH の最後の1回転はラストチャンス → ハズレでリザルト → 通常に戻る', async ({ page }) => {
  const errors = await open(page);
  await debug(page, '[data-cmd="rush"]');
  await expect(page.locator('#modesel')).toBeVisible();
  await press(page, '#modesel [data-mode="quick"]');
  await page.waitForFunction(() => window.__PACHI.M.mode === 'rush');
  // 待ち時間の短縮: 残り1回転にして、次の保留をハズレにする
  await page.evaluate(() => { const P = window.__PACHI; P.M.holds.length = 0; P.M.rushLeft = 1; P.UI.force('miss'); });
  await speed(page, 3);
  await playUntil(page, /ラストチャンス/);
  await page.keyboard.down('Space'); await page.waitForTimeout(800); await page.keyboard.up('Space'); // 長押しでメーターを溜める
  await playUntil(page, /リザルト/);
  await expect.poll(() => page.evaluate(() => window.__PACHI.LCD.result && window.__PACHI.LCD.result.t)).toBeGreaterThan(2);
  await press(page, '#push');
  await playUntil(page, /^通常/);
  const r = await page.evaluate(() => { const P = window.__PACHI; return { mode: P.M.mode, chain: P.M.chain, ends: P.D.meas.rushEnds }; });
  expect(r).toEqual({ mode: 'normal', chain: 0, ends: 1 });
  expect(errors).toEqual([]);
});

test('爆速モードの違和感（強制）で即当りして RUSH が続く', async ({ page }) => {
  const errors = await open(page);
  await debug(page, '[data-cmd="rush"]');
  await press(page, '#modesel [data-mode="quick"]');
  await page.waitForFunction(() => window.__PACHI.M.mode === 'rush');
  await page.evaluate(() => { const P = window.__PACHI; P.M.holds.length = 0; P.UI.force('iwakan'); });
  await speed(page, 3);
  await playUntil(page, /^大当り/);
  await playUntil(page, /^RUSH/);
  const r = await page.evaluate(() => { const P = window.__PACHI; return { chain: P.M.chain, hits: P.D.meas.rushHits, left: P.M.rushLeft }; });
  expect(r.chain).toBe(2);
  expect(r.hits).toBe(1);
  expect(r.left).toBeGreaterThan(90);
  expect(errors).toEqual([]);
});
