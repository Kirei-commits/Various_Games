/**
 * E2E共通のヘルパー。
 *
 * 端末差（マウス／指）はここに閉じ込め、スペック本体には書かない。
 * 実際の入力に近い経路（pointerdown / pointerup）で操作し、
 * 内部関数を直接呼ぶのは「待ち時間の短縮」など時間に関することだけに限る。
 *
 * ゲーム本体はログインしないと始まらないので、open() が新規作成まで済ませる。
 */
import { expect } from '@playwright/test';

export const USER = 'つりびと';
export const PASS = 'himitsu';

/** ログイン画面まで開く（まっさらな状態）。 */
export async function openGate(page, { seed = 1, extra = '' } = {}) {
  await page.goto(`/?reset=1&debug=1&seed=${seed}${extra}`);
  await expect(page.locator('#gate')).toBeVisible();
  return page;
}

/** 新規作成 → 控えの画面 → ログインボーナス までを済ませる。 */
export async function signUp(page, name = USER, pass = PASS) {
  await page.locator('#new-name').fill(name);
  await page.locator('#new-pass').fill(pass);
  await page.locator('#btn-create').click();
  await expect(page.locator('#memo')).toBeVisible();
  await page.locator('#memo-ok').check();
  await page.locator('#btn-memo-done').click();
  await dismissBonus(page);
  await ready(page);
}

/** ログインボーナスが出ていれば受け取って閉じる。 */
export async function dismissBonus(page) {
  const bonus = page.locator('#bonus');
  if (await bonus.isVisible()) await page.locator('#btn-bonus-ok').click();
  await expect(bonus).toBeHidden();
}

export async function ready(page) {
  await expect(page.locator('#action')).toBeVisible();
  await page.waitForFunction(() => !!window.FQ && !!window.FQ.app && !!window.FQ.app.state);
}

/** 毎回まっさらな状態でゲームを始める。seed を渡すと抽選が決定的になる。 */
export async function open(page, opts = {}) {
  await openGate(page, opts);
  await signUp(page, opts.user || USER, opts.pass || PASS);
  return page;
}

/** 同じアカウントで開き直す（reset を付けない）。 */
export async function reopen(page) {
  await page.goto('/?debug=1');
  await dismissBonus(page);
  await ready(page);
}

export const phase = (page) => page.evaluate(() => window.FQ.app.game.state.phase);
export const stateOf = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.FQ.app.state)));

async function aim(page) {
  // マウス座標はビューポート基準なので、パネルを開いてスクロールしたあとでも
  // 確実に当たるようにボタンを画面内へ入れてから座標を取る。
  //
  // scrollIntoViewIfNeeded() は使わない。アタリのときボタンが脈打つ演出のせいで
  // 「要素が安定するまで待つ」判定が永久に終わらず、テストが丸ごと時間切れになる。
  // evaluate は操作可能性の判定をしないので、演出があってもそのまま動く。
  const action = page.locator('#action');
  await action.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = await action.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/** 押して離す（1回の操作）。 */
export async function tap(page) {
  await aim(page);
  await page.mouse.down();
  await page.mouse.up();
}

export async function waitPhase(page, want, timeout = 30000) {
  await page.waitForFunction(
    (w) => window.FQ.app.game.state.phase === w, want, { polling: 16, timeout }
  );
}

/**
 * キャストして当たりが出るまで進める（待ち時間は潰す）。
 * 既定では当たりの猶予も伸ばす。魚によっては猶予が 0.7 秒しかなく、
 * テストの操作往復のほうが長くなることがあるため。
 * 猶予そのものを検証したいときは hold: false を渡す。
 */
export async function castToBite(page, { hold = true } = {}) {
  await tap(page);
  await waitPhase(page, 'waiting');
  await page.evaluate((h) => window.FQ.app.debug.skipWait({ holdBite: h }), hold);
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
    }, null, { polling: 16, timeout: 30000 });
    await page.mouse.up();
    if (await phase(page) !== 'fight') break;
    await page.waitForFunction(() => {
      const s = window.FQ.app.game.state;
      return s.phase !== 'fight' || s.tension <= 0.22;
    }, null, { polling: 16, timeout: 30000 });
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

export async function openShop(page) {
  await page.locator('#tab-shop').click();
  await expect(page.locator('#panel-shop')).toBeVisible();
}
