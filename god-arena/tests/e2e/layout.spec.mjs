import { test, expect } from '@playwright/test';
import { openGame, setMyHand, setFoeHand } from './fixtures.mjs';

/** ページ全体が縦にはみ出していないか（はみ出していたら何pxかを返す） */
const pageOverflow = (page) => page.evaluate(() =>
  document.documentElement.scrollHeight - document.documentElement.clientHeight);

test('主要な操作はスクロールせずに届く位置にある', async ({ page }) => {
  await openGame(page, { opponents: '3' });
  const vh = page.viewportSize().height;
  const bar = await page.locator('.actionbar').boundingBox();
  expect(bar.y + bar.height).toBeLessThanOrEqual(vh);
});

test('押せるものは最低 44x44px ある（指で確実に押せる大きさ）', async ({ page }) => {
  const g = await openGame(page);
  await setMyHand(page, ['sword', 'woodshield', 'apple']);
  const targets = [
    ...await page.locator('.abtn:visible').all(),
    ...await page.locator('#hand .card').all(),
    ...await page.locator('#opponents .pcard').all(),
    page.locator('#btn-settings')
  ];
  for (const t of targets) {
    const box = await t.boundingBox();
    expect(box.width, await t.innerText()).toBeGreaterThanOrEqual(44);
    expect(box.height, await t.innerText()).toBeGreaterThanOrEqual(44);
  }
});

test('一画面に収まる — 手札が満杯で相手が5人でもページが縦スクロールしない', async ({ page }) => {
  const g = await openGame(page, { opponents: '5' });
  // 手札を上限まで積み、相手にも手札と状態異常を持たせて、いちばん高くなる状態にする
  await setMyHand(page, [
    'cannon', 'inferno', 'hailstorm', 'pike', 'assassin', 'twinblade',
    'armor', 'aegis', 'backfire', 'herb', 'cure', 'poisonmist'
  ]);
  for (let i = 1; i <= 5; i++) await setFoeHand(page, i, ['sword', 'armor', 'apple']);
  await page.evaluate(() => {
    for (const p of window.GA.game.state.players) {
      if (p.isHuman) continue;
      p.status = [{ id: 'poison', turns: 3, power: 4 }, { id: 'curse', turns: 3, power: 1 }];
    }
    window.GA.refresh();
  });

  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  expect(g.errors).toEqual([]);
});

test('手札のカードの中身が切れない', async ({ page }) => {
  const g = await openGame(page, { opponents: '3' });
  // 説明の行がある防具・食料・魔法と、無い武器を混ぜる（種類で高さが変わる）
  await setMyHand(page, [
    'cannon', 'inferno', 'hailstorm', 'pike', 'assassin', 'twinblade',
    'armor', 'aegis', 'backfire', 'herb', 'cure', 'poisonmist'
  ]);
  const clipped = await page.evaluate(() => [...document.querySelectorAll('#hand .card')]
    .filter((c) => c.scrollHeight > c.clientHeight + 1)
    .map((c) => c.querySelector('.cname').textContent));
  expect(clipped, '中身がはみ出しているカード').toEqual([]);

  // 相手カードと内訳も同様に切れていないこと
  const others = await page.evaluate(() => [...document.querySelectorAll('.pcard')]
    .filter((c) => c.scrollHeight > c.clientHeight + 1).length);
  expect(others).toBe(0);
  expect(g.errors).toEqual([]);
});

test('スクロールするのは手札だけ', async ({ page }) => {
  const g = await openGame(page, { opponents: '3' });
  await setMyHand(page, new Array(12).fill('sword'));
  // 手札は中でスクロールできる（入りきらない分は見に行ける）
  const handScrollable = await page.evaluate(() => {
    const h = document.querySelector('#hand');
    return { canScroll: h.scrollHeight > h.clientHeight + 1, overflowY: getComputedStyle(h).overflowY };
  });
  expect(handScrollable.overflowY).toBe('auto');
  // ページ自体は動かない
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  expect(g.errors).toEqual([]);
});

test('戦況ログは📜で引き出せる（常時表示で場所を取らない）', async ({ page }) => {
  const g = await openGame(page, { opponents: '3' });
  const side = page.locator('#side');
  const openBtn = page.locator('#btn-log');

  if (await openBtn.isVisible()) {          // 狭い画面のときだけ引き出しになる
    await expect(side).not.toHaveClass(/is-open/);
    await g.tap(openBtn);
    await expect(side).toHaveClass(/is-open/);
    // 開始直後のログは空で高さを持たないので、常に中身がある属性表で見る
    await expect(page.locator('#elements')).toBeVisible();
    await g.tap(page.locator('#btn-close-side'));
    await expect(side).not.toHaveClass(/is-open/);
  } else {
    await expect(side).toBeVisible();       // 広い画面では横に並ぶ
  }
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
});

test('横スクロールが発生しない', async ({ page }) => {
  await openGame(page, { opponents: '5' });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('相手が増えてもカードが全員分出る', async ({ page }) => {
  const g = await openGame(page, { opponents: '5' });
  await expect(page.locator('#opponents .pcard')).toHaveCount(5);
  await expect(page.locator('#self .pcard')).toHaveCount(1);
});
