import { test, expect } from '@playwright/test';
import { openGame, waitForMyTurn, setMyHand, setFoeHand, cardByName } from './fixtures.mjs';

/** 相手の攻撃を受ける局面を作る */
async function incomingAttack(page, g, foeItems, myItems) {
  await setMyHand(page, []);
  await setFoeHand(page, 1, foeItems);
  await g.tap(page.locator('#btn-pray'));
  await expect.poll(async () => (await g.state()).phase, { timeout: 15000 }).toBe('defense');
  await setMyHand(page, myItems);
}

test('反射具は「反射」と分かる見た目になっている', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['backfire']);
  const card = cardByName(page, 'ほのおのかがみ');
  await expect(card).toHaveClass(/is-reflect/);
  await expect(card).toContainText('反射');
  await expect(card).toContainText('撃ち返す');
  // 詳しい効果は枠に収めるため title に入れている
  await expect(card).toHaveAttribute('title', /防いだ分を撃ち返す/);
});

test('反射具で受けると攻撃側にダメージが返る', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await incomingAttack(page, g, ['inferno'], ['backfire']);   // 火14 を 火の反射7 で受ける
  const before = await g.state();

  await g.tap(cardByName(page, 'ほのおのかがみ'));
  await expect(page.locator('#bd-total')).toContainText('撃ち返した');
  await g.tap(page.locator('#btn-guard'));
  await waitForMyTurn(page);

  const after = await g.state();
  expect(after.players[0].hp).toBe(before.players[0].hp - 7);   // 通った7
  expect(after.players[1].hp).toBe(before.players[1].hp - 7);   // 返した7
  await expect(page.locator('#log')).toContainText('撃ち返した');
  expect(g.errors).toEqual([]);
});

test('撃ち返しで相手を倒すと決着する', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await incomingAttack(page, g, ['inferno'], ['backfire']);
  // 加護（残りHPが4割以下で被ダメージ半減）が効かない条件にする
  await page.evaluate(() => {
    const p = window.GA.game.state.players[1];
    p.maxHp = 7; p.hp = 7;
    window.GA.refresh();
  });
  await g.tap(cardByName(page, 'ほのおのかがみ'));
  await g.tap(page.locator('#btn-guard'));
  await expect(page.locator('#overlay')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#overlay-title')).toHaveText('勝利');
  await expect(page.locator('#overlay-sub')).toContainText('撃ち返し 7');
});

test('相打ちになると引き分けとして表示される', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await incomingAttack(page, g, ['inferno'], ['backfire']);
  // 双方とも加護が効かない上限HPにして、通る7と返す7で相打ちにする
  await page.evaluate(() => {
    const s = window.GA.game.state;
    s.players[0].maxHp = 7; s.players[0].hp = 7;
    s.players[1].maxHp = 7; s.players[1].hp = 7;
    window.GA.refresh();
  });
  await g.tap(cardByName(page, 'ほのおのかがみ'));
  await g.tap(page.locator('#btn-guard'));
  await expect(page.locator('#overlay')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#overlay-title')).toHaveText('相打ち');
  await expect(page.locator('#overlay-kicker')).toHaveText('DRAW');
  await expect(page.locator('#log')).toContainText('相打ち');
});

test('相手が防いだ属性は「厚」、素通りした属性は「薄」と表示される', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  // 読めるものが無いうちは帯そのものを出さない（一画面に収めるため行を使わない）
  const strip = page.locator('#opponents .readstrip').first();
  await expect(strip).toHaveCount(0);

  // 火は防がれ、雷は素通りする局面をつくる
  await setMyHand(page, ['inferno', 'judgement']);
  await setFoeHand(page, 1, ['flameshield']);
  await g.tap(cardByName(page, 'ごうか'));
  await g.tap(cardByName(page, 'らくらい'));
  await g.tap(page.locator('#opponents .pcard').first());
  await waitForMyTurn(page);

  await expect(strip).toContainText('厚');
  await expect(strip).toContainText('薄');
  const text = await strip.innerText();
  expect(text).toMatch(/🔥厚/);
  expect(text).toMatch(/⚡薄/);
});
