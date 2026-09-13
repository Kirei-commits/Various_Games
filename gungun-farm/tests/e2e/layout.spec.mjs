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

test('レベル20で作物も施設も増えきっても、1画面から溢れない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });     // いちばん小さい画面で見る
  const g = await openFarm(page);
  await page.evaluate(() => {
    const s = window.GF.game.state, E = window.GF.Engine, D = window.GF.Data;
    s.level = D.MAX_LEVEL; s.coins = 99999; s.fieldsOwned = D.FIELD_SLOTS; s.barnUp = 8;
    for (const m of D.MACHINES) if (!E.ownsMachine(s, m.id)) s.machines.push({ id: m.id, queue: [], done: 0 });
    for (const id of Object.keys(D.ITEMS)) E.store(s, id, 2);
    window.GF.refresh();
  });

  // 注文の枠はレベルで増える。**いちばん多い枠 ＋ ふなびん**で見る
  const slots = await page.evaluate(() => {
    const s = window.GF.game.state, E = window.GF.Engine;
    while (s.orders.length < E.orderSlots(s)) s.orders.push(E.makeOrder(s));
    if (!s.boat) s.boat = E.makeBoat(s);
    window.GF.refresh();
    return s.orders.length;
  });
  expect(slots).toBeGreaterThan(3);

  for (const tab of ['seed', 'work', 'order', 'shop']) {
    await openTab(page, tab);
    const over = await page.evaluate(() => ({
      y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      x: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(over.y, `${tab}: たてのはみ出し`).toBeLessThanOrEqual(1);
    expect(over.x, `${tab}: よこのはみ出し`).toBeLessThanOrEqual(1);
    // 下の段に収まりきらないぶんは、パネルの内側だけがスクロールする
    const tabs = await page.locator('#tabs').boundingBox();
    expect(tabs.y + tabs.height, `${tab}: タブが画面の外`).toBeLessThanOrEqual(568 + 1);
  }
  // 注文は「上から1件目」が必ず見えている（開いた瞬間に何も見えないのは困る）
  await openTab(page, 'order');
  const first = await page.locator('.order').first().boundingBox();
  expect(first.y + first.height).toBeLessThanOrEqual(568);
  expect(g.errors).toEqual([]);
});

test('増えた施設ぜんぶが、みせの「かう」に並ぶ', async ({ page }) => {
  const g = await openFarm(page);
  await setProgress(page, { level: 20, coins: 99999 });
  await openTab(page, 'shop');
  await g.tap(page.locator('.seg-btn[data-id="buy"]'));

  const buyable = await page.locator('.card[data-act="buy-machine"]').count();
  const expected = await page.evaluate(() =>
    window.GF.Data.MACHINES.filter((m) => m.price > 0).length);
  expect(buyable).toBe(expected);
  expect(expected).toBeGreaterThanOrEqual(17, '後半の施設まで揃っている');
});

test('はじめての人の「あそびかた」は、いちばん小さい画面でも「はじめる」まで見える', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  // help=off を付けない＝初回の人と同じ道
  await page.goto('/?seed=2&speed=1&sound=off&fresh=1');
  await expect(page.locator('#fields .field')).toHaveCount(12);
  await expect(page.locator('.sheet')).toBeVisible();

  const btn = await page.locator('.sheet .menu.primary').boundingBox();
  expect(btn.y + btn.height, 'スクロールしないと始められない').toBeLessThanOrEqual(568);

  // 強調の書きかたがそのまま出ていないこと（textContent に ** を書くと生で出る）
  const text = await page.locator('.sheet').innerText();
  expect(text).not.toContain('**');

  await page.locator('.sheet .menu.primary').click();
  await expect(page.locator('.sheet')).toBeHidden();
});
