/**
 * オフラインでも開けること。
 *
 * 実行時の依存パッケージがゼロで、配るものが決まっているからこそできる。
 * **入れたつもりで欠けているファイルがあると、ここで白紙になる。**
 */
import { test, expect } from '@playwright/test';

test('Service Worker を入れたあとは、回線が無くても開いて遊べる', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto('/?seed=7&speed=8&sound=off&fresh=1&help=off');
  await expect(page.locator('#fields .field')).toHaveCount(12);

  // 登録が終わって、配るものがキャッシュに入るまで待つ
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(async () => page.evaluate(async () => {
    const names = await caches.keys();
    if (!names.length) return 0;
    const c = await caches.open(names[0]);
    return (await c.keys()).length;
  }), { timeout: 10000 }).toBeGreaterThanOrEqual(10);

  // 回線を落として開き直す
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#fields .field')).toHaveCount(12);

  // 遊べること（絵が出るだけでは足りない）
  await page.locator('.field').first().click();
  expect(await page.evaluate(() => window.GF.game.state.fields[0].crop)).toBeTruthy();
  expect(errors).toEqual([]);

  await context.setOffline(false);
});

test('スマホの画面に置くための宣言がそろっている', async ({ page }) => {
  await page.goto('/?help=off&sw=off');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('manifest.webmanifest');

  const man = await page.evaluate(async (h) => (await fetch(h)).json(), href);
  expect(man.display).toBe('standalone');
  expect(man.orientation).toBe('portrait');
  expect(man.icons.length).toBeGreaterThan(0);

  // アイコンが本当に取れる（マニフェストにあるのに404、が起きやすい）
  for (const icon of man.icons) {
    const res = await page.request.get(new URL(icon.src, page.url()).href);
    expect(res.status(), icon.src).toBe(200);
  }
});
