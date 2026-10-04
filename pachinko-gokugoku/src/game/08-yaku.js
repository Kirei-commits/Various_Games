// =====================================================================
//  役物（巨大FEVERロゴ）とパトランプ
// =====================================================================
const Yaku = {
  y: 276, st: 'rest', t: 0, sprite: null, hit: false,
  build() {
    const o = mkCanvas(380, 230), x = o.x;
    x.save(); x.translate(190, 112);
    x.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 98 : 112; x.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 0.95); } x.closePath();
    const g = x.createLinearGradient(0, -110, 0, 110); g.addColorStop(0, '#fff7c0'); g.addColorStop(0.35, '#ffcc22'); g.addColorStop(0.5, '#a06000'); g.addColorStop(0.65, '#ffd84a'); g.addColorStop(1, '#6a3a00');
    x.fillStyle = g; x.shadowColor = 'rgba(255,190,0,1)'; x.shadowBlur = 24; x.fill(); x.shadowBlur = 0; x.lineWidth = 5; x.strokeStyle = '#2e1600'; x.stroke();
    x.beginPath(); x.ellipse(0, 0, 140, 78, 0, 0, TAU); const g2 = x.createRadialGradient(0, -20, 10, 0, 0, 140); g2.addColorStop(0, '#a00000'); g2.addColorStop(1, '#1a0000'); x.fillStyle = g2; x.fill(); x.lineWidth = 6; x.strokeStyle = '#ffe680'; x.stroke();
    x.restore();
    const t1 = makeText('極極', 78, 'red'); x.drawImage(t1.c, 190 - t1.w / 2, 90 - t1.h / 2, t1.w, t1.h);
    const t2 = makeText('FEVER', 46, 'gold', F_HEAVY); x.drawImage(t2.c, 190 - t2.w / 2, 158 - t2.h / 2, t2.w, t2.h);
    this.sprite = o;
  },
  drop() { this.st = 'drop'; this.t = 0; this.hit = false; Sound.play('whoosh'); },
  update(dt) {
    this.t += dt;
    if (this.st === 'drop') {
      const p = Math.min(1, this.t / 0.5); this.y = 276 + (534 - 276) * easeOutBounce(p);
      if (!this.hit && p > 0.36) { this.hit = true; Sound.play('boom'); FX.shake(28, 0.8); FX.flash(WHITE_A, 0.9); FX.confetti(90); FX.sparks(360, 600, 60, 40, 500); }
      if (this.t > 2.6) { this.st = 'rise'; this.t = 0; }
    } else if (this.st === 'rise') { const p = Math.min(1, this.t / 1.1); this.y = 534 + (276 - 534) * easeInOut(p); if (p >= 1) this.st = 'rest'; }
  },
  draw(x, t) {
    const sc = this.st === 'rest' ? 0.6 : this.st === 'drop' ? 1.15 : lerp(1.15, 0.6, Math.min(1, this.t / 1.1));
    if (this.st === 'rest') { x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3); x.fillStyle = M.ledMode() === 'rainbow' ? hue(t * 400) : '#ffb000'; x.beginPath(); x.ellipse(360, this.y, 130, 60, 0, 0, TAU); x.fill(); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
    drawS(x, this.sprite, 360, this.y, sc, 1);
  }
};
const Patlamp = {
  t: 0, on: 0,
  fire() { this.on = 2.6; Sound.play('patlamp'); FX.shake(10, 0.4); },
  update(dt) { this.t += dt; if (this.on > 0) this.on -= dt; },
  draw(x) {
    const cx = 664, cy = 252;
    x.fillStyle = '#3a0000'; x.beginPath(); x.arc(cx, cy + 4, 24, Math.PI, 0); x.fill();
    x.fillStyle = this.on > 0 ? '#ff2020' : '#6a0a0a'; x.beginPath(); x.arc(cx, cy, 20, Math.PI, 0); x.fill();
    x.fillStyle = '#c9a227'; x.fillRect(cx - 28, cy, 56, 10);
    if (this.on > 0) {
      const a = this.t * 9;
      x.save(); x.globalCompositeOperation = 'lighter'; x.translate(cx, cy - 6);
      for (let k = 0; k < 2; k++) { const aa = a + k * Math.PI; x.fillStyle = RED_A[8]; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 900, aa - 0.18, aa + 0.18); x.closePath(); x.fill(); }
      x.restore();
      x.globalCompositeOperation = 'lighter'; x.fillStyle = RED_A[3 + ((this.t * 8 | 0) % 2) * 3]; x.fillRect(0, 196, W, 976); x.globalCompositeOperation = 'source-over';
    }
  }
};
