import { test, expect } from '@playwright/test';

/** 決まった seed で開いてスタートする */
async function open(page, seed = 3) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?seed=${seed}`);
  await expect(page.locator('#ovStart')).toBeVisible();
  return errors;
}
async function start(page) {
  await page.locator('#btnStart').click();
  await expect(page.locator('#ovStart')).toBeHidden();
}
const state = (page) => page.evaluate(() => {
  const g = cosmo.game.state;
  return { status: g.status, balls: g.balls.length, merges: g.merges, maxTier: g.maxTier, time: g.time };
});

test('スタート画面から始まり、星が落ちてきて合体が進む', async ({ page }) => {
  const errors = await open(page);
  // スタート前は進まない
  await page.waitForTimeout(400);
  expect((await state(page)).time).toBe(0);
  await start(page);
  await expect.poll(async () => (await state(page)).balls, { timeout: 5000 }).toBeGreaterThan(1);
  await page.evaluate(() => cosmo.advance(20));
  const s = await state(page);
  expect(s.merges).toBeGreaterThan(10);
  expect(s.maxTier).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#hudMerges')).toHaveText(String(s.merges));
  await expect(page.locator('#hudTime')).toHaveText(/^0:2\d$/);
  expect(errors).toEqual([]);
});

test('段階の一覧表：8つ並び、出てきた段階だけ光る', async ({ page }) => {
  await open(page);
  const tiers = page.locator('#tiers .tier');
  await expect(tiers).toHaveCount(8);
  await expect(tiers.locator('span')).toHaveText(['岩のかけら', '月', '水星', '火星', '地球', '土星', '木星', '太陽']);
  await start(page);
  await page.evaluate(() => cosmo.advance(12));
  const max = (await state(page)).maxTier;
  for (let i = 0; i < 8; i++) {
    if (i < max) await expect(tiers.nth(i)).toHaveClass(/reached/);
    else await expect(tiers.nth(i)).not.toHaveClass(/reached/);
  }
  await expect(page.locator('#hudMax')).not.toHaveText('—');
});

test('太陽が生まれるとクリア画面が出て、もう一度で最初から', async ({ page }) => {
  const errors = await open(page);
  await start(page);
  // 筒からの星を止めて、木星2つをくっつけて置く
  await page.evaluate(() => { cosmo.game.state.spawnTimer = Infinity; cosmo.place(7, -0.284, 0.6); cosmo.place(7, 0.284, 0.6); });
  await page.evaluate(() => cosmo.advance(2.5));
  expect((await state(page)).status).toBe('clear');
  await expect(page.locator('#ovClear')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('#tiers .tier').nth(7)).toHaveClass(/reached/);
  await page.locator('#btnAgainClear').click();
  await expect(page.locator('#ovClear')).toBeHidden();
  const s = await state(page);
  expect(s.status).toBe('running');
  expect(s.merges).toBe(0);
  expect(errors).toEqual([]);
});

test('ラインより上で止まり続けるとゲームオーバー画面が出る', async ({ page }) => {
  await open(page);
  await start(page);
  // 合体を止めて容器をあふれさせる
  await page.evaluate(() => {
    cosmo.game.state.opt.merge = false;
    for (let i = 0; i < 400 && cosmo.game.state.status === 'running'; i++) cosmo.advance(0.5);
  });
  expect((await state(page)).status).toBe('over');
  await expect(page.locator('#ovOver')).toBeVisible({ timeout: 4000 });
  await page.locator('#btnAgainOver').click();
  await expect(page.locator('#ovOver')).toBeHidden();
  expect((await state(page)).status).toBe('running');
});

test('容器をタップすると周りの星が弾き飛ぶ', async ({ page }) => {
  await open(page);
  await start(page);
  await page.evaluate(() => { cosmo.game.state.spawnTimer = Infinity; cosmo.place(3, 0.2, 0.7); cosmo.advance(1.5); });
  const before = await page.evaluate(() => { const b = cosmo.game.state.balls[0]; return { x: b.x, y: b.y }; });
  const pt = await page.evaluate(({ x, y }) => cosmo.toScreen(x - 0.15, y + 0.05), before);
  await page.mouse.click(pt.x, pt.y);
  await page.evaluate(() => cosmo.advance(0.15));
  const after = await page.evaluate(() => { const b = cosmo.game.state.balls[0]; return { x: b.x, y: b.y }; });
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.05);
});

test('シャッフル・速度・リスタート・消音のボタン', async ({ page }) => {
  await open(page);
  await start(page);
  await page.evaluate(() => { cosmo.game.state.spawnTimer = Infinity; for (let i = 0; i < 4; i++) cosmo.place(i + 1, -0.5 + i * 0.33, 0.6); cosmo.advance(2); });
  const ys = await page.evaluate(() => cosmo.game.state.balls.map((b) => b.y));
  await page.locator('#btnShuffle').click();
  await page.evaluate(() => cosmo.advance(0.1));
  const ys2 = await page.evaluate(() => cosmo.game.state.balls.map((b) => b.y));
  expect(ys2.filter((y, i) => y < ys[i] - 0.02).length).toBeGreaterThanOrEqual(3);

  const speed = page.locator('#btnSpeed');
  await expect(speed).toHaveText('1x');
  await speed.click(); await expect(speed).toHaveText('2x');
  await speed.click(); await expect(speed).toHaveText('4x');
  await speed.click(); await expect(speed).toHaveText('1x');

  await page.locator('#btnMute').click();
  expect(await page.evaluate(() => cosmo.muted)).toBe(true);
  await expect(page.locator('#btnMute')).toHaveText('🔇');

  await page.evaluate(() => cosmo.advance(3));
  expect(await page.locator('#tiers .tier.reached').count()).toBeGreaterThan(1);
  await page.locator('#btnRestart').click();
  // ゲームは動き続けるので、状態と一覧表は同じ瞬間に読む
  const s = await page.evaluate(() => ({
    time: cosmo.game.state.time, merges: cosmo.game.state.merges, maxTier: cosmo.game.state.maxTier,
    lit: document.querySelectorAll('#tiers .tier.reached').length
  }));
  expect(s.time).toBeLessThan(0.5);
  expect(s.merges).toBe(0);
  expect(s.lit).toBe(s.maxTier);
});

test('4倍速にすると、同じ実時間でゲーム内の時間が速く進む', async ({ page }) => {
  await open(page);
  await start(page);
  const t0 = (await state(page)).time;
  await page.waitForTimeout(1000);
  const d1 = (await state(page)).time - t0;
  await page.locator('#btnSpeed').click();
  await page.locator('#btnSpeed').click(); // 4x
  const t1 = (await state(page)).time;
  await page.waitForTimeout(1000);
  const d4 = (await state(page)).time - t1;
  expect(d4).toBeGreaterThan(d1 * 2);
});

test('画面からはみ出さず、容器が画面の中に収まる', async ({ page }) => {
  await open(page);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
    w: innerWidth, h: innerHeight,
    view: { S: cosmo.view.S, cx: cosmo.view.cx, w: cosmo.view.w }
  }));
  expect(m.sw).toBeLessThanOrEqual(m.w);
  expect(m.sh).toBeLessThanOrEqual(m.h);
  expect(m.view.cx - m.view.S).toBeGreaterThanOrEqual(0);
  expect(m.view.cx + m.view.S).toBeLessThanOrEqual(m.view.w);
  expect(m.view.S).toBeGreaterThan(80);
  for (const id of ['#btnShuffle', '#btnSpeed', '#btnRestart', '#btnMute']) await expect(page.locator(id)).toBeInViewport();
});
