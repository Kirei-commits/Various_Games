/**
 * ミニゲーム「ドロップパズル」。ドロップは実際にドラッグして動かし、盤面と敵の HP だけテストで決める。
 */
import { test, expect } from '@playwright/test';

const K = { F: 'fire', W: 'water', G: 'wood', L: 'light', K: 'dark', H: 'heart' };
// (3,2) の火を (2,2) へ動かすと、2行目の火が横に3つそろう
const BOARD = ['WGLKHF', 'GWLKHF', 'FFGWLH', 'KHFFWL', 'LLKHGF'].map((r) => [...r].map((c) => K[c]));

async function openPuzzle(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  await page.locator('#btn-puzzle').click();
  await expect(page.locator('#puzzle')).toBeVisible();
  await expect(page.locator('#pz-dungeons button')).toHaveCount(5);
  await page.locator('#pz-dungeon-0').click();
  await page.waitForFunction(() => window.__ms.puzzle.phase === 'input');
  await page.evaluate((b) => window.__ms.puzzle.setBoard(b), BOARD);
  return errors;
}
async function drag(page, from, to) {
  const a = await page.evaluate(([r, c]) => window.__ms.puzzle.cell(r, c), from);
  const b = await page.evaluate(([r, c]) => window.__ms.puzzle.cell(r, c), to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

test('ドロップを動かして3つそろえると消えて、火のキャラが攻撃し、次のターンになる', async ({ page }) => {
  const errors = await openPuzzle(page);
  await drag(page, [3, 2], [2, 2]);
  await page.waitForFunction(() => window.__ms.puzzle.phase !== 'input');
  await page.waitForFunction(() => window.__ms.puzzle.phase === 'input', null, { timeout: 15000 });
  const st = await page.evaluate(() => ({ turn: window.__ms.puzzle.battle.turn, ...window.__ms.puzzle.battle.stats }));
  expect(st.turn).toBe(2);
  expect(st.combos).toBeGreaterThanOrEqual(1);
  expect(st.damage).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('入れ替えずに離しただけではターンが進まない', async ({ page }) => {
  const errors = await openPuzzle(page);
  const a = await page.evaluate(() => window.__ms.puzzle.cell(0, 0));
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => [window.__ms.puzzle.phase, window.__ms.puzzle.battle.turn])).toEqual(['input', 1]);
  expect(errors).toEqual([]);
});

test('最後のフロアの敵を倒すとクリア。ジェムがもらえて、もどるとタイトル', async ({ page }) => {
  const errors = await openPuzzle(page);
  const gems = await page.evaluate(() => window.__ms.save.gems);
  await page.evaluate(() => {
    const b = window.__ms.puzzle.battle;
    b.floor = b.floors.length - 1; b.spawn();
    for (const e of b.enemies) e.hp = 1;
  });
  await drag(page, [3, 2], [2, 2]);
  await expect(page.locator('#pz-result')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#pz-result-title')).toHaveText('クリア！');
  await expect(page.locator('#pz-result-text')).toContainText('初回クリア');
  expect(await page.evaluate(() => window.__ms.save.gems)).toBe(gems + 20);
  await page.locator('#btn-pz-back').click();
  await expect(page.locator('#puzzle')).toBeHidden();
  await expect(page.locator('#title')).toBeVisible();
  expect(errors).toEqual([]);
});
