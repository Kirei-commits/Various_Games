/**
 * 盤面の物理（純粋。DOM・グローバルな乱数・時計に触らない）→ globalThis.PG.createPhysics
 *
 *   const phys = PG.createPhysics(cfg, { rng, emit, gates })
 *     rng   : [0,1) を返す関数（テストではシード付き）
 *     emit  : 入賞イベント emit('heso' | 'denchu' | 'attacker' | 'general' | 'warp')
 *     gates : { denchuOpen(): bool, attackerOpen(): bool }
 *
 * 約束ごと
 *  - 1フレームを substeps 回に分けて解く（最高速でも1回の移動量が 釘半径+球半径 より小さい）
 *  - 横並びの釘は pinGap 以上離す。壁・液晶からは pinMargin 以上離す。
 *    すき間が「球より狭いが0ではない」と球が挟まって止まるため（テストで止まり球0を確かめている）
 *  - 道釘は見た目だけ釘を並べ、当たりは摩擦の小さい1本のレール（釘の谷間で球が止まるため）
 */
(function (G) {
  'use strict';
  const PG = G.PG || (G.PG = {});
  const D2R = Math.PI / 180;

  PG.createPhysics = function (cfg, io) {
    const rng = io.rng, emit = io.emit, gates = io.gates;
    const P = cfg.physics, LY = cfg.layout, F = LY.field, LCD = LY.lcd;
    const RB = P.ballR, RP = P.pinR, RR2 = (RB + RP) * (RB + RP);
    const ACL = F.arcL, ACR = F.arcRc, AR = F.arcR, RAIL = F.rail;
    const RRAIL = AR - RAIL - RB - 0; // レール上の球の中心が通る半径
    const LA = F.bottom + 8 - ACL.y, LB = RRAIL * Math.PI / 2, LC = ACR.x - ACL.x;
    const PLATE = LY.plate, ROAD = LY.road, DC = LY.denchu, W = LY.W, H = LY.H;
    const plateY = x => PLATE.y1 + (PLATE.x1 - x) * (PLATE.y2 - PLATE.y1) / (PLATE.x1 - PLATE.x2);
    const CELL = 24, GC = Math.ceil(W / CELL), GR = Math.ceil(H / CELL), grid = new Array(GC * GR);
    const mills = LY.mills.map(m => ({ x: m.x, y: m.y, r: m.r, vr: m.vr, w: m.w, a: 0 }));
    const balls = [];
    for (let i = 0; i < P.poolSize; i++) balls.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, rail: false, s: 0, sRel: 0, vRel: 0, warp: 0, wchk: false, still: 0 });
    const RPOS = { x: 0, y: 0, tx: 0, ty: 0 };
    let px, py, np = 0, sx1, sy1, sdx, sdy, sl2, ns = 0, roadSeg = -1;
    let warpRate = P.warpRate;
    const stats = { launched: 0, heso: 0, denchu: 0, attacker: 0, general: 0, warp: 0, out: 0, stuck: 0 };

    function inField(x, y, m) {
      if (x < F.left + m || x > F.right - m || y < F.top + m || y > F.bottom) return false;
      if (y < ACL.y) {
        if (x < ACL.x) { const dx = x - ACL.x, dy = y - ACL.y; if (dx * dx + dy * dy > (AR - m) * (AR - m)) return false; }
        if (x > ACR.x) { const dx = x - ACR.x, dy = y - ACR.y; if (dx * dx + dy * dy > (AR - m) * (AR - m)) return false; }
      }
      return true;
    }
    const inLcd = (x, y, m) => x > LCD.x - m && x < LCD.x + LCD.w + m && y > LCD.y - m && y < LCD.y + LCD.h + m;

    function build() {
      const pts = [];
      const add = (x, y) => {
        if (!inField(x, y, RAIL + P.pinMargin) || inLcd(x, y, P.pinMargin)) return;
        for (let i = 0; i < pts.length; i += 2) { const dx = pts[i] - x, dy = pts[i + 1] - y; if (dx * dx + dy * dy < P.pinGap * P.pinGap) return; }
        pts.push(x, y);
      };
      // 左レーン（千鳥）
      for (let row = 0; row < 12; row++) { const y = 418 + row * 24; (row % 2 ? [50, 72, 94, 116] : [61, 83, 105]).forEach(x => add(x, y)); }
      // 天釘（左上）
      for (let a = 198; a <= 226; a += 9) add(ACL.x + 172 * Math.cos(a * D2R), ACL.y + 172 * Math.sin(a * D2R));
      // 風車まわり・液晶下左
      [[38, 708], [112, 708], [130, 732], [38, 770], [56, 796], [150, 760], [176, 744], [204, 736], [232, 732], [262, 734], [292, 742]].forEach(p => add(p[0], p[1]));
      // 命釘・寄り釘・ステージ落下口
      [[345, 826], [375, 826], [330, 806], [390, 806], [318, 778], [402, 778], [338, 742], [382, 742]].forEach(p => add(p[0], p[1]));
      // 液晶下右
      for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) { const x = 410 + c * 30 + (r % 2) * 15, y = 720 + r * 32; if (x < 566) add(x, y); }
      // 下段
      for (let c = 0; c < 9; c++) add(52 + c * 30, 860 + (c % 2) * 18);
      for (let c = 0; c < 7; c++) add(60 + c * 34, 908 + (c % 2) * 14);
      // 右レーン
      for (let r = 0; r < 10; r++) {
        const y = 418 + r * 36;
        (r % 2 ? [623, 649] : [610, 636, 662]).forEach(x => { const m = mills[1], dx = x - m.x, dy = y - m.y; if (dx * dx + dy * dy < 28 * 28 || y > 780) return; add(x, y); });
      }
      // 天釘（右上）
      for (let a = 296; a <= 330; a += 11) add(ACR.x + 172 * Math.cos(a * D2R), ACR.y + 172 * Math.sin(a * D2R));
      np = pts.length / 2; px = new Float32Array(np); py = new Float32Array(np);
      for (let i = 0; i < np; i++) { px[i] = pts[i * 2]; py[i] = pts[i * 2 + 1]; }
      for (let i = 0; i < grid.length; i++) grid[i] = null;
      const reach = RB + RP + 1;
      for (let i = 0; i < np; i++) {
        const c0 = Math.floor((px[i] - reach) / CELL), c1 = Math.floor((px[i] + reach) / CELL), r0 = Math.floor((py[i] - reach) / CELL), r1 = Math.floor((py[i] + reach) / CELL);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { if (c < 0 || r < 0 || c >= GC || r >= GR) continue; const k = c + r * GC; (grid[k] || (grid[k] = [])).push(i); }
      }
      // 壁
      const S = [];
      const seg = (a, b, c, d) => S.push(a, b, c, d);
      const lp = [], cr = LCD.r;
      const corner = (cx, cy, a0) => { for (let k = 0; k <= 4; k++) { const a = (a0 + k * 22.5) * D2R; lp.push(cx + cr * Math.cos(a), cy + cr * Math.sin(a)); } };
      corner(LCD.x + cr, LCD.y + cr, 180); corner(LCD.x + LCD.w - cr, LCD.y + cr, 270); corner(LCD.x + LCD.w - cr, LCD.y + LCD.h - cr, 0); corner(LCD.x + cr, LCD.y + LCD.h - cr, 90);
      for (let i = 0; i < lp.length / 2; i++) { const j = (i + 1) % (lp.length / 2); seg(lp[i * 2], lp[i * 2 + 1], lp[j * 2], lp[j * 2 + 1]); }
      const IW = LY.innerWall;
      seg(IW, LCD.y + LCD.h, IW, 908);                       // 右レーン内壁
      seg(IW + 1, 764, 614, 800); seg(686, 764, 666, 800);    // 電チューへの誘導
      seg(PLATE.x1, PLATE.y1, PLATE.x2, PLATE.y2);            // アタッカープレート
      seg(348, 846, 348, 866); seg(372, 846, 372, 866); seg(334, 852, 348, 846); seg(372, 846, 386, 852); // ヘソ
      seg(141, 934, 141, 950); seg(163, 934, 163, 950);       // 一般入賞口
      roadSeg = S.length / 4; seg(ROAD.x1, ROAD.y1, ROAD.x2, ROAD.y2); // 道釘
      ns = S.length / 4; sx1 = new Float32Array(ns); sy1 = new Float32Array(ns); sdx = new Float32Array(ns); sdy = new Float32Array(ns); sl2 = new Float32Array(ns);
      for (let i = 0; i < ns; i++) { sx1[i] = S[i * 4]; sy1[i] = S[i * 4 + 1]; sdx[i] = S[i * 4 + 2] - sx1[i]; sdy[i] = S[i * 4 + 3] - sy1[i]; sl2[i] = sdx[i] * sdx[i] + sdy[i] * sdy[i] || 1; }
    }

    function railPos(s) {
      if (s < LA) { RPOS.x = F.left + RAIL + RB; RPOS.y = F.bottom + 8 - s; RPOS.tx = 0; RPOS.ty = -1; return; }
      s -= LA;
      if (s < LB) { const a = Math.PI + s / RRAIL; RPOS.x = ACL.x + RRAIL * Math.cos(a); RPOS.y = ACL.y + RRAIL * Math.sin(a); RPOS.tx = -Math.sin(a); RPOS.ty = Math.cos(a); return; }
      s -= LB;
      if (s < LC) { RPOS.x = ACL.x + s; RPOS.y = ACL.y - RRAIL; RPOS.tx = 1; RPOS.ty = 0; return; }
      s -= LC;
      const a = 1.5 * Math.PI + s / RRAIL; RPOS.x = ACR.x + RRAIL * Math.cos(a); RPOS.y = ACR.y + RRAIL * Math.sin(a); RPOS.tx = -Math.sin(a); RPOS.ty = Math.cos(a);
    }
    function launch(strong) {
      let b = null; for (let i = 0; i < balls.length; i++) if (!balls[i].on) { b = balls[i]; break; }
      if (!b) return false;
      b.on = true; b.rail = true; b.s = 0; b.warp = 0; b.wchk = false; b.still = 0;
      const rg = strong ? P.releaseRight : P.releaseLeft;
      const deg = rg[0] + rng() * (rg[1] - rg[0]);
      b.sRel = strong ? LA + LB + LC + (deg - 270) * D2R * RRAIL : LA + (deg - 180) * D2R * RRAIL;
      b.vRel = P.releaseSpeed[0] + rng() * (P.releaseSpeed[1] - P.releaseSpeed[0]);
      railPos(0); b.x = RPOS.x; b.y = RPOS.y;
      stats.launched++;
      return true;
    }
    function bounce(b, nx, ny, pen, e, fr) {
      b.x += nx * pen; b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty, nvn = -vn * e, nvt = vt * fr; b.vx = nx * nvn + tx * nvt; b.vy = ny * nvn + ty * nvt; }
    }
    function kill(b, ev) { b.on = false; if (ev) { stats[ev]++; emit(ev); } else stats.out++; return true; }
    const Z = LY;
    function zones(b) {
      if (b.y > F.bottom) return kill(b, null);
      const hz = Z.heso; if (b.y > hz.y0 && b.y < hz.y1 && b.x > hz.x0 && b.x < hz.x1) return kill(b, 'heso');
      const gz = Z.general; if (b.y > gz.y0 && b.y < gz.y1 && b.x > gz.x0 && b.x < gz.x1) return kill(b, 'general');
      if (b.x > Z.innerWall) {
        const dz = DC.zone; if (gates.denchuOpen() && b.x > dz.x0 && b.x < dz.x1 && b.y > dz.y0 && b.y < dz.y1) return kill(b, 'denchu');
        if (gates.attackerOpen() && b.x > Z.attacker.x0 && b.x < Z.attacker.x1) { const y = plateY(b.x); if (b.y > y - RB - 5 && b.y < y + 8) return kill(b, 'attacker'); }
        if (b.x < Z.attacker.x0 + 2 && b.y > plateY(b.x) - RB - 3) return kill(b, null);
      }
      const wz = Z.warpZone;
      if (!b.wchk && b.x < wz.x1 && b.x > wz.x0 && b.y > wz.y0 && b.y < wz.y1) { b.wchk = true; if (rng() < warpRate) { b.warp = P.warpTime; stats.warp++; emit('warp'); return false; } }
      return false;
    }
    function step(b, h) {
      b.vy += P.gravity * h; b.x += b.vx * h; b.y += b.vy * h;
      const sp2 = b.vx * b.vx + b.vy * b.vy; if (sp2 > P.maxSpeed * P.maxSpeed) { const k = P.maxSpeed / Math.sqrt(sp2); b.vx *= k; b.vy *= k; }
      if (zones(b)) return false;
      if (b.warp > 0) return false;
      const er = P.restitution.rail, fr = P.friction.rail;
      if (b.y < ACL.y) {
        if (b.x < ACL.x) { const dx = b.x - ACL.x, dy = b.y - ACL.y, d2 = dx * dx + dy * dy, lim = AR - RAIL - RB; if (d2 > lim * lim) { const d = Math.sqrt(d2); bounce(b, -dx / d, -dy / d, d - lim, er, fr); } }
        else if (b.x > ACR.x) { const dx = b.x - ACR.x, dy = b.y - ACR.y, d2 = dx * dx + dy * dy, lim = AR - RAIL - RB; if (d2 > lim * lim) { const d = Math.sqrt(d2); bounce(b, -dx / d, -dy / d, d - lim, er, fr); } }
        else if (b.y < F.top + RAIL + RB) bounce(b, 0, 1, F.top + RAIL + RB - b.y, er, fr);
      }
      if (b.x < F.left + RAIL + RB) bounce(b, 1, 0, F.left + RAIL + RB - b.x, er, fr);
      else if (b.x > F.right - RAIL - RB) bounce(b, -1, 0, b.x - (F.right - RAIL - RB), er, fr);
      // 釘
      const cx = b.x / CELL | 0, cy = b.y / CELL | 0;
      if (cx >= 0 && cy >= 0 && cx < GC && cy < GR) {
        const cell = grid[cx + cy * GC];
        if (cell) for (let j = 0; j < cell.length; j++) {
          const p = cell[j], dx = b.x - px[p], dy = b.y - py[p], d2 = dx * dx + dy * dy;
          if (d2 < RR2) {
            const d = Math.sqrt(d2) || 0.01, jt = (rng() - 0.5) * P.pinJitter, c = Math.cos(jt), s = Math.sin(jt), nx = dx / d, ny = dy / d;
            bounce(b, nx * c - ny * s, nx * s + ny * c, RB + RP - d, P.restitution.pin, P.friction.pin);
          }
        }
      }
      // 電チュー（閉じているときはフタ）
      if (!gates.denchuOpen()) { const dx = b.x - DC.x, dy = b.y - (DC.y - 4), d2 = dx * dx + dy * dy, r = RB + 8; if (d2 < r * r) { const d = Math.sqrt(d2) || 0.01; bounce(b, dx / d, dy / d, r - d, 0.4, 0.9); } }
      // 壁
      for (let i = 0; i < ns; i++) {
        let t = ((b.x - sx1[i]) * sdx[i] + (b.y - sy1[i]) * sdy[i]) / sl2[i]; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = b.x - (sx1[i] + sdx[i] * t), ey = b.y - (sy1[i] + sdy[i] * t), d2 = ex * ex + ey * ey;
        if (d2 < RB * RB) {
          const d = Math.sqrt(d2) || 0.01;
          if (i === roadSeg) bounce(b, ex / d, ey / d, RB - d, P.restitution.road, P.friction.road);
          else bounce(b, ex / d, ey / d, RB - d, P.restitution.wall, P.friction.wall);
        }
      }
      // 風車
      for (let i = 0; i < mills.length; i++) {
        const m = mills[i], dx = b.x - m.x, dy = b.y - m.y, d2 = dx * dx + dy * dy, r = RB + m.r;
        if (d2 < r * r) { const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d; bounce(b, nx, ny, r - d, P.restitution.mill, 0.9); b.vx += -ny * m.w * m.r * P.millKick; b.vy += nx * m.w * m.r * P.millKick; }
      }
      return true;
    }
    function update(dt) {
      for (let i = 0; i < mills.length; i++) mills[i].a += mills[i].w * dt;
      const sub = P.substeps, h = dt / sub;
      for (let k = 0; k < balls.length; k++) {
        const b = balls[k]; if (!b.on) continue;
        if (b.rail) {
          b.s += P.railSpeed * dt;
          if (b.s >= b.sRel) { railPos(b.sRel); b.x = RPOS.x; b.y = RPOS.y; b.vx = RPOS.tx * b.vRel; b.vy = RPOS.ty * b.vRel; b.rail = false; }
          else { railPos(b.s); b.x = RPOS.x; b.y = RPOS.y; }
          continue;
        }
        if (b.warp > 0) { b.warp -= dt; if (b.warp <= 0) { const sd = LY.stageDrop; b.warp = 0; b.x = sd.x + rng() * sd.w; b.y = sd.y; b.vx = (rng() - 0.5) * 50; b.vy = 40; } continue; }
        for (let s = 0; s < sub; s++) if (!step(b, h)) break;
        if (b.on && b.warp <= 0) {
          if (b.vx * b.vx + b.vy * b.vy < P.stuckSpeed * P.stuckSpeed) { b.still += dt; if (b.still > P.stuckTime) { b.on = false; stats.stuck++; } }
          else b.still = 0;
        }
      }
    }
    build();
    return {
      launch, update, balls, mills, plateY, inField, stats,
      get np() { return np; }, get px() { return px; }, get py() { return py; },
      setWarp(v) { warpRate = v; },
      active() { let n = 0; for (let i = 0; i < balls.length; i++) if (balls[i].on) n++; return n; },
      resetStats() { for (const k in stats) stats[k] = 0; }
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
