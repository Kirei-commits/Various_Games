/**
 * E2E共通のヘルパー。
 *
 * 端末差（マウス／指）はここに閉じ込め、スペック本体には書かない。
 * 実際の入力に近い経路（pointerdown / pointerup）で操作し、
 * 内部関数を直接呼ぶのは「待ち時間の短縮」など時間に関することだけに限る。
 */
import { expect } from '@playwright/test';

/** 毎回まっさらな状態で開く。seed を渡すと抽選が決定的になる。 */
export async function open(page, { seed = 1, extra = '' } = {}) {
  await page.goto(`/?reset=1&debug=1&seed=${seed}${extra}`);
  await expect(page.locator('#action')).toBeVisible();
  await page.waitForFunction(() => !!window.FQ && !!window.FQ.app);
  return page;
}

export const phase = (page) => page.evaluate(() => window.FQ.app.game.state.phase);
export const stateOf = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.FQ.app.state)));

/** メインボタンの中心へマウスを置く（以降の down/up 用）。 */
async function aim(page) {
  const box = await page.locator('#action').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/** 押して離す（1回の操作）。 */
export async function tap(page) {
  await aim(page);
  await page.mouse.down();
  await page.mouse.up();
}

export async function waitPhase(page, want, timeout = 15000) {
  await page.waitForFunction(
    (w) => window.FQ.app.game.state.phase === w, want, { polling: 16, timeout }
  );
}

/** キャストして当たりが出るまで進める（待ち時間は潰す）。 */
export async function castToBite(page) {
  await tap(page);
  await waitPhase(page, 'waiting');
  await page.evaluate(() => window.FQ.app.debug.skipWait());
  await waitPhase(page, 'bite');
}

/**
 * ファイトを最後までこなす。テンションが糸の限界に近づいたら離し、
 * 緩んだらまた巻く。判定はページ内で行うので通信の遅延に左右されない。
 */
export async function reelIn(page) {
  await aim(page);
  for (let i = 0; i < 80; i++) {
    if (await phase(page) !== 'fight') break;
    await page.mouse.down();
    await page.waitForFunction(() => {
      const s = window.FQ.app.game.state;
      return s.phase !== 'fight' || s.tension >= s.breakAt - 0.18;
    }, null, { polling: 16, timeout: 20000 });
    await page.mouse.up();
    if (await phase(page) !== 'fight') break;
    await page.waitForFunction(() => {
      const s = window.FQ.app.game.state;
      return s.phase !== 'fight' || s.tension <= 0.22;
    }, null, { polling: 16, timeout: 20000 });
  }
}

/** キャストから釣り上げまでを一気に行う。@returns {'landed'|'missed'} */
export async function catchOne(page) {
  await castToBite(page);
  await tap(page);                 // 合わせ
  await waitPhase(page, 'fight');
  await reelIn(page);
  await waitPhase(page, 'result');
  const ok = await page.evaluate(() => window.FQ.app.game.state.result.ok);
  await tap(page);                 // 結果を閉じる
  await waitPhase(page, 'idle');
  return ok ? 'landed' : 'missed';
}

/** ポイントを配る（購入まわりの検証用）。 */
export async function grant(page, points) {
  await page.evaluate((n) => window.FQ.app.debug.grant(n), points);
}
