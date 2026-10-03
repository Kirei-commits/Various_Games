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
  await expect(page.locator('#rates tr')).toHaveCount(4);
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

test('編成: パズルのタブでは6体を選べて、モンストの5体とは別に保存される', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { window.__ms.save.owned.K = { luck: 0 }; });
  await page.locator('#btn-party').click();
  await expect(page.locator('[data-slot]')).toHaveCount(5);
  await page.locator('#tab-puzzle').click();
  await expect(page.locator('[data-slot]')).toHaveCount(6);
  await expect(page.locator('[data-slot="0"]')).toContainText('リーダー');
  await page.locator('[data-slot="5"]').click();
  await page.locator('#party-owned [data-unit="K"]').click();
  await page.locator('#btn-put').click();
  await expect(page.locator('[data-slot="5"]')).toContainText('ルナ');
  expect(await page.evaluate(() => [window.__ms.save.pzParty.join(), window.__ms.save.party.join()])).toEqual(['A,B,C,D,E,K', 'A,B,C,D,E']);
  await page.locator('#tab-strike').click();
  await expect(page.locator('[data-slot]')).toHaveCount(5);
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
  // 手持ちを押しただけでは入れ替わらず、詳しい能力が出る
  await page.locator('#party-owned [data-unit="K"]').click();
  await expect(page.locator('#party-detail')).toContainText('ルナ');
  await expect(page.locator('[data-slot="0"]')).toContainText('アクア');
  await page.locator('#btn-put').click();
  await expect(page.locator('[data-slot="0"]')).toContainText('ルナ');
  // すでに編成にいる B を1番目に入れると、K と入れ替わる
  await page.locator('#party-owned [data-unit="B"]').click();
  await page.locator('#btn-put').click();
  await expect(page.locator('[data-slot="0"]')).toContainText('ブレイズ');
  await expect(page.locator('[data-slot="1"]')).toContainText('ルナ');
  await page.locator('#btn-party-back').click();
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  await expect(page.locator('#active-name')).toHaveText('B');
  // 編成から外れた A はフィールドにいない
  expect(await page.evaluate(() => [!!window.__ms.world.get('K'), !!window.__ms.world.get('A')])).toEqual([true, false]);
  expect(await page.evaluate(() => window.__ms.save.party.join())).toBe('B,K,C,D,E');
  await page.reload();
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  expect(await page.evaluate(() => window.__ms.save.party.join())).toBe('B,K,C,D,E');
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

test('編成: 枠どうしの入れ替え・持っているだけ・並べ替え・合成・おすすめ編成', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { const s = window.__ms.save; s.owned.K = { luck: 1, plus: 0, stock: 2 }; s.owned.AI = { luck: 0, plus: 0, stock: 0 }; });
  await page.locator('#btn-party').click();
  // 1番目と3番目を入れ替える
  await page.locator('[data-slot="0"]').click();
  await page.locator('#btn-swap').click();
  await page.locator('[data-slot="2"]').click();
  expect(await page.evaluate(() => window.__ms.save.party.join())).toBe('C,B,A,D,E');
  // 持っているだけ
  await page.locator('#btn-owned-only').click();
  await expect(page.locator('#party-owned .owned-unit')).toHaveCount(8);
  await page.locator('#sort-by').selectOption('element');
  // 合成（K のストック2体で +2 まで）
  await page.locator('#party-owned [data-unit="K"]').click();
  await page.locator('#btn-fuse').click();
  await page.locator('#btn-fuse').click();
  await expect(page.locator('#btn-fuse')).toBeDisabled();
  expect(await page.evaluate(() => window.__ms.save.owned.K)).toMatchObject({ plus: 2, stock: 0 });
  // おすすめ編成（火山）
  await page.locator('#rec-target').selectOption('2');
  await page.locator('#btn-recommend').click();
  await expect(page.locator('#rec-note')).toContainText('おすすめ');
  expect(await page.evaluate(() => window.__ms.save.party.length)).toBe(5);
  expect(errors).toEqual([]);
});

test('ガチャ: コードは「開発者」だけジェムが無限になる', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('#btn-gacha').click();
  await page.locator('#code-input').fill('abc');
  await page.locator('#btn-code').click();
  await expect(page.locator('#code-msg')).toHaveText('何も起こりませんでした');
  await page.locator('#code-input').fill('開発者');
  await page.locator('#btn-code').click();
  await expect(page.locator('#gacha-gems')).toHaveText('∞');
  for (let i = 0; i < 3; i++) await page.locator('#btn-pull10').click();
  await expect(page.locator('#btn-pull10')).toBeEnabled();
  await expect(page.locator('#pull-results .card')).toHaveCount(10);
  expect(errors).toEqual([]);
});

test('編成: 手持ちのキャラを枠へドラッグで入れる。枠どうしのドラッグで入れ替え', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { window.__ms.save.owned.K = { luck: 0, plus: 0, stock: 0 }; });
  await page.locator('#btn-party').click();
  const center = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const dragTo = async (from, to) => {
    await page.locator(from).scrollIntoViewIfNeeded();   // 下の手持ちへスクロールしても、枠は上に貼りついて見えている
    const a = await center(from), b = await center(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
  };
  await dragTo('#party-owned [data-unit="K"]', '[data-slot="1"]');
  await expect(page.locator('[data-slot="1"]')).toContainText('ルナ');
  expect(await page.evaluate(() => window.__ms.save.party.join())).toBe('A,K,C,D,E');
  await dragTo('[data-slot="0"]', '[data-slot="4"]');
  expect(await page.evaluate(() => window.__ms.save.party.join())).toBe('E,K,C,D,A');
  // 押しただけ（動かさない）はいつものタップ: 詳しい能力が出るだけ
  await page.locator('#party-owned [data-unit="B"]').click();
  await expect(page.locator('#party-detail')).toContainText('ブレイズ');
  expect(await page.evaluate(() => window.__ms.save.party.join())).toBe('E,K,C,D,A');
  expect(errors).toEqual([]);
});

test('モード: ディフィカルトを選ぶと敵の HP が大きく、アイテムが増え、選んだモードは残る', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('#mode-difficult').click();
  await expect(page.locator('#mode-difficult')).toHaveClass(/on/);
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  const hp = await page.evaluate(() => window.__ms.battle.enemies[0].maxHp);
  const base = await page.evaluate(() => window.MSData.stages[0].waves[0].enemies[0].hp);
  expect(hp).toBeGreaterThan(base * 5);
  expect(await page.evaluate(() => window.__ms.battle.stage.waves[0].items.length)).toBeGreaterThanOrEqual(2);
  await page.reload();
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  await expect(page.locator('#mode-difficult')).toHaveClass(/on/);
  await page.locator('#mode-normal').click();
  await expect(page.locator('#mode-normal')).toHaveClass(/on/);
  expect(errors).toEqual([]);
});
