// =====================================================================
//  筐体枠LED（通常:青緑グラデ流れ / リーチ:赤点滅 / 確定:レインボー高速回転）
// =====================================================================
const Frame = {
  n: 0, xs: null, ys: null,
  build() {
    const x0 = 13, y0 = 207, w = 694, h = 954, r = 40, N = 92;
    const segs = [w - 2 * r, Math.PI * r / 2, h - 2 * r, Math.PI * r / 2, w - 2 * r, Math.PI * r / 2, h - 2 * r, Math.PI * r / 2];
    const per = segs.reduce((a, b) => a + b, 0);
    this.n = N; this.xs = new Float32Array(N); this.ys = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let d = i / N * per, k = 0; while (d > segs[k]) { d -= segs[k]; k++; }
      let X, Y;
      switch (k) {
        case 0: X = x0 + r + d; Y = y0; break;
        case 1: { const a = -Math.PI / 2 + d / r; X = x0 + w - r + Math.cos(a) * r; Y = y0 + r + Math.sin(a) * r; break; }
        case 2: X = x0 + w; Y = y0 + r + d; break;
        case 3: { const a = d / r; X = x0 + w - r + Math.cos(a) * r; Y = y0 + h - r + Math.sin(a) * r; break; }
        case 4: X = x0 + w - r - d; Y = y0 + h; break;
        case 5: { const a = Math.PI / 2 + d / r; X = x0 + r + Math.cos(a) * r; Y = y0 + h - r + Math.sin(a) * r; break; }
        case 6: X = x0; Y = y0 + h - r - d; break;
        default: { const a = Math.PI + d / r; X = x0 + r + Math.cos(a) * r; Y = y0 + r + Math.sin(a) * r; }
      }
      this.xs[i] = X; this.ys[i] = Y;
    }
  },
  draw(x, t) {
    const mode = M.ledMode(); if (mode === 'off') return;
    const br = [0, 0.45, 0.75, 1][D.settings.bright], N = this.n;
    x.globalCompositeOperation = 'lighter';
    const blinkOn = ((t * 9) | 0) % 2 === 0;
    for (let i = 0; i < N; i++) {
      let c;
      if (mode === 'rainbow') c = hue(i * 360 / N * 2 - t * 1100);
      else if (mode === 'reach') c = blinkOn ? '#ff1010' : '#3a0000';
      else if (mode === 'flash') c = (t * 16 | 0) % 2 ? '#ff0000' : '#300000';
      else if (mode === 'rush') c = hue(40 + 15 * Math.sin(t * 6 - i * 0.3));
      else c = hue(168 + 46 * Math.sin(t * 2.4 - i * 0.2));
      x.fillStyle = c;
      x.globalAlpha = br * 0.3; x.beginPath(); x.arc(this.xs[i], this.ys[i], 12, 0, TAU); x.fill();
      x.globalAlpha = br; x.beginPath(); x.arc(this.xs[i], this.ys[i], 4.6, 0, TAU); x.fill();
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }
};
