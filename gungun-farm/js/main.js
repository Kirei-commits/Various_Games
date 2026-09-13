/**
 * 進行役。入力の受付、時間を進めること、演出の合図をまとめて持つ。
 * ルールは engine、描画は render に閉じ込め、ここには「いつ何を呼ぶか」だけを書く。
 */
(function (global) {
  'use strict';

  const Data = global.GF.Data;
  const Engine = global.GF.Engine;
  const Store = global.GF.Store;
  const Audio = global.GF.Audio;
  const Render = global.GF.Render;

  const $ = (sel) => document.querySelector(sel);
  const QTY = [1, 5, 20];
  const RUSH_MS = 180_000;

  const game = {
    state: null,
    ui: { tab: 'seed', seed: 'wheat', qty: 1, shopTab: 'sell' },
    settings: null,
    record: null,
    speed: 1,          // 時間の倍率。?speed=8 でテストが待たずに済む
    paused: false,
    seenEvent: 0,
    popQueue: [],
    popping: false
  };

  /* ---------------------------------------------------------------- 乱数 */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const params = new URLSearchParams(global.location ? global.location.search : '');

  /* ---------------------------------------------------------------- 起動 */

  function boot() {
    Render.init();
    game.settings = Store.load().settings;
    game.record = Store.load().record;

    if (params.has('sound')) game.settings.sound = params.get('sound') !== 'off';
    Audio.setEnabled(game.settings.sound);
    game.speed = Math.max(0.1, Math.min(50, Number(params.get('speed')) || 1));
    if (params.has('seed')) Engine.setRandom(mulberry32(Number(params.get('seed')) || 1));

    const mode = params.get('mode') || game.settings.mode || 'free';
    game.ui.tab = game.settings.tab || 'seed';
    game.ui.seed = Data.crop(game.settings.seed) ? game.settings.seed : 'wheat';

    const resumed = (mode === 'free' && params.get('fresh') !== '1') ? enterFree({ silent: true }) : false;
    if (!resumed) startGame(mode, { silent: true });

    bindInput();
    global.requestAnimationFrame(frame);
    Render.sync(game.state, game.ui);

    // 初めての人にだけ、いちど遊びかたを出す
    if (!resumed && game.record.games === 0 && params.get('help') !== 'off') showHelp();
  }

  /**
   * のんびりモードに入る。保存された農園があれば続きから。
   * **ここを startGame('free') で済ませてはいけない。** あちらは農園を捨てるので、
   * 3分チャレンジから戻ってきただけで、育てた農園が消える。
   */
  function enterFree(opts = {}) {
    // ?fresh=1 は「起動時に読み込まない」だけの指定。あとから明示的に戻ってきたときは読む
    const saved = Store.loadFarm();
    if (!saved) { startGame('free', opts); return; }
    game.state = saved;
    game.seenEvent = (saved.events || []).reduce((a, e) => Math.max(a, e.id), 0);
    game.popQueue.length = 0;
    game.settings = Store.save({ settings: { mode: 'free' } }).settings;
    Render.invalidate();
    Render.ticker('おかえり！ 続きからどうぞ');
    Render.sync(game.state, game.ui);
    return true;
  }

  function startGame(mode, opts = {}) {
    game.state = Engine.create({ mode, limit: Number(params.get('limit')) || RUSH_MS });
    game.seenEvent = 0;
    game.popQueue.length = 0;
    game.settings = Store.save({ settings: { mode } }).settings;
    if (mode === 'free') Store.clearFarm();
    Render.invalidate();
    if (!opts.silent) Render.ticker(mode === 'rush' ? 'よーい、スタート！' : 'タネをえらんで、畑をタップ！');
    if (game.state) Render.sync(game.state, game.ui);
  }

  /* ---------------------------------------------------------------- 時間 */

  let lastTs = 0;
  let saveAt = 0;

  function frame(ts) {
    global.requestAnimationFrame(frame);
    const state = game.state;
    if (!state) return;

    const dt = lastTs ? Math.min(400, ts - lastTs) : 0;   // 戻ってきた瞬間に一気に進めない
    lastTs = ts;

    if (!game.paused && !state.over && !global.document.hidden) {
      Engine.tick(state, state.now + dt * game.speed);
    }
    drainEvents();
    Render.sync(state, game.ui);

    if (state.mode === 'free' && ts - saveAt > 3000) {
      saveAt = ts;
      Store.saveFarm(state);
    }
  }

  /** engine が積んだ出来事を演出に変える。ここでだけ音と浮き文字を出す。 */
  function drainEvents() {
    const state = game.state;
    for (const ev of state.events) {
      if (ev.id <= game.seenEvent) continue;
      game.seenEvent = ev.id;
      if (ev.kind === 'levelup') {
        game.popQueue.push(ev);
        Audio.play('levelup');
      } else if (ev.kind === 'deliver') {
        Render.ticker(`${ev.quick ? '⚡はやうま！ ' : ''}${ev.text}${ev.combo > 1 ? `（${ev.combo}れんぞく）` : ''}`);
      } else if (ev.kind === 'expire') {
        Render.ticker('注文が流れた…😢 コンボがリセット');
        Audio.play('nope');
      } else if (ev.kind === 'rescue') {
        Render.ticker('やさしい風が吹いた。ごえんのタネをもらった🌱');
      } else if (ev.kind === 'over') {
        Audio.play('finish');
        showResult();
      } else if (ev.kind === 'buy') {
        Render.ticker(ev.text);
      }
    }
    if (game.popQueue.length && !game.popping) {
      game.popping = true;
      const ev = game.popQueue.shift();
      Render.levelUp(ev.level, ev.unlocks, () => { game.popping = false; Render.invalidate(); });
    }
  }

  /* ---------------------------------------------------------------- 入力 */

  function bindInput() {
    $('#app').addEventListener('click', onClick);
    $('#btn-harvest').addEventListener('click', () => doHarvestAll());
    $('#btn-plant').addEventListener('click', () => doPlantAll());
    $('#btn-menu').addEventListener('click', showMenu);
    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => {
        game.ui.tab = tab.dataset.tab;
        Store.save({ settings: { tab: game.ui.tab } });
        Render.invalidate();
        Audio.play('tap');
        Render.sync(game.state, game.ui);
      });
    }
    $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') Render.closeSheet(); });
  }

  function onClick(e) {
    const node = e.target.closest('[data-act]');
    if (!node) return;
    const state = game.state;
    const act = node.dataset.act;
    const i = Number(node.dataset.i);
    const id = node.dataset.id;
    const at = node.getBoundingClientRect();
    const x = at.left + at.width / 2, y = at.top;

    if (act === 'field') {
      const f = state.fields[i];
      if (Engine.isReady(f, state.now)) {
        if (Engine.harvest(state, i)) { Audio.play('harvest'); Render.float(Render.icon(f.crop), x, y); }
        else barnFullWarning();
      } else if (!f.crop) {
        plantAt(i, x, y);
      }
    } else if (act === 'seed') {
      game.ui.seed = id;
      Store.save({ settings: { seed: id } });
      Audio.play('tap');
    } else if (act === 'machine') {
      const m = state.machines[i];
      if (m.done > 0) {
        const n = Engine.collect(state, i);
        if (n > 0) { Audio.play('collect'); Render.float(Render.icon(Engine.machineDef(m).recipe.out) + '×' + n, x, y); }
        else barnFullWarning();
      } else if (Engine.queue(state, i)) {
        Audio.play('craft');
      } else {
        const def = Engine.machineDef(m);
        const full = m.queue.length + m.done >= def.slots;
        Audio.play('nope');
        Render.ticker(full ? `${def.name}はいっぱい` : `材料が足りない（${recipeText(def)}）`);
      }
    } else if (act === 'deliver') {
      const res = Engine.deliver(state, Number(id));
      if (res) { Audio.play('deliver'); Render.float('+🪙' + res.coins, x, y); Render.float('+⭐' + res.xp, x, y + 18, 'xp'); }
    } else if (act === 'dismiss') {
      Engine.dismiss(state, Number(id));
      Audio.play('tap');
      Render.ticker('注文をことわった');
    } else if (act === 'sell') {
      const coins = Engine.sell(state, id, game.ui.qty);
      if (coins) { Audio.play('coin'); Render.float('+🪙' + coins, x, y); }
    } else if (act === 'shop-tab') {
      game.ui.shopTab = id;
      Audio.play('tap');
    } else if (act === 'qty') {
      game.ui.qty = QTY[(QTY.indexOf(game.ui.qty) + 1) % QTY.length];
      Audio.play('tap');
    } else if (act === 'buy-barn') {
      buy(() => Engine.buyBarn(state), '倉庫がいっぱいになったら広げよう');
    } else if (act === 'buy-field') {
      buy(() => Engine.buyField(state), fieldHint());
    } else if (act === 'buy-machine') {
      buy(() => Engine.buyMachine(state, id), machineHint(id));
    }
    Render.sync(state, game.ui);
  }

  const recipeText = (def) => Object.entries(def.recipe.in).map(([k, n]) => Render.nameOf(k) + '×' + n).join(' + ');

  function fieldHint() {
    const up = Engine.nextFieldPrice(game.state);
    if (!up) return 'これ以上は広げられない';
    return game.state.level < up.level ? `畑を増やすのは Lv${up.level} から` : `あと 🪙${up.price - Math.floor(game.state.coins)} 足りない`;
  }

  function machineHint(id) {
    const def = Data.machine(id);
    if (!def) return '';
    return game.state.level < def.level ? `${def.name}は Lv${def.level} から` : `あと 🪙${def.price - Math.floor(game.state.coins)} 足りない`;
  }

  function buy(fn, hint) {
    if (fn()) { Audio.play('buy'); Render.invalidate(); }
    else { Audio.play('nope'); Render.ticker(hint); }
  }

  function plantAt(i, x, y) {
    const state = game.state;
    if (Engine.plant(state, i, game.ui.seed)) {
      Audio.play('plant');
      return;
    }
    Audio.play('nope');
    const c = Data.crop(game.ui.seed);
    if (!c || state.coins >= c.cost) { Render.ticker('ここには植えられない'); return; }
    // 「コインが無い＋倉庫に在庫あり」は自力で抜けられるのに気づきにくい。売り場へ案内する。
    // （通しプレイで、在庫を抱えたまま手が止まる場面を捕まえた）
    if (Engine.barnUsed(state) > 0) {
      Render.ticker(`タネ代が足りない（🪙${c.cost}）。みせで売ってコインにしよう`);
      game.ui.tab = 'shop';
      game.ui.shopTab = 'sell';
      Render.invalidate();
    } else {
      Render.ticker(`タネ代が足りない（🪙${c.cost}）`);
    }
  }

  function barnFullWarning() {
    Audio.play('nope');
    Render.ticker('倉庫がいっぱい！ みせで売るか、倉庫を広げよう');
    game.ui.tab = 'shop';
    game.ui.shopTab = 'sell';
    Render.invalidate();
  }

  function doHarvestAll() {
    const state = game.state;
    const n = Engine.harvestAll(state);
    if (n > 0) {
      Audio.play('harvest');
      const box = $('#btn-harvest').getBoundingClientRect();
      Render.float('+' + n, box.left + box.width / 2, box.top);
      Render.ticker(`${n}こ 収穫した！`);
    } else if (Engine.barnFree(state) < 1) {
      barnFullWarning();
    } else {
      Audio.play('nope');
      Render.ticker('まだ実っていない');
    }
    Render.sync(state, game.ui);
  }

  function doPlantAll() {
    const state = game.state;
    const n = Engine.plantAll(state, game.ui.seed);
    if (n > 0) { Audio.play('plant'); Render.ticker(`${Render.nameOf(game.ui.seed)}を ${n}マス 植えた`); }
    else {
      Audio.play('nope');
      const c = Data.crop(game.ui.seed);
      if (c && state.coins < c.cost && Engine.barnUsed(state) > 0) {
        Render.ticker(`タネ代が足りない（🪙${c.cost}）。みせで売ってコインにしよう`);
        game.ui.tab = 'shop';
        game.ui.shopTab = 'sell';
        Render.invalidate();
      } else {
        Render.ticker('植えられる畑がない（タネ代か空きマスを確認）');
      }
    }
    Render.sync(state, game.ui);
  }

  /* ---------------------------------------------------------------- シート */

  const el = Render.el;

  function showMenu() {
    Audio.play('tap');
    const nodes = [el('h2', '', 'ぐんぐん農園')];
    const rows = el('div', 'rows');

    const rush = el('button', 'menu primary', '⏱ 3分チャレンジ をはじめる');
    rush.addEventListener('click', () => { Render.closeSheet(); startGame('rush'); Audio.play('buy'); });
    rows.appendChild(rush);

    // 続きがあるなら「戻る」、無い（または今まさに遊んでいる）なら「はじめから」
    if (game.state.mode !== 'free') {
      const back = el('button', 'menu', '🌻 のんびりモードへもどる');
      back.addEventListener('click', () => { Render.closeSheet(); enterFree(); Audio.play('buy'); });
      rows.appendChild(back);
    }
    const free = el('button', 'menu', '🌻 のんびりモード をはじめから');
    free.addEventListener('click', () => {
      Render.closeSheet();
      Store.clearFarm();
      startGame('free');
      Audio.play('buy');
    });
    rows.appendChild(free);

    const sound = el('button', 'menu', game.settings.sound ? '🔊 音: オン' : '🔇 音: オフ');
    sound.addEventListener('click', () => {
      game.settings = Store.save({ settings: { sound: !game.settings.sound } }).settings;
      Audio.setEnabled(game.settings.sound);
      sound.textContent = game.settings.sound ? '🔊 音: オン' : '🔇 音: オフ';
      Audio.play('tap');
    });
    rows.appendChild(sound);

    const help = el('button', 'menu', '❓ あそびかた');
    help.addEventListener('click', () => { Render.closeSheet(); showHelp(); });
    rows.appendChild(help);

    const close = el('button', 'menu', 'とじる');
    close.addEventListener('click', () => Render.closeSheet());
    rows.appendChild(close);

    nodes.push(rows);
    nodes.push(el('h3', '', 'これまでの記録'));
    const rec = el('div', 'result');
    rec.appendChild(stat(game.record.bestScore, '3分の最高コイン'));
    rec.appendChild(stat(game.record.bestLevel, '最高レベル'));
    rec.appendChild(stat(game.record.bestCombo, '最高コンボ'));
    rec.appendChild(stat(game.record.delivered, '届けた数'));
    nodes.push(rec);
    Render.sheet(nodes);
  }

  function stat(value, label) {
    const box = el('div');
    box.appendChild(el('b', '', String(value)));
    box.appendChild(el('small', '', label));
    return box;
  }

  function showHelp() {
    const nodes = [
      el('h2', '', 'あそびかた'),
      el('p', '', '🌱 タネをえらんで畑をタップ。いちばん長い作物でも9秒、機械でも10秒で出来上がる。'),
      el('p', '', '🏭 こうぼうは材料がそろうとタップで仕込める。出来たらもう一度タップで倉庫へ。'),
      el('p', '', '📦 ちゅうもんを届けるとコインと経験値がもらえる。早いほどオマケ、続けるほど倍率が上がる。'),
      el('p', '', '⚠️ 倉庫がいっぱいだと収穫できない。みせで売るか、倉庫を広げよう。')
    ];
    const ok = el('button', 'menu primary', 'はじめる！');
    ok.addEventListener('click', () => Render.closeSheet());
    const rows = el('div', 'rows');
    rows.appendChild(ok);
    nodes.push(rows);
    Render.sheet(nodes);
  }

  function showResult() {
    if (game.resultShown === game.state) return;
    game.resultShown = game.state;
    const s = game.state;
    const best = Math.max(game.record.bestScore, Engine.score(s));
    game.record = Store.save({
      record: {
        bestScore: best,
        bestLevel: Math.max(game.record.bestLevel, s.level),
        bestCombo: Math.max(game.record.bestCombo, s.bestCombo),
        delivered: game.record.delivered + s.stats.delivered,
        games: game.record.games + 1
      }
    }).record;

    const nodes = [el('h2', '', '3分おつかれさま！')];
    const grid = el('div', 'result');
    grid.appendChild(stat(Engine.score(s), '稼いだコイン'));
    grid.appendChild(stat(s.level, 'とうたつレベル'));
    grid.appendChild(stat(s.stats.delivered, '届けた注文'));
    grid.appendChild(stat(s.bestCombo, '最高コンボ'));
    nodes.push(grid);
    if (Engine.score(s) >= best) nodes.push(el('p', 'best', '🏆 自己ベスト更新！'));

    const rows = el('div', 'rows');
    const again = el('button', 'menu primary', 'もういちど');
    again.addEventListener('click', () => { Render.closeSheet(); startGame('rush'); });
    rows.appendChild(again);
    const back = el('button', 'menu', '🌻 のんびりモードへ');
    back.addEventListener('click', () => { Render.closeSheet(); enterFree(); });
    rows.appendChild(back);
    nodes.push(rows);
    Render.sheet(nodes);
  }

  /* ---------------------------------------------------------------- 公開 */

  global.GF = global.GF || {};
  global.GF.game = game;
  global.GF.refresh = () => Render.sync(game.state, game.ui);
  global.GF.startGame = startGame;
  global.GF.enterFree = enterFree;

  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
