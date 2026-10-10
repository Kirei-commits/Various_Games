// 共通の小物。src/game/ の各ファイルは1つの即時関数の中で同じスコープを共有する
const L = MGR.Legion;
const CFG = L.CONFIG;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const now = () => performance.now() / 1000;
/** 大きな数を短く（12,345 → 1.2万） */
function fmtNum(n) {
  n = Math.round(n);
  if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 0 : 1) + '億';
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + '万';
  return String(n);
}
function show(el, on = true) { (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on); }
/** タップ・クリックの両方で反応させる（スクロールと区別するため click を使う） */
function onTap(id, fn) { $(id).addEventListener('click', e => { e.preventDefault(); Sound.ui(); fn(e); }); }
