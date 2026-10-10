// 演出（画面座標）。控えめ・軽さ優先: 数に上限をつけ、古いものから捨てる
const FX = (() => {
  let parts = [], texts = [], rings = [];
  const MAXP = CFG.fx.maxParticles, MAXT = CFG.fx.maxTexts;
  function push(arr, o, max) { if (arr.length >= max) arr.shift(); arr.push(o); }
  function bones(x, y, s, n = 6) {
    for (let i = 0; i < n; i++) push(parts, { k: 'bone', x, y, vx: rand(-260, 260) * s, vy: rand(-520, -160) * s, g: 1300 * s, a: rand(6.28), va: rand(-12, 12), life: rand(0.5, 0.8), t: 0, s: s * rand(0.7, 1.1) }, MAXP);
    push(parts, { k: 'puff', x, y, life: 0.35, t: 0, s }, MAXP);
  }
  function shards(x, y, s, color) {
    for (let i = 0; i < 14; i++) push(parts, { k: 'shard', x: x + rand(-60, 60) * s, y, vx: rand(-300, 300) * s, vy: rand(-500, -100) * s, g: 1400 * s, a: rand(6.28), va: rand(-14, 14), life: rand(0.5, 0.9), t: 0, s, color }, MAXP);
  }
  function sparkle(x, y, s, color = '#ffe37a', n = 12) {
    for (let i = 0; i < n; i++) { const a = i / n * 6.28; push(parts, { k: 'spark', x, y, vx: Math.cos(a) * 260 * s, vy: Math.sin(a) * 260 * s, g: 0, life: 0.5, t: 0, s, color }, MAXP); }
  }
  function ring(x, y, r, color = 'rgba(255,200,80,', life = 0.35) { push(rings, { x, y, r, color, life, t: 0 }, 40); }
  function text(x, y, str, { color = '#fff', size = 30, life = 0.7, vy = -90, stroke = '#2a0a3a' } = {}) { push(texts, { x, y, str, color, size, life, t: 0, vy, stroke }, MAXT); }
  function update(dt) {
    for (const p of parts) { p.t += dt; if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; } if (p.va) p.a += p.va * dt; }
    parts = parts.filter(p => p.t < p.life);
    for (const t of texts) { t.t += dt; t.y += t.vy * dt; }
    texts = texts.filter(t => t.t < t.life);
    for (const r of rings) r.t += dt;
    rings = rings.filter(r => r.t < r.life);
  }
  function draw(g) {
    for (const r of rings) {
      const k = r.t / r.life;
      g.strokeStyle = r.color + (1 - k).toFixed(2) + ')'; g.lineWidth = 8 * (1 - k) + 2;
      g.beginPath(); g.ellipse(r.x, r.y, r.r * (0.4 + k * 0.8), r.r * (0.4 + k * 0.8) * 0.55, 0, 0, 7); g.stroke();
    }
    for (const p of parts) {
      const k = p.t / p.life;
      g.globalAlpha = Math.min(1, (1 - k) * 2);
      if (p.k === 'bone') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.scale(p.s, p.s);
        g.fillStyle = '#f5f0e6'; g.strokeStyle = '#6b6357'; g.lineWidth = 2;
        g.beginPath(); g.rect(-9, -2.5, 18, 5); g.arc(-10, -3, 3.5, 0, 7); g.arc(-10, 3, 3.5, 0, 7); g.arc(10, -3, 3.5, 0, 7); g.arc(10, 3, 3.5, 0, 7); g.fill(); g.stroke();
        g.restore();
      } else if (p.k === 'puff') {
        g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(p.x, p.y, (14 + k * 40) * p.s, 0, 7); g.fill();
      } else if (p.k === 'shard') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.color || '#334155'; g.fillRect(-7 * p.s, -4 * p.s, 14 * p.s, 8 * p.s); g.restore();
      } else if (p.k === 'spark') {
        g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, 6 * p.s * (1 - k) + 1, 0, 7); g.fill();
      }
    }
    g.globalAlpha = 1;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const t of texts) {
      const k = t.t / t.life;
      g.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      const sc = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, k);
      g.font = `900 ${Math.round(t.size * sc)}px "M PLUS Rounded 1c","Hiragino Maru Gothic ProN",sans-serif`;
      g.lineWidth = t.size * 0.2; g.strokeStyle = t.stroke; g.strokeText(t.str, t.x, t.y);
      g.fillStyle = t.color; g.fillText(t.str, t.x, t.y);
    }
    g.globalAlpha = 1;
  }
  function clear() { parts = []; texts = []; rings = []; }
  return { bones, shards, sparkle, ring, text, update, draw, clear, get count() { return parts.length + texts.length; } };
})();
