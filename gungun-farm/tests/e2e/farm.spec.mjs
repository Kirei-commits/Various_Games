import { test, expect } from '@playwright/test';
import { openFarm, openTab, give, setProgress, advance, waitReady, waitAllReady } from './fixtures.mjs';

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
  expect(s.fields[0].crop).toBe('wheat', '収穫と同時に植え直される');
  expect(g.errors).toEqual([]);
});

test('タネを選び替えると、植わるものが変わる', async ({ page }) => {
  const g = await openFarm(page);
  await g.tap(page.locator('.card[data-act="seed"][data-id="carrot"]'));
  await g.tap(page.locator('.field').first());
  expect((await g.state()).fields[0].crop).toBe('carrot');
});

test('主ボタンは「まく」→「収穫して植え直す」を1タップでやる', async ({ page }) => {
  const g = await openFarm(page);
  // 畑が空のときは、まくボタンとして働く
  await g.tap(page.locator('#btn-harvest'));
  let s = await g.state();
  expect(s.fields.filter((f) => f.crop).length).toBe(s.fieldsOwned);

  // 時間差で実るので、まとめて収穫を確かめるときは全マスが揃うのを待つ
  await waitAllReady(page);
  await g.tap(page.locator('#btn-harvest'));

  s = await g.state();
  expect(s.barn.wheat).toBe(s.fieldsOwned);
  // 収穫と同時に植え直されているので、畑は空にならない
  expect(s.fields.filter((f) => f.crop === 'wheat').length).toBe(s.fieldsOwned);
});

test('畑を1マスだけ押しても、収穫して植え直す', async ({ page }) => {
  const g = await openFarm(page);
  const field = page.locator('.field').first();
  await g.tap(field);
  await waitReady(page);
  const before = (await g.state()).coins;

  await g.tap(field);
  const s = await g.state();
  const cost = await page.evaluate(() => window.GF.Data.crop('wheat').cost);
  expect(s.barn.wheat).toBe(1);
  expect(s.fields[0].crop).toBe('wheat', '空かずに植え直されている');
  expect(s.coins).toBe(before - cost, 'タネ代を払っている');
});

test('タネ代が尽きたら、収穫しても植え直さない（空いたまま）', async ({ page }) => {
  const g = await openFarm(page);
  await g.tap(page.locator('#btn-harvest'));
  await waitAllReady(page);
  await page.evaluate(() => { window.GF.game.state.coins = 0; });

  await g.tap(page.locator('#btn-harvest'));
  const s = await g.state();
  expect(s.fields.filter((f) => f.crop).length).toBe(0);
  await expect(page.locator('#ticker')).toContainText('空いている');
});

test('副ボタンは「取り出す」と「まとめて仕込む」を1タップでやる', async ({ page }) => {
  const g = await openFarm(page);
  // 注文が材料を予約すると結果が変わる。板を空にし、補充も止めてから測る
  // （空にするだけでは、次の tick で新しい注文が来て予約が復活する）
  await page.evaluate(() => {
    const s = window.GF.game.state;
    s.orders = [];
    s.nextOrderAt = s.now + 10_000_000;
    window.GF.refresh();
  });
  await give(page, 'wheat', 6);
  await g.tap(page.locator('#btn-work'));
  expect((await g.state()).machines[0].queue.length).toBe(3, '空いている枠ぶん仕込む');

  await advance(page, 4000);
  await g.tap(page.locator('#btn-work'));
  expect((await g.state()).barn.flour).toBe(3);
});

test('まとめ仕込みは、注文に要るぶんの材料を残す', async ({ page }) => {
  const g = await openFarm(page);
  // こむぎ2個を欲しがる注文だけにする
  await page.evaluate(() => {
    const s = window.GF.game.state;
    s.orders = [{ id: 999, want: { wheat: 2 }, coins: 20, xp: 3, createdAt: s.now, expiresAt: s.now + 90000, ttl: 90000 }];
    window.GF.refresh();
  });
  await give(page, 'wheat', 3);

  await g.tap(page.locator('#btn-work'));
  const s = await g.state();
  expect(s.machines[0].queue.length).toBe(0, '残り1個では注文ぶんを割ってしまうので仕込まない');
  expect(s.barn.wheat).toBe(3);
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
  const sell = await page.evaluate(() => window.GF.Data.item('corn').sell);   // 値段は調整で動く
  expect(after.barn.corn).toBe(2);
  expect(after.coins).toBe(before.coins + sell);
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
  await g.tap(page.locator('#btn-harvest'));
  await waitAllReady(page);
  await page.evaluate(() => {
    const s = window.GF.game.state;
    window.GF.Engine.store(s, 'carrot', window.GF.Engine.barnFree(s));
    window.GF.refresh();
  });

  await expect(page.locator('#barn-stat')).toHaveClass(/full/);
  // ボタンは殺さない（理由が出ないまま手詰まりに見えるため）。ここでは畑を直接押す道を見る
  await expect(page.locator('#btn-harvest')).toBeEnabled();
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

test('育つにつれて、芽から作物の絵に変わる', async ({ page }) => {
  // 時間は advance() で自分で進めたいので、勝手に進まない速さで開く
  const g = await openFarm(page, { speed: '0.05' });
  await g.tap(page.locator('.card[data-act="seed"][data-id="carrot"]'));   // 3秒
  await g.tap(page.locator('.field').first());

  const plant = page.locator('.field').first().locator('.plant');
  await advance(page, 600);                      // 2割ほど
  await expect(plant).toHaveText('🌱');

  await advance(page, 1500);                     // 7割ほど
  await expect(plant).toHaveText('🥕');
  await expect(page.locator('.field').first()).not.toHaveClass(/ready/);

  await advance(page, 1200);                     // 実った
  await expect(page.locator('.field').first()).toHaveClass(/ready/);
  await expect(plant).toHaveText('🥕');
});

test('まとめてまいた畑は順番に実る（ずっと何かが光っている）', async ({ page }) => {
  const g = await openFarm(page, { speed: '1' });
  await g.tap(page.locator('.card[data-act="seed"][data-id="carrot"]'));   // 3秒
  await g.tap(page.locator('#btn-harvest'));                              // 空の畑にまく

  const s = await g.state();
  const times = s.fields.slice(0, s.fieldsOwned).map((f) => f.readyAt);
  expect(new Set(times).size).toBe(s.fieldsOwned, '実る時刻がばらけている');

  // いちばん早いマスは「作物の秒数 ÷ 畑の数」で来る。全部そろうのを待たない
  const sec = 3000;
  expect(Math.min(...times) - s.now).toBeLessThan(sec / 2);
  expect(Math.max(...times) - s.now).toBeLessThanOrEqual(sec + 1, '作物の秒数より長くは待たせない');

  // 実際に、一斉ではなく少しずつ光る
  await expect.poll(async () => page.locator('.field.ready').count(), { timeout: 4000 })
    .toBeGreaterThan(0);
  const someReady = await page.locator('.field.ready').count();
  expect(someReady).toBeLessThan(s.fieldsOwned, '一斉には実らない');
});

test('ふなびんは少しずつ積めて、満載で出港できる', async ({ page }) => {
  const g = await openFarm(page, { speed: '1' });
  // ふなびんが来る状態を作る
  await page.evaluate(() => {
    const s = window.GF.game.state, E = window.GF.Engine, D = window.GF.Data;
    s.level = 12; s.barnUp = 30; s.coins = 99999;
    for (const def of D.machinesAt(12)) if (!E.ownsMachine(s, def.id)) s.machines.push({ id: def.id, queue: [], done: 0 });
    s.orders = [];
    s.nextOrderAt = s.now + 10_000_000;          // 注文の予約で結果が変わらないように止める
    s.boat = E.makeBoat(s);
    window.GF.refresh();
  });
  await openTab(page, 'order');
  await expect(page.locator('.boat')).toBeVisible();

  // 半分だけ用意して積む
  await page.evaluate(() => {
    const s = window.GF.game.state, E = window.GF.Engine;
    for (const [id, n] of Object.entries(s.boat.want)) E.store(s, id, Math.floor(n / 2));
    window.GF.refresh();
  });
  await g.tap(page.locator('.boat .boat-go'));

  let s = await g.state();
  const loaded = Object.values(s.boat.loaded).reduce((a, b) => a + b, 0);
  expect(loaded).toBeGreaterThan(0);
  expect(await page.locator('.boat .boat-go').innerText()).toBe('つむ', 'まだ満載ではない');

  // 残りを用意して積みきる
  await page.evaluate(() => {
    const s2 = window.GF.game.state, E = window.GF.Engine;
    for (const id of Object.keys(s2.boat.want)) E.store(s2, id, E.boatNeed(s2.boat, id));
    window.GF.refresh();
  });
  await g.tap(page.locator('.boat .boat-go'));
  await expect(page.locator('.boat .boat-go')).toHaveText('しゅっこう！');
  await expect(page.locator('.boat')).toHaveClass(/full/);

  const before = (await g.state()).coins;
  const reward = (await g.state()).boat.coins;
  await g.tap(page.locator('.boat .boat-go'));

  s = await g.state();
  expect(s.coins).toBe(before + reward);
  expect(s.stats.shipped).toBe(1);
  expect(g.errors).toEqual([]);
});

test('ふなびんの「つむ」は、ふつうの注文が欲しがるぶんを残す', async ({ page }) => {
  const g = await openFarm(page, { speed: '1' });
  const item = await page.evaluate(() => {
    const s = window.GF.game.state, E = window.GF.Engine;
    s.level = 12; s.barnUp = 30; s.coins = 99999;
    s.boat = E.makeBoat(s);
    const id = Object.keys(s.boat.want)[0];
    s.orders = [{ id: 9001, want: { [id]: 3 }, coins: 50, xp: 5, createdAt: s.now, expiresAt: s.now + 999999, ttl: 999999 }];
    s.nextOrderAt = s.now + 10_000_000;
    E.store(s, id, 5);
    window.GF.refresh();
    return id;
  });
  await openTab(page, 'order');
  await g.tap(page.locator('.boat .boat-go'));

  const s = await g.state();
  expect(s.barn[item]).toBe(3, '注文ぶんの3個は残っている');
  expect(s.boat.loaded[item]).toBe(2);
});

test('まとめて収穫したときは、まとめるほど早いことを伝える', async ({ page }) => {
  const g = await openFarm(page, { speed: '1' });
  await g.tap(page.locator('#btn-harvest'));      // 空の畑にまく
  await waitAllReady(page);

  await g.tap(page.locator('#btn-harvest'));
  await expect(page.locator('#ticker')).toContainText('まとめて収穫');

  // 1マスだけのときは出さない（毎回言われるとうるさい）
  await page.evaluate(() => {
    const s = window.GF.game.state;
    s.fields.forEach((f, i) => { if (f.crop) f.readyAt = s.now + (i === 0 ? 0 : 60_000); });
    window.GF.refresh();
  });
  await g.tap(page.locator('#btn-harvest'));
  await expect(page.locator('#ticker')).toContainText('収穫して');
  await expect(page.locator('#ticker')).not.toContainText('まとめて収穫');
});

test('じっせきがメニューに並び、取ると知らせが出る', async ({ page }) => {
  const g = await openFarm(page, { speed: '1' });
  await page.locator('#btn-menu').click();
  const total = await page.evaluate(() => window.GF.Data.ACHIEVEMENTS.length);
  await expect(page.locator('.achieve')).toHaveCount(total);
  await expect(page.locator('.achieve.done')).toHaveCount(0, 'はじめは何も取っていない');
  await page.locator('.sheet .menu', { hasText: 'とじる' }).click();

  // ひとつ取る
  await g.tap(page.locator('#btn-harvest'));
  await waitReady(page);
  await g.tap(page.locator('#btn-harvest'));
  await expect(page.locator('#pop')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#pop')).toContainText('じっせき');
  await expect(page.locator('#pop')).toBeHidden({ timeout: 5000 });

  await page.locator('#btn-menu').click();
  await expect(page.locator('.achieve.done')).not.toHaveCount(0);
  expect(g.errors).toEqual([]);
});

test('倉庫が満杯でも主ボタンは死なない（押せば理由が出る）', async ({ page }) => {
  const g = await openFarm(page, { speed: '1' });
  await g.tap(page.locator('#btn-harvest'));
  await waitAllReady(page);
  await page.evaluate(() => {
    const s = window.GF.game.state;
    window.GF.Engine.store(s, 'carrot', window.GF.Engine.barnFree(s));
    window.GF.refresh();
  });

  // 押せなくすると、なぜ進めないのか分からないまま手が止まる
  await expect(page.locator('#btn-harvest')).toBeEnabled();
  await expect(page.locator('#harvest-label')).toHaveText('倉庫がいっぱい');

  await g.tap(page.locator('#btn-harvest'));
  await expect(page.locator('#ticker')).toContainText('倉庫がいっぱい');
  await expect(page.locator('.tab[data-tab="shop"]')).toHaveClass(/is-on/, '売り場へ案内する');
});

test('きょうの作物が、たねと みせの両方で分かる', async ({ page }) => {
  const g = await openFarm(page);
  await setProgress(page, { level: 20, coins: 5000 });
  const today = await page.evaluate(() => window.GF.Engine.todayCrop(window.GF.game.state));
  expect(today).toBeTruthy();

  // たね: 印が付いていて、上がった売値がカードに出ている
  const card = page.locator(`.card[data-act="seed"][data-id="${today}"]`);
  await expect(card).toHaveClass(/today/);
  const up = await page.evaluate((id) => ({
    now: window.GF.Engine.unitPrice(window.GF.game.state, id),
    base: window.GF.Data.item(id).sell
  }), today);
  expect(up.now).toBeGreaterThan(up.base);
  await expect(card.locator('.sub')).toContainText(String(up.now));
  await expect(page.locator('#panel-note')).toContainText('きょう');

  // 印が付くのは1つだけ（どれが今日か分からなくなる）
  expect(await page.locator('.card[data-act="seed"].today').count()).toBe(1);

  // みせ: 同じ値段で売れる
  await give(page, today, 3);
  await openTab(page, 'shop');
  const sellCard = page.locator(`.card[data-act="sell"][data-id="${today}"]`);
  await expect(sellCard).toHaveClass(/today/);
  await expect(sellCard.locator('.sub')).toHaveText('🪙' + up.now);

  const before = (await g.state()).coins;
  await g.tap(sellCard);
  expect((await g.state()).coins).toBe(before + up.now);
  expect(g.errors).toEqual([]);
});

test('日が変わると、きょうの作物が入れ替わって知らせが出る', async ({ page }) => {
  const g = await openFarm(page);
  await setProgress(page, { level: 20 });
  const first = await page.evaluate(() => window.GF.Engine.todayCrop(window.GF.game.state));

  await advance(page, 180_000);   // 一日ぶん
  await expect(page.locator('#pop')).toContainText('きょうの作物');

  const next = await page.evaluate(() => window.GF.Engine.todayCrop(window.GF.game.state));
  expect(next).not.toBe(first);
  await openTab(page, 'seed');
  await expect(page.locator(`.card[data-act="seed"][data-id="${next}"]`)).toHaveClass(/today/);
  expect(g.errors).toEqual([]);
});
