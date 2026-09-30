/**
 * E2E共通のヘルパー。
 * 操作は実際の入力と同じ経路（pointerdown → pointermove → pointerup）で行い、
 * 内部を直接触るのは「待ち時間の短縮」（setTimeScale）だけに限る。
 */
import { expect } from '@playwright/test';

export async function open(page, stage = 0) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  // 起動するとタイトル（ステージ選択）が出る。stage の番号のボタンを押して始める
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  await page.locator(`#stage-${stage}`).click();
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'ready');
  return errors;
}

export const phase = (page) => page.evaluate(() => window.__ms.phase);
export const body = (page, id) => page.evaluate((id) => window.__ms.body(id), id);

/** フィールド座標 → ページ座標 */
export const client = (page, x, y) => page.evaluate(([x, y]) => window.__ms.toClient(x, y), [x, y]);

/**
 * キャラ id を押して、フィールド座標で (dx, dy) だけ引っぱる。
 * release: false なら離さずに止める（ガイド表示の確認用）。
 */
export async function pullUnit(page, id, dx, dy, { release = true, steps = 8 } = {}) {
  const b = await body(page, id);
  const from = await client(page, b.x, b.y);
  const to = await client(page, b.x + dx, b.y + dy);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  if (release) await page.mouse.up();
}

export async function waitPhase(page, name, timeout = 20000) {
  await page.waitForFunction((n) => window.__ms.phase === n, name, { timeout });
}

export async function expectNoErrors(errors) {
  expect(errors, errors.join('\n')).toEqual([]);
}

/** チームの最大HP（編成で変わるので、テストでは数字を書かずにここから読む） */
export const maxHp = (page) => page.evaluate(() => window.__ms.battle.teamHpMax);
