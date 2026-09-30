/**
 * ガチャ・編成・クリア報酬。ボタンは実際に押し、待ち時間の短縮（敵を倒す・手持ちを増やす）だけ直接いじる。
 * 手持ちとジェムはブラウザ（localStorage）に保存され、読み直しても残る。
 */
import { test, expect } from '@playwright/test';
import { pullUnit, waitPhase } from './fixtures.mjs';

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  return errors;
}

test('ガチャ: 確率が出ていて、1回引くと5ジェム減り、読み直しても手持ちとジェムが残る', async ({ page }) => {
  const errors = await boot(page);
  // 最初の50ジェム＋ログインボーナス20
  await expect(page.locator('#gems')).toHaveText('70');
  await expect(page.locator('#daily')).toContainText('ログインボーナス');
  await page.locator('#btn-gacha').click();
  await expect(page.locator('#gacha')).toBeVisible();
  await expect(page.locator('#rates tr')).toHaveCount(3);
  await expect(page.locator('#rates')).toContainText('5%');
  await expect(page.locator('#btn-pull10')).toBeEnabled();        // 70 >= 50（最初から10連が引ける）
  await page.locator('#btn-pull1').click();
  await expect(page.locator('#pull-results .card')).toHaveCount(1);
  await expect(page.locator('#gacha-gems')).toHaveText('65');
  const owned = await page.evaluate(() => Object.keys(window.__ms.save.owned).length);
  await page.locator('#btn-gacha-back').click();
  await expect(page.locator('#gems')).toHaveText('65');
  await page.reload();
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  await expect(page.locator('#gems')).toHaveText('65');
  await expect(page.locator('#daily')).toBeHidden();              // ログインボーナスは1日1回
  expect(await page.evaluate(() => Object.keys(window.__ms.save.owned).length)).toBe(owned);
  expect(errors).toEqual([]);
});

test('ガチャ: 10連は10枚出て、10体目までに ★4 以上が1体はいる', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { window.__ms.save.gems = 50; });
  await page.locator('#btn-gacha').click();
  await page.locator('#btn-pull10').click();
  await expect(page.locator('#pull-results .card')).toHaveCount(10);
  expect(await page.locator('#pull-results .card.r4, #pull-results .card.r5').count()).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#gacha-gems')).toHaveText('0');
  await expect(page.locator('#btn-pull1')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('編成: 枠を選んで手持ちのキャラを入れると、そのキャラで出撃できて、読み直しても残る', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { window.__ms.save.owned.K = { luck: 0 }; });
  await page.locator('#btn-party').click();
  await expect(page.locator('#party-owned [data-unit="L"]')).toBeDisabled();   // まだ持っていない
  await page.locator('[data-slot="0"]').click();
  await page.locator('#party-owned [data-unit="K"]').click();
  await expect(page.locator('[data-slot="0"]')).toContainText('ルナ');
  // すでに編成にいる B を1番目に選ぶと、K と入れ替わる
  await page.locator('#party-owned [data-unit="B"]').click();
  await expect(page.locator('[data-slot="0"]')).toContainText('ブレイズ');
  await expect(page.locator('[data-slot="1"]')).toContainText('ルナ');
  await page.locator('#btn-party-back').click();
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  await expect(page.locator('#active-name')).toHaveText('B');
  // 編成から外れた A はフィールドにいない
  expect(await page.evaluate(() => [!!window.__ms.world.get('K'), !!window.__ms.world.get('A')])).toEqual([true, false]);
  expect(await page.evaluate(() => window.__ms.save.party.join())).toBe('B,K,C,D');
  await page.reload();
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  expect(await page.evaluate(() => window.__ms.save.party.join())).toBe('B,K,C,D');
  expect(errors).toEqual([]);
});

test('クリア報酬: 初回クリアで40ジェム。クリア画面に出て、タイトルのジェムも増える', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  await page.evaluate(() => window.__ms.setTimeScale(4));
  for (let wave = 0; wave < 2; wave++) {
    await page.evaluate(() => { const { battle, world } = window.__ms; for (const e of battle.alive()) battle.kill(e.id, world); });
    const id = await page.evaluate(() => window.__ms.active);
    await pullUnit(page, id, 0, -20);
    if (wave === 0) await waitPhase(page, 'ready');
  }
  await expect(page.locator('#result')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#result-text')).toContainText('+40');
  await expect(page.locator('#result-text')).toContainText('初回クリア');
  await page.locator('#btn-stages').click();
  await expect(page.locator('#gems')).toHaveText('110');
  expect(errors).toEqual([]);
});
