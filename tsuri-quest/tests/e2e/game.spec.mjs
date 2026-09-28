import { test, expect } from '@playwright/test';
import { open, tap, phase, stateOf, waitPhase, castToBite, catchOne } from './fixtures.mjs';

test('初回は Lv.1 で、図鑑はすべて未取得', async ({ page }) => {
  await open(page);
  await expect(page.locator('#hud-level')).toHaveText('Lv.1');
  await expect(page.locator('#hud-angler')).toHaveText('Lv.1');
  await expect(page.locator('#action')).toHaveText('キャスト');
  await expect(page.locator('#status')).toContainText('キャスト');

  const total = await page.evaluate(() => window.FQ.Fish.count);
  expect(total).toBe(30);
  await expect(page.locator('.dex-card')).toHaveCount(total);
  await expect(page.locator('.dex-card.locked')).toHaveCount(total);
  await expect(page.locator('#dex-count')).toHaveText('0 / 30');

  const st = await stateOf(page);
  expect(st.xp).toBe(0);
  expect(st.catches).toBe(0);
});

test('キャストすると仕掛けが飛び、やがて当たりが出る', async ({ page }) => {
  await open(page);
  await tap(page);
  expect(await phase(page)).toBe('casting');
  await waitPhase(page, 'waiting');
  await expect(page.locator('#status')).toContainText('アタリを待つ');
  await page.evaluate(() => window.FQ.app.debug.skipWait());
  await waitPhase(page, 'bite');
  await expect(page.locator('#action')).toHaveText('合わせる！');
  await expect(page.locator('#status')).toContainText('合わせろ');
});

test('1匹釣るとポイント・図鑑・記録・コンボがまとめて更新される', async ({ page }) => {
  await open(page, { seed: 42 });
  expect(await catchOne(page)).toBe('landed');

  const st = await stateOf(page);
  expect(st.catches).toBe(1);
  expect(st.combo).toBe(1);
  expect(st.xp).toBeGreaterThan(0);
  expect(st.anglerXp).toBeGreaterThan(0);
  expect(Object.keys(st.dex)).toHaveLength(1);
  expect(st.records).toHaveLength(1);

  await expect(page.locator('#hud-coins')).not.toHaveText('0');
  await expect(page.locator('#hud-combo')).toHaveText('🔥 1');
  await expect(page.locator('#dex-count')).toHaveText('1 / 30');
  await expect(page.locator('.dex-card.locked')).toHaveCount(29);
  await page.locator('#tab-records').click();
  await expect(page.locator('.record')).toHaveCount(1);
});

test('ファイト中はテンションと取り込みのゲージが出る', async ({ page }) => {
  await open(page);
  await castToBite(page);
  await tap(page);
  await waitPhase(page, 'fight');
  await expect(page.locator('#gauges')).toBeVisible();
  await expect(page.locator('#action')).toHaveText('押し続けて巻く');

  // 危険域の帯が、いま使っている糸の限界の位置から始まっている
  const left = await page.locator('#tension-danger').evaluate((el) => parseFloat(el.style.left));
  const breakAt = await page.evaluate(() => window.FQ.Gear.line(window.FQ.app.state.line).breakAt);
  expect(left).toBeCloseTo(breakAt * 100, 1);
});

test('早合わせは失敗し、理由が表示される', async ({ page }) => {
  await open(page);
  await tap(page);
  await waitPhase(page, 'waiting');
  await tap(page);
  await waitPhase(page, 'result');
  expect(await page.evaluate(() => window.FQ.app.game.state.result.reason)).toBe('early');
  await expect(page.locator('#status')).toContainText('早すぎた');
  expect((await stateOf(page)).misses).toBe(1);
});

test('合わせ遅れは失敗する', async ({ page }) => {
  await open(page);
  await castToBite(page, { hold: false });   // 猶予そのものを見たいので伸ばさない
  await waitPhase(page, 'result');
  expect(await page.evaluate(() => window.FQ.app.game.state.result.reason)).toBe('late');
  await expect(page.locator('#status')).toContainText('遅かった');
});

test('巻きっぱなしはラインブレイクになる', async ({ page }) => {
  await open(page);
  await castToBite(page);
  await tap(page);
  await waitPhase(page, 'fight');
  const box = await page.locator('#action').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await waitPhase(page, 'result');
  await page.mouse.up();
  expect(await page.evaluate(() => window.FQ.app.game.state.result.reason)).toBe('break');
  await expect(page.locator('#status')).toContainText('ラインブレイク');
});

test('バラすとコンボが0に戻る', async ({ page }) => {
  await open(page, { seed: 7 });
  expect(await catchOne(page)).toBe('landed');
  expect((await stateOf(page)).combo).toBe(1);

  await tap(page);                        // キャスト
  await waitPhase(page, 'waiting');
  await tap(page);                        // 早合わせでバラす
  await waitPhase(page, 'result');
  expect((await stateOf(page)).combo).toBe(0);
  await expect(page.locator('#hud-combo')).toHaveText('🔥 0');
});

test('キャストのたびに時計が進み、天気が移り変わる', async ({ page }) => {
  await open(page);
  const before = await page.locator('#hud-env').textContent();
  for (let i = 0; i < 8; i++) {
    await tap(page);
    await waitPhase(page, 'waiting');
    await page.evaluate(() => window.FQ.app.debug.skipWait());
    await waitPhase(page, 'result');      // 合わせずにバラす
    await tap(page);
    await waitPhase(page, 'idle');
  }
  const after = await page.locator('#hud-env').textContent();
  expect(after).not.toBe(before);
  expect((await stateOf(page)).casts).toBe(8);
});

test('スペースキーでも操作できる', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Space');
  expect(await phase(page)).toBe('casting');
});

test('レベルが上がると通知が出て、表示が変わる', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.FQ.app.debug.setLevelXp(9));
  await expect(page.locator('#hud-level')).toHaveText('Lv.9');
  await page.evaluate(() => {
    const need = window.FQ.Progress.req(9);
    window.FQ.app.debug.grant(need);
  });
  await expect(page.locator('#hud-level')).toHaveText('Lv.10');
});
