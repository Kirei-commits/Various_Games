import { test, expect } from '@playwright/test';
import { openGame, waitForMyTurn, setMyHand, setFoeHand, cardByName } from './fixtures.mjs';

test('起動してJSエラーなく手札と相手が表示される', async ({ page }) => {
  const g = await openGame(page);
  await expect(page.locator('.pcard')).toHaveCount(2);      // 相手1 + 自分
  await expect(page.locator('#hand .card')).not.toHaveCount(0);
  expect(g.errors).toEqual([]);
});

test('武器をえらんで相手をタップすると攻撃になり、HPが減る', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['cannon']);          // 無属性14
  await setFoeHand(page, 1, []);              // 防具なし＝必ず通る

  const before = (await g.state()).players[1].hp;
  await g.tap(cardByName(page, 'たいほう'));
  await expect(page.locator('.card.is-sel')).toHaveCount(1);
  await g.tap(page.locator('#opponents .pcard').first());

  await expect.poll(async () => (await g.state()).players[1].hp).toBeLessThan(before);
  expect((await g.state()).players[1].hp).toBe(before - 14);
  expect(g.errors).toEqual([]);
});

test('複数の武器を重ねて撃てる', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['sword', 'ember']);   // 無9 + 火6
  await setFoeHand(page, 1, []);
  const before = (await g.state()).players[1].hp;

  await g.tap(cardByName(page, 'つるぎ'));
  await g.tap(cardByName(page, 'ひのたま'));
  await expect(page.locator('.card.is-sel')).toHaveCount(2);
  await expect(page.locator('#hint')).toContainText('計15');
  await g.tap(page.locator('#opponents .pcard').first());

  await expect.poll(async () => (await g.state()).players[1].hp).toBe(before - 15);
});

test('武器を持っていると「いのる」は押せない', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['sword']);
  await expect(page.locator('#btn-pray')).toBeDisabled();
  await setMyHand(page, ['apple']);
  await expect(page.locator('#btn-pray')).toBeEnabled();
});

test('攻め手が無ければ祈って神器を授かる', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, []);
  await expect(page.locator('#btn-pray')).toBeEnabled();
  await g.tap(page.locator('#btn-pray'));
  await waitForMyTurn(page);
  const me = (await g.state()).players[0];
  expect(me.hand.length).toBeGreaterThan(0);
  await expect(page.locator('#log')).toContainText('祈った');
});

test('食料を使うとHPが回復する', async ({ page }) => {
  const g = await openGame(page);
  await page.evaluate(() => { window.GA.game.state.players[0].hp = 20; window.GA.refresh(); });
  await setMyHand(page, ['herb']);
  await g.tap(cardByName(page, 'やくそう'));
  await expect(page.locator('#btn-use')).toBeEnabled();
  await g.tap(page.locator('#btn-use'));
  await waitForMyTurn(page);
  expect((await g.state()).players[0].hp).toBe(36);
});

test('相手を倒しきると決着の表示が出る', async ({ page }) => {
  const g = await openGame(page);
  await page.evaluate(() => { window.GA.game.state.players[1].hp = 5; window.GA.refresh(); });
  await setMyHand(page, ['cannon']);
  await setFoeHand(page, 1, []);
  await g.tap(cardByName(page, 'たいほう'));
  await g.tap(page.locator('#opponents .pcard').first());
  await expect(page.locator('#overlay')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#overlay-title')).toHaveText('勝利');
  expect(g.errors).toEqual([]);
});

test('手札の絞り込みが効く', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['sword', 'woodshield', 'apple']);
  await g.tap(page.locator('.chip[data-filter="weapon"]'));
  await expect(page.locator('#hand .card')).toHaveCount(1);
  await g.tap(page.locator('.chip[data-filter="defense"]'));
  await expect(page.locator('#hand .card')).toHaveCount(1);
  await g.tap(page.locator('.chip[data-filter="all"]'));
  await expect(page.locator('#hand .card')).toHaveCount(3);
});

test('同じseedなら同じ手札で始まる', async ({ page }) => {
  const a = await openGame(page, { seed: '1234' });
  const first = (await a.state()).players.map((p) => p.hand.map((i) => i.id));
  const b = await openGame(page, { seed: '1234' });
  const second = (await b.state()).players.map((p) => p.hand.map((i) => i.id));
  expect(second).toEqual(first);
});
