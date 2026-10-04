// =====================================================================
//  上部データカウンター（回転数・大当り・初当り・最高出玉・RUSH・スランプグラフ・履歴）
// =====================================================================
const Counter = {
  cv: null, dirty: true,
  build() { this.cv = mkCanvas(W, 196); this.dirty = true; },
  render() {
    const x = this.cv.x; x.clearRect(0, 0, W, 196);
    const g = x.createLinearGradient(0, 0, 0, 196); g.addColorStop(0, '#221400'); g.addColorStop(1, '#050200'); x.fillStyle = g; x.fillRect(0, 0, W, 196);
    x.strokeStyle = '#c9a227'; x.lineWidth = 2; x.strokeRect(1, 1, W - 2, 194);
    const prob = D.firstHits ? '1/' + (D.totalSpins / D.firstHits).toFixed(1) : '---';
    const items = [
      [M.mode === 'rush' ? 'RUSH回転' : '現在回転数', M.mode === 'rush' ? String(M.rushSpinCount) : String(D.spinsSinceHit)],
      ['大当り回数', String(D.hits)], ['初当り確率', prob], ['最高出玉', fmt(D.maxPayout)],
      ['RUSH継続', M.chain > 0 ? M.chain + '連' : (D.lastChain ? D.lastChain + '連' : '-')]
    ];
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < 5; i++) {
      const bx = 6 + i * 142, by = 6;
      x.fillStyle = '#0a0500'; x.beginPath(); rr(x, bx, by, 136, 52, 8); x.fill(); x.strokeStyle = '#7a5a00'; x.lineWidth = 1.5; x.stroke();
      x.fillStyle = '#e8c870'; x.font = '700 13px sans-serif'; x.fillText(items[i][0], bx + 68, by + 13);
      x.font = `400 ${items[i][1].length > 7 ? 19 : 24}px ${F_HEAVY}`; x.shadowColor = '#ff7a00'; x.shadowBlur = 8; x.fillStyle = i === 4 && M.chain > 0 ? '#ff4040' : '#ffa31a'; x.fillText(items[i][1], bx + 68, by + 35); x.shadowBlur = 0;
    }
    // スランプグラフ
    const gx = 8, gy = 64, gw = 398, gh = 126;
    x.fillStyle = '#000'; x.beginPath(); rr(x, gx, gy, gw, gh, 8); x.fill(); x.strokeStyle = '#7a5a00'; x.stroke();
    const sl = D.slump; let mn = 0, mx = 0; for (let i = 0; i < sl.length; i++) { if (sl[i] < mn) mn = sl[i]; if (sl[i] > mx) mx = sl[i]; }
    const span = Math.max(1000, mx - mn) * 1.1, top = mx + (span - (mx - mn)) / 2;
    const yOf = v => gy + 18 + (top - v) / span * (gh - 26);
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1;
    for (let k = -10; k <= 10; k++) { const v = k * 5000; if (v < top - span || v > top) continue; const yy = yOf(v); x.beginPath(); x.moveTo(gx + 4, yy); x.lineTo(gx + gw - 4, yy); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.moveTo(gx + 4, yOf(0)); x.lineTo(gx + gw - 4, yOf(0)); x.stroke();
    x.lineWidth = 2.5; x.strokeStyle = '#ffd700'; x.shadowColor = '#ff9000'; x.shadowBlur = 6; x.beginPath();
    const n = sl.length; for (let i = 0; i < n; i++) { const xx = gx + 6 + (n === 1 ? 0 : i / (n - 1)) * (gw - 12), yy = yOf(sl[i]); if (i) x.lineTo(xx, yy); else x.moveTo(xx, yy); }
    x.stroke(); x.shadowBlur = 0;
    x.textAlign = 'left'; x.fillStyle = '#e8c870'; x.font = '700 12px sans-serif'; x.fillText('スランプグラフ（差玉）', gx + 8, gy + 10);
    x.textAlign = 'right'; const last = sl[n - 1] | 0; x.fillStyle = last >= 0 ? '#ff6a6a' : '#7ab8ff'; x.font = `400 14px ${F_HEAVY}`; x.fillText((last >= 0 ? '+' : '') + fmt(last), gx + gw - 8, gy + 11);
    // 履歴
    const hx = 412, hy = 64, hw = 300, hh = 126;
    x.fillStyle = '#000'; x.beginPath(); rr(x, hx, hy, hw, hh, 8); x.fill(); x.strokeStyle = '#7a5a00'; x.stroke();
    x.textAlign = 'left'; x.fillStyle = '#e8c870'; x.font = '700 12px sans-serif'; x.fillText('大当り履歴（過去10回）', hx + 8, hy + 10);
    const hs = D.history;
    for (let i = 0; i < 10; i++) {
      const e = hs[i]; const col = i < 5 ? 0 : 1, row = i % 5; const tx = hx + 8 + col * 148, ty = hy + 32 + row * 21;
      x.fillStyle = '#5a4a20'; x.font = '700 13px sans-serif'; x.fillText((i + 1) + '.', tx, ty);
      if (!e) { x.fillText('----', tx + 24, ty); continue; }
      x.fillStyle = e.t === 'RUSH' ? '#ff5050' : e.t === 'FEVER' ? '#ffd700' : '#7ab8ff';
      x.font = `400 14px ${F_HEAVY}`; x.fillText(e.s + '回転 ' + e.r + 'R', tx + 24, ty);
    }
    this.dirty = false;
  },
  draw(x) { if (this.dirty) this.render(); x.drawImage(this.cv.c, 0, 0, W, 196); }
};
