import { test, expect } from '@playwright/test';
import { openGame, waitForMyTurn, setMyHand, setFoeHand, cardByName } from './fixtures.mjs';

test('特性は手札カードに出る', async ({ page }) => {
  await openGame(page);
  await setMyHand(page, ['hailstorm', 'pike', 'assassin', 'sword']);
  await expect(cardByName(page, 'あられ')).toContainText('連撃3');
  await expect(cardByName(page, 'つらぬきやり')).toContainText('貫通');
  await expect(cardByName(page, 'あんさつけん')).toContainText('会心');
  await expect(cardByName(page, 'つるぎ').locator('.trait')).toHaveCount(0);
});

/** 相手の攻撃を受ける局面を作る（AIの出し惜しみに左右されず、特性の効き方を確かめられる） */
async function incomingAttack(page, g, foeItems, myItems) {
  await setMyHand(page, []);
  await setFoeHand(page, 1, foeItems);
  await g.tap(page.locator('#btn-pray'));
  await expect.poll(async () => (await g.state()).phase, { timeout: 15000 }).toBe('defense');
  await setMyHand(page, myItems);
}

test('連撃は防具1枚では受けきれない', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await incomingAttack(page, g, ['twinblade'], ['ironshield']);   // 無4×2 を 無8 で受ける
  const before = (await g.state()).players[0].hp;

  await g.tap(cardByName(page, 'てつのたて'));
  await expect(page.locator('#hint')).toContainText('4 ダメージ');
  await g.tap(page.locator('#btn-guard'));
  await waitForMyTurn(page);
  expect((await g.state()).players[0].hp).toBe(before - 4, '1回分だけ止まる');
});

test('連撃は回数分の防具をそろえれば止まる', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await incomingAttack(page, g, ['twinblade'], ['woodshield', 'woodshield']);
  const before = (await g.state()).players[0].hp;

  for (const card of await page.locator('#hand .card').all()) await g.tap(card);
  await expect(page.locator('#hint')).toContainText('0 ダメージ');
  await g.tap(page.locator('#btn-guard'));
  await waitForMyTurn(page);
  expect((await g.state()).players[0].hp).toBe(before);
});

test('貫通は防具の効果を半分にする', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await incomingAttack(page, g, ['pike'], ['armor']);   // 無6貫通 を 無11 で受ける → 5しか効かない
  const before = (await g.state()).players[0].hp;

  await g.tap(cardByName(page, 'よろい'));
  await expect(page.locator('#hint')).toContainText('1 ダメージ');
  await g.tap(page.locator('#btn-guard'));
  await waitForMyTurn(page);
  expect((await g.state()).players[0].hp).toBe(before - 1);
});

test('会心は無防備なら1.5倍になり、演出とログに出る', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await setMyHand(page, ['blazeburst']);         // 火7 会心
  await setFoeHand(page, 1, []);                 // 防具なし
  const before = (await g.state()).players[1].hp;

  await g.tap(cardByName(page, 'ばくえん'));
  await g.tap(page.locator('#opponents .pcard').first());
  await waitForMyTurn(page);
  expect((await g.state()).players[1].hp).toBe(before - 10);
  await expect(page.locator('#log')).toContainText('会心');
});

test('会心は少しでも防がれると起きない', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await setMyHand(page, ['blazeburst']);         // 火7 会心
  await setFoeHand(page, 1, ['flameshield']);    // 火9 → 完全に防がれる
  const before = (await g.state()).players[1].hp;

  await g.tap(cardByName(page, 'ばくえん'));
  await g.tap(page.locator('#opponents .pcard').first());
  await waitForMyTurn(page);
  expect((await g.state()).players[1].hp).toBe(before);
  await expect(page.locator('#log')).not.toContainText('会心');
});

test('会心を含む攻撃のプレビューは1.5倍を織り込む', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await incomingAttack(page, g, ['blazeburst'], ['iceshield']);   // 火7会心 を 水の盾で受けようとする
  // 属性が合わないので防げず、会心して 10 になる
  await g.tap(cardByName(page, 'こおりのたて'));
  await expect(page.locator('#hint')).toContainText('10 ダメージ');
  expect(g.errors).toEqual([]);
});
