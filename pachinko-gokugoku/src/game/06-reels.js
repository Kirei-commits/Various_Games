// =====================================================================
//  リール（図柄 3×3・5ライン）
// =====================================================================
// 各リールは止まると3つの図柄（上・中・下）を見せる。どの図柄が並ぶかは抽選（spec.js）が決めた cols。
// 回っている間・リーチのスロー中は、1〜9 の帯が流れて見える。
const RG = 86;                                               // 段の間隔
const BIG = { x: [86, 226, 366], y: [38, 124, 210], s: 0.47 };
const SMALL = { x: [24, 52, 80], y: [18, 42, 66], s: 0.15 };
const LINES = PG.Spec.LINES;
const LINE_HUE = [200, 40, 120, 300, 0];                   // ラインごとの色
const Reels = {
  r: [0, 1, 2].map(i => ({ pos: i * 3, vel: 0, state: 'stop', t: 0, dur: 0.2, col: [i + 2, i + 1, i + 3], glow: [false, false, false] })),
  layout: 'big', lt: 1, prev: 'big', flashT: 0, lines: [], win: -1, winT: 0,
  setLayout(l) { if (l === this.layout) return; this.prev = this.layout; this.layout = l; this.lt = 0; },
  startAll() { this.r.forEach((r, i) => { r.state = 'spin'; r.vel = 15 + i * 1.5; r.glow = [false, false, false]; }); this.clearLines(); },
  /** col: 止まったときの [上, 中, 下] */
  stop(i, col, dur) { const r = this.r[i]; r.col = col.slice(); r.t = 0; r.dur = dur || 0.22; r.state = 'stopping'; this.refreshGlow(); },
  slow(i) { this.r[i].state = 'slow'; },
  stopSlow(i, col) { this.stop(i, col, 0.7); },
  setCol(i, col) { const r = this.r[i]; r.col = col.slice(); r.state = 'stop'; r.vel = 0; this.refreshGlow(); },
  setCols(cols) { for (let i = 0; i < 3; i++) this.setCol(i, cols[i]); this.flashT = 0.6; },
  zenkaiten() { const p = Math.floor(this.r[0].pos); this.r.forEach(r => { r.state = 'zen'; r.pos = p; r.vel = 2.6; r.glow = [true, true, true]; }); },
  stopAllAligned(n) { const col = [(n % 9) + 1, n, ((n + 7) % 9) + 1]; this.r.forEach(r => { r.col = col.slice(); r.t = 0; r.dur = 0.6; r.state = 'stopping'; r.glow = [true, true, true]; }); },
  // ---- ライン ----
  clearLines() { this.lines = []; this.win = -1; this.r.forEach(r => r.glow = [false, false, false]); },
  setLines(lines) { this.lines = lines.map(l => ({ line: l.line, num: l.num, t: 0 })); this.refreshGlow(); },
  addLine(l) { this.lines.push({ line: l.line, num: l.num, t: 0 }); this.refreshGlow(); },
  setWin(line) { this.win = line; this.winT = 0; this.refreshGlow(); },
  refreshGlow() {
    this.r.forEach(r => r.glow = [false, false, false]);
    for (const l of this.lines) { const ln = LINES[l.line]; this.r[0].glow[ln[0]] = true; this.r[2].glow[ln[2]] = true; }
    if (this.win >= 0) { const ln = LINES[this.win]; for (let i = 0; i < 3; i++) this.r[i].glow[ln[i]] = true; }
  },
  /** 昇格: 当りラインの図柄を n に差し替える（同じ列に n があれば入れ替える） */
  promoteLine(line, n) {
    const ln = LINES[line];
    for (let i = 0; i < 3; i++) { const c = this.r[i].col, row = ln[i], j = c.indexOf(n); if (j >= 0 && j !== row) c[j] = c[row]; c[row] = n; }
    this.flashT = 0.6;
  },
  update(dt) {
    if (this.lt < 1) this.lt = Math.min(1, this.lt + dt / 0.35);
    if (this.flashT > 0) this.flashT -= dt;
    this.winT += dt;
    for (let i = 0; i < this.lines.length; i++) this.lines[i].t += dt;
    for (let i = 0; i < 3; i++) {
      const r = this.r[i];
      if (r.state === 'spin' || r.state === 'zen') r.pos += r.vel * dt;
      else if (r.state === 'slow') { r.vel = lerp(r.vel, 2.4, Math.min(1, dt * 3)); r.pos += r.vel * dt; }
      else if (r.state === 'stopping') { r.t += dt; if (r.t >= r.dur) { r.state = 'stop'; Sound.play('stop'); } }
    }
  },
  geom(i, row, A, B, p) { GEO.x = lerp(A.x[i], B.x[i], p); GEO.y = lerp(A.y[row], B.y[row], p); return GEO; },
  draw(x, t) {
    if (this.layout === 'hidden' && this.prev === 'hidden') return;
    if (this.layout === 'hidden' && this.lt >= 1) return;
    const hidden = this.layout === 'hidden';
    const A = this.prev === 'small' ? SMALL : BIG, B = this.layout === 'small' ? SMALL : (hidden ? A : BIG);
    const p = easeInOut(this.lt);
    const alpha = hidden ? 1 - p : (this.prev === 'hidden' ? p : 1);
    const sc = lerp(A.s, B.s, p), gap = RG * sc / BIG.s;
    for (let i = 0; i < 3; i++) {
      const r = this.r[i];
      if (r.state === 'spin' || r.state === 'slow' || r.state === 'zen') {
        // 帯が流れる（上から下へ）
        const blur = r.state === 'spin' || (r.state === 'slow' && r.vel > 6);
        const k0 = Math.floor(r.pos), frac = r.pos - k0, mid = this.geom(i, 1, A, B, p), cx = mid.x, cy = mid.y;
        for (let kk = -2; kk <= 2; kk++) {
          const y = cy + (frac - kk) * gap, d = Math.abs(y - cy) / gap;
          if (d > 1.6) continue;
          const n = ((((k0 + kk) % 9) + 9) % 9) + 1, sp = DIG.s[n];
          if (r.state === 'zen' && d < 0.3) drawS(x, sp.glow, cx, y, sc * 1.05, alpha * 0.8);
          drawS(x, blur ? sp.blur : sp.norm, cx, y, sc, alpha * (1 - Math.max(0, d - 1) * 1.6));
        }
        continue;
      }
      // 止まっている（止まる途中は上から滑り込んで少し跳ねる）
      const k = r.state === 'stopping' ? Math.min(1, r.t / r.dur) : 1;
      const off = (1 - (r.dur > 0.4 ? easeOut(k) : easeOutBack(k))) * -gap * 0.9;
      for (let row = 0; row < 3; row++) {
        const g = this.geom(i, row, A, B, p), sp = DIG.s[r.col[row]]; if (!sp) continue;
        if (r.glow[row] && k >= 1) drawS(x, sp.glow, g.x, g.y, sc * (1.05 + 0.04 * Math.sin(t * 14)), alpha * (0.6 + 0.4 * Math.sin(t * 14)));
        drawS(x, sp.norm, g.x, g.y + off, sc, alpha);
      }
    }
    this.drawLines(x, t, A, B, p, alpha);
    if (this.flashT > 0) { x.globalCompositeOperation = 'lighter'; x.fillStyle = WHITE_A[aIdx(this.flashT)]; x.fillRect(0, 0, LW, LH); x.globalCompositeOperation = 'source-over'; }
  },
  /** テンパイライン（左右の図柄を結ぶ光の線）と当りライン（虹） */
  drawLines(x, t, A, B, p, alpha) {
    if (!this.lines.length && this.win < 0) return;
    const small = this.layout === 'small';
    x.save(); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
    const path = ln => { const a = this.geom(0, ln[0], A, B, p), ax = a.x, ay = a.y, b = this.geom(1, ln[1], A, B, p), bx = b.x, by = b.y, c = this.geom(2, ln[2], A, B, p); x.beginPath(); x.moveTo(ax - (small ? 8 : 34), ay - (ln[2] - ln[0]) * (small ? 3 : 12)); x.lineTo(ax, ay); x.lineTo(bx, by); x.lineTo(c.x, c.y); x.lineTo(c.x + (small ? 8 : 34), c.y + (ln[2] - ln[0]) * (small ? 3 : 12)); };
    for (const l of this.lines) {
      if (l.line === this.win) continue;
      const k = Math.min(1, l.t / 0.25), pulse = 0.55 + 0.35 * Math.sin(t * 9 + l.line);
      path(LINES[l.line]);
      x.strokeStyle = hue(LINE_HUE[l.line]); x.globalAlpha = alpha * 0.35 * k; x.lineWidth = small ? 5 : 16; x.stroke();
      x.globalAlpha = alpha * pulse * k; x.lineWidth = small ? 1.5 : 4; x.stroke();
    }
    if (this.win >= 0) {
      path(LINES[this.win]);
      x.strokeStyle = hue(t * 500); x.globalAlpha = alpha * 0.45; x.lineWidth = small ? 7 : 24; x.stroke();
      x.strokeStyle = '#ffffff'; x.globalAlpha = alpha * 0.9; x.lineWidth = small ? 2 : 6; x.stroke();
    }
    x.restore();
  }
};
const GEO = { x: 0, y: 0 };
