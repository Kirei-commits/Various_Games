import { test, expect } from '@playwright/test';
import { open, press, drag, tapWorld, startStage, sim, SAVE_DONE } from './fixtures.mjs';

test('ステージ1の最初は指アニメで操作を教える', async ({ page }) => {
  await open(page);
  await startStage(page, 1);
  expect(await page.evaluate(() => window.__MGR.Game.tutorial?.step)).toBe(1);
});

test('英雄をドラッグすると、なぞったマスの得意武器を拾って投げる', async ({ page }) => {
  const errors = await open(page, { save: SAVE_DONE });
  await startStage(page, 1);
  // 1列目を鎌、ほかを剣にして、死神をその列でなぞる
  await sim(page, `
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) S.board[r][c] = { w: c === 1 ? 'sickle' : 'sword', off: 0 };
    const h = S.heroes[0]; h.col = 1; h.row = 0; h.x = 1.5; h.y = 0.5; h.ammo = [];
    sim.pause(false);`);
  const thrown0 = await sim(page, 'return S.stats.thrown');
  await drag(page, [{ x: 1.5, y: 0.25 }, { x: 1.5, y: 2.2 }, { x: 1.5, y: 4.2 }, { x: 3.5, y: 4.2 }]);
  const st = await sim(page, 'const h = S.heroes[0]; return { col: h.col, row: h.row, drag: h.drag, thrown: S.stats.thrown, ammo: h.ammo.length }');
  expect(st.drag).toBe(false);
  expect(st.col).toBe(3);
  expect(st.thrown + st.ammo - thrown0).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(1500);
  expect(await sim(page, 'return S.stats.thrown')).toBeGreaterThan(thrown0);
  expect(errors).toEqual([]);
});

test('同じ英雄の上にドロップすると合体して★2になる', async ({ page }) => {
  await open(page, { save: SAVE_DONE });
  await startStage(page, 1);
  await sim(page, `sim.addHero('reaper', 1, { col: 4, row: 3 });`);
  const a = await sim(page, 'const h = S.heroes[0]; return { x: h.x, y: h.y }');
  await drag(page, [{ x: 4.5, y: 3.2 }, { x: a.x, y: a.y - 0.2 }]);
  const st = await sim(page, 'return S.heroes.map(h => h.tier)');
  expect(st).toEqual([2]);
});

test('檻の英雄を解放 → 2択。「仲間にする」で加わり、「進化させる」は英雄をタップして★+1', async ({ page }) => {
  await open(page, { save: SAVE_DONE });
  await startStage(page, 1);
  await page.waitForFunction(() => window.__MGR.sim().S.cages.length === 1);
  // 檻の真下の列・いちばん奥の段（射程が届く）に立たせて、檻をあと1発で壊れるようにする
  await sim(page, `S.cages[0].hp = 1; const h = S.heroes[0]; h.col = 0; h.row = 5; h.x = 0.5; h.y = 5.5; h.ammo = ['sickle'];`);
  await expect(page.locator('#choice')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#choiceName')).toContainText('騎士');
  await press(page, '#chJoin');
  await expect(page.locator('#choice')).toBeHidden();
  expect(await sim(page, 'return S.heroes.map(h => h.type).sort()')).toEqual(['knight', 'reaper']);

  await page.waitForFunction(() => window.__MGR.sim().S.cages.length === 1, null, { timeout: 10_000 });
  await sim(page, `S.cages[0].hp = 1; const h = S.heroes.find(h => h.type === 'reaper'); h.col = 0; h.row = 5; h.x = 0.5; h.y = 5.5; h.ammo = ['sickle'];`);
  await expect(page.locator('#choice')).toBeVisible({ timeout: 10_000 });
  await press(page, '#chEvolve');
  await expect(page.locator('#evolveHint')).toBeVisible();
  const k = await sim(page, `const h = S.heroes.find(h => h.type === 'knight'); return { x: h.x, y: h.y }`);
  await tapWorld(page, k.x, k.y - 0.3);
  await expect(page.locator('#evolveHint')).toBeHidden();
  expect(await sim(page, `return S.heroes.find(h => h.type === 'knight').tier`)).toBe(2);
  expect(await sim(page, 'return S.phase')).toBe('play');
});

test('一時停止で止まり、再開で動き、メニューへ戻れる', async ({ page }) => {
  await open(page, { save: SAVE_DONE });
  await startStage(page, 1);
  await press(page, '#pauseBtn');
  await expect(page.locator('#pause')).toBeVisible();
  const t = await sim(page, 'return S.t');
  await page.waitForTimeout(500);
  expect(await sim(page, 'return S.t')).toBe(t);
  await press(page, '#resume');
  await page.waitForTimeout(500);
  expect(await sim(page, 'return S.t')).toBeGreaterThan(t);
  await press(page, '#pauseBtn');
  await press(page, '#quit');
  await expect(page.locator('#lmenu')).toBeVisible();
});
