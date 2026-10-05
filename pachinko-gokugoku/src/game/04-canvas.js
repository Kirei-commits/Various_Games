// =====================================================================
//  Canvas ヘルパー・テキストスプライト（筆文字ゴールド）
// =====================================================================
let R = 1; // バッキングストアの倍率
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * R)); c.height = Math.max(1, Math.ceil(h * R));
  const x = c.getContext('2d'); x.setTransform(R, 0, 0, R, 0, 0);
  return { c, x, w, h };
}
function rr(p, x, y, w, h, r) {
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r); p.lineTo(x + w, y + h - r);
  p.arcTo(x + w, y + h, x + w - r, y + h, r); p.lineTo(x + r, y + h); p.arcTo(x, y + h, x, y + h - r, r); p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r); p.closePath();
}
function drawS(ctx, s, x, y, sc, a) {
  if (!s) return; sc = sc == null ? 1 : sc; a = a == null ? 1 : a; if (a <= 0.003 || sc <= 0) return;
  if (a < 1) ctx.globalAlpha = a; const w = s.w * sc, h = s.h * sc; ctx.drawImage(s.c, x - w / 2, y - h / 2, w, h); if (a < 1) ctx.globalAlpha = 1;
}
const STYLES = {
  gold: { stops: [[0, '#fffbe0'], [0.22, '#ffe066'], [0.48, '#c88a0a'], [0.52, '#ffd23f'], [0.8, '#fff1a8'], [1, '#8a5a00']], edge: '#2e1600', glow: 'rgba(255,190,30,0.95)', inner: '#fff8d0' },
  red: { stops: [[0, '#ffe2e2'], [0.3, '#ff4040'], [0.5, '#a00000'], [0.56, '#ff5050'], [1, '#5a0000']], edge: '#1a0000', glow: 'rgba(255,40,40,0.95)', inner: '#ffd700' },
  white: { stops: [[0, '#ffffff'], [0.5, '#e2e8f2'], [1, '#98a2b4']], edge: '#0c1420', glow: 'rgba(150,200,255,0.85)', inner: '#ffffff' },
  blue: { stops: [[0, '#e8f4ff'], [0.4, '#4aa0ff'], [0.55, '#0a3aa0'], [1, '#6ac0ff']], edge: '#00102a', glow: 'rgba(60,140,255,0.9)', inner: '#ffffff' },
  green: { stops: [[0, '#eaffea'], [0.4, '#40e070'], [0.55, '#0a7a2a'], [1, '#8af0a0']], edge: '#002a0a', glow: 'rgba(40,255,100,0.9)', inner: '#ffffff' },
  silver: { stops: [[0, '#ffffff'], [0.45, '#b8c0cc'], [0.52, '#6a7280'], [1, '#e0e6ee']], edge: '#101010', glow: 'rgba(200,210,230,0.7)', inner: '#ffffff' },
  rainbow: { rainbow: true, edge: '#1a0030', glow: 'rgba(255,255,255,0.95)', inner: '#ffffff' },
  purple: { stops: [[0, '#f6e6ff'], [0.4, '#c060ff'], [0.55, '#5a0090'], [1, '#e0a0ff']], edge: '#14002a', glow: 'rgba(190,80,255,0.9)', inner: '#fff' }
};
// 文字色のチャンスアップ 0=白 1=青 2=緑 3=赤 4=金 5=虹
const COLOR_STYLE = ['white', 'blue', 'green', 'red', 'gold', 'rainbow'];
const COLOR_NAME = ['白', '青', '緑', '赤', '金', '虹'];
function makeText(text, size, style, font) {
  const st = STYLES[style] || STYLES.gold; font = font || F_BRUSH;
  const mc = document.createElement('canvas').getContext('2d'); const f = `900 ${size}px ${font}`; mc.font = f;
  const tw = Math.ceil(mc.measureText(text).width);
  const pad = Math.ceil(size * 0.5); const w = tw + pad * 2, h = Math.ceil(size * 1.45) + pad;
  const o = mkCanvas(w, h), x = o.x; const cx = w / 2, cy = h / 2;
  x.font = f; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.shadowColor = st.glow; x.shadowBlur = size * 0.35; x.lineWidth = size * 0.24; x.strokeStyle = st.edge; x.strokeText(text, cx, cy); x.shadowBlur = 0;
  x.fillStyle = st.edge; const depth = Math.max(2, size * 0.07 | 0);
  for (let d = 1; d <= depth; d++) { x.strokeStyle = st.edge; x.lineWidth = size * 0.12; x.strokeText(text, cx + d * 0.45, cy + d); }
  let g;
  if (st.rainbow) { g = x.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 55},100%,62%)`); }
  else { g = x.createLinearGradient(0, cy - size * 0.55, 0, cy + size * 0.55); st.stops.forEach(s => g.addColorStop(s[0], s[1])); }
  x.fillStyle = g; x.strokeStyle = g; x.lineWidth = size * 0.055; x.strokeText(text, cx, cy); x.fillText(text, cx, cy);
  x.lineWidth = Math.max(1, size * 0.02); x.strokeStyle = st.inner; x.globalAlpha = 0.75; x.strokeText(text, cx, cy - size * 0.02); x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-atop';
  const gg = x.createLinearGradient(0, cy - size * 0.6, 0, cy); gg.addColorStop(0, 'rgba(255,255,255,0.5)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gg; x.fillRect(0, 0, w, cy - size * 0.04); x.globalCompositeOperation = 'source-over';
  return o;
}
const TXT = new Map();
const SPR = {}; // 描画中に使うスプライトの参照キャッシュ（毎フレームのキー生成を避ける）
function T(text, size, style, font) {
  const k = text + '|' + size + '|' + style + '|' + (font || ''); let s = TXT.get(k);
  if (!s) { s = makeText(text, size, style, font); TXT.set(k, s); }
  return s;
}
