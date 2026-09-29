/**
 * 友情コンボ。撃つ操作は実際の入力で行い、キャラの置き場所だけ直接決める。
 */
import { test, expect } from '@playwright/test';
import { open, pullUnit, waitPhase, expectNoErrors } from './fixtures.mjs';

test.beforeEach(async ({ page }) => {
  page.errors = await open(page);
  await page.evaluate(() => window.__ms.setTimeScale(4));
});

const place = (page, id, x, y) => page.evaluate(([id, x, y]) => { const b = window.__ms.world.get(id); b.x = x; b.y = y; }, [id, x, y]);
const stats = (page) => page.evaluate(() => ({ ...window.__ms.battle.stats }));

test('A で B に当てると、B のクロスレーザーが縦横に走ってゴーレムに当たる', async ({ page }) => {
  await place(page, 'A', 210, 590);           // B（210, 715）の真上
  await pullUnit(page, 'A', 0, -60);          // 上へ引く → 下へ撃つ
  await page.waitForFunction(() => window.__ms.battle.stats.combos > 0);
  const golem = await page.evaluate(() => window.__ms.battle.enemy('w1-golem').hp);
  // ゴーレム（x=190〜350）は B の真上（x=210）にいるので縦のビームが当たる。火のレーザーは水のゴーレムに0.66倍
  expect(golem).toBeLessThanOrEqual(12000 - Math.round(1800 * 0.66));
  await waitPhase(page, 'ready');
  const s = await stats(page);
  expect(s.combos).toBe(1);
  await expectNoErrors(page.errors);
});

test('貫通の B で A を通り抜けると、A のホーミングが敵に飛び、弾が届いてからターンが終わる', async ({ page }) => {
  await place(page, 'B', 90, 560);            // A（90, 690）の真上
  await pullUnit(page, 'B', 0, -60);          // B を押して交代 → 下へ撃つ
  await page.waitForFunction(() => window.__ms.battle.stats.combos > 0);
  const hpBefore = await page.evaluate(() => window.__ms.battle.enemies.reduce((a, e) => a + e.hp, 0));
  expect(hpBefore).toBeLessThanOrEqual(7000 * 2 + 12000 - 6 * 500);
  await waitPhase(page, 'ready');
  const s = await stats(page);
  expect(s.combos).toBe(1);
  expect(s.hits).toBeGreaterThanOrEqual(6);
  await expect(page.locator('#turn')).toHaveText('2');
  await expectNoErrors(page.errors);
});

test('C の爆発は周りの敵をまとめて巻き込む', async ({ page }) => {
  // C をゴーレムの横へ動かし、A を当てる
  await place(page, 'C', 400, 520);
  await place(page, 'A', 400, 650);
  await pullUnit(page, 'A', 0, 60);           // 下へ引く → 上へ撃つ
  await page.waitForFunction(() => window.__ms.battle.stats.combos > 0);
  const golem = await page.evaluate(() => window.__ms.battle.enemy('w1-golem').hp);
  expect(golem).toBeLessThanOrEqual(12000 - 2500);
  await waitPhase(page, 'ready');
  await expectNoErrors(page.errors);
});
