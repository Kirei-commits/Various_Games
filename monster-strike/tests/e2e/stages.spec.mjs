/**
 * 追加の3ステージ（火山・神殿・古城）。どれも始めて1発撃てて、ウェーブを進めてもエラーが出ない。
 */
import { test, expect } from '@playwright/test';
import { open, pullUnit, waitPhase, expectNoErrors } from './fixtures.mjs';

for (const [stage, name, boss] of [[2, 'ほのおの火山', 'フレイムドラゴン'], [3, 'こおりの神殿', 'こおりの王'], [4, 'やみの古城', 'ダークドラゴン']]) {
  test(`${name}: 1発撃ててターンが進み、ボスのウェーブまで行ける`, async ({ page }) => {
    const errors = await open(page, stage);
    await page.evaluate(() => window.__ms.setTimeScale(4));
    await pullUnit(page, await page.evaluate(() => window.__ms.active), 0, 80);
    await waitPhase(page, 'ready');
    await expect(page.locator('#turn')).toHaveText('2');
    for (let wave = 0; wave < 2; wave++) {
      await page.evaluate(() => { const { battle, world } = window.__ms; for (const e of battle.alive()) battle.kill(e.id, world); });
      await pullUnit(page, await page.evaluate(() => window.__ms.active), 0, -20);
      await waitPhase(page, 'ready');
    }
    await expect(page.locator('#wave')).toHaveText('3/3');
    expect(await page.evaluate(() => window.__ms.battle.alive().find((e) => e.def.boss).def.name)).toBe(boss);
    await expectNoErrors(errors);
  });
}

test('タイトルに5つのステージがあり、クリアしたステージには CLEAR が付く', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  await expect(page.locator('#stage-list button')).toHaveCount(5);
  await expect(page.locator('#stage-2.cleared')).toHaveCount(0);
  await page.evaluate(() => { window.__ms.save.cleared.s2 = true; });
  await page.locator('#btn-gacha').click();
  await page.locator('#btn-gacha-back').click();
  await expect(page.locator('#stage-2.cleared')).toHaveCount(1);
});
