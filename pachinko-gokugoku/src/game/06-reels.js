// =====================================================================
//  リール（図柄）
// =====================================================================
const SP = 168;
const BIG = { x: [86, 226, 366], y: 142, s: 0.88 };
const SMALL = { x: [32, 74, 116], y: 34, s: 0.28 };
const Reels = {
  r: [0, 1, 2].map(i => ({ pos: i * 3 + 1, vel: 0, state: 'stop', from: 0, dest: 0, t: 0, dur: 0.2, num: 1, glow: false, hide: false })),
  layout: 'big', lt: 1, prev: 'big', zen: false, flashT: 0,
  setLayout(l) { if (l === this.layout) return; this.prev = this.layout; this.layout = l; this.lt = 0; },
  startAll() { this.zen = false; this.r.forEach((r, i) => { r.state = 'spin'; r.vel = 15 + i * 1.5; r.glow = false; r.hide = false; }); },
  stop(i, num, dur) {
    const r = this.r[i]; const idx = num - 1; let k = Math.ceil(r.pos + 1.2); while ((((k % 9) + 9) % 9) !== idx) k++;
    r.from = r.pos; r.dest = k; r.t = 0; r.dur = dur || 0.22; r.state = 'stopping'; r.num = num;
  },
  slow(i) { const r = this.r[i]; r.state = 'slow'; },
  stopSlow(i, num) { const r = this.r[i]; const idx = num - 1; let k = Math.ceil(r.pos + 1.5); while ((((k % 9) + 9) % 9) !== idx) k++; r.from = r.pos; r.dest = k; r.t = 0; r.dur = clamp((k - r.pos) / 3.2, 0.5, 2.6); r.state = 'stopping'; r.num = num; },
  set(i, num) { const r = this.r[i]; r.pos = num - 1; r.state = 'stop'; r.num = num; r.vel = 0; },
  setAll(n) { for (let i = 0; i < 3; i++) this.set(i, n); this.flashT = 0.6; },
  zenkaiten() { this.zen = true; const p = this.r[0].pos; this.r.forEach(r => { r.state = 'zen'; r.pos = Math.floor(p); r.vel = 2.6; r.glow = true; }); },
  stopAllAligned(n) { const r0 = this.r[0]; let k = Math.ceil(r0.pos + 1.5); while ((((k % 9) + 9) % 9) !== n - 1) k++; this.r.forEach(r => { r.pos = r0.pos; r.from = r0.pos; r.dest = k; r.t = 0; r.dur = clamp((k - r0.pos) / 2.4, 0.6, 3); r.state = 'stopping'; r.num = n; }); this.zen = false; },
  allStopped() { return this.r.every(r => r.state === 'stop'); },
  update(dt) {
    if (this.lt < 1) this.lt = Math.min(1, this.lt + dt / 0.35);
    if (this.flashT > 0) this.flashT -= dt;
    for (let i = 0; i < 3; i++) {
      const r = this.r[i];
      if (r.state === 'spin') r.pos += r.vel * dt;
      else if (r.state === 'slow') { r.vel = lerp(r.vel, 2.4, Math.min(1, dt * 3)); r.pos += r.vel * dt; }
      else if (r.state === 'zen') r.pos += r.vel * dt;
      else if (r.state === 'stopping') {
        r.t += dt; const p = Math.min(1, r.t / r.dur);
        r.pos = r.from + (r.dest - r.from) * (r.dur > 0.4 ? easeOut(p) : easeOutBack(p));
        if (p >= 1) { r.state = 'stop'; r.pos = ((r.dest % 9) + 9) % 9; Sound.play('stop'); }
      }
    }
  },
  draw(x, t) {
    if (this.layout === 'hidden' && this.lt >= 1) return;
    const A = this.prev === 'small' ? SMALL : BIG, B = this.layout === 'small' ? SMALL : BIG;
    const p = easeInOut(this.lt);
    const alpha = this.layout === 'hidden' ? 1 - p : (this.prev === 'hidden' ? p : 1);
    if (this.layout === 'hidden' && this.prev === 'hidden') return;
    const sc = lerp(A.s, B.s, this.layout === 'hidden' ? 0 : p), cyy = lerp(A.y, B.y, this.layout === 'hidden' ? 0 : p);
    for (let i = 0; i < 3; i++) {
      const r = this.r[i]; if (r.hide) continue;
      const cx = lerp(A.x[i], B.x[i], this.layout === 'hidden' ? 0 : p);
      const moving = r.state === 'spin' || (r.state === 'slow' && r.vel > 6);
      const k0 = Math.floor(r.pos), frac = r.pos - k0;
      for (let kk = -1; kk <= 1; kk++) {
        const k = k0 + kk; const y = cyy + (frac - kk) * SP * sc;
        const dist = Math.abs(y - cyy) / (SP * sc);
        if (dist > 1.05) continue;
        const n = (((k % 9) + 9) % 9) + 1; const sp = DIG.s[n]; if (!sp) continue;
        const a = alpha * (1 - dist * 0.55);
        if (!moving && r.glow && dist < 0.3) { const pulse = 0.6 + 0.4 * Math.sin(t * 14); drawS(x, sp.glow, cx, y, sc * (1.04 + pulse * 0.04), a); }
        drawS(x, moving ? sp.blur : sp.norm, cx, y, sc, a);
      }
    }
    if (this.flashT > 0) { x.globalCompositeOperation = 'lighter'; x.fillStyle = WHITE_A[aIdx(this.flashT)]; x.fillRect(0, 0, LW, LH); x.globalCompositeOperation = 'source-over'; }
  }
};
