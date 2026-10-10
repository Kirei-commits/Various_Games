/**
 * 自動で遊ぶボット（純粋）。人と同じ操作（grab → dragTo → release / choose）だけで遊ぶ。
 * バランスの測定（tools/measure.mjs）とロジックテストで使う。
 *   const bot = L.createBot(cfg, sim, rng, { skill })   skill 0〜1: 1 ほど判断が速く、わなのゲートを避ける
 *   bot.step(dt)
 */
(function (G) {
  const L = G.MGR.Legion;

  L.createBot = function (cfg, sim, rng, { skill = 1 } = {}) {
    const S = sim.S;
    let task = null, think = 0, rr = 0;
    const speed = cfg.hero.dragSpeedBot;

    /** 撃つ列: 一番近い敵の列。敵が遠ければ檻 → よいゲート */
    function wantCol() {
      let near = null;
      for (const e of S.enemies) if (!e.hidden && (!near || e.y < near.y)) near = e;
      const badCol = c => skill > 0.5 && S.gates.some(g => g.kind === 'bad' && g.x0 < c + 0.85 && g.x1 > c + 0.15 &&
        !S.enemies.some(e => e.y < g.y && Math.abs(e.x - (c + 0.5)) < 0.5));
      const cands = [];
      if (near && near.y < 15) cands.push(Math.floor(near.x));
      for (const g of S.gates) if (g.kind === 'good') cands.push(Math.floor((g.x0 + g.x1) / 2));
      for (const c of S.cages) cands.push(Math.floor((c.x0 + c.x1) / 2));
      if (near) cands.push(Math.floor(near.x));
      for (const c of cands) if (!badCol(c)) return Math.max(0, Math.min(4, c));
      for (let c = 0; c < 5; c++) if (!badCol(c)) return c;
      return 2;
    }

    function nearestWeapon(h, col) {
      const w = cfg.heroes[h.type].weapon;
      let best = null, bd = 1e9;
      for (let r = 0; r < cfg.board.rows; r++) for (let c = 0; c < cfg.board.cols; c++) {
        const it = S.board[r][c];
        if (!it || it.w !== w) continue;
        const d = Math.abs(c - col) * 3 + Math.abs(r + 0.5 - h.y) * 0.5 + Math.abs(c + 0.5 - h.x) * 0.3;
        if (d < bd) { bd = d; best = { col: c, row: r }; }
      }
      return best;
    }

    function plan() {
      // 合体できる組があれば重ねる
      for (const a of S.heroes) for (const b of S.heroes) {
        if (a !== b && a.type === b.type && a.tier === b.tier && a.tier < cfg.hero.maxTier && rng() < 0.6 * skill + 0.2) {
          return { id: a.id, x: b.col + 0.5, y: b.row + 0.5 };
        }
      }
      if (!S.heroes.length) return null;
      // 弾の少ない英雄から順に、撃ちたい列の得意武器を拾いに行く
      const order = S.heroes.slice().sort((a, b) => a.ammo.length - b.ammo.length);
      const h = order[rr++ % Math.min(order.length, 3)];
      const col = wantCol();
      const t = nearestWeapon(h, col);
      if (!t) return { id: h.id, x: col + 0.5, y: h.y };
      return { id: h.id, x: t.col + 0.5, y: t.row + 0.5, settle: col + 0.5 };
    }

    function step(dt) {
      if (S.phase === 'choice') {
        const ch = S.choice;
        const top = S.heroes.filter(h => h.tier < cfg.hero.maxTier).sort((a, b) => b.tier - a.tier)[0];
        if (ch.canJoin && (S.heroes.length < 8 || !top)) sim.choose('join');
        else if (top) sim.choose('evolve', top.id);
        else sim.choose('join');
        return;
      }
      if (S.phase !== 'play') return;
      think -= dt;
      if (!task) {
        if (think > 0) return;
        think = 0.15 + (1 - skill) * 0.5;
        task = plan();
        if (!task || !sim.grab(task.id)) { task = null; return; }
      }
      const h = S.heroes.find(x => x.id === task.id);
      if (!h) { task = null; return; }
      const dx = task.x - h.x, dy = task.y - h.y, d = Math.hypot(dx, dy), m = speed * dt;
      if (d <= m) {
        sim.dragTo(h.id, task.x, task.y);
        if (task.settle != null && Math.abs(task.settle - task.x) > 0.01) { task.x = task.settle; task.settle = null; return; }
        sim.release(h.id);
        task = null;
      } else sim.dragTo(h.id, h.x + dx / d * m, h.y + dy / d * m);
    }
    return { step };
  };
})(globalThis);
