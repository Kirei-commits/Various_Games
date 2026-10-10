/**
 * ステージの自動生成（純粋。乱数はシードから作る）。
 *   Stage.build(cfg, n, diff)   → ステージ n の中身（地形・敵の群れ・ゲート・檻・ボス）
 *   Stage.endless(cfg, diff, seed) → 無限に続くステージ（pull で少しずつ作る）
 *   Stage.layout(id)            → 地形（通路・合流する位置・檻の置き場）
 */
(function (G) {
  const L = G.MGR.Legion;

  /** シード付き乱数（mulberry32）。[0,1) */
  function rng32(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** 等差のシードは乱数列が似るので撹拌してから使う */
  function mixSeed(n) { let h = (n * 0x9E3779B1) >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B) >>> 0; h ^= h >>> 13; return h >>> 0; }
  const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
  function weighted(r, items) {
    let sum = 0; for (const [, w] of items) sum += w;
    let x = r() * sum;
    for (const [k, w] of items) { if ((x -= w) < 0) return k; }
    return items[items.length - 1][0];
  }

  // 地形。lanes: 合流より奥での敵の通り道（x の範囲）/ mergeY: ここより手前は道幅いっぱいに広がる / slots: 檻の置き場
  // walls: 描画用の壁で囲まれた区画（檻の部屋）
  const LAYOUTS = {
    A: { name: '左の檻', lanes: [{ x0: 2.05, x1: 4.95 }], mergeY: 11, slots: [{ x0: 0.15, x1: 1.85, y0: 13.4, y1: 17.2 }], rooms: [{ x0: 0, x1: 2, y0: 11, y1: 22 }] },
    B: { name: '右の檻', lanes: [{ x0: 0.05, x1: 2.95 }], mergeY: 11, slots: [{ x0: 3.15, x1: 4.85, y0: 13.4, y1: 17.2 }], rooms: [{ x0: 3, x1: 5, y0: 11, y1: 22 }] },
    C: { name: '二本道', lanes: [{ x0: 0.05, x1: 1.9 }, { x0: 3.1, x1: 4.95 }], mergeY: 10, slots: [{ x0: 2.02, x1: 2.98, y0: 13, y1: 16.6 }], rooms: [{ x0: 1.95, x1: 3.05, y0: 10, y1: 22 }] },
    D: { name: '奥の檻', lanes: [{ x0: 0.05, x1: 1.5 }, { x0: 3.5, x1: 4.95 }], mergeY: 18.6, slots: [{ x0: 1.65, x1: 3.35, y0: 19.2, y1: 21.6 }], rooms: [{ x0: 1.55, x1: 3.45, y0: 18.6, y1: 22 }] },
    E: { name: '両側の檻', lanes: [{ x0: 1.05, x1: 3.95 }], mergeY: 10, slots: [{ x0: 0.1, x1: 0.95, y0: 13, y1: 16.6 }, { x0: 4.05, x1: 4.9, y0: 13, y1: 16.6 }], rooms: [{ x0: 0, x1: 1, y0: 10, y1: 22 }, { x0: 4, x1: 5, y0: 10, y1: 22 }] }
  };
  const LAYOUT_IDS = ['A', 'B', 'C', 'D', 'E'];

  function layoutFor(cfg, n, r) {
    const ok = LAYOUT_IDS.filter(id => n >= cfg.stage.layoutsFrom[id]);
    // 新しい地形は出てきた最初のステージで必ず使う
    const fresh = ok.find(id => cfg.stage.layoutsFrom[id] === n);
    return fresh || (n <= 3 ? 'A' : pick(r, ok));
  }

  function enemyPool(cfg, n) {
    return cfg.enemyOrder.filter(k => cfg.enemies[k].from <= n);
  }
  /** 群れの種類。ゴブリンが基本で、新しい敵ほど少し出にくい。出始めのステージではよく出す */
  function waveType(cfg, n, r) {
    const pool = enemyPool(cfg, n);
    return weighted(r, pool.map((k, i) => [k, k === 'goblin' ? 3 : (cfg.enemies[k].from === n ? 3 : 1.6 - i * 0.05)]));
  }

  function gateDef(cfg, n, r, pool, diff) {
    const items = Object.entries(cfg.gates).filter(([, g]) => g.kind === 'good' || n >= cfg.gate.badFrom);
    const bad = n >= cfg.gate.badFrom && r() < 0.24;
    const id = weighted(r, items.filter(([, g]) => (g.kind === 'bad') === bad).map(([k, g]) => [k, g.w]));
    const g = cfg.gates[id];
    const vi = Math.floor(r() * g.v.length) % g.v.length;
    let hp = cfg.gate.hpBase * Math.pow(cfg.gate.hpGrow, n - 1) * (1 + 0.6 * vi) * diff.hp;
    if (g.kind === 'bad') hp *= 0.6;
    const out = { id, value: g.v[vi], hp: Math.round(hp) };
    if (id === 'wpn') out.wpn = pick(r, pool);
    return out;
  }

  /** 檻の英雄の段階。ステージが進むと上の段階も出る */
  function cageTier(cfg, n, r) {
    let t = 1;
    for (const from of cfg.stage.cageTierFrom) if (n >= from && r() < 0.6) t++;
    return Math.min(t, cfg.hero.maxTier);
  }

  function laneOf(layout, r) { return Math.floor(r() * layout.lanes.length) % layout.lanes.length; }

  function build(cfg, n, diffKey = 'normal') {
    const diff = cfg.difficulty[diffKey];
    const r = rng32(mixSeed(n * 7919 + 13));
    const S = cfg.stage;
    const layoutId = layoutFor(cfg, n, r);
    const layout = LAYOUTS[layoutId];
    const hpMul = Math.pow(S.hpGrow, n - 1) * diff.hp;
    const total = Math.round(Math.min(S.countMax, S.countBase + S.countGrow * (n - 1)) * diff.count);
    const events = [];

    // 檻の英雄（ステージ1は広告どおり騎士から）
    const cageCount = n === 1 ? 2 : S.cages[0] + Math.floor(r() * (S.cages[1] - S.cages[0] + 1));
    const others = cfg.heroOrder.filter(h => h !== cfg.starterHero);
    const cages = [];
    for (let i = 0; i < cageCount; i++) {
      let hero = n === 1 ? ['knight', 'mage'][i] : pick(r, others);
      if (n > 1 && cages.some(c => c.hero === hero)) hero = pick(r, others);
      const tier = n === 1 ? 1 : cageTier(cfg, n, r);
      const hp = Math.round(S.cageHp * Math.pow(S.cageHpGrow, n - 1) * diff.hp * Math.pow(1.8, tier - 1) * Math.pow(2.6, i));
      cages.push({ hero, tier, hp });
    }
    // 盤面に混ざる「まだ持っていない武器」の候補: 檻の英雄の武器を中心に
    const pool = [...new Set([cfg.heroes[cfg.starterHero].weapon, ...cages.map(c => cfg.heroes[c.hero].weapon)])];
    while (pool.length < Math.min(cfg.weaponOrder.length, cfg.board.unlockedPool + 1)) {
      const w = pick(r, cfg.weaponOrder); if (!pool.includes(w)) pool.push(w);
    }

    // 敵の群れ
    const waves = Math.max(4, Math.round(S.duration / S.waveEvery));
    let left = total;
    for (let i = 0; i < waves; i++) {
      const t = 3 + (S.duration - 6) * i / (waves - 1) + (r() - 0.5) * 2;
      // 後半ほど大きな群れ
      const share = (0.6 + 0.8 * i / (waves - 1)) / waves;
      let count = i === waves - 1 ? left : Math.max(2, Math.round(total * share));
      count = Math.min(count, left); if (count <= 0) break;
      left -= count;
      const type = waveType(cfg, n, r);
      // HP の多い敵は数を減らす
      const heavy = cfg.enemies[type].hp / cfg.enemies.goblin.hp;
      const c = Math.max(1, Math.round(count / Math.max(1, heavy * 0.7)));
      events.push({ t: Math.max(1.5, t), kind: 'wave', type, count: c, lane: laneOf(layout, r), hpMul: hpMul * (0.85 + 0.35 * i / (waves - 1)) });
    }

    // ゲート
    const gateCount = S.gates[0] + Math.floor(r() * (S.gates[1] - S.gates[0] + 1));
    for (let i = 0; i < gateCount; i++) {
      const t = 6 + (S.duration - 20) * (i + r() * 0.7) / gateCount;
      events.push({ t, kind: 'gate', lane: laneOf(layout, r), gate: gateDef(cfg, n, r, pool, diff), pos: r() });
    }

    // ボス
    const boss = cfg.bossOrder[(n - 1) % cfg.bossOrder.length];
    events.push({ t: S.duration + 4, kind: 'boss', type: boss, lane: laneOf(layout, r), hpMul });
    events.sort((a, b) => a.t - b.t);

    return {
      n, diff: diffKey, endless: false, layoutId, layout, events, cages, pool,
      speedMul: diff.speed, total, boss, baseHpMul: diff.baseHp, coinMul: diff.coin,
      seed: mixSeed(n * 104729 + 7)
    };
  }

  /** エンドレス: pull(t) を呼ぶたびに、必要なぶんだけ先の群れを作る */
  function endless(cfg, diffKey = 'normal', seed = 1) {
    const diff = cfg.difficulty[diffKey];
    const E = cfg.endless;
    const r = rng32(mixSeed(seed));
    const layoutId = pick(r, LAYOUT_IDS);
    const layout = LAYOUTS[layoutId];
    const pool = [...new Set([cfg.heroes[cfg.starterHero].weapon, ...cfg.weaponOrder.slice(0, 5)])];
    const def = {
      n: 0, diff: diffKey, endless: true, layoutId, layout, events: [], cages: [], pool,
      speedMul: diff.speed, total: Infinity, baseHpMul: diff.baseHp, coinMul: diff.coin, seed: mixSeed(seed + 1),
      wave: 0, generatedTo: 0
    };
    const others = cfg.heroOrder.filter(h => h !== cfg.starterHero);
    // ウェーブ k の中身を作る。ステージ相当の強さは k / 2 + 1
    def.more = function () {
      const k = def.wave++;
      const t0 = k * E.waveEvery;
      const level = 1 + k / 2;
      const hpMul = Math.pow(E.hpGrow, k) * diff.hp;
      const n = Math.min(cfg.enemyOrder.length * 2 + 1, Math.floor(level));
      const count = Math.round((5 + k * 0.9) * diff.count);
      const type = waveType(cfg, Math.max(1, n), r);
      const heavy = cfg.enemies[type].hp / cfg.enemies.goblin.hp;
      def.events.push({ t: t0 + 1, kind: 'wave', type, count: Math.max(1, Math.round(count / Math.max(1, heavy * 0.7))), lane: laneOf(layout, r), hpMul, wave: k + 1 });
      if (k % 2 === 1 || r() < 0.3) def.events.push({ t: t0 + 4, kind: 'gate', lane: laneOf(layout, r), gate: gateDef(cfg, Math.max(1, Math.floor(level)), r, pool, diff), pos: r() });
      if ((k + 1) % E.bossEvery === 0) def.events.push({ t: t0 + 6, kind: 'boss', type: cfg.bossOrder[Math.floor(k / E.bossEvery) % cfg.bossOrder.length], lane: laneOf(layout, r), hpMul: hpMul * 0.8 });
      if (k % Math.max(1, Math.round(E.cageEvery / E.waveEvery)) === 1) {
        const tier = cageTier(cfg, Math.floor(level * 2), r);
        def.cages.push({ hero: pick(r, others), tier, hp: Math.round(cfg.stage.cageHp * hpMul * Math.pow(1.8, tier - 1) * (1 + k * 0.08)) });
      }
      def.generatedTo = t0 + E.waveEvery;
    };
    return def;
  }

  L.Stage = { build, endless, layout: id => LAYOUTS[id], LAYOUTS, LAYOUT_IDS, rng32, mixSeed, weighted };
})(globalThis);
