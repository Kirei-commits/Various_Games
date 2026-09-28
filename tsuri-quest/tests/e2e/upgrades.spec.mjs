/**
 * ブーストアイテム・パーツ・管理者コードの検証。
 * どれも「買う → 使う／装備する → 実際に効いている」までを見る。
 */
import { test, expect } from '@playwright/test';
import { open, tap, grant, stateOf, waitPhase, openShop } from './fixtures.mjs';

test.beforeEach(async ({ page }) => {
  await open(page);
  await openShop(page);
});

test('ブーストは買って使うと効果が出て、キャストごとに減る', async ({ page }) => {
  await grant(page, 5000);
  await openShop(page);
  await page.locator('[data-buy-boost="boost_point"][data-count="1"]').click();
  expect((await stateOf(page)).boostStock.boost_point).toBe(1);

  await page.locator('[data-use-boost="boost_point"]').click();
  const item = await page.evaluate(() => window.FQ.Boost.byId('boost_point'));
  const st = await stateOf(page);
  expect(st.boostStock.boost_point).toBe(0);
  expect(st.boostActive.boost_point).toBe(item.casts);
  await expect(page.locator('#hud-boost')).toBeVisible();

  // 効果が Tackle に乗っている
  const mul = await page.evaluate(() =>
    window.FQ.Tackle.resolve(window.FQ.app.state, window.FQ.World.weatherOf('sunny')).pointMul);
  expect(mul).toBe(2);

  // キャストすると1つ減る
  await tap(page);
  await waitPhase(page, 'waiting');
  expect((await stateOf(page)).boostActive.boost_point).toBe(item.casts - 1);
});

test('持っていないブーストは使えない', async ({ page }) => {
  await expect(page.locator('[data-use-boost="boost_rare"]')).toBeDisabled();
});

test('ブーストが切れると効果も消える', async ({ page }) => {
  await grant(page, 5000);
  await openShop(page);
  await page.locator('[data-buy-boost="boost_point"][data-count="1"]').click();
  await page.locator('[data-use-boost="boost_point"]').click();

  // 残り1キャストの状態にしてから投げる
  await page.evaluate(() => {
    window.FQ.app.state.boostActive.boost_point = 1;
    window.FQ.app.render();
  });
  await tap(page);
  await waitPhase(page, 'waiting');
  const st = await stateOf(page);
  expect(st.boostActive.boost_point).toBe(undefined);
  await expect(page.locator('#hud-boost')).toBeHidden();
});

test('パーツを買うとその場で装備され、見た目と性能が変わる', async ({ page }) => {
  await grant(page, 20000);
  await openShop(page);

  const before = await page.evaluate(() =>
    window.FQ.Tackle.resolve(window.FQ.app.state, window.FQ.World.weatherOf('sunny')).reelMul);

  await page.locator('[data-buy-part="reel_power"]').click();
  const st = await stateOf(page);
  expect(st.ownedParts).toContain('reel_power');
  expect(st.parts.reel).toBe('reel_power');
  await expect(page.locator('[data-part="reel_power"] [data-equip-part]')).toHaveText('装備中');
  await expect(page.locator('#hint')).toContainText('パワーギア');

  const after = await page.evaluate(() =>
    window.FQ.Tackle.resolve(window.FQ.app.state, window.FQ.World.weatherOf('sunny')).reelMul);
  expect(after).toBeGreaterThan(before);
});

test('買ったパーツは持ち替えられる', async ({ page }) => {
  await grant(page, 20000);
  await openShop(page);
  await page.locator('[data-buy-part="reel_power"]').click();
  await page.locator('[data-buy-part="reel_light"]').click();
  expect((await stateOf(page)).parts.reel).toBe('reel_light');

  await page.locator('[data-part="reel_power"] [data-equip-part]').click();
  expect((await stateOf(page)).parts.reel).toBe('reel_power');
  await expect(page.locator('[data-part="reel_light"] [data-equip-part]')).toHaveText('装備する');
});

test('ウキを変えると合わせの猶予が伸びる', async ({ page }) => {
  await grant(page, 20000);
  await openShop(page);
  const before = await page.evaluate(() =>
    window.FQ.Tackle.resolve(window.FQ.app.state, window.FQ.World.weatherOf('sunny')).biteBonusMs);
  await page.locator('[data-buy-part="float_gold"]').click();
  const after = await page.evaluate(() =>
    window.FQ.Tackle.resolve(window.FQ.app.state, window.FQ.World.weatherOf('sunny')).biteBonusMs);
  expect(after).toBeGreaterThan(before);
});

test('パーツを6つ買うと実績「洒落者」が解除される', async ({ page }) => {
  await grant(page, 40000);
  await openShop(page);
  for (const id of ['reel_light', 'reel_power', 'float_lemon', 'float_aqua', 'skin_black', 'skin_cherry']) {
    await page.locator(`[data-buy-part="${id}"]`).click();
  }
  expect((await stateOf(page)).achievements).toContain('dressed');
  await page.locator('#tab-achievements').click();
  await expect(page.locator('[data-ach="dressed"]')).toHaveClass(/done/);
});

test('コード "aaa" を入れると全商品が0円になる', async ({ page }) => {
  await page.evaluate(() => { window.FQ.app.state.coins = 0; window.FQ.app.render(); });
  await openShop(page);
  await expect(page.locator('[data-buy="chum"][data-count="1"]')).toBeDisabled();
  await expect(page.locator('#admin-state')).toBeHidden();

  await page.locator('#admin-code').fill('aaa');
  await page.locator('#btn-admin').click();

  await expect(page.locator('#admin-state')).toBeVisible();
  await expect(page.locator('#form-admin')).toBeHidden();
  expect((await stateOf(page)).admin).toBe(true);

  // 値段の表示が 0P になり、所持ポイント0でも買える
  await expect(page.locator('[data-buy="chum"][data-count="1"]')).toHaveText('×1  0P');
  await expect(page.locator('[data-buy="chum"][data-count="1"]')).toBeEnabled();
  await page.locator('[data-buy="chum"][data-count="10"]').click();
  const st = await stateOf(page);
  expect(st.lures.chum).toBe(10);
  expect(st.coins).toBe(0);

  // 竿・糸・ブースト・パーツも0円
  await page.locator('#upgrade-rod').click();
  await page.locator('#upgrade-line').click();
  await page.locator('[data-buy-boost="boost_rare"][data-count="5"]').click();
  await page.locator('[data-buy-part="reel_legend"]').click();
  const st2 = await stateOf(page);
  expect(st2.rod).toBe(2);
  expect(st2.line).toBe(2);
  expect(st2.boostStock.boost_rare).toBe(5);
  expect(st2.ownedParts).toContain('reel_legend');
  expect(st2.coins).toBe(0);
});

test('間違ったコードでは何も起きない', async ({ page }) => {
  await page.locator('#admin-code').fill('bbb');
  await page.locator('#btn-admin').click();
  await expect(page.locator('#admin-state')).toBeHidden();
  expect((await stateOf(page)).admin).toBe(false);
});

test('管理者モードは解除でき、リロードしても状態が残る', async ({ page }) => {
  await page.locator('#admin-code').fill('aaa');
  await page.locator('#btn-admin').click();
  await expect(page.locator('#admin-state')).toBeVisible();

  await page.goto('/?debug=1');
  await expect(page.locator('#action')).toBeVisible();
  await openShop(page);
  await expect(page.locator('#admin-state')).toBeVisible();

  await page.locator('#btn-admin-off').click();
  await expect(page.locator('#admin-state')).toBeHidden();
  await expect(page.locator('#form-admin')).toBeVisible();
  expect((await stateOf(page)).admin).toBe(false);
});
