import { test, expect } from '@playwright/test';
import { openGame, waitForMyTurn, setMyHand, setFoeHand, cardByName } from './fixtures.mjs';

test('狙い先つきの魔法は、相手をタップして発動する', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['poisonmist']);
  await g.tap(cardByName(page, 'どくのきり'));
  // 相手を選ぶまでは押せない
  await expect(page.locator('#btn-use')).toBeDisabled();
  await expect(page.locator('#hint')).toContainText('かける相手をタップ');

  await g.tap(page.locator('#opponents .pcard').first());
  await waitForMyTurn(page);
  const s = await g.state();
  expect(s.players[1].status.map((st) => st.id)).toContain('poison');
  await expect(page.locator('#log')).toContainText('どく');
});

test('状態異常は相手カードに残りターン数つきで出る', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['hexward']);
  await g.tap(cardByName(page, 'のろいのふだ'));
  await g.tap(page.locator('#opponents .pcard').first());
  await waitForMyTurn(page);
  const tag = page.locator('#opponents .statustag').first();
  await expect(tag).toBeVisible();
  await expect(tag).toContainText('のろい');
});

test('どくは手番のはじめに減り、演出が出る', async ({ page }) => {
  const g = await openGame(page, { speed: 'fast' });
  // 自分に毒をかけた状態を作る（相手の手番を挟まずに刻みだけを見る）
  await page.evaluate(() => {
    const s = window.GA.game.state;
    s.players[0].status = [{ id: 'poison', turns: 3, power: 4 }];
    window.GA.refresh();
  });
  await expect(page.locator('#self .statustag')).toContainText('どく');

  const before = (await g.state()).players[0].hp;
  // 相手の手札も空にして「祈るしかない」状態にし、攻撃を挟まずに自分の手番へ戻す
  await setMyHand(page, []);
  await setFoeHand(page, 1, []);
  await g.tap(page.locator('#btn-pray'));
  await expect.poll(async () => {
    const st = await g.state();
    return st.phase === 'turn' && st.players[st.turn].isHuman;
  }, { timeout: 15000 }).toBe(true);
  await expect.poll(async () => (await g.state()).players[0].hp).toBe(before - 4);
  await expect(page.locator('#log')).toContainText('どく');
});

test('封じられた手札は「封」が付いて押せない', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['inferno', 'sword']);
  await page.evaluate(() => {
    const s = window.GA.game.state;
    s.players[0].status = [{ id: 'seal', turns: 2, element: 'fire' }];
    window.GA.refresh();
  });
  const sealed = cardByName(page, 'ごうか');
  await expect(sealed).toHaveClass(/is-sealed/);
  await expect(sealed).toBeDisabled();
  await expect(sealed).toContainText('封じられていて使えない');
  // 封じられていない武器は使える
  await expect(cardByName(page, 'つるぎ')).toBeEnabled();
});

test('封じで攻め手が無くなると「いのる」が押せるようになる', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['inferno']);
  await expect(page.locator('#btn-pray')).toBeDisabled();
  await page.evaluate(() => {
    const s = window.GA.game.state;
    s.players[0].status = [{ id: 'seal', turns: 2, element: 'fire' }];
    window.GA.refresh();
  });
  await expect(page.locator('#btn-pray')).toBeEnabled();
});

test('のろい中は防御の予測値が半分になる', async ({ page }) => {
  const g = await openGame(page, { level: 'hard' });
  await setMyHand(page, []);
  await setFoeHand(page, 1, ['cannon']);            // 無14
  await g.tap(page.locator('#btn-pray'));
  await expect.poll(async () => (await g.state()).phase, { timeout: 15000 }).toBe('defense');
  await setMyHand(page, ['armor']);                 // 無11

  await g.tap(cardByName(page, 'よろい'));
  await expect(page.locator('#hint')).toContainText('3 ダメージ');   // 14 - 11

  // 選択は解かず、のろいをかけた状態で描画し直す（もう一度タップすると選択が外れる）
  await page.evaluate(() => {
    window.GA.game.state.players[0].status = [{ id: 'curse', turns: 3, power: 1 }];
    window.GA.refresh();
  });
  await expect(page.locator('#hint')).toContainText('9 ダメージ');   // 14 - 5（11が5に目減り）
  expect(g.errors).toEqual([]);
});
