/**
 * フェーズ6〜8: タイトルとステージ選択、SS ボタン、からくりの塔のギミック。
 * 撃つ操作は実際の入力で行い、内部は待ち時間の短縮（SS の残りを0にする・置き場所）だけ直接いじる。
 */
import { test, expect } from '@playwright/test';
import { open, pullUnit, waitPhase, expectNoErrors, maxHp } from './fixtures.mjs';

const place = (page, id, x, y) => page.evaluate(([id, x, y]) => { const b = window.__ms.world.get(id); b.x = x; b.y = y; }, [id, x, y]);

test('起動するとタイトルが出て、ステージを選ぶと始まる。クリア画面からステージ選択へ戻れる', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#stage-list button')).toHaveCount(10);
  await expect(page.locator('#stage-1')).toContainText('からくりの塔');
  await page.locator('#stage-1').click();
  await expect(page.locator('#title')).toBeHidden();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  await expect(page.locator('#wave')).toHaveText('1/3');
  expect(await page.evaluate(() => window.__ms.stage)).toBe(1);
  // 負けてからステージ選択へ
  await page.evaluate(() => { window.__ms.setTimeScale(4); window.__ms.battle.teamHp = 1; for (const e of window.__ms.battle.alive()) e.counter = 1; });
  await pullUnit(page, 'A', 0, 30);
  await expect(page.locator('#result')).toBeVisible({ timeout: 20000 });
  await page.locator('#btn-stages').click();
  await expect(page.locator('#title')).toBeVisible();
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  await expect(page.locator('#wave')).toHaveText('1/2');
  expect(errors).toEqual([]);
});

test('SS ボタン: 溜まるまでは押せず、押すと次の一発が SS になって残りが元に戻る', async ({ page }) => {
  page.errors = await open(page);
  const ss = page.locator('#btn-ss');
  await expect(ss).toHaveText('SS あと8');
  await expect(ss).toBeDisabled();
  await page.evaluate(() => { window.__ms.setTimeScale(4); window.__ms.battle.us.A.ssLeft = 0; window.__ms.refresh(); });
  await expect(ss).toHaveText('SS 使える');
  await ss.click();
  await expect(ss).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__ms.ssArmed)).toBe(true);
  // 別のキャラに持ちかえると解除される
  await pullUnit(page, 'B', 0, 0, { release: false });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__ms.ssArmed)).toBe(false);
  await pullUnit(page, 'A', 0, 0, { release: false });
  await page.mouse.up();
  await ss.click();
  await pullUnit(page, 'A', 30, 100);
  await waitPhase(page, 'ready');
  const r = await page.evaluate(() => ({ ss: window.__ms.battle.stats.ss, left: window.__ms.battle.us.A.ssLeft, armed: window.__ms.ssArmed }));
  expect(r).toEqual({ ss: 1, left: 8 - 1, armed: false });
  await expectNoErrors(page.errors);
});

test('からくりの塔: 地雷を踏むとチームのHPが減り、アンチブロックの C はブロックを通り抜ける', async ({ page }) => {
  page.errors = await open(page, 1);
  await page.evaluate(() => window.__ms.setTimeScale(3));
  // C を左のブロックと地雷の真下へ
  await place(page, 'C', 200, 620);
  await pullUnit(page, 'C', 0, 40);           // 下へ引く → 上へ
  await waitPhase(page, 'ready');
  const s = await page.evaluate(() => ({ ...window.__ms.battle.stats }));
  expect(s.mines).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#hp-text')).toHaveText(`${(await maxHp(page)) - 1200 * s.mines} / ${await maxHp(page)}`);
  await expectNoErrors(page.errors);
});
