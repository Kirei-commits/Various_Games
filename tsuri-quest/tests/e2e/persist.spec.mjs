import { test, expect } from '@playwright/test';
import { open, openGate, signUp, grant, stateOf, catchOne, reopen, ready, dismissBonus } from './fixtures.mjs';

test('進捗はリロードしても残る', async ({ page }) => {
  await open(page, { seed: 3 });
  await catchOne(page);
  const before = await stateOf(page);

  await reopen(page);                    // reset を付けずに開き直す
  const after = await stateOf(page);

  expect(after.xp).toBe(before.xp);
  expect(after.catches).toBe(before.catches);
  expect(Object.keys(after.dex)).toEqual(Object.keys(before.dex));
  expect(after.records).toHaveLength(before.records.length);
  expect(after.anglerXp).toBe(before.anglerXp);
  await expect(page.locator('.dex-card.locked')).toHaveCount(29);
});

test('効果音の設定も残る', async ({ page }) => {
  await open(page);
  await page.locator('#btn-sound').click();
  await expect(page.locator('#btn-sound')).toHaveAttribute('aria-pressed', 'false');

  await reopen(page);
  await expect(page.locator('#btn-sound')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#btn-sound')).toHaveText('🔇');
});

test('データ消去で初期状態に戻る', async ({ page }) => {
  await open(page, { seed: 3 });
  await grant(page, 5000);
  page.on('dialog', (d) => d.accept());
  await page.locator('#tab-records').click();
  await page.locator('#btn-reset').click();

  const st = await stateOf(page);
  expect(st.xp).toBe(0);
  expect(st.coins).toBe(0);
  await expect(page.locator('#hud-level')).toHaveText('Lv.1');
  await expect(page.locator('.dex-card.locked')).toHaveCount(30);
});

test('localStorage が使えなくてもゲームは動く', async ({ page }) => {
  // プライベートモードなどでは読み書きの両方が例外を投げる
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('access denied'); }
    });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/?debug=1');
  await signUp(page);
  await expect(page.locator('#action')).toHaveText('キャスト');
  await expect(page.locator('#hud-level')).toHaveText('Lv.1');
  await catchOne(page);
  expect((await stateOf(page)).catches).toBe(1);
  expect(errors).toEqual([]);
});
