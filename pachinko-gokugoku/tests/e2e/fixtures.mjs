/**
 * E2E 共通のヘルパー。
 * 操作は実際の入力（ボタンのタップ・クリック、キー）で行い、内部を直接触るのは
 * 「待ち時間の短縮」（setSpeed）と「状態の確認・RUSH残り回転の設定」だけに限る。
 */
import { expect } from '@playwright/test';

export async function open(page, { start = true } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Google Fonts はテスト環境で読めないことがある（読めなくても代わりのフォントで動く）
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => window.__PACHI && window.__PACHI.state() !== '');
  if (start) { await press(page, '#start'); await expect(page.locator('#start')).toBeHidden(); }
  return errors;
}

/** タッチ端末ならタップ、そうでなければクリック */
export async function press(page, sel) {
  const loc = page.locator(sel);
  if (page.context()._options?.hasTouch) await loc.tap(); else await loc.click();
}

export const state = page => page.evaluate(() => window.__PACHI.state());
export const speed = (page, v) => page.evaluate(v => window.__PACHI.setSpeed(v), v);

/** 設定（デバッグ）パネルのボタンを押す */
export async function debug(page, sel) {
  await press(page, '#bDbg');
  await expect(page.locator('#dbg')).toBeVisible();
  await press(page, `#dbg ${sel}`);
}

/**
 * 状態の名前が pattern に合うまで進める。途中の判定・スクープ・レバー・モード選択は実際の操作で進める。
 * mode: モード選択で押すボタン（'quick' | 'battle'）
 */
export async function playUntil(page, pattern, { mode = 'quick', timeout = 60_000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const s = await state(page);
    if (pattern.test(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`「${pattern}」にならない（いま: ${s}）`);
    if (/当否判定|昇格スクープ|RUSHバトル/.test(s)) await press(page, '#push');
    else if (/一撃昇格/.test(s)) await press(page, '#lever');
    else if (/モード選択/.test(s) && await page.locator('#modesel').isVisible()) await press(page, `#modesel [data-mode="${mode}"]`);
    if (/当否判定/.test(s)) await press(page, '#lever').catch(() => { });
    await page.waitForTimeout(120);
  }
}
