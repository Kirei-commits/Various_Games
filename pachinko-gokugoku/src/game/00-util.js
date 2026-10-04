// =====================================================================
//  定数・ユーティリティ
// =====================================================================
const PG = globalThis.PG;
const CFG = PG.CONFIG;             // 調整値（src/pure/config.js）
const TM = CFG.timing;
const { W, H } = CFG.layout;
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const { x: LX, y: LY, w: LW, h: LH, r: LRAD } = CFG.layout.lcd; // 液晶
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutBounce = t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; };
const rnd = Math.random;
const u32 = new Uint32Array(1);
// リアルタイム乱数取得（ヘソ入賞の瞬間に呼ぶ）: 0..randRange-1
const RAND_RANGE = CFG.spec.randRange;
function rand16() { if (window.crypto && crypto.getRandomValues) { crypto.getRandomValues(u32); return u32[0] % RAND_RANGE; } return (rnd() * RAND_RANGE) | 0; }
const randIn = a => a[0] + rnd() * (a[1] - a[0]);
// 抽選（src/pure/spec.js）。設定（確率・先読み・先バレ）は保存データから渡す
const LOT = PG.Spec.createLottery(CFG, rnd);
const Lottery = { draw: (raw, isRush, force) => LOT.draw(raw, isRush, force, D.settings) };
// 物理（src/pure/physics.js）は boot() で作る（M の開閉状態を参照するため）
let Phys = null;
const fmt = n => Math.round(n).toLocaleString('ja-JP');
// 毎フレームの文字列生成を避けるための色テーブル
const HUE = [], HUE_D = [];
for (let i = 0; i < 360; i++) { HUE.push(`hsl(${i},100%,60%)`); HUE_D.push(`hsl(${i},100%,35%)`); }
const hue = h => HUE[(((h | 0) % 360) + 360) % 360];
const BLACK_A = [], RED_A = [], WHITE_A = [], GOLD_A = [];
for (let i = 0; i <= 20; i++) { const a = (i / 20).toFixed(2); BLACK_A.push(`rgba(0,0,0,${a})`); RED_A.push(`rgba(255,0,0,${a})`); WHITE_A.push(`rgba(255,255,255,${a})`); GOLD_A.push(`rgba(255,200,40,${a})`); }
const aIdx = a => clamp(Math.round(a * 20), 0, 20);
const F_BRUSH = '"Yuji Boku","Dela Gothic One","Hiragino Mincho ProN","Yu Mincho",serif';
const F_HEAVY = '"Dela Gothic One","Arial Black","Hiragino Kaku Gothic StdN",sans-serif';
const COLOR_RANK = PG.Spec.COLOR_RANK;
const HOLD_FILL = { white: '#f2f2f2', blue: '#2f7bff', green: '#20d468', red: '#ff2323', gold: '#ffc61a' };
