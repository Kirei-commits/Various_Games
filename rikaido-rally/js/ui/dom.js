/** DOM のごく薄い道具。ここにロジックは置かない。 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const byId = (id) => document.getElementById(id);

/** 文字列を HTML に埋めるときは必ずこれを通す（資料も回答も、外から来た文字列だから） */
export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 設問文などの `…` だけを <code> にする。それ以外のマークアップは通さない。 */
export const rich = (s) => esc(s).replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`);

export const on = (el, type, fn, opts) => el && el.addEventListener(type, fn, opts);

/** 数値をパーセント幅に。0 だと棒が消えるので下限を置く。 */
export const pct = (v) => `${Math.max(2, Math.min(100, Number(v) || 0))}%`;

export const clip = (s, n) => {
  const t = String(s == null ? '' : s);
  return t.length > n ? t.slice(0, n) + '…' : t;
};

/** 画面の出し分け。hidden 属性だけで切り替える（CSS の display に負けないように） */
export function showScreen(id) {
  for (const el of $$('.screen')) el.hidden = el.id !== id;
  window.scrollTo(0, 0);
}
