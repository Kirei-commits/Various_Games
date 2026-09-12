import { test, expect } from '@playwright/test';
import { openGame, waitForMyTurn } from './fixtures.mjs';

test('設定を変えて新しい戦いを始められる', async ({ page }) => {
  const g = await openGame(page);
  await expect(page.locator('#opponents .pcard')).toHaveCount(1);

  await g.tap(page.locator('#btn-settings'));
  await expect(page.locator('#settings')).toBeVisible();
  await page.selectOption('#opt-opponents', '3');
  await g.tap(page.locator('#btn-restart'));

  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#opponents .pcard')).toHaveCount(3);
  expect(g.errors).toEqual([]);
});

test('設定は再読み込み後も残る', async ({ page }) => {
  const g = await openGame(page);
  await g.tap(page.locator('#btn-settings'));
  await page.selectOption('#opt-level', 'hard');
  await g.tap(page.locator('#btn-close-settings'));

  await page.reload();
  await waitForMyTurn(page);
  await expect(page.locator('#opt-level')).toHaveValue('hard');
});

test('戦績が対戦後に増える', async ({ page }) => {
  const g = await openGame(page);
  await page.evaluate(() => {
    const s = window.GA.game.state;
    s.players[1].hp = 3;
    s.players[0].hand = [window.GA.Items.instantiate('cannon')];
    s.players[1].hand = [];
    window.GA.refresh();
  });
  await g.tap(page.locator('#hand .card').first());
  await g.tap(page.locator('#opponents .pcard').first());
  await expect(page.locator('#overlay')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#record')).toContainText('勝');
  const wins = await page.evaluate(() => window.GA.game.record.wins);
  expect(wins).toBeGreaterThanOrEqual(1);
});

test('もう一戦を押すと新しい対戦が始まる', async ({ page }) => {
  const g = await openGame(page);
  await page.evaluate(() => {
    const s = window.GA.game.state;
    s.players[1].hp = 3;
    s.players[0].hand = [window.GA.Items.instantiate('cannon')];
    s.players[1].hand = [];
    window.GA.refresh();
  });
  await g.tap(page.locator('#hand .card').first());
  await g.tap(page.locator('#opponents .pcard').first());
  await expect(page.locator('#overlay')).toBeVisible({ timeout: 15000 });
  await g.tap(page.locator('#btn-rematch'));
  await expect(page.locator('#overlay')).toBeHidden();
  await waitForMyTurn(page);
  const s = await g.state();
  expect(s.players.every((p) => p.hp === p.maxHp)).toBe(true);
});
