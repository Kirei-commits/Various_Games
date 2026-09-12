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

test('ランダムに狙うと、生きている相手が選ばれる', async ({ page }) => {
  const g = await openGame(page, { opponents: '3' });
  await setMyHand(page, ['apple']);            // 武器を持たずに狙い先だけ決める
  await g.tap(page.locator('#btn-random'));
  const s = await g.state();
  expect(s.players.some((p) => p.alive && !p.isHuman)).toBe(true);
  const targetId = await page.evaluate(() => window.GA.game.ui.targetId);
  expect(targetId).not.toBeNull();
  expect(s.players[targetId].alive).toBe(true);
  expect(s.players[targetId].isHuman).toBe(false);
  await expect(page.locator(`#opponents .pcard[data-player="${targetId}"]`)).toHaveClass(/is-target/);
});

test('武器を選んでランダムを押すと、そのまま攻撃になる', async ({ page }) => {
  const g = await openGame(page, { opponents: '3', level: 'hard' });
  await setMyHand(page, ['cannon']);
  for (let i = 1; i <= 3; i++) await setFoeHand(page, i, []);   // 防具なしで必ず通る
  const before = (await g.state()).players.map((p) => p.hp);

  await g.tap(cardByName(page, 'たいほう'));
  await g.tap(page.locator('#btn-random'));
  await waitForMyTurn(page);

  const after = (await g.state()).players;
  const hit = after.filter((p, i) => !p.isHuman && p.hp < before[i]);
  expect(hit.length).toBe(1);
  expect(g.errors).toEqual([]);
});

test('ランダムは食料や回復を勝手に使わない', async ({ page }) => {
  const g = await openGame(page, { opponents: '3' });
  await page.evaluate(() => { window.GA.game.state.players[0].hp = 20; window.GA.refresh(); });
  await setMyHand(page, ['herb']);                 // 狙い先の要らない回復
  await g.tap(cardByName(page, 'やくそう'));
  await g.tap(page.locator('#btn-random'));

  const s = await g.state();
  expect(s.players[0].hp).toBe(20, '勝手に回復してしまっている');
  expect(s.players[0].hand.length).toBe(1, '勝手に消費してしまっている');
  expect(s.turn).toBe(0, '手番が終わってしまっている');
});

test('ランダムを押しても ?seed の再現性が崩れない', async ({ page }) => {
  // 狙い先の抽選がゲームの乱数を消費すると、以降の引きがずれて再現できなくなる
  const draw = async (pressRandom) => {
    const g = await openGame(page, { seed: '4242', opponents: '3' });
    await setMyHand(page, []);
    if (pressRandom) for (let i = 0; i < 5; i++) await g.tap(page.locator('#btn-random'));
    await g.tap(page.locator('#btn-pray'));
    await waitForMyTurn(page);
    const s = await g.state();
    return s.players[0].hand.map((i) => i.id);
  };
  const without = await draw(false);
  const withRandom = await draw(true);
  expect(withRandom).toEqual(without);
});

test('防御中はランダムを押せない', async ({ page }) => {
  const g = await openGame(page, { opponents: '1', level: 'hard' });
  await setMyHand(page, []);
  await setFoeHand(page, 1, ['cannon']);
  await g.tap(page.locator('#btn-pray'));
  await expect.poll(async () => (await g.state()).phase, { timeout: 15000 }).toBe('defense');
  await expect(page.locator('#btn-random')).toBeDisabled();
});

test('倒れた相手はランダムの対象にならない', async ({ page }) => {
  const g = await openGame(page, { opponents: '3' });
  await page.evaluate(() => {
    const s = window.GA.game.state;
    s.players[1].alive = false; s.players[1].hp = 0;
    s.players[2].alive = false; s.players[2].hp = 0;
    window.GA.refresh();
  });
  await setMyHand(page, ['apple']);
  for (let i = 0; i < 8; i++) {
    await g.tap(page.locator('#btn-random'));
    expect(await page.evaluate(() => window.GA.game.ui.targetId)).toBe(3);
  }
});

test('同じseedなら同じ手札で始まる', async ({ page }) => {
  const a = await openGame(page, { seed: '1234' });
  const first = (await a.state()).players.map((p) => p.hand.map((i) => i.id));
  const b = await openGame(page, { seed: '1234' });
  const second = (await b.state()).players.map((p) => p.hand.map((i) => i.id));
  expect(second).toEqual(first);
});
