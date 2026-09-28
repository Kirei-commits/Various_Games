/**
 * 指での操作だけを検証する。mobile プロジェクト（hasTouch）でのみ走る。
 * マウスでは通ってしまう不具合（当たり判定・スクロール・押しっぱなし）を拾うのが目的。
 */
import { test, expect } from '@playwright/test';
import { open, phase, stateOf, waitPhase } from './fixtures.mjs';

test.skip(({ isMobile }) => !isMobile, '指での操作の検証');

async function centerOf(page, selector) {
  const box = await page.locator(selector).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 指を置く／離す。Playwright の touchscreen は tap しかないので CDP を使う。 */
async function finger(cdp, type, point) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: point.x, y: point.y }]
  });
}

test('指でタップするとキャストできる', async ({ page }) => {
  await open(page);
  const p = await centerOf(page, '#action');
  await page.touchscreen.tap(p.x, p.y);
  expect(await phase(page)).toBe('casting');
});

test('釣り場を直接タップしても操作できる', async ({ page }) => {
  await open(page);
  const p = await centerOf(page, '#scene');
  await page.touchscreen.tap(p.x, p.y);
  expect(await phase(page)).toBe('casting');
});

test('指を置いたままにすれば巻き取れ、離せば緩む', async ({ context, page }) => {
  await open(page, { seed: 42 });
  const cdp = await context.newCDPSession(page);
  const p = await centerOf(page, '#action');

  await page.touchscreen.tap(p.x, p.y);            // キャスト
  await waitPhase(page, 'waiting');
  await page.evaluate(() => window.FQ.app.debug.skipWait());
  await waitPhase(page, 'bite');
  await page.touchscreen.tap(p.x, p.y);            // 合わせ
  await waitPhase(page, 'fight');

  for (let i = 0; i < 80; i++) {
    if (await phase(page) !== 'fight') break;
    await finger(cdp, 'touchStart', p);
    await page.waitForFunction(() => {
      const s = window.FQ.app.game.state;
      return s.phase !== 'fight' || s.tension >= s.breakAt - 0.18;
    }, null, { polling: 16, timeout: 20000 });
    await finger(cdp, 'touchEnd', p);
    if (await phase(page) !== 'fight') break;
    await page.waitForFunction(() => {
      const s = window.FQ.app.game.state;
      return s.phase !== 'fight' || s.tension <= 0.22;
    }, null, { polling: 16, timeout: 20000 });
  }

  await waitPhase(page, 'result');
  expect(await page.evaluate(() => window.FQ.app.game.state.result.ok)).toBe(true);
  expect((await stateOf(page)).catches).toBe(1);
});

test('指を離し損ねてもフォーカスを失えば巻きが止まる', async ({ context, page }) => {
  await open(page);
  const cdp = await context.newCDPSession(page);
  const p = await centerOf(page, '#action');

  await page.touchscreen.tap(p.x, p.y);
  await waitPhase(page, 'waiting');
  await page.evaluate(() => window.FQ.app.debug.skipWait());
  await waitPhase(page, 'bite');
  await page.touchscreen.tap(p.x, p.y);
  await waitPhase(page, 'fight');

  await finger(cdp, 'touchStart', p);
  await page.waitForFunction(() => window.FQ.app.game.state.tension > 0.4, null, { polling: 16 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => window.FQ.app.game.state.reeling)).toBe(false);
  await finger(cdp, 'touchEnd', p);
});

test('釣り場を指でなぞってもページがスクロールしない', async ({ context, page }) => {
  await open(page);
  // パネルが下にあるので、そもそもスクロールできる高さがある
  const scrollable = await page.evaluate(() =>
    document.documentElement.scrollHeight > window.innerHeight);
  expect(scrollable, 'ページが1画面に収まっていて検証にならない').toBe(true);

  const touchAction = await page.locator('#scene').evaluate((el) => getComputedStyle(el).touchAction);
  expect(touchAction).toBe('none');

  const cdp = await context.newCDPSession(page);
  const p = await centerOf(page, '#scene');
  await finger(cdp, 'touchStart', p);
  for (let dy = 20; dy <= 120; dy += 20) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: p.x, y: p.y - dy }]
    });
  }
  await finger(cdp, 'touchEnd', p);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('スマホ幅でもメインボタンが十分な大きさで1画面目にある', async ({ page }) => {
  await open(page);
  const box = await page.locator('#action').boundingBox();
  const vp = page.viewportSize();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThan(vp.width * 0.6);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
});
