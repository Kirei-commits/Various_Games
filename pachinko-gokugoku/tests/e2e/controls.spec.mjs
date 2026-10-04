import { test, expect } from '@playwright/test';
import { open, debug, playUntil, press, speed } from './fixtures.mjs';

test('カスタム設定は保存され、再読み込みしても残る', async ({ page }) => {
  await open(page);
  await press(page, '#bMenu');
  await press(page, '#menu [data-key="vol"][data-val="5"]');
  await press(page, '#menu [data-key="bright"][data-val="1"]');
  await press(page, '#menu [data-key="preread"][data-val="true"]');
  await press(page, '#menu [data-key="sakibare"][data-val="0.1"]');
  await page.reload();
  await page.waitForFunction(() => window.__PACHI);
  const s = await page.evaluate(() => window.__PACHI.D.settings);
  expect(s).toMatchObject({ vol: 5, bright: 1, preread: true, sakibare: 0.1 });
  await press(page, '#start');
  await press(page, '#bMenu');
  await expect(page.locator('#menu [data-key="vol"][data-val="5"]')).toHaveClass(/on/);
  await expect(page.locator('#menu [data-key="sakibare"][data-val="0.1"]')).toHaveText('1/10');
});

test('設定モードに理論値と実測値が出て、確率を変えると理論値も変わる', async ({ page }) => {
  await open(page);
  await press(page, '#bDbg');
  const box = page.locator('#specBox');
  await expect(box).toContainText('1/319.7');
  await expect(box).toContainText('81.0%');
  await expect(box).toContainText('金カットイン');
  await press(page, '#dbg [data-key="prob"][data-val="99"]');
  await expect(box).toContainText('1/99.0');
  await expect.poll(() => page.evaluate(() => window.__PACHI.D.settings.prob)).toBe(99);
});

test('裏ボタン（5連打）でパトランプ、長押しでSPリーチをスキップ', async ({ page }) => {
  const errors = await open(page);
  await debug(page, '[data-force="story"]');
  await speed(page, 2);
  await playUntil(page, /SPリーチ/);
  await speed(page, 1);
  for (let i = 0; i < 5; i++) await press(page, '#push');
  await expect.poll(() => page.evaluate(() => window.__PACHI.M.cur && window.__PACHI.M.cur.uraDone)).toBe(true);
  await page.keyboard.down('Space'); await page.waitForTimeout(1800); await page.keyboard.up('Space');
  await expect.poll(() => page.evaluate(() => window.__PACHI.state())).toMatch(/当否判定|昇格スクープ|大当り/);
  expect(errors).toEqual([]);
});

test('先バレ強制: ヘソ入賞の瞬間に保留が赤以上になる', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__PACHI.M.holds.length = 0);
  await debug(page, '[data-force="sakibare"]');
  const h = await page.evaluate(() => { const P = window.__PACHI; const x = P.M.holds.find(h => h.sakibare) || (P.M.cur && P.M.cur.sakibare ? P.M.cur : null); return x && { hit: x.hit, disp: x.dispColor }; });
  expect(h.hit).toBe(true);
  expect(['red', 'gold', 'rainbow']).toContain(h.disp);
});
