import { expect } from '@playwright/test';

/**
 * ページを開く。?seed で引きを固定し、?speed=fast で演出を詰めて
 * テストが待ち時間に左右されないようにする。
 */
export async function openGame(page, query = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const params = new URLSearchParams(Object.assign(
    { seed: '7', speed: 'fast', sound: 'off', opponents: '1' }, query));
  await page.goto('/?' + params.toString());
  await expect(page.locator('#hand')).toBeVisible();
  await waitForMyTurn(page);

  const hasTouch = await page.evaluate(
    () => 'ontouchstart' in window || navigator.maxTouchPoints > 0);

  return {
    errors,
    hasTouch,
    state: () => page.evaluate(() => JSON.parse(JSON.stringify(window.GA.game.state))),
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

/** 自分の手番（入力待ち）になるまで待つ */
export async function waitForMyTurn(page, timeout = 15000) {
  await expect.poll(async () => page.evaluate(() => {
    const g = window.GA.game;
    if (!g.state) return 'boot';
    if (g.busy) return 'busy';
    if (g.state.phase === 'over') return 'over';
    if (g.state.phase === 'defense') return 'defense';
    return g.state.players[g.state.turn].isHuman ? 'mine' : 'ai';
  }), { timeout }).toMatch(/mine|defense|over/);
}

/**
 * 自分の手札を任意のアイテムに差し替える。
 * 局面を作らないと検証できないことが多いので、テスト用の入口として用意している。
 */
export async function setMyHand(page, ids) {
  await page.evaluate((list) => {
    const g = window.GA.game;
    const me = g.state.players.find((p) => p.isHuman);
    me.hand = list.map((id) => window.GA.Items.instantiate(id));
    g.ui.selected.clear();
    window.GA.refresh();
  }, ids);
}

/** 相手の手札を差し替える */
export async function setFoeHand(page, playerId, ids) {
  await page.evaluate(({ playerId, list }) => {
    const g = window.GA.game;
    g.state.players[playerId].hand = list.map((id) => window.GA.Items.instantiate(id));
    window.GA.refresh();
  }, { playerId, list: ids });
}

export const cardByName = (page, name) => page.locator('.card', { hasText: name }).first();
