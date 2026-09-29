/**
 * 指での操作だけを検証する。mobile プロジェクト（hasTouch）でのみ走る。
 */
import { test, expect } from '@playwright/test';
import { open, phase, body, client, waitPhase, expectNoErrors } from './fixtures.mjs';

test.skip(({ isMobile }) => !isMobile, '指での操作の検証');

/** Playwright の touchscreen は tap しかないので CDP で指を動かす。 */
async function finger(cdp, type, point) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: point.x, y: point.y }]
  });
}

test('指で引っぱって離すと発射でき、ページはスクロールしない', async ({ context, page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.__ms.setTimeScale(4));
  const cdp = await context.newCDPSession(page);
  const a = await body(page, 'A');
  const from = await client(page, a.x, a.y);
  await finger(cdp, 'touchStart', from);
  for (let i = 1; i <= 8; i++) {
    const p = await client(page, a.x + i * 3, a.y + i * 18);
    await finger(cdp, 'touchMove', p);
  }
  expect(await phase(page)).toBe('pulling');
  expect(await page.evaluate(() => window.__ms.aim)).not.toBeNull();
  await finger(cdp, 'touchEnd', from);
  expect(await phase(page)).toBe('moving');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await waitPhase(page, 'ready');
  await expect(page.locator('#turn')).toHaveText('2');
  await expectNoErrors(errors);
});
