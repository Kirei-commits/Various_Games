// =====================================================================
//  盤面（静的キャッシュ + 動的部品）
// =====================================================================
const Board = {
  cache: null, pin: null, ball: null, hesoT: 0, dcAnim: 0, atAnim: 0, gloss: null,
  build() {
    // 球スプライト
    const b = mkCanvas(16, 16); const bg = b.x.createRadialGradient(6, 5, 1, 8, 8, 8); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.35, '#d8dde6'); bg.addColorStop(0.8, '#6a7484'); bg.addColorStop(1, '#2a3038'); b.x.fillStyle = bg; b.x.beginPath(); b.x.arc(8, 8, 7.5, 0, TAU); b.x.fill(); this.ball = b;
    // 保留の光沢
    const gl = mkCanvas(40, 40); const gg = gl.x.createRadialGradient(14, 12, 1, 20, 20, 20); gg.addColorStop(0, 'rgba(255,255,255,0.95)'); gg.addColorStop(0.3, 'rgba(255,255,255,0.25)'); gg.addColorStop(0.75, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(0,0,0,0.45)'); gl.x.fillStyle = gg; gl.x.beginPath(); gl.x.arc(20, 20, 20, 0, TAU); gl.x.fill(); this.gloss = gl;
    const o = mkCanvas(W, H), x = o.x;
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    // 実機枠（金属ゴールド）
    const fg = x.createLinearGradient(0, 200, 0, 1170);
    [[0, '#5a3c00'], [0.05, '#ffe9a0'], [0.1, '#b8860b'], [0.3, '#7a5200'], [0.5, '#ffd700'], [0.55, '#fff6c0'], [0.6, '#b8860b'], [0.85, '#6a4400'], [0.95, '#ffe080'], [1, '#3a2600']].forEach(s => fg.addColorStop(s[0], s[1]));
    x.fillStyle = fg; x.beginPath(); rr(x, 4, 199, 712, 971, 46); x.fill();
    const fh = x.createLinearGradient(0, 0, W, 0); fh.addColorStop(0, 'rgba(0,0,0,0.5)'); fh.addColorStop(0.12, 'rgba(255,255,255,0.15)'); fh.addColorStop(0.5, 'rgba(0,0,0,0)'); fh.addColorStop(0.88, 'rgba(255,255,255,0.15)'); fh.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = fh; x.beginPath(); rr(x, 4, 199, 712, 971, 46); x.fill();
    x.fillStyle = '#140400'; x.beginPath(); rr(x, 22, 216, 676, 938, 32); x.fill();
    // 上部装飾パネル
    const tp = x.createLinearGradient(0, 216, 0, 346); tp.addColorStop(0, '#5a0000'); tp.addColorStop(1, '#1a0000'); x.fillStyle = tp; x.fillRect(22, 216, 676, 330);
    x.strokeStyle = 'rgba(255,190,40,0.35)'; x.lineWidth = 2;
    for (let i = 0; i < 14; i++) { x.beginPath(); const sx = 30 + i * 50; x.moveTo(sx, 344); x.bezierCurveTo(sx + 20, 300, sx - 20, 270, sx + 10, 226); x.stroke(); }
    // 盤面
    const fp = new Path2D(); fp.moveTo(30, 1014); fp.lineTo(30, 546); fp.arc(230, 546, 200, Math.PI, 1.5 * Math.PI); fp.lineTo(490, 346); fp.arc(490, 546, 200, 1.5 * Math.PI, 2 * Math.PI); fp.lineTo(690, 1014); fp.closePath();
    const bgg = x.createRadialGradient(360, 640, 60, 360, 640, 520); bgg.addColorStop(0, '#5a0a0a'); bgg.addColorStop(0.6, '#2a0303'); bgg.addColorStop(1, '#080000');
    x.fillStyle = bgg; x.fill(fp);
    x.save(); x.clip(fp);
    x.strokeStyle = 'rgba(255,200,60,0.09)'; x.lineWidth = 2;
    for (let yy = 340; yy < 1040; yy += 26) for (let xx = (yy / 26 % 2) * 26; xx < W + 30; xx += 52) { x.beginPath(); x.arc(xx, yy, 24, Math.PI, 0); x.stroke(); x.beginPath(); x.arc(xx, yy, 14, Math.PI, 0); x.stroke(); }
    // 炎モチーフ
    for (let i = 0; i < 10; i++) { const fx = 40 + i * 70; const g = x.createLinearGradient(0, 1014, 0, 860); g.addColorStop(0, 'rgba(255,90,0,0.35)'); g.addColorStop(1, 'rgba(255,90,0,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(fx - 30, 1014); x.quadraticCurveTo(fx - 10, 930, fx + 5, 860); x.quadraticCurveTo(fx + 15, 940, fx + 35, 1014); x.fill(); }
    x.restore();
    // ガイドレール
    x.lineWidth = 9; const rg = x.createLinearGradient(0, 346, 0, 1014); rg.addColorStop(0, '#fff2b0'); rg.addColorStop(0.5, '#c08a10'); rg.addColorStop(1, '#ffe680'); x.strokeStyle = rg; x.stroke(fp);
    x.lineWidth = 2; x.strokeStyle = '#e8eef8'; x.save(); x.translate(0, 0); x.stroke(fp); x.restore();
    // 液晶ベゼル
    x.fillStyle = '#000'; x.beginPath(); rr(x, LX - 12, LY - 12, LW + 24, LH + 24, LRAD + 10); x.fill();
    const bz = x.createLinearGradient(0, LY - 12, 0, LY + LH + 12); bz.addColorStop(0, '#fff4b0'); bz.addColorStop(0.5, '#a06a00'); bz.addColorStop(1, '#ffe080');
    x.lineWidth = 8; x.strokeStyle = bz; x.beginPath(); rr(x, LX - 6, LY - 6, LW + 12, LH + 12, LRAD + 5); x.stroke();
    // ステージ（液晶下）
    const st = x.createLinearGradient(0, LY + LH, 0, LY + LH + 14); st.addColorStop(0, 'rgba(120,200,255,0.8)'); st.addColorStop(1, 'rgba(40,80,160,0.3)'); x.fillStyle = st; x.beginPath(); rr(x, 250, LY + LH + 4, 220, 12, 6); x.fill();
    // ワープ入口
    x.fillStyle = 'rgba(80,200,255,0.6)'; x.beginPath(); rr(x, LX - 9, 528, 9, 74, 4); x.fill();
    // 右レーン壁・プレート
    x.lineCap = 'round'; x.lineWidth = 6; x.strokeStyle = '#d0a020'; x.beginPath(); x.moveTo(586, 696); x.lineTo(586, 908); x.stroke();
    x.lineWidth = 7; x.strokeStyle = '#c0c8d8'; x.beginPath(); x.moveTo(690, 884); x.lineTo(586, 912); x.stroke();
    x.lineWidth = 5; x.strokeStyle = '#d0a020'; x.beginPath(); x.moveTo(587, 764); x.lineTo(614, 800); x.moveTo(686, 764); x.lineTo(666, 800); x.stroke();
    // ヘソ（スタートチャッカー）
    const hg = x.createLinearGradient(330, 846, 390, 880); hg.addColorStop(0, '#ffe680'); hg.addColorStop(1, '#a06000');
    x.fillStyle = hg; x.beginPath(); x.moveTo(330, 852); x.lineTo(348, 846); x.lineTo(348, 872); x.lineTo(372, 872); x.lineTo(372, 846); x.lineTo(390, 852); x.lineTo(386, 886); x.lineTo(334, 886); x.closePath(); x.fill();
    x.fillStyle = '#300'; x.fillRect(349, 846, 22, 22);
    x.fillStyle = '#fff'; x.font = `400 11px ${F_HEAVY}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('START', 360, 879);
    // 一般入賞口
    x.fillStyle = '#c08a10'; x.fillRect(139, 932, 4, 20); x.fillRect(161, 932, 4, 20); x.fillStyle = '#300'; x.fillRect(143, 934, 18, 14);
    // アウト口
    x.fillStyle = '#000'; x.beginPath(); x.ellipse(360, 1000, 40, 12, 0, 0, TAU); x.fill(); x.strokeStyle = '#c08a10'; x.lineWidth = 3; x.stroke();
    // 釘
    const pin = mkCanvas(10, 10); const pg = pin.x.createRadialGradient(4, 4, 0.5, 5, 5, 5); pg.addColorStop(0, '#fffbe0'); pg.addColorStop(0.5, '#e0b030'); pg.addColorStop(1, '#4a3000'); pin.x.fillStyle = pg; pin.x.beginPath(); pin.x.arc(5, 5, 4.6, 0, TAU); pin.x.fill();
    const pxs = Phys.px, pys = Phys.py;
    const RD = CFG.layout.road; for (let i = 0; i <= 15; i++) { const k = i / 15, rx = lerp(RD.x1, RD.x2, k), ry = lerp(RD.y1, RD.y2, k) + 3; x.drawImage(pin.c, rx - 4.5, ry - 4.5, 9, 9); }
    for (let i = 0; i < Phys.np; i++) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.arc(pxs[i] + 2, pys[i] + 2, 3.4, 0, TAU); x.fill(); x.drawImage(pin.c, pxs[i] - 4.5, pys[i] - 4.5, 9, 9); }
    // 下皿パネル
    const lp = x.createLinearGradient(0, 1014, 0, 1160); lp.addColorStop(0, '#2a1a00'); lp.addColorStop(1, '#0a0500'); x.fillStyle = lp; x.beginPath(); rr(x, 22, 1018, 676, 138, 26); x.fill();
    const tray = x.createLinearGradient(0, 1030, 0, 1150); tray.addColorStop(0, '#3a3f48'); tray.addColorStop(1, '#0c0e12'); x.fillStyle = tray; x.beginPath(); rr(x, 34, 1032, 236, 116, 20); x.fill(); x.strokeStyle = '#c9a227'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#ffe9a0'; x.font = `700 14px sans-serif`; x.textAlign = 'left'; x.fillText('上皿', 46, 1046);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) { x.fillStyle = '#000'; x.beginPath(); x.arc(608 + j * 13, 1050 + i * 24, 4, 0, TAU); x.fill(); }
    x.fillStyle = '#ffe9a0'; x.font = `400 13px ${F_HEAVY}`; x.textAlign = 'center'; x.fillText('右打ち', 650, 1146);
    this.cache = o;
  },
  update(dt) { if (this.hesoT > 0) this.hesoT -= dt; this.dcAnim = lerp(this.dcAnim, M.denchuOpen ? 1 : 0, Math.min(1, dt * 18)); this.atAnim = lerp(this.atAnim, M.attackerOpen ? 1 : 0, Math.min(1, dt * 14)); },
  drawDynamic(x, t) {
    // 風車（回転するプラスチック風車）
    const ms = Phys.mills;
    for (let i = 0; i < 2; i++) {
      const m = ms[i]; x.save(); x.translate(m.x, m.y); x.rotate(m.a);
      for (let k = 0; k < 4; k++) { x.rotate(TAU / 4); x.fillStyle = k % 2 ? 'rgba(255,80,80,0.75)' : 'rgba(255,220,80,0.75)'; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(10, -6, m.vr, -2); x.lineTo(m.vr, 4); x.closePath(); x.fill(); }
      x.fillStyle = '#ffe680'; x.beginPath(); x.arc(0, 0, 5, 0, TAU); x.fill(); x.restore();
    }
    // ヘソ発光
    if (this.hesoT > 0) { x.globalCompositeOperation = 'lighter'; x.fillStyle = GOLD_A[aIdx(this.hesoT * 2.5)]; x.beginPath(); x.arc(360, 858, 26, 0, TAU); x.fill(); x.globalCompositeOperation = 'source-over'; }
    // 電チュー
    const dc = CFG.layout.denchu, o = this.dcAnim;
    x.fillStyle = '#c08a10'; x.fillRect(dc.x - 14, dc.y + 4, 28, 14);
    x.lineWidth = 6; x.lineCap = 'round'; x.strokeStyle = o > 0.5 ? '#40ff80' : '#ff4040';
    x.beginPath(); x.moveTo(dc.x - 8, dc.y + 4); x.lineTo(dc.x - 8 - 14 * o, dc.y - 14 + 6 * o); x.stroke();
    x.beginPath(); x.moveTo(dc.x + 8, dc.y + 4); x.lineTo(dc.x + 8 + 14 * o, dc.y - 14 + 6 * o); x.stroke();
    if (o > 0.5) { x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(80,255,120,0.3)'; x.beginPath(); x.arc(dc.x, dc.y, 22, 0, TAU); x.fill(); x.globalCompositeOperation = 'source-over'; }
    // アタッカー
    const a = this.atAnim, y1 = Phys.plateY(604), y2 = Phys.plateY(676);
    x.lineWidth = 9; x.lineCap = 'butt';
    x.strokeStyle = a > 0.1 ? '#200' : '#ff3030'; x.beginPath(); x.moveTo(604, y1); x.lineTo(676, y2); x.stroke();
    if (a > 0.05) {
      x.fillStyle = '#ff3030'; x.save(); x.translate(604, y1 + 4); x.rotate(Math.atan2(y2 - y1, 72) + a * 1.1); x.fillRect(0, -3, 74, 6); x.restore();
      x.globalCompositeOperation = 'lighter'; x.fillStyle = GOLD_A[aIdx(0.3 + 0.3 * Math.sin(t * 20))]; x.fillRect(600, y2 - 30, 80, 44); x.globalCompositeOperation = 'source-over';
    }
    // 上皿の玉
    const n = Math.min(90, Math.ceil(D.balls / 12));
    for (let i = 0; i < n; i++) { const col = i % 15, row = (i / 15) | 0; x.drawImage(this.ball.c, 46 + col * 14 + (row % 2) * 7, 1128 - row * 12, 13, 13); }
    x.fillStyle = '#fff'; x.font = `400 26px ${F_HEAVY}`; x.textAlign = 'right'; x.textBaseline = 'middle'; x.fillText(UI.ballStr, 258, 1056);
    // 右打ちランプ
    const needR = M.needRight();
    x.fillStyle = M.strong ? ((t * 4 | 0) % 2 ? '#ff3030' : '#ffd700') : (needR ? ((t * 8 | 0) % 2 ? '#ff0000' : '#300') : '#301000');
    x.beginPath(); x.arc(650, 1112, 14, 0, TAU); x.fill();
    // 右打ち指示（盤面の右レーンに巨大矢印）
    if (needR && (!M.strong || M.arrowT > 0)) this.drawArrow(x, 636, 470, t, 0.9);
    // 球
    const bs = Phys.balls, bi = this.ball.c;
    for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (b.on && b.warp <= 0) x.drawImage(bi, b.x - 6.5, b.y - 6.5, 13, 13); }
  },
  drawArrow(x, cx, cy, t, s) {
    const k = 1 + 0.12 * Math.sin(t * 10);
    x.save(); x.translate(cx, cy + Math.sin(t * 8) * 8); x.scale(s * k, s * k);
    x.beginPath(); x.moveTo(-26, -60); x.lineTo(26, -60); x.lineTo(26, 10); x.lineTo(52, 10); x.lineTo(0, 66); x.lineTo(-52, 10); x.lineTo(-26, 10); x.closePath();
    x.fillStyle = (t * 6 | 0) % 2 ? '#ffd700' : '#ff3030'; x.shadowColor = '#ff0'; x.shadowBlur = 18; x.fill(); x.shadowBlur = 0; x.lineWidth = 5; x.strokeStyle = '#3a1800'; x.stroke();
    x.restore();
  }
};
