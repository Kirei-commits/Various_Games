// 絵（すべてコードで描く）。一度だけ小さなキャンバスに描いて、あとは drawImage で拡大縮小して使う
const Sprites = (() => {
  const cache = new Map();
  const SZ = 128;
  function make(key, w, h, fn) {
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g, w, h);
    cache.set(key, c);
    return c;
  }
  const OUT = '#1b1030';
  function blob(g, pts, fill, lw = 4) { g.beginPath(); pts(g); g.fillStyle = fill; g.fill(); g.strokeStyle = OUT; g.lineWidth = lw; g.stroke(); }
  function ellipse(g, x, y, rx, ry, fill, lw = 4) { blob(g, gg => gg.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2), fill, lw); }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, gr = (n >> 8) & 255, b = n & 255;
    const f = v => clamp(Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)), 0, 255);
    return `rgb(${f(r)},${f(gr)},${f(b)})`;
  }

  // ---------- 武器（盤面と弾で共通。中心が (64,64)、右上を向く） ----------
  const WEAPON = {
    sickle(g) {
      g.save(); g.translate(64, 64); g.rotate(-0.6);
      blob(g, gg => gg.rect(-7, -10, 14, 62), '#5b3fa8');
      blob(g, gg => gg.rect(-8, 38, 16, 12), '#3b2a6b');
      blob(g, gg => { gg.moveTo(-6, -14); gg.quadraticCurveTo(-58, -40, -60, 6); gg.quadraticCurveTo(-46, -22, 6, -2); gg.closePath(); }, '#d6dbe6');
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(-14, -20); g.quadraticCurveTo(-44, -28, -52, -6); g.stroke();
      blob(g, gg => gg.rect(-10, -18, 20, 12), '#9aa3b5');
      g.restore();
    },
    sword(g) {
      g.save(); g.translate(64, 64); g.rotate(0.75);
      blob(g, gg => { gg.moveTo(0, -56); gg.lineTo(11, -42); gg.lineTo(11, 14); gg.lineTo(-11, 14); gg.lineTo(-11, -42); gg.closePath(); }, '#cfd6e4');
      g.fillStyle = '#eef2f8'; g.fillRect(-3, -44, 6, 54);
      blob(g, gg => gg.rect(-24, 14, 48, 10), '#7bc142');
      blob(g, gg => gg.rect(-6, 24, 12, 24), '#2f7d32');
      ellipse(g, 0, 52, 8, 6, '#7bc142');
      g.restore();
    },
    staff(g) {
      g.save(); g.translate(64, 64); g.rotate(0.6);
      blob(g, gg => gg.rect(-5, -30, 10, 86), '#c98a3c');
      blob(g, gg => { gg.moveTo(-14, -26); gg.lineTo(14, -26); gg.lineTo(8, -14); gg.lineTo(-8, -14); gg.closePath(); }, '#3b82f6');
      blob(g, gg => { gg.moveTo(-6, -20); gg.lineTo(-22, -6); gg.lineTo(-10, -12); gg.closePath(); }, '#38bdf8', 3);
      ellipse(g, 0, -42, 17, 17, '#7dd3fc');
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-5, -47, 5, 0, 7); g.fill();
      g.restore();
    },
    sling(g) {
      g.save(); g.translate(64, 64); g.rotate(-0.3);
      blob(g, gg => { gg.moveTo(-6, 50); gg.lineTo(-6, 6); gg.quadraticCurveTo(-40, -6, -36, -44); gg.lineTo(-22, -46); gg.quadraticCurveTo(-24, -14, 0, -6); gg.quadraticCurveTo(24, -14, 22, -46); gg.lineTo(36, -44); gg.quadraticCurveTo(40, -6, 6, 6); gg.lineTo(6, 50); gg.closePath(); }, '#e8892c');
      g.strokeStyle = '#ffd08a'; g.lineWidth = 3; g.beginPath(); g.moveTo(-30, -38); g.quadraticCurveTo(-30, -14, -6, -6); g.stroke();
      blob(g, gg => gg.rect(-9, 30, 18, 10), '#ffd23f', 3);
      g.strokeStyle = '#6b3d10'; g.lineWidth = 3; g.beginPath(); g.moveTo(-29, -44); g.quadraticCurveTo(0, -10, 29, -44); g.stroke();
      g.restore();
    },
    bow(g) {
      g.save(); g.translate(64, 64); g.rotate(-0.7);
      g.strokeStyle = OUT; g.lineWidth = 12; g.beginPath(); g.arc(-26, 0, 54, -1.0, 1.0); g.stroke();
      g.strokeStyle = '#c0264b'; g.lineWidth = 7; g.beginPath(); g.arc(-26, 0, 54, -1.0, 1.0); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(3, -45); g.lineTo(3, 45); g.stroke();
      blob(g, gg => { gg.moveTo(26, -10); gg.lineTo(40, -26); gg.lineTo(34, -6); gg.closePath(); }, '#e5e7eb', 3);
      blob(g, gg => { gg.moveTo(26, 10); gg.lineTo(40, 26); gg.lineTo(34, 6); gg.closePath(); }, '#e5e7eb', 3);
      g.restore();
    },
    spear(g) {
      g.save(); g.translate(64, 64); g.rotate(0.75);
      blob(g, gg => gg.rect(-4, -30, 8, 88), '#8b5a2b');
      blob(g, gg => { gg.moveTo(0, -62); gg.lineTo(11, -34); gg.lineTo(0, -26); gg.lineTo(-11, -34); gg.closePath(); }, '#e2e8f0');
      blob(g, gg => gg.rect(-9, -28, 18, 6), '#b91c1c', 3);
      g.restore();
    },
    axe(g) {
      g.save(); g.translate(64, 64); g.rotate(0.5);
      blob(g, gg => gg.rect(-5, -40, 10, 92), '#92582a');
      blob(g, gg => { gg.moveTo(4, -40); gg.quadraticCurveTo(46, -50, 44, -10); gg.quadraticCurveTo(28, -18, 4, -14); gg.closePath(); }, '#cbd5e1');
      blob(g, gg => { gg.moveTo(-4, -40); gg.quadraticCurveTo(-30, -44, -30, -20); gg.quadraticCurveTo(-20, -24, -4, -18); gg.closePath(); }, '#94a3b8');
      g.restore();
    },
    bomb(g) {
      ellipse(g, 60, 70, 36, 36, '#2b2d42');
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(48, 58, 10, 7, -0.6, 0, 7); g.fill();
      blob(g, gg => gg.rect(78, 26, 16, 14), '#64748b', 3);
      g.strokeStyle = '#a16207'; g.lineWidth = 4; g.beginPath(); g.moveTo(88, 26); g.quadraticCurveTo(96, 10, 108, 14); g.stroke();
      g.fillStyle = '#fbbf24'; g.beginPath(); g.arc(110, 13, 8, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(110, 13, 3, 0, 7); g.fill();
    },
    shuriken(g) {
      g.save(); g.translate(64, 64);
      blob(g, gg => { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; gg.lineTo(Math.cos(a) * 50, Math.sin(a) * 50); gg.lineTo(Math.cos(a + 0.785) * 14, Math.sin(a + 0.785) * 14); } gg.closePath(); }, '#cbd5e1');
      ellipse(g, 0, 0, 9, 9, '#334155', 3);
      g.restore();
    }
  };
  const weapon = w => make('w:' + w, SZ, SZ, g => WEAPON[w](g));

  // ---------- 英雄 ----------
  // 体（マント）＋顔＋頭（種類ごと）＋手に持った武器。段階でマント・王冠・オーラ・翼が増える
  function drawHero(g, type, tier, opt = {}) {
    const d = CFG.heroes[type];
    const col = d.color, acc = d.accent;
    g.save();
    g.translate(64, 70);
    const s = 0.86 + tier * 0.04; g.scale(s, s);
    if (tier >= 4) {
      const gr = g.createRadialGradient(0, 0, 10, 0, 0, 62); gr.addColorStop(0, 'rgba(255,240,150,.7)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, 7); g.fill();
      for (const sx of [-1, 1]) blob(g, gg => { gg.moveTo(sx * 18, -6); gg.quadraticCurveTo(sx * 64, -40, sx * 58, 6); gg.quadraticCurveTo(sx * 44, 0, sx * 40, 16); gg.quadraticCurveTo(sx * 30, 6, sx * 18, 12); gg.closePath(); }, '#fffbe6', 3);
    }
    if (tier >= 2) blob(g, gg => { gg.moveTo(-26, -10); gg.quadraticCurveTo(-46, 30, -36, 46); gg.lineTo(36, 46); gg.quadraticCurveTo(46, 30, 26, -10); gg.closePath(); }, tier >= 3 ? '#c81e4a' : shade(col, -0.35));
    // 体
    blob(g, gg => { gg.moveTo(-24, -6); gg.quadraticCurveTo(-34, 30, -28, 44); gg.lineTo(28, 44); gg.quadraticCurveTo(34, 30, 24, -6); gg.closePath(); }, col);
    g.fillStyle = shade(col, 0.25); g.fillRect(-4, 4, 8, 38);
    if (tier >= 3) { g.fillStyle = '#ffd23f'; g.fillRect(-26, 30, 52, 6); }
    // 顔
    const skin = { reaper: '#f1f0f7', knight: '#ffe1c4', mage: '#f1f0f7', rascal: '#ffd9b3', elf: '#ffe4cc', lancer: '#ffe1c4', warrior: '#f5c9a0', bomber: '#ffe1c4', ninja: '#ffe1c4' }[type];
    ellipse(g, 0, -20, 25, 23, skin);
    // 目
    const eye = (x) => {
      if (type === 'reaper' || type === 'mage') { g.fillStyle = '#1b1030'; g.beginPath(); g.ellipse(x, -18, 6, 7, 0, 0, 7); g.fill(); g.fillStyle = type === 'mage' ? '#ef4444' : '#a78bfa'; g.beginPath(); g.arc(x, -17, 2.5, 0, 7); g.fill(); }
      else { g.fillStyle = '#1b1030'; g.beginPath(); g.ellipse(x, -18, 3.5, 5, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 1, -20, 1.4, 0, 7); g.fill(); }
    };
    eye(-9); eye(9);
    if (type === 'reaper' || type === 'mage') { g.fillStyle = '#1b1030'; g.fillRect(-6, -6, 12, 3); for (let i = -4; i <= 4; i += 4) g.fillRect(i - 0.5, -8, 1.5, 6); }
    else if (type === 'ninja') { blob(g, gg => { gg.moveTo(-25, -14); gg.lineTo(25, -14); gg.lineTo(22, 0); gg.quadraticCurveTo(0, 6, -22, 0); gg.closePath(); }, '#1e293b', 3); }
    else { g.strokeStyle = '#1b1030'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, -10, 5, 0.2, Math.PI - 0.2); g.stroke(); }
    if (type === 'rascal') { g.fillStyle = '#d97706'; for (const x of [-14, -11, 11, 14]) { g.beginPath(); g.arc(x, -10, 1.3, 0, 7); g.fill(); } }
    // 頭
    const HEAD = {
      reaper() { blob(g, gg => { gg.moveTo(-30, -6); gg.quadraticCurveTo(-34, -40, 0, -58); gg.quadraticCurveTo(34, -40, 30, -6); gg.quadraticCurveTo(22, -34, 0, -40); gg.quadraticCurveTo(-22, -34, -30, -6); gg.closePath(); }, col); },
      knight() { blob(g, gg => { gg.moveTo(-28, -16); gg.quadraticCurveTo(-28, -50, 0, -50); gg.quadraticCurveTo(28, -50, 28, -16); gg.lineTo(20, -28); gg.lineTo(-20, -28); gg.closePath(); }, '#cbd5e1'); blob(g, gg => { gg.moveTo(0, -50); gg.quadraticCurveTo(10, -72, 28, -64); gg.quadraticCurveTo(14, -58, 6, -48); gg.closePath(); }, col, 3); },
      mage() { blob(g, gg => { gg.moveTo(-40, -30); gg.lineTo(40, -30); gg.lineTo(22, -38); gg.quadraticCurveTo(14, -70, 24, -84); gg.quadraticCurveTo(-6, -74, -22, -38); gg.closePath(); }, col); g.fillStyle = '#facc15'; g.fillRect(-20, -40, 40, 5); },
      rascal() { blob(g, gg => { gg.moveTo(-26, -24); gg.quadraticCurveTo(-26, -50, 0, -50); gg.quadraticCurveTo(26, -50, 26, -24); gg.closePath(); }, col); blob(g, gg => gg.rect(-40, -28, 22, 8), shade(col, -0.25), 3); },
      elf() { for (const sx of [-1, 1]) blob(g, gg => { gg.moveTo(sx * 22, -22); gg.lineTo(sx * 44, -34); gg.lineTo(sx * 24, -12); gg.closePath(); }, '#ffe4cc', 3); blob(g, gg => { gg.moveTo(-28, -12); gg.quadraticCurveTo(-30, -52, 0, -50); gg.quadraticCurveTo(30, -52, 28, -12); gg.quadraticCurveTo(18, -36, 0, -38); gg.quadraticCurveTo(-18, -36, -28, -12); gg.closePath(); }, '#fde68a'); blob(g, gg => gg.rect(-26, -40, 52, 6), col, 3); },
      lancer() { blob(g, gg => { gg.moveTo(-27, -14); gg.quadraticCurveTo(-28, -50, 0, -50); gg.quadraticCurveTo(28, -50, 27, -14); gg.lineTo(18, -26); gg.lineTo(-18, -26); gg.closePath(); }, '#e5e7eb'); blob(g, gg => { gg.moveTo(-4, -50); gg.lineTo(0, -74); gg.lineTo(4, -50); gg.closePath(); }, col, 3); blob(g, gg => gg.rect(-3, -48, 6, 22), col, 2); },
      warrior() { blob(g, gg => { gg.moveTo(-27, -18); gg.quadraticCurveTo(-28, -48, 0, -48); gg.quadraticCurveTo(28, -48, 27, -18); gg.closePath(); }, '#94a3b8'); for (const sx of [-1, 1]) blob(g, gg => { gg.moveTo(sx * 22, -36); gg.quadraticCurveTo(sx * 46, -44, sx * 42, -66); gg.quadraticCurveTo(sx * 36, -48, sx * 18, -44); gg.closePath(); }, '#fef3c7', 3); },
      bomber() { blob(g, gg => { gg.moveTo(-27, -20); gg.quadraticCurveTo(-28, -50, 0, -50); gg.quadraticCurveTo(28, -50, 27, -20); gg.closePath(); }, '#7f1d1d'); blob(g, gg => gg.rect(-26, -32, 52, 12), '#334155', 3); for (const x of [-10, 10]) ellipse(g, x, -26, 8, 7, '#fbbf24', 3); },
      ninja() { blob(g, gg => { gg.moveTo(-27, -14); gg.quadraticCurveTo(-28, -48, 0, -48); gg.quadraticCurveTo(28, -48, 27, -14); gg.closePath(); }, '#1e293b'); g.fillStyle = skin; g.fillRect(-20, -26, 40, 12); eye(-9); eye(9); blob(g, gg => { gg.moveTo(24, -30); gg.lineTo(46, -40); gg.lineTo(42, -28); gg.closePath(); }, '#dc2626', 3); }
    };
    HEAD[type]();
    if (type === 'ninja') { g.fillStyle = '#1b1030'; }
    if (tier >= 3) {
      blob(g, gg => { gg.moveTo(-18, -54); gg.lineTo(-18, -70); gg.lineTo(-9, -60); gg.lineTo(0, -74); gg.lineTo(9, -60); gg.lineTo(18, -70); gg.lineTo(18, -54); gg.closePath(); }, '#ffd23f', 3);
      if (tier >= 4) { g.fillStyle = '#ef4444'; g.beginPath(); g.arc(0, -61, 3.5, 0, 7); g.fill(); }
    }
    // 武器
    if (!opt.noWeapon) { g.save(); g.translate(30, 18); g.scale(0.42, 0.42); g.translate(-64, -64); WEAPON[d.weapon](g); g.restore(); }
    g.restore();
  }
  const hero = (type, tier) => make(`h:${type}:${tier}`, SZ, SZ, g => drawHero(g, type, tier));

  // ---------- 敵 ----------
  function goblinBody(g, body, opt = {}) {
    blob(g, gg => { gg.moveTo(-22, 0); gg.quadraticCurveTo(-26, 36, -18, 40); gg.lineTo(18, 40); gg.quadraticCurveTo(26, 36, 22, 0); gg.closePath(); }, shade(body, -0.15));
    for (const sx of [-1, 1]) blob(g, gg => { gg.moveTo(sx * 18, -18); gg.lineTo(sx * 42, -28); gg.lineTo(sx * 20, -4); gg.closePath(); }, body, 3);
    ellipse(g, 0, -12, 24, 21, body);
    g.fillStyle = '#1b1030'; g.save(); g.beginPath(); g.ellipse(-8, -12, 6, 3.5, 0.3, 0, 7); g.ellipse(8, -12, 6, 3.5, -0.3, 0, 7); g.fill(); g.restore();
    g.strokeStyle = '#1b1030'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-7, -1); g.quadraticCurveTo(0, 4, 7, -1); g.stroke();
    if (!opt.noHat) blob(g, gg => { gg.moveTo(-22, -20); gg.quadraticCurveTo(-18, -42, 4, -40); gg.quadraticCurveTo(22, -38, 22, -20); gg.quadraticCurveTo(0, -28, -22, -20); gg.closePath(); }, '#7c4a1e', 3);
    if (!opt.noKnife) blob(g, gg => { gg.moveTo(18, 28); gg.lineTo(40, 22); gg.lineTo(36, 32); gg.closePath(); }, '#e2e8f0', 3);
  }
  const ENEMY = {
    goblin(g) { goblinBody(g, '#a020f0'); },
    runner(g) { goblinBody(g, '#e040fb', { noHat: true }); blob(g, gg => gg.rect(-24, -26, 48, 7), '#facc15', 3); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; for (const y of [10, 20, 30]) { g.beginPath(); g.moveTo(-40, y); g.lineTo(-28, y); g.stroke(); } },
    orc(g) {
      g.scale(1.2, 1.2);
      blob(g, gg => { gg.moveTo(-28, -4); gg.quadraticCurveTo(-34, 36, -24, 42); gg.lineTo(24, 42); gg.quadraticCurveTo(34, 36, 28, -4); gg.closePath(); }, '#64748b');
      ellipse(g, 0, -12, 26, 22, '#65a30d');
      blob(g, gg => { gg.moveTo(-27, -12); gg.quadraticCurveTo(-26, -42, 0, -42); gg.quadraticCurveTo(26, -42, 27, -12); gg.lineTo(14, -18); gg.lineTo(-14, -18); gg.closePath(); }, '#94a3b8', 3);
      g.fillStyle = '#fef08a'; g.fillRect(-10, -14, 6, 4); g.fillRect(4, -14, 6, 4);
      for (const sx of [-1, 1]) blob(g, gg => { gg.moveTo(sx * 6, -2); gg.lineTo(sx * 9, -10); gg.lineTo(sx * 12, -2); gg.closePath(); }, '#fff', 2);
    },
    shield(g) { goblinBody(g, '#8b2fc9', { noKnife: true }); ellipse(g, -6, 18, 26, 28, '#9ca3af'); ellipse(g, -6, 18, 16, 18, '#6b7280', 3); ellipse(g, -6, 18, 5, 5, '#fbbf24', 2); },
    skeleton(g, rev) {
      blob(g, gg => { gg.moveTo(-14, 2); gg.lineTo(-16, 40); gg.lineTo(16, 40); gg.lineTo(14, 2); gg.closePath(); }, '#e5e7eb');
      g.strokeStyle = '#9ca3af'; g.lineWidth = 3; for (const y of [12, 20, 28]) { g.beginPath(); g.moveTo(-12, y); g.lineTo(12, y); g.stroke(); }
      ellipse(g, 0, -14, 22, 20, '#f8fafc');
      g.fillStyle = '#1b1030'; g.beginPath(); g.arc(-8, -15, 6, 0, 7); g.arc(8, -15, 6, 0, 7); g.fill();
      g.fillStyle = rev ? '#ef4444' : '#38bdf8'; g.beginPath(); g.arc(-8, -15, 2.5, 0, 7); g.arc(8, -15, 2.5, 0, 7); g.fill();
      g.fillStyle = '#1b1030'; g.fillRect(-7, -3, 14, 3);
      blob(g, gg => { gg.moveTo(18, 30); gg.lineTo(22, -10); gg.lineTo(26, 30); gg.closePath(); }, '#cbd5e1', 3);
    },
    slime(g, color = '#38bdf8') {
      blob(g, gg => { gg.moveTo(-36, 36); gg.quadraticCurveTo(-40, -30, 0, -34); gg.quadraticCurveTo(40, -30, 36, 36); gg.closePath(); }, color);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(-16, -14, 8, 12, -0.4, 0, 7); g.fill();
      g.fillStyle = '#1b1030'; g.beginPath(); g.ellipse(-9, 4, 4, 7, 0, 0, 7); g.ellipse(11, 4, 4, 7, 0, 0, 7); g.fill();
    },
    minislime(g) { g.scale(0.7, 0.7); ENEMY.slime(g, '#7dd3fc'); },
    bat(g) {
      for (const sx of [-1, 1]) blob(g, gg => { gg.moveTo(sx * 10, -6); gg.quadraticCurveTo(sx * 40, -36, sx * 54, -8); gg.quadraticCurveTo(sx * 44, -6, sx * 40, 6); gg.quadraticCurveTo(sx * 30, -2, sx * 24, 10); gg.quadraticCurveTo(sx * 18, 2, sx * 10, 10); gg.closePath(); }, '#581c87', 3);
      ellipse(g, 0, 0, 18, 18, '#7e22ce');
      g.fillStyle = '#fde047'; g.beginPath(); g.arc(-6, -2, 3.5, 0, 7); g.arc(6, -2, 3.5, 0, 7); g.fill();
      for (const sx of [-1, 1]) blob(g, gg => { gg.moveTo(sx * 6, -14); gg.lineTo(sx * 12, -28); gg.lineTo(sx * 14, -12); gg.closePath(); }, '#7e22ce', 2);
    },
    ghost(g) {
      g.globalAlpha = 0.9;
      blob(g, gg => { gg.moveTo(-28, 36); gg.lineTo(-28, -8); gg.quadraticCurveTo(-28, -40, 0, -40); gg.quadraticCurveTo(28, -40, 28, -8); gg.lineTo(28, 36); gg.lineTo(18, 28); gg.lineTo(9, 36); gg.lineTo(0, 28); gg.lineTo(-9, 36); gg.lineTo(-18, 28); gg.closePath(); }, '#f1f5f9');
      g.fillStyle = '#1b1030'; g.beginPath(); g.ellipse(-9, -12, 5, 8, 0, 0, 7); g.ellipse(9, -12, 5, 8, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(0, 6, 6, 8, 0, 0, 7); g.fill();
    },
    shaman(g) {
      goblinBody(g, '#9d4edd', { noHat: true, noKnife: true });
      blob(g, gg => { gg.moveTo(-24, -10); gg.lineTo(24, -10); gg.lineTo(18, 6); gg.lineTo(-18, 6); gg.closePath(); }, '#f97316', 3);
      g.fillStyle = '#fff'; g.fillRect(-12, -6, 6, 4); g.fillRect(6, -6, 6, 4);
      for (const [x, c] of [[-12, '#ef4444'], [0, '#facc15'], [12, '#22c55e']]) blob(g, gg => { gg.moveTo(x, -28); gg.quadraticCurveTo(x - 6, -52, x, -60); gg.quadraticCurveTo(x + 6, -52, x, -28); gg.closePath(); }, c, 2);
      blob(g, gg => gg.rect(26, -30, 6, 70), '#92400e', 3); ellipse(g, 29, -34, 9, 9, '#4ade80', 3);
    },
    bombgob(g) { ENEMY.goblin(g); g.save(); g.translate(-22, -30); g.scale(0.38, 0.38); g.translate(-64, -64); WEAPON.bomb(g); g.restore(); },
    // ボス
    king(g) {
      g.scale(1.15, 1.15);
      blob(g, gg => { gg.moveTo(-34, -4); gg.quadraticCurveTo(-50, 40, -40, 46); gg.lineTo(40, 46); gg.quadraticCurveTo(50, 40, 34, -4); gg.closePath(); }, '#b91c1c');
      goblinBody(g, '#7e22ce', { noHat: true, noKnife: true });
      blob(g, gg => { gg.moveTo(-20, -28); gg.lineTo(-20, -52); gg.lineTo(-10, -40); gg.lineTo(0, -56); gg.lineTo(10, -40); gg.lineTo(20, -52); gg.lineTo(20, -28); gg.closePath(); }, '#ffd23f', 3);
      blob(g, gg => gg.rect(28, -20, 7, 64), '#a16207', 3); ellipse(g, 31, -24, 10, 10, '#ef4444', 3);
    },
    gslime(g) { ENEMY.slime(g, '#22c55e'); blob(g, gg => { gg.moveTo(-16, -30); gg.lineTo(-16, -50); gg.lineTo(-8, -40); gg.lineTo(0, -54); gg.lineTo(8, -40); gg.lineTo(16, -50); gg.lineTo(16, -30); gg.closePath(); }, '#ffd23f', 3); },
    dknight(g) {
      g.scale(1.1, 1.1);
      blob(g, gg => { gg.moveTo(-30, -4); gg.quadraticCurveTo(-42, 40, -34, 46); gg.lineTo(34, 46); gg.quadraticCurveTo(42, 40, 30, -4); gg.closePath(); }, '#1e1b4b');
      blob(g, gg => { gg.moveTo(-28, 6); gg.quadraticCurveTo(-28, -46, 0, -48); gg.quadraticCurveTo(28, -46, 28, 6); gg.lineTo(18, -4); gg.lineTo(-18, -4); gg.closePath(); }, '#312e81');
      g.fillStyle = '#ef4444'; g.fillRect(-16, -20, 12, 5); g.fillRect(4, -20, 12, 5);
      for (const sx of [-1, 1]) blob(g, gg => { gg.moveTo(sx * 20, -36); gg.quadraticCurveTo(sx * 40, -46, sx * 40, -70); gg.quadraticCurveTo(sx * 30, -50, sx * 14, -44); gg.closePath(); }, '#6d28d9', 3);
      g.save(); g.translate(32, 10); g.scale(0.7, 0.7); g.translate(-64, -64); WEAPON.sword(g); g.restore();
    }
  };
  const enemy = (type, variant) => make(`e:${type}:${variant || ''}`, SZ, SZ, g => { g.translate(64, 64); ENEMY[type](g, variant); });

  /** 檻の中の英雄（鎖つき） */
  const caged = (type, tier) => make(`c:${type}:${tier}`, SZ, SZ, g => {
    drawHero(g, type, tier, { noWeapon: true });
    g.strokeStyle = '#475569'; g.lineWidth = 5;
    for (const [y, a] of [[52, 0.15], [70, -0.1], [88, 0.12], [104, -0.08]]) {
      g.save(); g.translate(64, y); g.rotate(a);
      for (let x = -40; x <= 40; x += 10) { g.strokeStyle = '#1e293b'; g.lineWidth = 6; g.beginPath(); g.ellipse(x, 0, 6, 3.5, 0, 0, 7); g.stroke(); g.strokeStyle = '#cbd5e1'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, 0, 6, 3.5, 0, 0, 7); g.stroke(); }
      g.restore();
    }
  });

  const hand = () => make('hand', SZ, SZ, g => {
    g.translate(56, 40);
    blob(g, gg => { gg.moveTo(0, 0); gg.quadraticCurveTo(0, -14, 9, -14); gg.quadraticCurveTo(18, -14, 18, 0); gg.lineTo(18, 30); gg.quadraticCurveTo(30, 22, 40, 30); gg.quadraticCurveTo(52, 26, 58, 38); gg.quadraticCurveTo(70, 36, 70, 52); gg.quadraticCurveTo(68, 84, 40, 86); gg.quadraticCurveTo(10, 86, 0, 60); gg.lineTo(-18, 36); gg.quadraticCurveTo(-22, 26, -10, 26); gg.lineTo(0, 36); gg.closePath(); }, '#ffffff', 5);
  });

  return { weapon, hero, enemy, caged, hand, drawHero, shade };
})();
