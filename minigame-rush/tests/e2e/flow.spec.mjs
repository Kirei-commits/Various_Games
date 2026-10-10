import { test, expect } from '@playwright/test';
import { open, press, startStage, SAVE_DONE } from './fixtures.mjs';

const fast = page => page.evaluate(() => { window.__MGR.bot(true); window.__MGR.speed(12); });

test('ステージ1をクリア → ★とコイン、ステージ2が遊べるようになり、再読み込みしても残る', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await open(page, { save: SAVE_DONE });
  await startStage(page, 1);
  await fast(page);
  await expect(page.locator('#result')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#resTitle')).toHaveText('STAGE CLEAR!');
  await expect(page.locator('#resStars b')).not.toHaveCount(0);
  await expect(page.locator('#resNext')).toBeVisible();
  const coins = await page.evaluate(() => window.__MGR.Store.d.coins);
  expect(coins).toBeGreaterThan(0);
  await press(page, '#resMenu');
  await expect(page.locator('#stageGrid [data-n="1"]')).toHaveClass(/clear/);
  await expect(page.locator('#stageGrid [data-n="2"]')).toHaveClass(/next/);
  await page.reload();
  await press(page, '#openLegion');
  await expect(page.locator('#stageGrid [data-n="2"]')).toBeEnabled();
  expect(await page.evaluate(() => window.__MGR.Store.d.coins)).toBe(coins);
  // 図鑑: 檻から助けた英雄が載っている
  await press(page, '#openDex');
  await expect(page.locator('#dexList .cell:not(.unknown)')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test('負けると「拠点が落ちた」→ リトライで同じステージをやり直せる', async ({ page }) => {
  await open(page, { save: SAVE_DONE });
  await startStage(page, 1);
  await page.evaluate(() => { window.__MGR.sim().S.baseHp = 0.5; window.__MGR.sim().S.baseMax = 100; window.__MGR.speed(10); });
  await page.evaluate(() => { const S = window.__MGR.sim().S; S.heroes[0].ammo = []; for (const r of S.board) for (const it of r) it.w = 'sword'; });
  await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#resTitle')).toHaveText('拠点が落ちた…');
  await expect(page.locator('#resNext')).toBeHidden();
  await press(page, '#resRetry');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => window.__MGR.sim().S.t)).toBeLessThan(5);
});

test('強化を買うとコインが減り、レベルが上がって保存される', async ({ page }) => {
  await open(page, { save: { ...SAVE_DONE, coins: 1000 } });
  await press(page, '#openLegion');
  await press(page, '#openUp');
  await expect(page.locator('#upList .up')).toHaveCount(6);
  await press(page, '#upList [data-up="atk"]');
  await expect(page.locator('#upList .up').first()).toContainText('Lv 1/');
  expect(await page.evaluate(() => window.__MGR.Store.d.coins)).toBe(940);
  await page.reload();
  expect(await page.evaluate(() => window.__MGR.Store.d.legion.upgrades.atk)).toBe(1);
});

test('エンドレス: ウェーブが進み、終わると記録が残る', async ({ page }) => {
  test.setTimeout(150_000);
  await open(page, { save: SAVE_DONE });
  await press(page, '#openLegion');
  await press(page, '#modeTabs [data-mode="endless"]');
  await press(page, '#startEndless');
  await expect(page.locator('#hudTitle')).toContainText('エンドレス');
  await page.evaluate(() => { window.__MGR.bot(true); window.__MGR.speed(12); });
  await page.waitForFunction(() => window.__MGR.sim().S.wave >= 3, null, { timeout: 60_000 });
  await page.evaluate(() => { const S = window.__MGR.sim().S; S.baseHp = 0.1; S.barrier = 0; });
  await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#resLines')).toContainText('到達ウェーブ');
  const best = await page.evaluate(() => window.__MGR.Store.d.legion.best.normal);
  expect(best.wave).toBeGreaterThanOrEqual(3);
});

test('設定: ミュートと音量は保存される。データ消去で最初からになる', async ({ page }) => {
  await open(page, { save: { ...SAVE_DONE, coins: 500 } });
  await press(page, '#hubSettings');
  await page.locator('#mute').check();
  await page.reload();
  await press(page, '#hubSettings');
  await expect(page.locator('#mute')).toBeChecked();
  await press(page, '#resetData');
  await press(page, '#confirmYes');
  expect(await page.evaluate(() => window.__MGR.Store.d.coins)).toBe(0);
  await expect(page.locator('#hubCoins')).toHaveText('0');
});
