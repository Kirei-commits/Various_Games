import { test, expect } from '@playwright/test';
import { openFarm, openTab, give, setProgress, advance, waitReady } from './fixtures.mjs';

test('畑をタップして植え、実ったらタップで収穫できる', async ({ page }) => {
  const g = await openFarm(page);
  const field = page.locator('.field').first();
  await expect(field).toHaveClass(/empty/);

  await g.tap(field);
  await expect(field).not.toHaveClass(/empty/);
  expect((await g.state()).fields[0].crop).toBe('wheat');

  await waitReady(page);
  await expect(field).toHaveClass(/ready/);
  await g.tap(field);

  const s = await g.state();
  expect(s.barn.wheat).toBe(1);
  expect(s.fields[0].crop).toBe(null);
  expect(g.errors).toEqual([]);
});

test('タネを選び替えると、植わるものが変わる', async ({ page }) => {
  const g = await openFarm(page);
  await g.tap(page.locator('.card[data-act="seed"][data-id="carrot"]'));
  await g.tap(page.locator('.field').first());
  expect((await g.state()).fields[0].crop).toBe('carrot');
});

test('ぜんぶ植える・ぜんぶ収穫が1タップで効く', async ({ page }) => {
  const g = await openFarm(page);
  await g.tap(page.locator('#btn-plant'));
  let s = await g.state();
  expect(s.fields.filter((f) => f.crop).length).toBe(s.fieldsOwned);

  await waitReady(page);
  await expect(page.locator('#btn-harvest')).toBeEnabled();
  await g.tap(page.locator('#btn-harvest'));

  s = await g.state();
  expect(s.barn.wheat).toBe(s.fieldsOwned);
  expect(s.fields.filter((f) => f.crop).length).toBe(0);
});

test('こうぼうは材料がそろうと仕込め、出来たらタップで取り出せる', async ({ page }) => {
  const g = await openFarm(page);
  await openTab(page, 'work');
  const mill = page.locator('.card[data-act="machine"]').first();
  await expect(mill).toHaveClass(/off/);

  await give(page, 'wheat', 2);
  await expect(mill).not.toHaveClass(/off/);
  await g.tap(mill);
  expect((await g.state()).machines[0].queue.length).toBe(1);

  await expect(mill.locator('.pill')).toBeVisible({ timeout: 15000 });
  await g.tap(mill);
  expect((await g.state()).barn.flour).toBe(1);
  expect(g.errors).toEqual([]);
});

test('注文は品物がそろうまで押せず、届けるとコインが増える', async ({ page }) => {
  const g = await openFarm(page);
  await openTab(page, 'order');
  const first = page.locator('.order').first();
  await expect(first.locator('.go')).toBeDisabled();

  const s0 = await g.state();
  const order = s0.orders[0];
  for (const [id, n] of Object.entries(order.want)) await give(page, id, n);

  await expect(first.locator('.go')).toBeEnabled();
  await g.tap(first.locator('.go'));

  const s1 = await g.state();
  expect(s1.coins).toBeGreaterThan(s0.coins);
  expect(s1.stats.delivered).toBe(1);
  expect(s1.combo).toBe(1);
});

test('注文はことわれて、枠は少し経つと埋まる', async ({ page }) => {
  const g = await openFarm(page);
  await openTab(page, 'order');
  await g.tap(page.locator('.order .x').first());
  expect((await g.state()).orders.length).toBe(2);
  await expect(page.locator('.order')).toHaveCount(3, { timeout: 15000 });
});

test('みせで売るとコインが増え、倉庫が空く', async ({ page }) => {
  const g = await openFarm(page);
  await give(page, 'corn', 3);
  await openTab(page, 'shop');
  const before = await g.state();

  await g.tap(page.locator('.card[data-act="sell"][data-id="corn"]'));
  const after = await g.state();
  expect(after.barn.corn).toBe(2);
  expect(after.coins).toBe(before.coins + 11);
});

test('売る数はまとめて選べる', async ({ page }) => {
  const g = await openFarm(page);
  await give(page, 'wheat', 9);
  await openTab(page, 'shop');
  await g.tap(page.locator('.qty'));             // ×1 → ×5
  await expect(page.locator('.qty')).toHaveText('×5');
  await g.tap(page.locator('.card[data-act="sell"][data-id="wheat"]'));
  expect((await g.state()).barn.wheat).toBe(4);
});

test('倉庫がいっぱいだと収穫できず、みせへ案内される', async ({ page }) => {
  const g = await openFarm(page);
  await g.tap(page.locator('#btn-plant'));
  await waitReady(page);
  await page.evaluate(() => {
    const s = window.GF.game.state;
    window.GF.Engine.store(s, 'carrot', window.GF.Engine.barnFree(s));
    window.GF.refresh();
  });

  await expect(page.locator('#barn-stat')).toHaveClass(/full/);
  await expect(page.locator('#btn-harvest')).toBeDisabled();
  await g.tap(page.locator('.field').first());
  await expect(page.locator('#ticker')).toContainText('倉庫がいっぱい');
  await expect(page.locator('.tab[data-tab="shop"]')).toHaveClass(/is-on/);
});

test('みせは「うる」と「かう」を1タップで行き来できる', async ({ page }) => {
  const g = await openFarm(page);
  await give(page, 'wheat', 2);
  await openTab(page, 'shop');
  await expect(page.locator('.card[data-act="sell"]')).toHaveCount(1);
  await g.tap(page.locator('.seg-btn[data-id="buy"]'));
  await expect(page.locator('.card[data-act="sell"]')).toHaveCount(0);
  await expect(page.locator('.card[data-act="buy-barn"]')).toBeVisible();
  await g.tap(page.locator('.seg-btn[data-id="sell"]'));
  await expect(page.locator('.card[data-act="sell"]')).toHaveCount(1);
});

test('みせで機械と畑と倉庫が買える', async ({ page }) => {
  const g = await openFarm(page);
  await setProgress(page, { level: 6, coins: 5000 });
  await openTab(page, 'shop');
  await g.tap(page.locator('.seg-btn[data-id="buy"]'));

  await g.tap(page.locator('.card[data-act="buy-machine"][data-id="coop"]'));
  expect((await g.state()).machines.some((m) => m.id === 'coop')).toBe(true);

  const beforeFields = (await g.state()).fieldsOwned;
  await g.tap(page.locator('.card[data-act="buy-field"]'));
  expect((await g.state()).fieldsOwned).toBe(beforeFields + 1);

  const beforeCap = (await g.state()).barnUp;
  await g.tap(page.locator('.card[data-act="buy-barn"]'));
  expect((await g.state()).barnUp).toBe(beforeCap + 1);
});

test('レベルが上がると演出が出て、新しいタネが解放される', async ({ page }) => {
  const g = await openFarm(page);
  await page.evaluate(() => {
    const s = window.GF.game.state;
    s.level = 1; s.xp = 0; s.xpNext = 2;   // こむぎこ1個(経験値3)で上がる
    window.GF.Engine.store(s, 'x', 0);
  });
  await give(page, 'wheat', 2);
  await openTab(page, 'work');
  await g.tap(page.locator('.card[data-act="machine"]').first());   // 仕込む
  await advance(page, 4000);
  await g.tap(page.locator('.card[data-act="machine"]').first());   // 取り出す → 経験値

  await expect(page.locator('#pop')).toBeVisible();
  await expect(page.locator('#pop')).toBeHidden({ timeout: 5000 });
  expect((await g.state()).level).toBeGreaterThan(1);
});

test('3分チャレンジは時間が切れると結果が出る', async ({ page }) => {
  const g = await openFarm(page, { mode: 'rush', limit: '4000', speed: '4' });
  await expect(page.locator('#timer')).toBeVisible();
  await expect(page.locator('#sheet')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#sheet')).toContainText('おつかれさま');
  expect(g.errors).toEqual([]);
});
