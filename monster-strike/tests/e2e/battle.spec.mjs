/**
 * 敵の攻撃・ウェーブ・勝ち負け。
 * 敵を倒す・カウンターを進めるのは、待ち時間の短縮として戦闘の状態を直接いじる。
 * 撃つ操作そのものは実際の入力（pullUnit）で行う。
 */
import { test, expect } from '@playwright/test';
import { open, pullUnit, waitPhase, expectNoErrors } from './fixtures.mjs';

async function killWave(page) {
  await page.evaluate(() => {
    const { battle, world } = window.__ms;
    for (const e of battle.alive()) battle.kill(e.id, world);
  });
}

/** 弱く撃って（敵に届かない強さ）ターンを進める */
async function weakShot(page) {
  const id = await page.evaluate(() => window.__ms.active);
  await pullUnit(page, id, 0, -20);   // 上に少し引く → 下へ弱く
}

test.beforeEach(async ({ page }) => {
  page.errors = await open(page);
  await page.evaluate(() => window.__ms.setTimeScale(5));
});

test('カウンターが0になった敵が攻撃し、チームのHPが減る', async ({ page }) => {
  await page.evaluate(() => { for (const e of window.__ms.battle.alive()) e.counter = 1; });
  await weakShot(page);
  await waitPhase(page, 'enemy');
  await waitPhase(page, 'ready');
  // スライム2体(2000×2) + ゴーレム(3500)
  await expect(page.locator('#hp-text')).toHaveText('20500 / 28000');
  const counters = await page.evaluate(() => window.__ms.battle.alive().map((e) => e.counter));
  expect(counters).toEqual([3, 4, 3]);
  await expectNoErrors(page.errors);
});

test('敵を全滅させると次のウェーブ（ボス）が出る', async ({ page }) => {
  await killWave(page);
  await weakShot(page);
  await waitPhase(page, 'wave');
  await expect(page.locator('#wave')).toHaveText('2/2');
  await waitPhase(page, 'ready');
  const boss = await page.evaluate(() => window.__ms.battle.alive().filter((e) => e.def.boss).length);
  expect(boss).toBe(1);
  await expect(page.locator('#hp-text')).toHaveText('28000 / 28000');
  await expectNoErrors(page.errors);
});

test('ボスの弱点に当てると3倍のダメージ', async ({ page }) => {
  await killWave(page);
  await weakShot(page);
  await waitPhase(page, 'ready');
  // A を弱点（ドラゴンの真下）の下へ置いて、真上へ
  await page.evaluate(() => { const a = window.__ms.world.get('A'); a.x = 270; a.y = 560; });
  await page.evaluate(() => { window.__ms.world.get('B').x = 470; });
  const active = await page.evaluate(() => window.__ms.active);
  expect(active).toBe('B');
  await pullUnit(page, 'A', 0, 60);
  await page.waitForFunction(() => window.__ms.battle.stats.hits > 0);
  const s = await page.evaluate(() => window.__ms.battle.stats);
  expect(s.weak).toBeGreaterThan(0);
  await waitPhase(page, 'ready');
  await expectNoErrors(page.errors);
});

test('最後のウェーブを倒すとクリア画面が出て、もう一度遊べる', async ({ page }) => {
  await killWave(page);
  await weakShot(page);
  await waitPhase(page, 'ready');
  await killWave(page);
  await weakShot(page);
  await waitPhase(page, 'won');
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result-title')).toHaveText('STAGE CLEAR');
  await expect(page.locator('#result-text')).toContainText('2ターン');
  await page.locator('#btn-retry').click();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#turn')).toHaveText('1');
  await expect(page.locator('#wave')).toHaveText('1/2');
  expect(await page.evaluate(() => window.__ms.phase)).toBe('ready');
  await expectNoErrors(page.errors);
});

test('チームのHPが0になるとゲームオーバー', async ({ page }) => {
  await page.evaluate(() => {
    const b = window.__ms.battle;
    b.teamHp = 100;
    for (const e of b.alive()) e.counter = 1;
  });
  await weakShot(page);
  await waitPhase(page, 'lost');
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result-title')).toHaveText('GAME OVER');
  await expect(page.locator('#hp-text')).toHaveText('0 / 28000');
  // 結果画面では撃てない
  expect(await page.evaluate(() => window.__ms.phase)).toBe('lost');
  await expectNoErrors(page.errors);
});
