// =====================================================================
//  エフェクト（パーティクル・フラッシュ・シェイク・ポップ文字）
// =====================================================================
class PopList {
  constructor(n) { this.a = []; for (let i = 0; i < n; i++) this.a.push({ on: false, s: null, x: 0, y: 0, t: 0, dur: 1, anim: 'zoom', sc: 1 }); }
  add(s, x, y, dur, anim, sc) {
    let p = this.a[0]; for (let i = 0; i < this.a.length; i++) { if (!this.a[i].on) { p = this.a[i]; break; } if (this.a[i].t > p.t) p = this.a[i]; }
    p.on = true; p.s = s; p.x = x; p.y = y; p.t = 0; p.dur = dur || 1.2; p.anim = anim || 'zoom'; p.sc = sc || 1; return p;
  }
  clear() { for (let i = 0; i < this.a.length; i++) this.a[i].on = false; }
  update(dt) { for (let i = 0; i < this.a.length; i++) { const p = this.a[i]; if (p.on) { p.t += dt; if (p.t >= p.dur) p.on = false; } } }
  draw(x, t) {
    for (let i = 0; i < this.a.length; i++) {
      const p = this.a[i]; if (!p.on) continue;
      const k = p.t / p.dur; let sc = p.sc, a = 1, yy = p.y, xx = p.x;
      const fade = k > 0.82 ? 1 - (k - 0.82) / 0.18 : 1;
      if (p.anim === 'zoom') { const z = Math.min(1, p.t / 0.22); sc *= lerp(3, 1, easeOutBack(z)); a = Math.min(1, z * 2) * fade; if (p.t < 0.35) { xx += (rnd() - 0.5) * 10; yy += (rnd() - 0.5) * 10; } }
      else if (p.anim === 'drop') { const z = Math.min(1, p.t / 0.5); yy = lerp(p.y - 300, p.y, easeOutBounce(z)); a = fade; }
      else if (p.anim === 'rise') { yy = p.y - k * 60; a = fade; sc *= 1 + k * 0.1; }
      else if (p.anim === 'pulse') { sc *= 1 + 0.08 * Math.sin(t * 12); a = Math.min(1, p.t * 6) * fade; }
      else if (p.anim === 'slide') { const z = Math.min(1, p.t / 0.25); xx = lerp(p.x + 500, p.x, easeOut(z)); if (k > 0.8) xx = lerp(p.x, p.x - 500, (k - 0.8) / 0.2); }
      drawS(x, p.s, xx, yy, sc, a);
    }
  }
}
const FX = {
  parts: [], shakeT: 0, shakeI: 0, sx: 0, sy: 0, flashA: 0, flashC: WHITE_A, rainbowT: 0, pops: new PopList(14), dim: 0,
  init() { for (let i = 0; i < 420; i++) this.parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, h: 0, type: 0, rot: 0, vr: 0 }); },
  get() { for (let i = 0; i < this.parts.length; i++) if (!this.parts[i].on) return this.parts[i]; return null; },
  shake(i, d) { if (this.shakeT <= 0 || i >= this.shakeI) this.shakeI = i; this.shakeT = Math.max(this.shakeT, d); },
  flash(arr, a) { this.flashC = arr; this.flashA = a == null ? 1 : a; },
  rainbow(d) { this.rainbowT = Math.max(this.rainbowT, d); },
  confetti(n, y0) {
    for (let i = 0; i < n; i++) { const p = this.get(); if (!p) return; p.on = true; p.type = 0; p.x = rnd() * W; p.y = (y0 == null ? 180 : y0) - rnd() * 120; p.vx = (rnd() - 0.5) * 160; p.vy = 80 + rnd() * 220; p.life = 0; p.max = 2.2 + rnd() * 1.8; p.size = 6 + rnd() * 8; p.h = rnd() * 360; p.rot = rnd() * TAU; p.vr = (rnd() - 0.5) * 14; }
  },
  sparks(x, y, n, hBase, spd) {
    for (let i = 0; i < n; i++) { const p = this.get(); if (!p) return; const a = rnd() * TAU, v = (spd || 300) * (0.3 + rnd()); p.on = true; p.type = 1; p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.life = 0; p.max = 0.4 + rnd() * 0.6; p.size = 2 + rnd() * 4; p.h = hBase == null ? rnd() * 360 : hBase + rnd() * 30; }
  },
  pop(s, x, y, dur, anim, sc) { return this.pops.add(s, x, y, dur, anim, sc); },
  update(dt) {
    if (this.shakeT > 0) { this.shakeT -= dt; const k = this.shakeI * Math.min(1, this.shakeT * 3); this.sx = (rnd() - 0.5) * 2 * k; this.sy = (rnd() - 0.5) * 2 * k; if (this.shakeT <= 0) { this.sx = 0; this.sy = 0; } }
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 2.2);
    if (this.rainbowT > 0) this.rainbowT -= dt;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i]; if (!p.on) continue;
      p.life += dt; if (p.life >= p.max) { p.on = false; continue; }
      if (p.type === 0) { p.vy += 60 * dt; p.vx += Math.sin(p.life * 4 + p.h) * 30 * dt; p.rot += p.vr * dt; } else { p.vy += 400 * dt; p.vx *= 0.98; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    this.pops.update(dt);
  },
  draw(x, t) {
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i]; if (!p.on || p.type !== 1) continue;
      x.globalAlpha = 1 - p.life / p.max; x.fillStyle = hue(p.h); x.beginPath(); x.arc(p.x, p.y, p.size, 0, TAU); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i]; if (!p.on || p.type !== 0) continue;
      x.globalAlpha = Math.min(1, (p.max - p.life) * 2); x.fillStyle = hue(p.h + t * 200);
      const c = Math.cos(p.rot), s = Math.sin(p.rot); x.setTransform(c * R, s * R, -s * R * 0.5, c * R * 0.5, p.x * R, p.y * R); x.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    }
    x.setTransform(R, 0, 0, R, 0, 0); x.globalAlpha = 1;
    this.pops.draw(x, t);
    if (this.rainbowT > 0) { x.globalCompositeOperation = 'lighter'; x.globalAlpha = Math.min(0.35, this.rainbowT * 0.4); x.fillStyle = hue(t * 600); x.fillRect(0, 196, W, 976); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
    if (this.flashA > 0) { x.fillStyle = this.flashC[aIdx(this.flashA)]; x.fillRect(0, 0, W, H); }
  }
};
