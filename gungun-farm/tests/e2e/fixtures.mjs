import { expect } from '@playwright/test';

/**
 * ページを開く。
 *  seed  … 注文の引きを固定する
 *  speed … 時間の倍率。8 にすると10秒待ちが1.25秒で済み、テストが待たない
 *  fresh … 保存された農園を読み込まない（テストごとに同じ最初の状態から始める）
 *  help  … 初回の「あそびかた」を出さない
 */
export async function openFarm(page, query = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const params = new URLSearchParams(Object.assign(
    { seed: '7', speed: '8', sound: 'off', fresh: '1', help: 'off' }, query));
  await page.goto('/?' + params.toString());
  await expect(page.locator('#fields .field')).toHaveCount(12);

  const hasTouch = await page.evaluate(
    () => 'ontouchstart' in window || navigator.maxTouchPoints > 0);

  return {
    errors,
    hasTouch,
    state: () => page.evaluate(() => JSON.parse(JSON.stringify(window.GF.game.state))),
    /** 端末差を吸収した「押す」。スペック本体に分岐を書かないために使う。 */
    tap: async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      if (hasTouch) {
        const box = await locator.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await locator.click();
      }
    }
  };
}

/** 下の段を切り替える */
export const openTab = (page, name) => page.locator(`.tab[data-tab="${name}"]`).click();

/** 倉庫に品物を入れる。局面を作らないと確かめられないことが多いので用意している。 */
export async function give(page, id, n = 1) {
  await page.evaluate(({ id, n }) => {
    window.GF.Engine.store(window.GF.game.state, id, n);
    window.GF.refresh();
  }, { id, n });
}

/** レベルとコインを直に設定する（解放後の画面を確かめるため） */
export async function setProgress(page, { level, coins }) {
  await page.evaluate(({ level, coins }) => {
    const s = window.GF.game.state;
    if (level !== undefined) { s.level = level; s.xp = 0; s.xpNext = window.GF.Data.xpFor(level); }
    if (coins !== undefined) s.coins = coins;
    window.GF.refresh();
  }, { level, coins });
}

/** 時間を進める（描画ループに任せず、確実に進めたいとき） */
export async function advance(page, ms) {
  await page.evaluate((ms) => {
    const g = window.GF.game;
    window.GF.Engine.tick(g.state, g.state.now + ms);
    window.GF.refresh();
  }, ms);
}

/** 畑が実るまで待つ */
export async function waitReady(page, index = 0) {
  await expect.poll(async () => page.evaluate((i) => {
    const g = window.GF.game;
    return window.GF.Engine.isReady(g.state.fields[i], g.state.now);
  }, index), { timeout: 15000 }).toBe(true);
}
