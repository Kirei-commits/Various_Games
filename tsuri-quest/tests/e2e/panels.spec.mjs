import { test, expect } from '@playwright/test';
import { open, stateOf, catchOne } from './fixtures.mjs';

test('タブを切り替えると対応するパネルだけが出る', async ({ page }) => {
  await open(page);
  const names = ['dex', 'shop', 'angler', 'records', 'achievements'];
  for (const name of names) {
    await page.locator('#tab-' + name).click();
    await expect(page.locator('#panel-' + name)).toBeVisible();
    await expect(page.locator('#tab-' + name)).toHaveAttribute('aria-selected', 'true');
    for (const other of names.filter((n) => n !== name)) {
      await expect(page.locator('#panel-' + other)).toBeHidden();
    }
  }
});

test('図鑑は未取得を伏せ、釣った魚だけ中身を見せる', async ({ page }) => {
  await open(page, { seed: 42 });
  await expect(page.locator('.dex-card.locked h3').first()).toHaveText('？？？');

  await catchOne(page);
  const id = (await stateOf(page)).records[0].id;
  const card = page.locator(`[data-fish="${id}"]`);
  await expect(card).not.toHaveClass(/locked/);
  await expect(card.locator('h3')).not.toHaveText('？？？');
  await expect(card).toContainText('釣った数');
  await expect(card).toContainText('最大');
});

test('記録は空のときにその旨を出し、釣ると並ぶ', async ({ page }) => {
  await open(page, { seed: 42 });
  await page.locator('#tab-records').click();
  await expect(page.locator('.empty')).toBeVisible();

  await catchOne(page);
  await expect(page.locator('.record')).toHaveCount(1);
  await expect(page.locator('.stat').filter({ hasText: '釣り上げ' })).toContainText('1 匹');
  await expect(page.locator('.stat').filter({ hasText: '成功率' })).toContainText('100 %');
});

test('実績は全件並び、達成すると印が変わる', async ({ page }) => {
  await open(page, { seed: 42 });
  await page.locator('#tab-achievements').click();
  const total = await page.evaluate(() => window.FQ.Achievements.LIST.length);
  await expect(page.locator('.ach')).toHaveCount(total);
  await expect(page.locator('.ach.done')).toHaveCount(0);

  await catchOne(page);
  await expect(page.locator('[data-ach="first"]')).toHaveClass(/done/);
  await expect(page.locator('#hud-title')).toHaveText('見習い釣り師');
});

test('時間帯と天候の表示が状態と一致する', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.FQ.app.debug.setClock(23 * 60);
    window.FQ.app.debug.setWeather('storm');
  });
  await expect(page.locator('#hud-env')).toHaveText('🌙 23:00 ⛈️');
  await expect(page.locator('#hud-env')).toHaveAttribute('title', '夜 / 嵐');

  await page.evaluate(() => {
    window.FQ.app.debug.setClock(5 * 60);
    window.FQ.app.debug.setWeather('sunny');
  });
  await expect(page.locator('#hud-env')).toHaveText('🌅 05:00 ☀️');
});

test('釣り人パネルに恩恵と「つぎのレベルで」が並ぶ', async ({ page }) => {
  await open(page);
  await page.locator('#tab-angler').click();
  await expect(page.locator('#angler-count')).toHaveText('Lv.1 / 20');
  await expect(page.locator('#perk-list .perk')).toHaveCount(5);
  await expect(page.locator('#perk-next .perk')).toHaveCount(5);

  await page.evaluate(() => window.FQ.app.debug.setAnglerXp(12));
  await expect(page.locator('#angler-count')).toHaveText('Lv.12 / 20');
  await expect(page.locator('#hud-angler')).toHaveText('Lv.12');

  await page.evaluate(() => window.FQ.app.debug.setAnglerXp(20));
  await expect(page.locator('#perk-next .maxed')).toBeVisible();
});

test('効果音の切り替えが表示に反映される', async ({ page }) => {
  await open(page);
  await expect(page.locator('#btn-sound')).toHaveText('🔊');
  await page.locator('#btn-sound').click();
  await expect(page.locator('#btn-sound')).toHaveText('🔇');
  expect(await page.evaluate(() => window.FQ.Sfx.isEnabled())).toBe(false);
});
