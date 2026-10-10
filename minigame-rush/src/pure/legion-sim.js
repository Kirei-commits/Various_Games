/**
 * 武器拾いレギオンの中身（純粋。乱数・通知は引数でもらう。DOM や時計には触れない）。
 *
 *   const sim = L.createSim(cfg, { stage, rng, meta, emit })
 *   sim.update(dt)              時間を進める（phase が 'play' のときだけ動く）
 *   sim.grab(id) / sim.dragTo(id, x, y) / sim.release(id)   英雄をつかんで動かして離す（x, y はワールド座標）
 *   sim.choose('join' | 'evolve', heroId)  檻の英雄を解放したあとの2択
 *   sim.S                       状態（描画とテストが読む）
 *
 * emit(type, data) で起きたことを知らせる: throw / hit / kill / leak / gate / cage / choice / merge / join / evolve /
 *   spawnBoss / bossDown / win / lose / heroLost / pickup / shift / revive / split / thunder / barrier / boom / heal / summon / charge
 */
(function (G) {
  const L = G.MGR.Legion;

  L.createSim = function (cfg, { stage, rng, meta = {}, emit = () => { } }) {
    const W = cfg.world.W, ROWS = cfg.board.rows, COLS = cfg.board.cols;
    const up = k => meta[k] || 0;
    const UP = cfg.upgrades;
    let nextId = 1;

    const baseMax = Math.round((cfg.base.hp + up('base') * UP.base.per) * (stage.baseHpMul || 1));
    const S = {
      t: 0, phase: 'play', stage,
      baseHp: baseMax, baseMax, barrier: 0,
      heroes: [], board: [], enemies: [], projs: [], gates: [], cages: [],
      slots: stage.layout.slots.map(() => null),
      mods: { atk: 1, rate: 1, pierce: 0, multi: 0, pspeed: 1, big: 1, crit: 0, wpn: {}, ammo: 0, slow: 1 },
      kills: 0, coins: 0, wave: 0,
      evIndex: 0, cageIndex: 0, cageDelay: 1.5, shiftT: cfg.board.shiftEvery,
      bossSpawned: false, bossDown: false, boss: null,
      choice: null, dragging: null, stats: { thrown: 0, leaked: 0, gates: 0, cagesFreed: 0, merges: 0, dmg: 0 }
    };

    // ---- 英雄 ----
    function owned() { const s = new Set(); for (const h of S.heroes) s.add(cfg.heroes[h.type].weapon); return s; }
    function heroAt(col, row, except) { return S.heroes.find(h => h !== except && !h.drag && h.col === col && h.row === row); }
    function freeCell(prefRows = [0, 1, 2, 3, 4, 5]) {
      for (const row of prefRows) {
        const cols = [2, 1, 3, 0, 4].filter(c => !heroAt(c, row));
        if (cols.length) return { col: cols[Math.floor(rng() * cols.length) % cols.length], row };
      }
      return null;
    }
    function addHero(type, tier = 1, cell) {
      if (S.heroes.length >= cfg.hero.maxHeroes) { S.coins += 10; return null; }
      const c = cell || freeCell([0, 1, 2, 3, 4, 5]);
      if (!c) return null;
      const h = { id: nextId++, type, tier, col: c.col, row: c.row, x: c.col + 0.5, y: c.row + 0.5, ammo: [], cool: 0, drag: false, born: S.t, anim: 0 };
      S.heroes.push(h);
      emit('join', { hero: h });
      return h;
    }
    function ammoMax() { return cfg.hero.ammoMax + up('ammo') * UP.ammo.per + S.mods.ammo; }

    // ---- 盤面 ----
    function randWeapon() {
      const mine = [...owned()];
      // 使えない武器ばかりで埋まらないように、盤面の「使える武器」の割合が目標より低いほど使える武器を出す
      let have = 0, all = 0;
      for (const row of S.board) for (const it of row) if (it) { all++; if (mine.includes(it.w)) have++; }
      const frac = all ? have / all : cfg.board.ownedWeight;
      const p = Math.max(0.35, Math.min(0.95, cfg.board.ownedWeight + (cfg.board.ownedWeight - frac) * 3));
      if (mine.length && rng() < p) return mine[Math.floor(rng() * mine.length) % mine.length];
      const others = stage.pool.filter(w => !mine.includes(w));
      const from = others.length ? others : (mine.length ? mine : stage.pool);
      return from[Math.floor(rng() * from.length) % from.length];
    }
    for (let r = 0; r < ROWS; r++) { S.board.push([]); for (let c = 0; c < COLS; c++) S.board[r].push({ w: randWeapon(), off: 0 }); }

    function settleBoard(dt) {
      // 空いたマスへ奥から詰める（手前が row 0）
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          if (S.board[r][c]) continue;
          let k = r + 1; while (k < ROWS && !S.board[k][c]) k++;
          if (k < ROWS) { const it = S.board[k][c]; S.board[k][c] = null; it.off += k - r; S.board[r][c] = it; }
        }
        for (let r = 0; r < ROWS; r++) if (!S.board[r][c]) S.board[r][c] = { w: randWeapon(), off: ROWS - r };
      }
      const fall = cfg.board.fallSpeed * dt;
      for (const row of S.board) for (const it of row) if (it.off > 0) it.off = Math.max(0, it.off - fall);
    }
    function shiftBoard() {
      // 盤面全体が手前へ1段流れる。いちばん手前の列は捨て、奥に新しい列
      S.board.shift();
      const row = []; for (let c = 0; c < COLS; c++) row.push({ w: randWeapon(), off: 1 });
      S.board.push(row);
      for (const r of S.board) for (const it of r) if (it) it.off += 1;
      for (const r of S.board) for (const it of r) if (it) it.off = Math.min(it.off, ROWS);
      emit('shift', {});
    }
    function tryPickup(h, col, row) {
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
      const it = S.board[row][col];
      if (!it || it.off > 0.35) return false;
      if (it.w !== cfg.heroes[h.type].weapon || h.ammo.length >= ammoMax()) return false;
      S.board[row][col] = null;
      h.ammo.push(it.w);
      emit('pickup', { hero: h, col, row, w: it.w });
      return true;
    }

    // ---- 弾 ----
    function heroDmg(h, w) {
      const wd = cfg.weapons[w];
      return wd.dmg * cfg.hero.tierDmg[h.tier - 1] * S.mods.atk * (S.mods.wpn[w] || 1) * (1 + up('atk') * UP.atk.per);
    }
    function throwFrom(h) {
      const w = h.ammo.shift();
      const wd = cfg.weapons[w];
      const dirs = wd.spread || [0];
      const extra = S.mods.multi;
      const sp = wd.speed * S.mods.pspeed;
      for (let m = 0; m <= extra; m++) {
        const dx = (m - extra / 2) * 0.3;
        for (const a of dirs) {
          const crit = rng() * 100 < S.mods.crit;
          S.projs.push({
            id: nextId++, w, tier: h.tier, x: Math.max(0.05, Math.min(W - 0.05, h.x + dx)), y: h.y + 0.3,
            vx: Math.sin(a) * sp, vy: Math.cos(a) * sp,
            dmg: heroDmg(h, w) * (crit ? cfg.gate.critMul : 1), crit,
            r: wd.r * S.mods.big, pierce: (wd.pierce || 0) + S.mods.pierce, bounce: wd.bounce || 0,
            aoe: wd.aoe ? wd.aoe * Math.sqrt(S.mods.big) : 0, aoeDmg: wd.aoeDmg || 0, homing: wd.homing || 0,
            hit: [], ang: 0, life: 4, dist: 0, range: (wd.range || cfg.hero.range) * Math.sqrt(S.mods.pspeed)
          });
        }
      }
      S.stats.thrown++;
      h.anim = 0.18;
      emit('throw', { hero: h, w });
    }
    function rate(h) {
      return cfg.hero.tierRate[h.tier - 1] * S.mods.rate * (1 + up('rate') * UP.rate.per);
    }

    // ---- 敵 ----
    function laneRange(lane) { const l = stage.layout.lanes[lane] || stage.layout.lanes[0]; return l; }
    function spawnEnemy(type, x, y, lane, hpMul, extra) {
      const d = cfg.enemies[type] || cfg.bosses[type];
      const boss = !!cfg.bosses[type];
      const hp = Math.max(1, Math.round(d.hp * hpMul));
      const e = {
        id: nextId++, type, boss, x, y, bx: x, lane, hp, maxHp: hp, r: d.r, speed: d.speed * stage.speedMul * (0.92 + rng() * 0.16),
        armor: d.armor || 0, leak: d.leak, coin: d.coin, revived: false, phaseT: rng() * 3, hidden: false,
        healT: 1 + rng() * 2, summonT: d.summon ? d.summon[1] : 0, chargeT: d.charge ? d.charge[0] : 0, charging: 0,
        tx: null, wob: rng() * 6.28, flash: 0, hpMul, ...extra
      };
      S.enemies.push(e);
      return e;
    }
    function spawnWave(ev) {
      const l = laneRange(ev.lane);
      const width = l.x1 - l.x0;
      const cols = Math.max(1, Math.floor(width / 0.55));
      const gap = width / cols;
      for (let i = 0; i < ev.count; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        spawnEnemy(ev.type, l.x0 + gap * (c + 0.5) + (rng() - 0.5) * 0.08, cfg.world.spawnY + r * 0.55, ev.lane, ev.hpMul);
      }
      if (ev.wave) S.wave = ev.wave;
    }
    function spawnGate(ev) {
      const l = laneRange(ev.lane);
      const w = Math.min(cfg.gate.w, l.x1 - l.x0 - 0.1);
      const x0 = l.x0 + 0.05 + (l.x1 - l.x0 - 0.1 - w) * ev.pos;
      const g = cfg.gates[ev.gate.id];
      S.gates.push({ id: nextId++, ...ev.gate, kind: g.kind, x0, x1: x0 + w, y: cfg.world.spawnY, maxHp: ev.gate.hp, speed: cfg.gate.speed * stage.speedMul, flash: 0 });
    }
    function spawnBoss(ev) {
      const l = laneRange(ev.lane);
      const e = spawnEnemy(ev.type, (l.x0 + l.x1) / 2, cfg.world.spawnY + 0.8, ev.lane, ev.hpMul);
      S.boss = e; S.bossSpawned = true;
      emit('spawnBoss', { enemy: e });
    }
    function damageEnemy(e, dmg, src) {
      if (e.dead) return;
      const real = Math.max(1, dmg - e.armor);
      e.hp -= real; e.flash = 0.12;
      S.stats.dmg += real;
      emit('hit', { enemy: e, dmg: real, crit: src && src.crit });
      if (e.hp <= 0) killEnemy(e);
    }
    function killEnemy(e) {
      const d = cfg.enemies[e.type] || cfg.bosses[e.type];
      if (d.revive && !e.revived) { e.revived = true; e.hp = Math.round(e.maxHp * d.revive); emit('revive', { enemy: e }); return; }
      e.dead = true;
      S.kills++;
      S.coins += e.coin;
      emit('kill', { enemy: e });
      if (d.split) {
        const child = e.boss ? 'slime' : 'minislime';
        for (let i = 0; i < d.split; i++) {
          const a = (i / d.split) * Math.PI * 2;
          spawnEnemy(child, clampX(e.x + Math.cos(a) * e.r * 0.8, e), e.y + Math.sin(a) * e.r * 0.6, e.lane, e.hpMul * (e.boss ? 1.4 : 1), { tx: null });
        }
        emit('split', { enemy: e });
      }
      if (e === S.boss) { S.bossDown = true; emit('bossDown', { enemy: e }); }
    }
    function clampX(x, e) {
      if (e.y > stage.layout.mergeY) { const l = laneRange(e.lane); return Math.max(l.x0 + e.r * 0.5, Math.min(l.x1 - e.r * 0.5, x)); }
      return Math.max(0.2, Math.min(W - 0.2, x));
    }

    // ---- ゲート ----
    function applyGate(g) {
      const def = cfg.gates[g.id], v = g.value, M = S.mods, cap = cfg.cap;
      switch (g.id) {
        case 'heroes': { const types = S.heroes.map(h => h.type); for (let i = 0; i < v; i++) addHero(types.length ? types[Math.floor(rng() * types.length) % types.length] : cfg.starterHero, 1); break; }
        case 'atkspd': M.rate = Math.min(cap.atkspd, M.rate * v); break;
        case 'atk': M.atk = Math.min(cap.atk, M.atk * v); break;
        case 'pierce': M.pierce = Math.min(cap.pierce, M.pierce + v); break;
        case 'multi': M.multi = Math.min(cap.multi, M.multi + v); break;
        case 'pspeed': M.pspeed = Math.min(cap.pspeed, M.pspeed * v); break;
        case 'big': M.big = Math.min(cap.big, M.big * v); break;
        case 'crit': M.crit = Math.min(cap.crit, M.crit + v); break;
        case 'wpn': M.wpn[g.wpn] = Math.min(8, (M.wpn[g.wpn] || 1) * v); break;
        case 'ammo': M.ammo += v; break;
        case 'heal': S.baseHp = Math.min(S.baseMax, S.baseHp + Math.round(S.baseMax * v / 100)); break;
        case 'barrier': S.barrier += v; break;
        case 'fever': { const mine = [...owned()]; for (const row of S.board) for (let c = 0; c < COLS; c++) row[c] = { w: mine[Math.floor(rng() * mine.length) % mine.length], off: 0 }; break; }
        case 'slow': M.slow = Math.max(cap.slow, M.slow * v); break;
        case 'thunder': for (const e of S.enemies) if (!e.dead) damageEnemy(e, e.maxHp * (e.boss ? 0.06 : 0.4), null); emit('thunder', {}); break;
        case 'evolve': { const c = S.heroes.filter(h => h.tier < cfg.hero.maxTier); if (c.length) { const h = c[Math.floor(rng() * c.length) % c.length]; h.tier++; emit('evolve', { hero: h }); } break; }
        case 'coin': S.coins += v; break;
        case 'atkDown': M.atk = Math.max(0.3, M.atk * v); break;
        case 'spdDown': M.rate = Math.max(0.3, M.rate * v); break;
        case 'horde': {
          const pool = cfg.enemyOrder.filter(k => cfg.enemies[k].from <= Math.max(1, stage.n || 9));
          const l = stage.layout.lanes.length;
          for (let i = 0; i < v; i++) {
            const lane = Math.floor(rng() * l) % l, lr = laneRange(lane);
            spawnEnemy(pool[Math.floor(rng() * pool.length) % pool.length], lr.x0 + 0.3 + rng() * (lr.x1 - lr.x0 - 0.6), cfg.world.spawnY + rng() * 1.2, lane, g.hpMul || hpNow());
          }
          break;
        }
        case 'haste': M.slow = Math.min(cap.haste, M.slow * v); break;
        case 'loseHero': if (S.heroes.length > 1) { const h = S.heroes.filter(x => !x.drag).sort((a, b) => a.tier - b.tier)[0]; if (h) { S.heroes.splice(S.heroes.indexOf(h), 1); emit('heroLost', { hero: h }); } } break;
      }
      S.stats.gates++;
      emit('gate', { gate: g, def });
    }
    function hpNow() {
      // わなのゲートで湧く敵の強さ: 直前の群れと同じ
      for (let i = S.evIndex - 1; i >= 0; i--) if (stage.events[i] && stage.events[i].kind === 'wave') return stage.events[i].hpMul;
      return 1;
    }

    // ---- 檻 ----
    function placeCages(dt) {
      for (let s = 0; s < S.slots.length; s++) {
        if (S.slots[s]) continue;
        if (S.cageIndex >= stage.cages.length) return;
        S.cageDelay -= dt;
        if (S.cageDelay > 0) return;
        const c = stage.cages[S.cageIndex++];
        const sl = stage.layout.slots[s];
        S.slots[s] = { id: nextId++, ...c, maxHp: c.hp, slot: s, x0: sl.x0, x1: sl.x1, y0: sl.y0, y1: sl.y1, flash: 0, born: S.t };
        S.cages.push(S.slots[s]);
        S.cageDelay = 2.5;
      }
    }
    function freeCage(c) {
      S.slots[c.slot] = null;
      S.cages.splice(S.cages.indexOf(c), 1);
      S.stats.cagesFreed++;
      S.choice = { hero: c.hero, tier: c.tier, canJoin: S.heroes.length < cfg.hero.maxHeroes, canEvolve: S.heroes.some(h => h.tier < cfg.hero.maxTier) };
      S.phase = 'choice';
      emit('cage', { cage: c });
      emit('choice', S.choice);
    }

    // ---- 当たり判定 ----
    function hitRect(p, x0, x1, y0, y1) { return p.x + p.r > x0 && p.x - p.r < x1 && p.y + p.r > y0 && p.y - p.r < y1; }
    function explode(p, x, y) {
      for (const e of S.enemies) if (!e.dead && !e.hidden && Math.hypot(e.x - x, e.y - y) < p.aoe + e.r) damageEnemy(e, p.dmg * p.aoeDmg, p);
      emit('boom', { x, y, r: p.aoe, w: p.w });
    }
    function afterHit(p, target) {
      p.hit.push(target.id);
      if (p.bounce > 0) {
        let best = null, bd = 3.5;
        for (const e of S.enemies) if (!e.dead && !e.hidden && !p.hit.includes(e.id)) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
        if (best) { p.bounce--; const sp = Math.hypot(p.vx, p.vy); p.vx = (best.x - p.x) / bd * sp; p.vy = (best.y - p.y) / bd * sp; return; }
      }
      if (p.pierce > 0) { p.pierce--; return; }
      p.dead = true;
    }
    function collide(p) {
      for (const c of S.cages) {
        if (!p.hit.includes(c.id) && hitRect(p, c.x0, c.x1, c.y0, c.y1)) {
          c.hp -= p.dmg; c.flash = 0.1; S.stats.dmg += p.dmg;
          emit('hitCage', { cage: c, dmg: p.dmg, x: p.x, y: p.y });
          p.hit.push(c.id); p.dead = true;
          if (c.hp <= 0) freeCage(c);
          return;
        }
      }
      for (const g of S.gates) {
        if (!g.dead && !p.hit.includes(g.id) && hitRect(p, g.x0, g.x1, g.y - cfg.gate.h / 2, g.y + cfg.gate.h / 2)) {
          g.hp -= p.dmg; g.flash = 0.1;
          emit('hitGate', { gate: g, dmg: p.dmg, x: p.x, y: p.y });
          if (g.hp <= 0) { g.dead = true; applyGate(g); }
          p.hit.push(g.id); p.dead = true;
          return;
        }
      }
      for (const e of S.enemies) {
        if (e.dead || e.hidden || p.hit.includes(e.id)) continue;
        const dx = e.x - p.x, dy = e.y - p.y, rr = e.r + p.r;
        if (dx * dx + dy * dy < rr * rr) {
          if (p.aoe) { p.hit.push(e.id); explode(p, p.x, p.y); p.dead = true; return; }
          damageEnemy(e, p.dmg, p);
          afterHit(p, e);
          if (p.dead) return;
        }
      }
    }
    function walled(p) {
      // 檻の部屋の壁は弾を止めない（檻が空でも奥へ抜ける）。通路の外へ出たら消す
      return p.x < -0.3 || p.x > W + 0.3 || p.y > cfg.world.fieldTop + 0.8 || p.y < -1;
    }

    // ---- 時間を進める ----
    function update(dt) {
      if (S.phase !== 'play') return;
      S.t += dt;

      // 出来事
      if (stage.endless) while (stage.generatedTo < S.t + 30) stage.more();
      while (S.evIndex < stage.events.length && stage.events[S.evIndex].t <= S.t) {
        const ev = stage.events[S.evIndex++];
        if (ev.kind === 'wave') spawnWave(ev);
        else if (ev.kind === 'gate') spawnGate(ev);
        else if (ev.kind === 'boss') spawnBoss(ev);
      }
      placeCages(dt);

      // 盤面
      S.shiftT -= dt;
      if (S.shiftT <= 0) { S.shiftT += cfg.board.shiftEvery; shiftBoard(); }
      settleBoard(dt);

      // 英雄
      for (const h of S.heroes) {
        h.anim = Math.max(0, h.anim - dt);
        if (!h.drag) {
          // 置いてある英雄は足元と、まわり（idleReach マス）の得意武器を拾う
          if (!tryPickup(h, h.col, h.row)) {
            const R = cfg.hero.idleReach;
            out: for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) if ((dr || dc) && tryPickup(h, h.col + dc, h.row + dr)) break out;
          }
        }
        else tryPickup(h, Math.floor(h.x), Math.floor(h.y));
        h.cool -= dt;
        if (h.cool <= 0 && h.ammo.length) {
          throwFrom(h);
          h.cool = cfg.weapons[cfg.heroes[h.type].weapon].every / rate(h);
        } else if (h.cool < 0) h.cool = 0;
      }
      settleBoard(0);   // 拾ったマスをすぐ埋める（盤面はいつも満杯）

      // 弾
      for (const p of S.projs) {
        if (p.homing) {
          let best = null, bd = 6;
          for (const e of S.enemies) if (!e.dead && !e.hidden && e.y > p.y - 0.2) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
          if (best) {
            const sp = Math.hypot(p.vx, p.vy);
            const tx = (best.x - p.x) / bd, ty = (best.y - p.y) / bd;
            p.vx += (tx * sp - p.vx) * Math.min(1, p.homing * dt);
            p.vy += (ty * sp - p.vy) * Math.min(1, p.homing * dt);
            const n = Math.hypot(p.vx, p.vy) || 1; p.vx = p.vx / n * sp; p.vy = p.vy / n * sp;
          }
        }
        const dist = Math.hypot(p.vx, p.vy) * dt;
        p.dist += dist;
        const steps = Math.max(1, Math.ceil(dist / 0.22));
        for (let i = 0; i < steps && !p.dead; i++) {
          p.x += p.vx * dt / steps; p.y += p.vy * dt / steps;
          if (p.y > cfg.world.leakY - 0.2) collide(p);
        }
        p.ang += dt * 14;
        p.life -= dt;
        if (walled(p) || p.life <= 0 || p.dist > p.range) p.dead = true;  // 射程を超えたら消える
        if (S.phase !== 'play') break;
      }
      S.projs = S.projs.filter(p => !p.dead);
      if (S.phase !== 'play') { tidy(); return; }

      // 敵
      const slow = S.mods.slow;
      for (const e of S.enemies) {
        if (e.dead) continue;
        const d = cfg.enemies[e.type] || cfg.bosses[e.type];
        e.flash = Math.max(0, e.flash - dt);
        let sp = e.speed * slow;
        if (d.charge) {
          e.chargeT -= dt;
          if (e.chargeT <= 0 && !e.charging) { e.charging = d.charge[1]; e.chargeT = d.charge[0]; emit('charge', { enemy: e }); }
          if (e.charging) { e.charging = Math.max(0, e.charging - dt); sp *= d.charge[2]; }
        }
        e.y -= sp * dt;
        // 合流したら道幅いっぱいに広がる
        if (e.y <= stage.layout.mergeY) {
          if (e.tx == null) e.tx = 0.35 + rng() * (W - 0.7);
          e.bx += Math.sign(e.tx - e.bx) * Math.min(Math.abs(e.tx - e.bx), 0.7 * dt);
        }
        e.x = d.zigzag ? clampX(e.bx + Math.sin(S.t * 2.2 + e.wob) * d.zigzag * 0.45, e) : clampX(e.bx, e);
        if (d.phase) { e.phaseT += dt; const cyc = d.phase[0] + d.phase[1]; e.hidden = (e.phaseT % cyc) > d.phase[0]; }
        if (d.heal) {
          e.healT -= dt;
          if (e.healT <= 0) {
            e.healT = d.heal[0];
            for (const o of S.enemies) if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < d.heal[1]) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * d.heal[2]);
            emit('heal', { enemy: e });
          }
        }
        if (d.summon) {
          e.summonT -= dt;
          if (e.summonT <= 0) {
            e.summonT = d.summon[1];
            for (let i = 0; i < d.summon[0]; i++) spawnEnemy('goblin', clampX(e.x + (i - d.summon[0] / 2) * 0.4, e), e.y + 0.6 + (i % 2) * 0.3, e.lane, e.hpMul * 0.9);
            emit('summon', { enemy: e });
          }
        }
        if (e.y <= cfg.world.leakY) {
          e.dead = true; e.leaked = true;
          S.stats.leaked++;
          // ボスに拠点まで来られたら負け
          if (e.boss) { S.baseHp = 0; emit('leak', { enemy: e }); }
          else if (S.barrier > 0) { S.barrier--; emit('barrier', { enemy: e }); }
          else { S.baseHp = Math.max(0, S.baseHp - e.leak * cfg.base.leakMul); emit('leak', { enemy: e }); }
        }
      }

      // ゲート
      for (const g of S.gates) {
        if (g.dead) continue;
        g.flash = Math.max(0, g.flash - dt);
        g.y -= g.speed * slow * dt;
        if (g.y < cfg.world.leakY) g.dead = true;
      }
      for (const c of S.cages) c.flash = Math.max(0, c.flash - dt);
      tidy();

      // 決着
      if (S.baseHp <= 0) { S.phase = 'lose'; emit('lose', {}); return; }
      if (!stage.endless && S.evIndex >= stage.events.length && S.bossSpawned && S.enemies.length === 0) {
        S.phase = 'win'; emit('win', {});
      }
    }
    function tidy() {
      S.enemies = S.enemies.filter(e => !e.dead);
      S.gates = S.gates.filter(g => !g.dead);
    }

    // ---- 操作 ----
    function find(id) { return S.heroes.find(h => h.id === id); }
    function grab(id) {
      const h = find(id); if (!h || S.dragging) return false;
      h.drag = true; S.dragging = h.id; h.lx = h.x; h.ly = h.y;
      return true;
    }
    function dragTo(id, x, y) {
      const h = find(id); if (!h || !h.drag) return;
      x = Math.max(0.05, Math.min(W - 0.05, x)); y = Math.max(0.05, Math.min(ROWS - 0.05, y));
      // 通り道のマスを全部たどる（速く動かしても取りこぼさない）
      const steps = Math.max(1, Math.ceil(Math.hypot(x - h.x, y - h.y) / 0.25));
      const x0 = h.x, y0 = h.y;
      for (let i = 1; i <= steps; i++) {
        const px = x0 + (x - x0) * i / steps, py = y0 + (y - y0) * i / steps;
        tryPickup(h, Math.floor(px), Math.floor(py));
      }
      h.x = x; h.y = y;
    }
    function release(id) {
      const h = find(id); if (!h || !h.drag) return null;
      h.drag = false; S.dragging = null;
      const col = Math.max(0, Math.min(COLS - 1, Math.floor(h.x))), row = Math.max(0, Math.min(ROWS - 1, Math.floor(h.y)));
      const other = heroAt(col, row, h);
      let result = 'move';
      if (other && other.type === h.type && other.tier === h.tier && h.tier < cfg.hero.maxTier) {
        other.tier++;
        other.ammo.push(...h.ammo.slice(0, Math.max(0, ammoMax() - other.ammo.length)));
        S.heroes.splice(S.heroes.indexOf(h), 1);
        S.stats.merges++;
        emit('merge', { hero: other });
        emit('evolve', { hero: other });
        return 'merge';
      }
      if (other) { other.col = h.col; other.row = h.row; other.x = other.col + 0.5; other.y = other.row + 0.5; result = 'swap'; }
      h.col = col; h.row = row; h.x = col + 0.5; h.y = row + 0.5;
      return result;
    }
    function choose(kind, heroId) {
      if (S.phase !== 'choice' || !S.choice) return false;
      const ch = S.choice;
      if (kind === 'join') {
        if (!ch.canJoin) return false;
        addHero(ch.hero, ch.tier);
      } else if (kind === 'evolve') {
        const h = find(heroId);
        if (!h || h.tier >= cfg.hero.maxTier) return false;
        h.tier++;
        emit('evolve', { hero: h });
      } else return false;
      S.choice = null; S.phase = 'play';
      return true;
    }

    // 最初の英雄
    addHero(cfg.starterHero, 1, { col: 2, row: 1 });
    const extra = Math.min(UP.start.max, up('start'));
    const starters = (meta.unlocked && meta.unlocked.length ? meta.unlocked : [cfg.starterHero]);
    for (let i = 0; i < extra; i++) addHero(starters[Math.floor(rng() * starters.length) % starters.length], 1);
    // 最初の盤面は「持っている武器」を多めに
    for (const row of S.board) for (const it of row) it.w = randWeapon();

    function stars() {
      if (S.phase !== 'win') return 0;
      const r = S.baseHp / S.baseMax;
      return r >= cfg.stage.star[0] ? 3 : r >= cfg.stage.star[1] ? 2 : 1;
    }
    function pause(on) { if (on && S.phase === 'play') S.phase = 'pause'; else if (!on && S.phase === 'pause') S.phase = 'play'; }

    return { S, update, grab, dragTo, release, choose, stars, pause, heroAt, ammoMax, owned, addHero, applyGate, rate, heroDmg };
  };
})(globalThis);

/** コインの計算（純粋）。強化の値段と、遊び終わったときにもらえるコイン */
(function (G) {
  const L = G.MGR.Legion;
  L.upgradeCost = (cfg, key, lv) => {
    const u = cfg.upgrades[key];
    return lv >= u.max ? Infinity : Math.round(u.base * Math.pow(u.grow, lv));
  };
  /** S: 終わったときの状態 / stars: ★の数（負けたら0）/ meta: 強化のレベル */
  L.reward = (cfg, stage, S, stars, meta = {}) => {
    const greed = 1 + (meta.greed || 0) * cfg.upgrades.greed.per;
    const mul = (stage.coinMul || 1) * greed;
    const kills = Math.round(S.coins * (cfg.stage.killCoin ?? 1) * mul);
    const clear = stars > 0 && !stage.endless
      ? Math.round((cfg.stage.clearCoin + cfg.stage.clearCoinGrow * (stage.n - 1)) * (1 + (stars - 1) * 0.25) * mul)
      : 0;
    // エンドレスは到達ウェーブに応じたボーナス
    const wave = stage.endless ? Math.round(S.wave * S.wave * 0.8 * mul) : 0;
    return { kills, clear, wave, total: kills + clear + wave };
  };
})(globalThis);
