import { test, expect } from '@playwright/test';
import { openGame, waitForMyTurn, setMyHand, setFoeHand, cardByName } from './fixtures.mjs';

/** 相手の攻撃を受ける局面を作る。自分は手札を空にして祈り、手番を相手へ渡す。 */
async function incomingAttack(page, g, foeItems, myItems) {
  await setMyHand(page, []);
  await setFoeHand(page, 1, foeItems);
  await g.tap(page.locator('#btn-pray'));
  await expect.poll(async () => (await g.state()).phase, { timeout: 15000 }).toBe('defense');
  await setMyHand(page, myItems);
}

test('攻撃を受けると防御の選択肢が出る', async ({ page }) => {
  const g = await openGame(page);
  await incomingAttack(page, g, ['inferno'], ['flameshield', 'iceshield']);

  await expect(page.locator('#btn-guard')).toBeVisible();
  await expect(page.locator('#btn-take')).toBeVisible();
  await expect(page.locator('#btn-attack')).toBeHidden();
  // 防御中は防具だけが押せる
  await expect(page.locator('#hand .card:not(.is-off)')).toHaveCount(2);
});

test('属性の合う防具で受けるとダメージが減る', async ({ page }) => {
  const g = await openGame(page);
  await incomingAttack(page, g, ['inferno'], ['flameshield']);   // 火14 に 火9
  const before = (await g.state()).players[0].hp;

  await g.tap(cardByName(page, 'ほのおのたて'));
  await expect(page.locator('#hint')).toContainText('5 ダメージ');
  await g.tap(page.locator('#btn-guard'));

  await waitForMyTurn(page);
  expect((await g.state()).players[0].hp).toBe(before - 5);
});

test('そのまま受けると全部くらう', async ({ page }) => {
  const g = await openGame(page);
  await incomingAttack(page, g, ['inferno'], ['flameshield']);
  const before = (await g.state()).players[0].hp;
  await g.tap(page.locator('#btn-take'));
  await waitForMyTurn(page);
  expect((await g.state()).players[0].hp).toBe(before - 14);
});

test('属性の違う防具では防げない（予測にもそう出る）', async ({ page }) => {
  const g = await openGame(page);
  await incomingAttack(page, g, ['inferno'], ['iceshield']);
  await g.tap(cardByName(page, 'こおりのたて'));
  await expect(page.locator('#hint')).toContainText('14 ダメージ');
});

test('防御をおまかせにすると自動で受けてくれる', async ({ page }) => {
  const g = await openGame(page);
  await page.evaluate(() => {
    const game = window.GA.game;
    game.settings.autoDefend = true;
  });
  await incomingAttack(page, g, ['ember'], ['flameshield']);
  // おまかせでは防御の入力を求められず、そのまま進む
  await waitForMyTurn(page);
  expect((await g.state()).phase).not.toBe('defense');
  expect(g.errors).toEqual([]);
});
