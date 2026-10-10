// 1回のプレイ（ステージ / エンドレス）を進める。sim の出来事を音・演出・HUD に変える
const Game = (() => {
  const G = {
    active: false, sim: null, stage: null, mode: 'stage', diff: 'normal', n: 1,
    speed: 1, autobot: false, bot: null, evolvePick: false, tutorial: null, over: false, acc: 0,
    lastHud: '', toastT: 0, hintsShown: {}, flash: 0
  };
  const P = View;
  const meta = () => ({ ...Store.d.legion.upgrades, unlocked: Object.keys(Store.d.legion.dex) });

  G.start = function ({ mode = 'stage', n = 1, diff = 'normal' }) {
    Sound.init();
    G.mode = mode; G.n = n; G.diff = diff;
    G.stage = mode === 'endless' ? L.Stage.endless(CFG, diff, (Date.now() & 0xffffff) + 1) : L.Stage.build(CFG, n, diff);
    G.sim = L.createSim(CFG, { stage: G.stage, rng: Math.random, meta: meta(), emit: onEvent });
    G.bot = null; G.active = true; G.over = false; G.evolvePick = false; G.acc = 0; G.flash = 0; G.hintsShown = {};
    FX.clear();
    for (const h of G.sim.S.heroes) seen(h);
    G.tutorial = (mode === 'stage' && n === 1 && !Store.d.legion.tutorial) ? { step: 1, text: '英雄をドラッグして鎌を拾おう！', path: null, picks: 0, t: 0 } : null;
    Store.d.legion.plays++; Store.save();
    UI.toGame();
    Sound.play('battle');
    hud(true);
    toast(mode === 'endless' ? 'エンドレス開始！' : `STAGE ${n}  ${G.stage.layout.name}`, 1.6);
  };

  function seen(h) {
    const dex = Store.d.legion.dex;
    if ((dex[h.type] || 0) < h.tier) { dex[h.type] = h.tier; Store.save(); }
  }
  function at(x, y) { return [P.sx(x, y), P.sy(y)]; }
  let lastNum = 0;
  function onEvent(type, d) {
    if (!G.active) return;
    const S = G.sim.S;
    switch (type) {
      case 'pickup': Sound.pick(); if (G.tutorial && d.hero.drag) G.tutorial.picks++; break;
      case 'throw': Sound.throw(); break;
      case 'hit': {
        Sound.hit();
        const t = performance.now();
        if (d.crit || d.enemy.boss || t - lastNum > 70) {
          lastNum = t;
          const [x, y] = at(d.enemy.x, d.enemy.y);
          FX.text(x + rand(-12, 12), y - P.scale(d.enemy.y) * d.enemy.r * 2.4, fmtNum(d.dmg), { size: d.crit ? 34 : 22, color: d.crit ? '#ff6b6b' : '#fff', life: 0.55 });
        }
        break;
      }
      case 'kill': { const [x, y] = at(d.enemy.x, d.enemy.y); FX.bones(x, y - 20, P.scale(d.enemy.y) / 100 * (d.enemy.boss ? 2.4 : 1), d.enemy.boss ? 24 : 5); Sound.kill(); break; }
      case 'boom': { const [x, y] = at(d.x, d.y); FX.ring(x, y, d.r * P.scale(d.y), 'rgba(255,170,60,'); Sound.boom(); break; }
      case 'hitGate': Sound.hit(); break;
      case 'hitCage': Sound.cageHit(); break;
      case 'gate': {
        const g = d.gate, good = g.kind === 'good';
        const [x, y] = at((g.x0 + g.x1) / 2, g.y);
        FX.shards(x, y - 30, P.scale(g.y) / 100, good ? '#334155' : '#7f1d1d');
        const [label, v] = Render.gateText(g);
        FX.text(P.W / 2, P.H * 0.42, `${label} ${v}`.trim(), { size: 46, color: good ? '#fde68a' : '#fca5a5', life: 1.2, vy: -30 });
        Sound.gate(good);
        if (g.id === 'thunder') { G.flash = 0.35; Sound.thunder(); }
        break;
      }
      case 'cage': { const c = d.cage; const [x, y] = at((c.x0 + c.x1) / 2, c.y0); FX.sparkle(x, y - 60, 1.4, '#fde68a', 18); Sound.cage(); break; }
      case 'choice': UI.openChoice(d); break;
      case 'merge': case 'evolve': {
        const h = d.hero; const [x, y] = at(h.x, h.y);
        FX.sparkle(x, y - 40, 1.2); FX.ring(x, y, 70);
        FX.text(x, y - 110, `${'★'.repeat(h.tier)} ${CFG.heroes[h.type].names[h.tier - 1]}`, { size: 30, color: '#ffe37a', life: 1.1, vy: -50 });
        Sound.merge(); seen(h);
        break;
      }
      case 'join': { const h = d.hero; seen(h); if (S.t > 0.1) { const [x, y] = at(h.x, h.y); FX.sparkle(x, y - 40, 1, '#a7f3d0'); Sound.join(); } break; }
      case 'heroLost': toast('英雄が1体いなくなった…', 1.4); break;
      case 'leak': { Sound.leak(); FX.text(P.W / 2 + rand(-80, 80), P.sy(CFG.world.leakY) - 20, '-' + (d.enemy.boss ? 'ALL' : d.enemy.leak), { color: '#ff5b5b', size: 32 }); G.flash = Math.max(G.flash, 0.12); break; }
      case 'barrier': Sound.barrier(); FX.text(P.W / 2, P.sy(CFG.world.leakY) - 20, 'ガード!', { color: '#7dd3fc', size: 30 }); break;
      case 'spawnBoss': Sound.boss(); Sound.play('boss'); toast(`ボス出現！ ${CFG.bosses[d.enemy.type].name}`, 2); break;
      case 'bossDown': toast('ボス撃破！', 1.5); break;
      case 'revive': { const [x, y] = at(d.enemy.x, d.enemy.y); FX.text(x, y - 50, '復活!', { size: 22, color: '#93c5fd' }); break; }
      case 'win': setTimeout(() => finish(true), 700); break;
      case 'lose': setTimeout(() => finish(false), 500); break;
    }
  }

  G.onRelease = function (res) {
    if (res === 'merge' && G.tutorial) G.hintsShown.merge = true;
  };
  G.choose = function (kind) {
    if (kind === 'evolve') { G.evolvePick = true; UI.closeChoice(true); return; }
    G.sim.choose('join'); UI.closeChoice();
  };
  G.pickEvolve = function (id) {
    if (G.sim.choose('evolve', id)) { G.evolvePick = false; UI.closeChoice(); }
  };
  G.cancelEvolve = function () { G.evolvePick = false; UI.openChoice(G.sim.S.choice); };

  function finish(win) {
    if (!G.active || G.over) return;
    G.over = true;
    Input.drop();
    const S = G.sim.S, d = Store.d, lg = d.legion;
    const stars = win ? G.sim.stars() : 0;
    const rw = L.reward(CFG, G.stage, S, stars, lg.upgrades);
    d.coins += rw.total;
    let record = false;
    if (G.mode === 'stage' && win) {
      lg.cleared[G.diff] = Math.max(lg.cleared[G.diff], G.n);
      lg.stars[G.diff][G.n] = Math.max(lg.stars[G.diff][G.n] || 0, stars);
    }
    if (G.mode === 'endless') {
      const b = lg.best[G.diff];
      if (!b || S.wave > b.wave || (S.wave === b.wave && S.kills > b.kills)) { lg.best[G.diff] = { wave: S.wave, kills: S.kills }; record = true; }
    }
    if (G.n === 1 && G.mode === 'stage') lg.tutorial = true;
    Store.save();
    if (win) Sound.win(); else Sound.lose();
    Sound.play('menu');
    UI.openResult({ win, stars, rw, S, mode: G.mode, n: G.n, record });
  }
  G.quit = function () { Input.drop(); G.active = false; G.sim = null; G.evolvePick = false; FX.clear(); Sound.play('menu'); };
  G.togglePause = function (on) { if (!G.sim) return; Input.drop(); G.sim.pause(on); };

  let toastTimer = null;
  function toast(text, sec = 1.5) {
    const el = $('toast'); el.textContent = text; show(el, true);
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => show(el, false), sec * 1000);
  }
  G.toast = toast;

  function hud(force) {
    const S = G.sim.S;
    const title = G.mode === 'endless' ? `エンドレス  WAVE ${S.wave}` : `STAGE ${G.n}  ${CFG.difficulty[G.diff].name}`;
    const M = S.mods;
    const buffs = [];
    if (M.atk !== 1) buffs.push([`攻撃力 ×${+M.atk.toFixed(2)}`, M.atk < 1]);
    if (M.rate !== 1) buffs.push([`攻撃速度 ×${+M.rate.toFixed(2)}`, M.rate < 1]);
    if (M.pierce) buffs.push([`貫通 +${M.pierce}`]);
    if (M.multi) buffs.push([`弾数 +${M.multi}`]);
    if (M.crit) buffs.push([`会心 ${M.crit}%`]);
    if (M.pspeed !== 1) buffs.push([`弾速 ×${+M.pspeed.toFixed(2)}`]);
    if (M.big !== 1) buffs.push([`弾の大きさ ×${+M.big.toFixed(2)}`]);
    if (M.ammo) buffs.push([`持てる弾 +${M.ammo}`]);
    if (M.slow !== 1) buffs.push([`敵の速さ ×${+M.slow.toFixed(2)}`, M.slow > 1]);
    for (const w in M.wpn) buffs.push([`${CFG.weapons[w].name} ×${M.wpn[w]}`]);
    if (S.barrier) buffs.push([`バリア ${S.barrier}`]);
    const boss = S.boss && !S.bossDown ? `${Math.ceil(Math.max(0, S.boss.hp))}` : '';
    const key = [title, S.baseHp, S.baseMax, S.coins, buffs.join(), boss].join('|');
    if (!force && key === G.lastHud) return;
    G.lastHud = key;
    $('hudTitle').textContent = title;
    const r = S.baseHp / S.baseMax;
    $('hpFill').style.width = (r * 100) + '%'; $('hpFill').classList.toggle('low', r < 0.35);
    $('hpText').textContent = `拠点 ${Math.ceil(S.baseHp)} / ${S.baseMax}`;
    $('hudCoins').textContent = fmtNum(S.coins);
    $('buffs').innerHTML = buffs.map(([t, bad]) => `<span class="${bad ? 'bad' : ''}">${t}</span>`).join('');
    show('bossBar', !!boss);
    if (boss) { $('bossName').textContent = CFG.bosses[S.boss.type].name; $('bossFill').style.width = (S.boss.hp / S.boss.maxHp * 100) + '%'; }
  }

  function tutorialStep(dt) {
    const tu = G.tutorial; if (!tu) return;
    const S = G.sim.S;
    tu.t += dt;
    if (tu.step === 1) {
      if (!tu.path || tu.t > 2.2) {
        tu.t = 0;
        const h = S.heroes[0];
        const pts = [{ x: h.x, y: h.y - 0.3 }];
        const cells = [];
        for (let r = 0; r < CFG.board.rows; r++) for (let c = 0; c < CFG.board.cols; c++) if (S.board[r][c] && S.board[r][c].w === CFG.heroes[h.type].weapon) cells.push({ x: c + 0.5, y: r + 0.2, d: Math.hypot(c + 0.5 - h.x, r + 0.5 - h.y) });
        cells.sort((a, b) => a.d - b.d);
        tu.path = pts.concat(cells.slice(0, 3));
      }
      if (tu.picks >= 6) { tu.step = 2; tu.path = null; toast('武器は英雄の真上に飛ぶよ！', 2.2); }
    } else if (tu.step === 2) {
      if (S.cages.length && !G.hintsShown.cage) { G.hintsShown.cage = true; toast('檻の数字を0にすると英雄を解放！', 2.5); }
      const pair = S.heroes.some(a => S.heroes.some(b => a !== b && a.type === b.type && a.tier === b.tier));
      if (pair && !G.hintsShown.mergeHint) { G.hintsShown.mergeHint = true; toast('同じ英雄を重ねると合体して進化！', 2.6); }
      if (S.gates.length && !G.hintsShown.gate) { G.hintsShown.gate = true; toast('ゲートを壊すとパワーアップ！', 2.2); }
    }
  }

  G.frame = function (dt, g) {
    if (!G.sim) return;
    const S = G.sim.S;
    if (G.active && !G.over) {
      G.acc += Math.min(dt, 0.1) * G.speed;
      const step = 1 / 60;
      let n = 0;
      while (G.acc >= step && n < 240) {
        if (G.autobot) { if (!G.bot) G.bot = L.createBot(CFG, G.sim, Math.random, { skill: 0.9 }); G.bot.step(step); }
        G.sim.update(step); G.acc -= step; n++;
        if (S.phase !== 'play') { G.acc = 0; break; }
      }
      // ボット（テスト用）が2択を選んだら、開いている画面を閉じる
      if (S.phase === 'play' && (!$('choice').classList.contains('hidden') || G.evolvePick)) { G.evolvePick = false; UI.closeChoice(); }
      tutorialStep(dt);
      hud(false);
    }
    FX.update(dt);
    Render.draw(g, G.tutorial && G.tutorial.step === 1 ? { ...G, tutorial: G.tutorial } : { ...G, tutorial: null });
    if (G.flash > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.6, G.flash * 2)})`; g.fillRect(0, 0, P.W, P.H); G.flash -= dt; }
  };
  return G;
})();
