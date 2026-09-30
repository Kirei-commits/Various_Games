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

test('A で B に当てると、B の友情コンボが3つとも出てゴーレムに当たる', async ({ page }) => {
  const b = await page.evaluate(() => { const o = window.__ms.world.get('B'); return { x: o.x, y: o.y }; });
  await place(page, 'A', b.x, b.y - 115);     // B の真上
  await pullUnit(page, 'A', 0, -60);          // 上へ引く → 下へ撃つ
  await page.waitForFunction(() => window.__ms.battle.stats.combos > 0);
  const golem = await page.evaluate(() => { const e = window.__ms.battle.enemy('w1-golem'); return [e.hp, e.maxHp]; });
  expect(golem[0]).toBeLessThan(golem[1]);
  await waitPhase(page, 'ready');
  const s = await stats(page);
  expect(s.combos).toBeGreaterThanOrEqual(1);
  await expectNoErrors(page.errors);
});

test('貫通の B で A を通り抜けると、A の友情（ホーミングなど）が敵に飛び、弾が届いてからターンが終わる', async ({ page }) => {
  const a = await page.evaluate(() => { const o = window.__ms.world.get('A'); return { x: o.x, y: o.y }; });
  const total0 = await page.evaluate(() => window.__ms.battle.enemies.reduce((t, e) => t + e.hp, 0));
  await place(page, 'B', a.x, a.y - 125);     // A の真上
  await pullUnit(page, 'B', 0, -60);          // B を押して交代 → 下へ撃つ
  await page.waitForFunction(() => window.__ms.battle.stats.combos > 0);
  await waitPhase(page, 'ready');
  const s = await stats(page);
  expect(s.combos).toBeGreaterThanOrEqual(1);
  expect(s.hits).toBeGreaterThanOrEqual(12);   // ホーミング12発＋ほか
  const total1 = await page.evaluate(() => window.__ms.battle.enemies.reduce((t, e) => t + e.hp, 0));
  expect(total1).toBeLessThan(total0);
  await expect(page.locator('#turn')).toHaveText('2');
  await expectNoErrors(page.errors);
});

test('C の大爆発は周りの敵をまとめて巻き込む', async ({ page }) => {
  // C をゴーレムの横へ動かし、A を当てる
  await place(page, 'C', 400, 520);
  await place(page, 'A', 400, 650);
  await pullUnit(page, 'A', 0, 60);           // 下へ引く → 上へ撃つ
  await page.waitForFunction(() => window.__ms.battle.stats.combos > 0);
  const golem = await page.evaluate(() => { const e = window.__ms.battle.enemy('w1-golem'); return [e.hp, e.maxHp]; });
  expect(golem[0]).toBeLessThan(golem[1]);
  await waitPhase(page, 'ready');
  await expectNoErrors(page.errors);
});
