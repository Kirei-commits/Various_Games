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
    D: { name: '奥の檻', lanes: [{ x0: 0.05, x1: 1.5 }, { x0: 3.5, x1: 4.95 }], mergeY: 15.6, slots: [{ x0: 1.65, x1: 3.35, y0: 16.1, y1: 18.5 }], rooms: [{ x0: 1.55, x1: 3.45, y0: 15.6, y1: 22 }] },
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

  /**
   * t0〜t1 のあいだ、敵の列を途切れずに流す。同じ種類の敵が数秒ずつ続き、surgeEvery ごとに大群が来る。
   * 出した敵の数を返す
   */
  function stream(cfg, n, r, layout, events, t0, t1, hpAt, diff, wave) {
    const S = cfg.stage;
    // 最初はまばらで、仲間が増えるころ（rampTo 秒）にかけて詰まっていく
    // 序盤のステージ（easyUntil まで）は列の間隔を広げて、遊び方を覚えられるようにする
    const ease = 1 + S.earlyEase * Math.max(0, S.easyUntil - n) / (S.easyUntil - 1);
    const base = Math.max(S.rowEveryMin, S.rowEvery - S.rowEveryGrow * (n - 1)) * ease / diff.count;
    const every = t => base * (S.rampFrom + (1 - S.rampFrom) * Math.min(1, t / S.rampTo)) ;
    let t = t0, total = 0, type = null, segEnd = -1, lane = 0, nextSurge = t0 + S.surgeEvery * (0.5 + r() * 0.5);
    while (t < t1) {
      if (t >= segEnd) { type = waveType(cfg, n, r); lane = laneOf(layout, r); segEnd = t + 5 + r() * 5; }
      const heavy = cfg.enemies[type].hp / cfg.enemies.goblin.hp;
      // 列のところどころを空けて、ぎっしりすぎない行進にする。HP の多い敵は1列の数を減らす
      // 地形で道幅が違っても数は同じ（狭い道では2列になる）
      let count = Math.max(1, Math.round(S.rowSize / Math.max(1, heavy * 0.7)) - (r() < 0.3 ? 1 : 0));
      let rows = 1;
      if (t >= nextSurge) { rows = S.surgeRows; nextSurge = t + S.surgeEvery * (0.8 + r() * 0.4); }
      count *= rows;
      const ev = { t, kind: 'wave', type, count, lane, hpMul: hpAt(t) * S.streamHp };
      if (wave && total === 0) ev.wave = wave;
      events.push(ev);
      total += count;
      t += Math.min(2.5, every(wave ? S.rampTo : t) * (0.85 + r() * 0.3) * (rows > 1 ? 1.8 : 1));  // 間が空きすぎないように
    }
    return total;
  }

  function build(cfg, n, diffKey = 'normal') {
    const diff = cfg.difficulty[diffKey];
    const r = rng32(mixSeed(n * 7919 + 13));
    const S = cfg.stage;
    const layoutId = layoutFor(cfg, n, r);
    const layout = LAYOUTS[layoutId];
    const hpMul = Math.pow(S.hpGrow, n - 1) * diff.hp;
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

    // 敵は途切れずに行進してくる（列が1秒ごとくらいに入ってきて、ときどき大群が押し寄せる）
    const total = stream(cfg, n, r, layout, events, 1.5, S.duration, t => hpMul * (0.85 + 0.35 * t / S.duration), diff);

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
      stream(cfg, Math.max(1, n), r, layout, def.events, t0 + 0.5, t0 + E.waveEvery, () => hpMul, { count: diff.count * (0.85 + Math.min(0.6, k * 0.02)) }, k + 1);
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
