/**
 * 「1画面にぜんぶ入っていること」を機械で見張る。
 * スクロールして探す・小さくて押し間違える、が起きないことがこのゲームの前提。
 */
import { test, expect } from '@playwright/test';
import { openFarm, openTab, give, setProgress } from './fixtures.mjs';

/** 実機でありがちな画面の大きさ。いちばん小さいものまで成立させる */
const SCREENS = [
  { name: 'iPhone SE', width: 320, height: 568 },
  { name: '標準的なスマホ', width: 390, height: 844 },
  { name: '大きめのスマホ', width: 430, height: 932 },
  { name: 'パソコン', width: 1280, height: 800 }
];

for (const sc of SCREENS) {
  test(`${sc.name}（${sc.width}x${sc.height}）でページがスクロールしない`, async ({ page }) => {
    await page.setViewportSize({ width: sc.width, height: sc.height });
    await openFarm(page);

    const over = await page.evaluate(() => ({
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(over.y, 'たてのはみ出し').toBeLessThanOrEqual(1);
    expect(over.x, 'よこのはみ出し').toBeLessThanOrEqual(1);

    // 下の段（タブ）まで画面の中にあること
    const tabs = await page.locator('#tabs').boundingBox();
    expect(tabs.y + tabs.height).toBeLessThanOrEqual(sc.height + 1);
  });
}

test('畑は12マスぜんぶ見えている（買う前のマスも含めて）', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const g = await openFarm(page);
  const vh = 568;
  const cells = await page.locator('.field').all();
  expect(cells.length).toBe(12);
  for (const c of cells) {
    const box = await c.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(vh);
    expect(box.y).toBeGreaterThanOrEqual(0);
  }
  expect(g.errors).toEqual([]);
});

test('押せるものは 44x44px 以上ある（指で確実に押せる大きさ）', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const g = await openFarm(page);
  await setProgress(page, { level: 8, coins: 3000 });
  await give(page, 'wheat', 6);

  for (const tab of ['seed', 'work', 'order', 'shop']) {
    await openTab(page, tab);
    const targets = [
      ...await page.locator('.field').all(),
      ...await page.locator('#panel-body button').all(),
      ...await page.locator('.tab').all(),
      page.locator('#btn-harvest'), page.locator('#btn-work'), page.locator('#btn-menu')
    ];
    for (const t of targets) {
      const box = await t.boundingBox();
      if (!box) continue;                   // 隠れているものは対象外
      const label = (await t.innerText()).slice(0, 20) || (await t.getAttribute('data-act'));
      expect(box.width, `${tab}: ${label} の幅`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${tab}: ${label} の高さ`).toBeGreaterThanOrEqual(44);
    }
  }
  expect(g.errors).toEqual([]);
});

test('主要な2つのボタンは、どの画面でも同じ場所にある', async ({ page }) => {
  await openFarm(page);
  const harvest = await page.locator('#btn-harvest').boundingBox();
  const plant = await page.locator('#btn-work').boundingBox();
  const tabs = await page.locator('#tabs').boundingBox();
  expect(harvest.y).toBeCloseTo(plant.y, 0);
  expect(harvest.y + harvest.height).toBeLessThanOrEqual(tabs.y + 1);
});

test('下の段を切り替えても、上の畑は動かない', async ({ page }) => {
  await openFarm(page);
  const before = await page.locator('#fields').boundingBox();
  for (const tab of ['work', 'order', 'shop', 'seed']) {
    await openTab(page, tab);
    const after = await page.locator('#fields').boundingBox();
    expect(after.y, tab).toBeCloseTo(before.y, 0);
    expect(after.height, tab).toBeCloseTo(before.height, 0);
  }
});

test('倉庫の中身が増えても、みせの一覧が画面を押し広げない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFarm(page);
  await page.evaluate(() => {
    const s = window.GF.game.state;
    s.barnUp = 8;
    for (const id of Object.keys(window.GF.Data.ITEMS)) window.GF.Engine.store(s, id, 3);
    window.GF.refresh();
  });
  await openTab(page, 'shop');
  const over = await page.evaluate(() =>
    document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(over).toBeLessThanOrEqual(1);
});
