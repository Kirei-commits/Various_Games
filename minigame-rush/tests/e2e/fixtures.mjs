/**
 * E2E 共通のヘルパー。
 * 操作は実際の入力（ボタンのタップ・クリック、指・マウスのドラッグ）で行い、内部を直接触るのは
 * 「待ち時間の短縮」（speed / bot）と「状態の確認・準備」だけに限る。
 */
import { expect } from '@playwright/test';

export async function open(page, { save } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => window.__MGR && window.__MGR.screen() === 'hub');
  if (save) {
    await page.evaluate(s => { localStorage.setItem('mgr.v1', JSON.stringify(s)); }, save);
    await page.reload();
    await page.waitForFunction(() => window.__MGR && window.__MGR.screen() === 'hub');
  }
  return errors;
}

export const isTouch = page => !!page.context()._options?.hasTouch;

/** タッチ端末ならタップ、そうでなければクリック */
export async function press(page, sel) {
  const loc = page.locator(sel);
  if (isTouch(page)) await loc.tap(); else await loc.click();
}

/** ワールド座標 → ページ上の座標 */
export async function toPage(page, x, y) {
  return page.evaluate(([x, y]) => {
    const V = window.__MGR.View, r = document.getElementById('cv').getBoundingClientRect();
    return { x: r.left + V.sx(x, y) / V.W * r.width, y: r.top + V.sy(y) / V.H * r.height };
  }, [x, y]);
}

/**
 * 盤面の上を指（タッチ端末）かマウスでなぞる。points はワールド座標の列。
 * タッチは CDP で本物のタッチイベントを送る（pointerType が touch になる）
 */
export async function drag(page, points) {
  const pts = [];
  for (const p of points) pts.push(await toPage(page, p.x, p.y));
  if (isTouch(page)) {
    const cdp = await page.context().newCDPSession(page);
    const tp = p => [{ x: p.x, y: p.y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) });
    for (let i = 1; i < pts.length; i++) {
      for (let k = 1; k <= 6; k++) {
        const a = pts[i - 1], b = pts[i];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp({ x: a.x + (b.x - a.x) * k / 6, y: a.y + (b.y - a.y) * k / 6 }) });
      }
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (let i = 1; i < pts.length; i++) await page.mouse.move(pts[i].x, pts[i].y, { steps: 6 });
    await page.mouse.up();
  }
}

/** 盤面のマスをタップ（クリック） */
export async function tapWorld(page, x, y) {
  const p = await toPage(page, x, y);
  if (isTouch(page)) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}

export async function startStage(page, n = 1) {
  await press(page, '#openLegion');
  await expect(page.locator('#lmenu')).toBeVisible();
  await press(page, `#stageGrid [data-n="${n}"]`);
  await expect(page.locator('#hud')).toBeVisible();
}

export const sim = (page, fn, arg) => page.evaluate(([f, a]) => new Function('S', 'sim', 'a', f)(window.__MGR.sim().S, window.__MGR.sim(), a), [fn, arg]);

/** チュートリアルを済ませたセーブ（ステージ1で指アニメが出ないようにする） */
export const SAVE_DONE = { v: 1, coins: 0, legion: { tutorial: true } };
