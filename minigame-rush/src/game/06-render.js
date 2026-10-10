// 1フレームぶんの絵を描く。地面・通路・盤面のマス目は地形ごとに1回だけ描いておく
const Render = (() => {
  const P = View;
  let bgCache = { id: null, img: null };
  const WD = CFG.world;
  function quad(g, x0, y0, x1, y1) {
    g.beginPath();
    g.moveTo(P.sx(x0, y0), P.sy(y0)); g.lineTo(P.sx(x1, y0), P.sy(y0));
    g.lineTo(P.sx(x1, y1), P.sy(y1)); g.lineTo(P.sx(x0, y1), P.sy(y1)); g.closePath();
  }
  function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

  function buildBg(layoutId) {
    const c = document.createElement('canvas'); c.width = P.W; c.height = P.H;
    const g = c.getContext('2d');
    const layout = L.Stage.layout(layoutId);
    // 草
    const gr = g.createLinearGradient(0, 0, 0, P.H); gr.addColorStop(0, '#5fb83a'); gr.addColorStop(1, '#3f9a2a');
    g.fillStyle = gr; g.fillRect(0, 0, P.W, P.H);
    const r = seeded(7);
    for (let i = 0; i < 2600; i++) {
      const x = r() * P.W, y = r() * P.H, h = 6 + r() * 10 * (0.4 + y / P.H);
      g.strokeStyle = r() < 0.5 ? 'rgba(30,90,20,.35)' : 'rgba(170,230,110,.35)';
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - h); g.stroke();
    }
    const top = WD.fieldTop + 14;
    // 外側の石垣
    for (const [a, b] of [[-0.55, -0.05], [WD.W + 0.05, WD.W + 0.55]]) {
      g.fillStyle = '#6b6f7a'; quad(g, a, 0, b, top); g.fill();
      for (let y = 0; y < top; y += 0.9) {
        g.fillStyle = (Math.round(y / 0.9) % 2) ? '#8b909c' : '#7a7f8b';
        quad(g, a + 0.05, y + 0.05, b - 0.05, y + 0.85); g.fill();
      }
    }
    // 通路
    g.fillStyle = '#a3a39e'; quad(g, -0.05, 0, WD.W + 0.05, top); g.fill();
    for (let i = 0; i < 900; i++) {
      const y = WD.leakY + r() * (top - WD.leakY), x = r() * WD.W;
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)';
      const s = P.scale(y) * 0.06; g.fillRect(P.sx(x, y), P.sy(y), s * 2, s);
    }
    // 檻の部屋（壁で囲った区画）
    for (const rm of layout.rooms) {
      g.fillStyle = '#b8b8b2'; quad(g, rm.x0, rm.y0, rm.x1, top); g.fill();
      const wl = 0.12;
      g.fillStyle = '#7d6a5c';
      if (rm.x0 > 0.01) { quad(g, rm.x0, rm.y0, rm.x0 + wl, top); g.fill(); }
      if (rm.x1 < WD.W - 0.01) { quad(g, rm.x1 - wl, rm.y0, rm.x1, top); g.fill(); }
      quad(g, rm.x0, rm.y0, rm.x1, rm.y0 + wl * 2); g.fill();
      g.fillStyle = '#9a8676';
      for (let x = rm.x0; x < rm.x1 - 0.05; x += 0.5) { quad(g, x + 0.03, rm.y0 + 0.02, Math.min(rm.x1, x + 0.47), rm.y0 + wl * 2 - 0.03); g.fill(); }
    }
    // 盤面（黄色の市松）
    for (let row = 0; row < CFG.board.rows; row++) for (let col = 0; col < CFG.board.cols; col++) {
      g.fillStyle = (row + col) % 2 ? '#e2b33c' : '#d4a32c';
      quad(g, col, row, col + 1, row + 1); g.fill();
      g.strokeStyle = 'rgba(120,80,0,.35)'; g.lineWidth = 2; g.stroke();
    }
    g.strokeStyle = '#a77a12'; g.lineWidth = 4; quad(g, 0, 0, WD.W, CFG.board.rows); g.stroke();
    return c;
  }

  const font = (px, w = 900) => `${w} ${Math.round(px)}px "M PLUS Rounded 1c","Hiragino Maru Gothic ProN",sans-serif`;
  function outlined(g, str, x, y, px, fill = '#fff', stroke = '#1b1030') {
    g.font = font(px); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = px * 0.22; g.strokeStyle = stroke; g.strokeText(str, x, y);
    g.fillStyle = fill; g.fillText(str, x, y);
  }
  function shadow(g, x, y, s, w = 0.36) {
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(P.sx(x, y), P.sy(y), w * s, w * s * 0.35, 0, 0, 7); g.fill();
  }
  /** スプライトを足元 (x, y) に置く。size はワールド単位 */
  function sprite(g, img, x, y, size, { alpha = 1, rot = 0, lift = 0 } = {}) {
    const s = P.scale(y), px = size * s;
    const sx = P.sx(x, y), sy = P.sy(y) - px * 0.38 - lift * s;
    g.globalAlpha = alpha;
    if (rot) { g.save(); g.translate(sx, sy); g.rotate(rot); g.drawImage(img, -px / 2, -px / 2, px, px); g.restore(); }
    else g.drawImage(img, sx - px / 2, sy - px / 2, px, px);
    g.globalAlpha = 1;
  }
  const flashCache = new Map();
  function flashOf(img) {
    if (flashCache.has(img)) return flashCache.get(img);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, c.width, c.height);
    flashCache.set(img, c); return c;
  }

  function gateText(gt) {
    const d = CFG.gates[gt.id];
    let v = '';
    if (d.fmt === 'x') v = '×' + gt.value;
    else if (d.fmt === '+') v = '+' + gt.value;
    else if (d.fmt === '-') v = '-' + gt.value;
    else if (d.fmt === '+%') v = '+' + gt.value + '%';
    const label = gt.id === 'wpn' ? CFG.weapons[gt.wpn].name + 'の' + d.label : d.label;
    return [label, v];
  }
  function drawGate(g, gt) {
    const y = gt.y, s = P.scale(y);
    const xa = P.sx(gt.x0, y), xb = P.sx(gt.x1, y), base = P.sy(y), h = 0.95 * s;
    const bad = gt.kind === 'bad';
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(xa + 4, base - 4, xb - xa, 8);
    g.fillStyle = gt.flash > 0 ? '#ffffff' : (bad ? '#4a1620' : '#2c3344');
    g.strokeStyle = bad ? '#f87171' : '#94a3b8'; g.lineWidth = Math.max(2, s * 0.06);
    g.beginPath(); g.roundRect(xa, base - h, xb - xa, h, s * 0.08); g.fill(); g.stroke();
    // 鎖の飾り
    g.strokeStyle = bad ? 'rgba(248,113,113,.45)' : 'rgba(203,213,225,.35)'; g.lineWidth = s * 0.04;
    g.beginPath(); g.moveTo(xa + 4, base - h + 4); g.lineTo(xb - 4, base - 4); g.moveTo(xb - 4, base - h + 4); g.lineTo(xa + 4, base - 4); g.stroke();
    const [label, v] = gateText(gt);
    const fs = Math.min(s * 0.3, (xb - xa) / Math.max(4, label.length) * 1.1);
    outlined(g, label, (xa + xb) / 2, base - h * 0.66, fs, bad ? '#fecaca' : '#fff');
    if (v) outlined(g, v, (xa + xb) / 2, base - h * 0.28, s * 0.32, bad ? '#fca5a5' : '#fde68a');
    outlined(g, fmtNum(Math.max(0, gt.hp)), (xa + xb) / 2, base - h - s * 0.25, s * 0.42);
  }
  function drawCage(g, c, t) {
    const y = c.y0, s = P.scale(y);
    const drop = clamp((t - c.born) / 0.5, 0, 1);
    const w = c.x1 - c.x0, x = (c.x0 + c.x1) / 2;
    const size = Math.min(w * 1.25, 2.2);
    shadow(g, x, y + 0.6, s, size * 0.32);
    const img = Sprites.caged(c.hero, c.tier);
    sprite(g, c.flash > 0 ? flashOf(img) : img, x, y + 0.6, size, { lift: (1 - drop) * 4 });
    const top = P.sy(y + 0.6) - size * s * 0.95 - (1 - drop) * 4 * s;
    // 頭の上の飾り（段階の★）とHP
    outlined(g, '★'.repeat(c.tier), P.sx(x, y), top + s * 0.05, s * 0.22, '#ffd23f');
    outlined(g, fmtNum(Math.max(0, c.hp)), P.sx(x, y), top - s * 0.3, s * 0.55);
  }
  function drawEnemy(g, e, t) {
    const d = CFG.enemies[e.type] || CFG.bosses[e.type];
    const size = e.r * 2 * 1.45;
    const bob = Math.abs(Math.sin(t * 9 + e.wob)) * 0.06;
    shadow(g, e.x, e.y, P.scale(e.y), e.r);
    const img = Sprites.enemy(e.type, e.type === 'skeleton' && e.revived ? 1 : 0);
    sprite(g, e.flash > 0 ? flashOf(img) : img, e.x, e.y, size, { alpha: e.hidden ? 0.28 : 1, lift: bob + (d.zigzag ? 0.25 : 0) });
    if (!e.boss && e.hp < e.maxHp && e.maxHp > 60) {
      const s = P.scale(e.y), w = e.r * 1.6 * s, x = P.sx(e.x, e.y) - w / 2, y = P.sy(e.y) - size * s * 0.92;
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x, y, w, 5); g.fillStyle = '#f87171'; g.fillRect(x, y, w * e.hp / e.maxHp, 5);
    }
  }
  function drawProj(g, p) {
    const img = Sprites.weapon(p.w);
    const size = Math.max(0.45, p.r * 2.4) * (p.w === 'bomb' ? 0.9 : 1);
    const rot = CFG.weapons[p.w].spin ? -p.ang : Math.atan2(p.vx, p.vy) * 1 - 0.8;
    if (p.tier >= 3 || p.crit) {
      const s = P.scale(p.y);
      g.strokeStyle = p.crit ? 'rgba(255,90,90,.5)' : (p.tier >= 4 ? 'rgba(255,215,80,.55)' : 'rgba(140,255,140,.45)');
      g.lineWidth = size * s * 0.35;
      g.beginPath(); g.moveTo(P.sx(p.x, p.y), P.sy(p.y) - size * s * 0.38); const by = p.y - p.vy * 0.05;
      g.lineTo(P.sx(p.x - p.vx * 0.05, by), P.sy(by) - size * s * 0.38); g.stroke();
    }
    sprite(g, img, p.x, p.y, size, { rot });
  }

  function draw(g, game) {
    const sim = game.sim, S = sim.S, t = S.t;
    if (bgCache.id !== S.stage.layoutId) bgCache = { id: S.stage.layoutId, img: buildBg(S.stage.layoutId) };
    g.drawImage(bgCache.img, 0, 0);

    // 奥のもの（ゲート・檻・敵・弾）を奥から順に
    const far = [];
    for (const gt of S.gates) far.push([gt.y, 0, gt]);
    for (const c of S.cages) far.push([c.y0 + 0.6, 1, c]);
    for (const e of S.enemies) far.push([e.y, 2, e]);
    for (const p of S.projs) if (p.y >= WD.leakY) far.push([p.y, 3, p]);
    far.sort((a, b) => b[0] - a[0]);
    for (const [, k, o] of far) {
      if (k === 0) drawGate(g, o); else if (k === 1) drawCage(g, o, t); else if (k === 2) drawEnemy(g, o, t); else drawProj(g, o);
    }

    // 盤面の武器
    const usable = sim.owned();
    for (let row = CFG.board.rows - 1; row >= 0; row--) for (let col = 0; col < CFG.board.cols; col++) {
      const it = S.board[row][col]; if (!it) continue;
      const y = row + 0.5 + it.off;
      if (y > CFG.board.rows) continue;
      const ok = usable.has(it.w);
      shadow(g, col + 0.5, y - 0.15, P.scale(y), 0.3);
      sprite(g, Sprites.weapon(it.w), col + 0.5, y - 0.1, 0.92, { alpha: ok ? 1 : 0.55 });
    }
    // 英雄（つかんでいる英雄は一番手前）
    const hs = S.heroes.slice().sort((a, b) => (a.drag - b.drag) || (b.y - a.y));
    for (const h of hs) {
      const s = P.scale(h.y);
      const sel = game.evolvePick && h.tier < CFG.hero.maxTier;
      if (sel) { g.strokeStyle = `rgba(255,215,80,${0.6 + Math.sin(performance.now() / 120) * 0.3})`; g.lineWidth = 6; g.beginPath(); g.ellipse(P.sx(h.x, h.y), P.sy(h.y) - 4, 0.45 * s, 0.17 * s, 0, 0, 7); g.stroke(); }
      if (h.tier >= 4) { g.fillStyle = 'rgba(255,220,100,.25)'; g.beginPath(); g.ellipse(P.sx(h.x, h.y), P.sy(h.y), 0.5 * s, 0.2 * s, 0, 0, 7); g.fill(); }
      shadow(g, h.x, h.y - 0.2, s, 0.32);
      const born = clamp((t - h.born) / 0.3, 0, 1);
      const size = (1.05 + (h.drag ? 0.12 : 0)) * (0.5 + born * 0.5) * (1 + h.anim * 0.6);
      sprite(g, Sprites.hero(h.type, h.tier), h.x, h.y - 0.25, size, { lift: h.drag ? 0.25 : 0 });
      // 持っている弾の数（小さな点）
      if (h.ammo.length) {
        const cx = P.sx(h.x, h.y), cy = P.sy(h.y - 0.25) + 6;
        for (let i = 0; i < h.ammo.length; i++) { g.fillStyle = '#ffe37a'; g.beginPath(); g.arc(cx + (i - (h.ammo.length - 1) / 2) * 10, cy, 3.5, 0, 7); g.fill(); }
      }
    }
    for (const p of S.projs) if (p.y < WD.leakY) drawProj(g, p);
    FX.draw(g);
    if (game.tutorial) drawHand(g, game.tutorial);
  }

  function drawHand(g, tut) {
    const k = (performance.now() / 1000 % 2.2) / 2.2;
    const path = tut.path;
    if (!path || path.length < 2) return;
    const seg = k * (path.length - 1), i = Math.min(path.length - 2, Math.floor(seg)), f = seg - i;
    const x = lerp(path[i].x, path[i + 1].x, f), y = lerp(path[i].y, path[i + 1].y, f);
    const px = P.sx(x, y), py = P.sy(y);
    // 指先（絵の (65, 26)）が path の点に来るように置く
    g.globalAlpha = 0.95; g.drawImage(Sprites.hand(), px - 76, py - 30, 150, 150); g.globalAlpha = 1;
    outlined(g, tut.text, P.W / 2, P.sy(CFG.board.rows) - 50, 34, '#fff');
  }

  /** ハブのサムネイル */
  function thumb(cv) {
    const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, cv.height); gr.addColorStop(0, '#6cc444'); gr.addColorStop(1, '#3b8f2a'); g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#a3a39e'; g.beginPath(); g.moveTo(70, 0); g.lineTo(170, 0); g.lineTo(240, 240); g.lineTo(0, 240); g.closePath(); g.fill();
    for (let i = 0; i < 9; i++) g.drawImage(Sprites.enemy('goblin'), 120 + (i % 3) * 22, 10 + Math.floor(i / 3) * 18, 40, 40);
    g.drawImage(Sprites.caged('knight', 1), 10, 20, 100, 100);
    g.fillStyle = '#d4a32c'; g.fillRect(0, 160, 240, 80);
    for (let i = 0; i < 4; i++) g.drawImage(Sprites.weapon(['sickle', 'sword', 'staff', 'sickle'][i]), 6 + i * 58, 172, 56, 56);
    g.drawImage(Sprites.hero('reaper', 2), 70, 110, 110, 110);
  }

  return { draw, thumb, gateText, buildBg };
})();
