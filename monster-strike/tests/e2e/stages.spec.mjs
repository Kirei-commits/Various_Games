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
    const waves = await page.evaluate(() => window.__ms.battle.stage.waves.length);
    const bossWave = await page.evaluate(() => window.__ms.battle.stage.waves.findIndex((w) => w.enemies.some((e) => e.boss)));
    for (let wave = 0; wave < bossWave; wave++) {
      await page.evaluate(() => { const { battle, world } = window.__ms; for (const e of battle.alive()) battle.kill(e.id, world); });
      await pullUnit(page, await page.evaluate(() => window.__ms.active), 0, -20);
      await waitPhase(page, 'ready');
    }
    await expect(page.locator('#wave')).toHaveText(`${bossWave + 1}/${waves}`);
    expect(await page.evaluate(() => window.__ms.battle.alive().find((e) => e.def.boss).def.name)).toBe(boss);
    await expectNoErrors(errors);
  });
}

test('タイトルに10のステージがあり、クリアしたステージには CLEAR が付く', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  await expect(page.locator('#stage-list button')).toHaveCount(10);
  await expect(page.locator('#stage-2.cleared')).toHaveCount(0);
  await page.evaluate(() => { window.__ms.save.cleared.s2 = true; });
  await page.locator('#btn-gacha').click();
  await page.locator('#btn-gacha-back').click();
  await expect(page.locator('#stage-2.cleared')).toHaveCount(1);
});

test('ゲージが2本あるボスは、1本目を削ると逃げて次のバトルでまた戦い、最後に倒すとクリア', async ({ page }) => {
  const errors = await open(page, 4);
  await page.evaluate(() => window.__ms.setTimeScale(4));
  const next = async () => {
    await pullUnit(page, await page.evaluate(() => window.__ms.active), 0, -20);
  };
  // ボスのバトルまで進める
  for (let wave = 0; wave < 2; wave++) {
    await page.evaluate(() => { const { battle, world } = window.__ms; for (const e of battle.alive()) battle.kill(e.id, world); });
    await next();
    await waitPhase(page, 'ready');
  }
  const boss1 = await page.evaluate(() => window.__ms.battle.alive().find((e) => e.def.boss).def);
  expect([boss1.phase, boss1.phases]).toEqual([1, 2]);
  // 1本目: ボスにダメージを入れて倒す（残りの敵も倒す）
  await page.evaluate(() => { const { battle, world } = window.__ms; for (const e of battle.alive()) battle.kill(e.id, world); });
  await next();
  await waitPhase(page, 'ready');
  const boss2 = await page.evaluate(() => window.__ms.battle.alive().find((e) => e.def.boss).def);
  expect([boss2.name, boss2.phase]).toEqual([boss1.name, 2]);
  await expect(page.locator('#wave')).toHaveText('4/4');
  await page.evaluate(() => { const { battle, world } = window.__ms; for (const e of battle.alive()) battle.kill(e.id, world); });
  await next();
  await expect(page.locator('#result')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#result-title')).toHaveText('STAGE CLEAR');
  await expectNoErrors(errors);
});

test('ストップボタンで、動いているキャラをその場で止められる', async ({ page }) => {
  const errors = await open(page, 0);
  await pullUnit(page, 'A', 0, 150);
  await expect(page.locator('#btn-stop')).toBeVisible();
  await page.locator('#btn-stop').click();
  await waitPhase(page, 'ready');
  await expect(page.locator('#btn-stop')).toBeHidden();
  await expect(page.locator('#turn')).toHaveText('2');
  await expectNoErrors(errors);
});
