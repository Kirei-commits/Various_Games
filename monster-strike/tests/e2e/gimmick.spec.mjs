/**
 * ギミック（ダメージウォール・重力バリア）とアビリティ。
 * 撃つ操作は実際の入力で行い、キャラの置き場所と敵の全滅（待ち時間の短縮）だけ直接いじる。
 */
import { test, expect } from '@playwright/test';
import { open, pullUnit, waitPhase, expectNoErrors } from './fixtures.mjs';

test.beforeEach(async ({ page }) => {
  page.errors = await open(page);
  await page.evaluate(() => window.__ms.setTimeScale(4));
});

const place = (page, id, x, y) => page.evaluate(([id, x, y]) => { const b = window.__ms.world.get(id); b.x = x; b.y = y; }, [id, x, y]);
const stats = (page) => page.evaluate(() => ({ ...window.__ms.battle.stats }));

async function toBossWave(page) {
  await page.evaluate(() => { const { battle, world } = window.__ms; for (const e of battle.alive()) battle.kill(e.id, world); });
  const id = await page.evaluate(() => window.__ms.active);
  await pullUnit(page, id, 0, -20);
  await waitPhase(page, 'ready');
  await expect(page.locator('#wave')).toHaveText('2/2');
}

test('アビリティの無い C が電気の壁に触れると、チームのHPが減る', async ({ page }) => {
  await place(page, 'C', 80, 300);
  await pullUnit(page, 'C', 40, 0);           // 右へ引く → 左の壁へ
  await waitPhase(page, 'ready');
  // 左の壁で跳ね返って右の壁にも届くことがあるので、回数ぶん減っていることを見る
  const s = await stats(page);
  expect(s.dwHits).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#hp-text')).toHaveText(`${34000 - 1400 * s.dwHits} / 34000`);
  await expectNoErrors(page.errors);
});

test('アンチダメージウォールの A は電気の壁に触れても平気', async ({ page }) => {
  await place(page, 'A', 80, 300);
  await pullUnit(page, 'A', 40, 0);
  await waitPhase(page, 'ready');
  const s = await stats(page);
  expect(s.dwHits).toBe(0);
  expect(s.dwBlocked).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#hp-text')).toHaveText('34000 / 34000');
  await expectNoErrors(page.errors);
});

test('ボス戦の重力バリアは C を大きく減速させ、アンチ重力バリアの B は素通りする', async ({ page }) => {
  await toBossWave(page);
  const fields = await page.evaluate(() => window.__ms.world.fields.length);
  expect(fields).toBe(1);

  await place(page, 'C', 270, 600);
  await pullUnit(page, 'C', 0, 60);           // 下へ引く → 上へ（バリアを通る）
  await waitPhase(page, 'ready');
  let s = await stats(page);
  expect(s.gravity).toBe(1);

  await place(page, 'B', 270, 600);
  await pullUnit(page, 'B', 0, 60);
  await page.waitForFunction(() => window.__ms.battle.stats.gravityBlocked > 0);
  await waitPhase(page, 'ready');
  s = await stats(page);
  expect(s.gravity).toBe(1);
  await expectNoErrors(page.errors);
});

test('電気の壁でHPが尽きると、動き終わったところでゲームオーバー', async ({ page }) => {
  await page.evaluate(() => { window.__ms.battle.teamHp = 500; });
  await place(page, 'C', 80, 300);
  await pullUnit(page, 'C', 40, 0);
  await waitPhase(page, 'lost');
  await expect(page.locator('#result-title')).toHaveText('GAME OVER');
  await expect(page.locator('#hp-text')).toHaveText('0 / 34000');
  await expectNoErrors(page.errors);
});
