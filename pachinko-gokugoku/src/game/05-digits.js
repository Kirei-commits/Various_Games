// =====================================================================
//  3D風立体ゴールド図柄スプライト
// =====================================================================
const DIG = { s: [] };
function makeDigit(n, kind) {
  const w = 150, h = 184, o = mkCanvas(w, h), x = o.x, cx = w / 2, cy = h / 2 + 6, s = String(n);
  if (kind === 'glow') { x.shadowColor = n === 7 ? 'rgba(255,60,40,1)' : 'rgba(255,215,0,1)'; x.shadowBlur = 40; }
  if (n === 7) { // 金V柄
    x.beginPath(); x.moveTo(8, 20); x.lineTo(50, 20); x.lineTo(75, 120); x.lineTo(100, 20); x.lineTo(142, 20); x.lineTo(92, 170); x.lineTo(58, 170); x.closePath();
    const vg = x.createLinearGradient(0, 20, 0, 170); vg.addColorStop(0, '#fff6b0'); vg.addColorStop(0.4, '#ffc400'); vg.addColorStop(0.6, '#a86a00'); vg.addColorStop(1, '#ffe680');
    x.fillStyle = vg; x.fill(); x.lineWidth = 5; x.strokeStyle = '#3a1800'; x.stroke(); x.shadowBlur = 0;
  }
  x.font = `400 156px ${F_HEAVY}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  for (let d = 12; d > 0; d--) { x.fillStyle = d > 2 ? (n === 7 ? '#4a0000' : '#4a2a00') : '#1a0c00'; x.fillText(s, cx + d * 0.55, cy + d * 0.8); }
  x.shadowBlur = 0;
  x.lineWidth = 11; x.strokeStyle = '#000'; x.strokeText(s, cx, cy);
  const g = x.createLinearGradient(0, cy - 72, 0, cy + 72);
  if (n === 7) { g.addColorStop(0, '#fff0f0'); g.addColorStop(0.3, '#ff3030'); g.addColorStop(0.5, '#8a0000'); g.addColorStop(0.56, '#ff5a5a'); g.addColorStop(1, '#4a0000'); }
  else { g.addColorStop(0, '#fffbe0'); g.addColorStop(0.28, '#ffd700'); g.addColorStop(0.5, '#b47208'); g.addColorStop(0.55, '#ffe680'); g.addColorStop(1, '#7a4c00'); }
  x.fillStyle = g; x.fillText(s, cx, cy);
  x.lineWidth = 3.5; x.strokeStyle = n === 7 ? '#ffd700' : (n % 2 ? '#ff5a3a' : '#fff4b0'); x.strokeText(s, cx, cy);
  x.globalCompositeOperation = 'source-atop';
  const gl = x.createLinearGradient(0, cy - 80, 0, cy); gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gl; x.fillRect(0, 0, w, cy - 4); x.globalCompositeOperation = 'source-over';
  return o;
}
function buildDigits() {
  DIG.s = [null];
  for (let n = 1; n <= 9; n++) {
    const norm = makeDigit(n, 'norm'), glow = makeDigit(n, 'glow');
    const blur = mkCanvas(150, 184);
    for (let k = -4; k <= 4; k++) { blur.x.globalAlpha = 0.2; blur.x.drawImage(norm.c, 0, k * 9, 150, 184); }
    DIG.s.push({ norm, glow, blur });
  }
}
