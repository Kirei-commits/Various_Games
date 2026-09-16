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
    if (params.has('music')) game.settings.music = params.get('music') !== 'off';
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

    registerWorker();
  }

  /**
   * オフラインでも開けるようにする。
   * **`file://` で直接開いたときは登録できない**（Service Worker が使えない）ので、
   * 失敗を握りつぶす。このゲームは file:// でもそのまま動くのが前提。
   */
  function registerWorker() {
    if (params.get('sw') === 'off') return;
    const nav = global.navigator;
    if (!nav || !nav.serviceWorker || !/^https?:$/.test(global.location.protocol)) return;
    try {
      nav.serviceWorker.register('sw.js').catch(() => { /* 鳴らないだけ。遊びは続く */ });
    } catch (e) { /* noop */ }
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
    if (!opts.silent) Render.ticker(mode === 'rush' ? 'よーい、スタート！' : 'したの大きいボタンでどんどん回そう！');
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
    Audio.setMusicPhase((state.now % Render.DAY_MS) / Render.DAY_MS);

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
      } else if (ev.kind === 'buy' || ev.kind === 'boatgone') {
        Render.ticker(ev.text);
        if (ev.kind === 'boatgone') Audio.play('nope');
      } else if (ev.kind === 'boat') {
        Render.ticker('ふなびんが着いた🚢 余ったものをどんどん積もう');
      } else if (ev.kind === 'ship') {
        Render.ticker('⛵ ' + ev.text);
      } else if (ev.kind === 'achieve') {
        // ティッカーは1行しかないので、収穫などの知らせを押しのけない形で出す
        game.popQueue.push(ev);
        Audio.play('coin');
      } else if (ev.kind === 'today') {
        // 日が変わるのは3分に1度。操作の結果ではないので ticker は使わない
        game.popQueue.push(ev);
        Audio.play('coin');
      }
    }
    if (game.popQueue.length && !game.popping) {
      game.popping = true;
      const ev = game.popQueue.shift();
      const done = () => { game.popping = false; Render.invalidate(); };
      if (ev.kind === 'achieve') {
        const a = Data.ACHIEVEMENTS.find((x) => x.id === ev.achievement);
        Render.award(a ? a.emoji : '🏅', a ? a.name : ev.text, done);
      } else if (ev.kind === 'today') {
        Render.award(Render.icon(ev.crop), `もうけ ×${Engine.TODAY_BONUS}`, done, '☀️ きょうの作物');
      } else {
        Render.levelUp(ev.level, ev.unlocks, done);
      }
    }
  }

  /* ---------------------------------------------------------------- 入力 */

  /**
   * BGMは**最初に触られるまで鳴らせない**（自動再生の制限）。
   * 起動時ではなく、どれか押されたときに始める。
   */
  function wakeMusic() {
    if (game.settings.sound && game.settings.music) Audio.startMusic();
  }

  function bindInput() {
    for (const ev of ['pointerdown', 'keydown']) {
      global.document.addEventListener(ev, wakeMusic, { passive: true });
    }
    $('#app').addEventListener('click', onClick);
    $('#btn-harvest').addEventListener('click', () => doHarvest());
    $('#btn-work').addEventListener('click', () => doWorkAll());
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

    // 隠れているあいだは requestAnimationFrame が止まる＝自動保存も止まる。
    // 裏に回った時点と閉じる直前に、その場で保存しておく
    const saveNow = () => { if (game.state) Store.saveFarm(game.state); };
    global.document.addEventListener('visibilitychange', () => { if (global.document.hidden) saveNow(); });
    global.addEventListener('pagehide', saveNow);
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
        // 収穫すると、選んでいるタネがその場に植え直される（タネ代が無ければ空いたまま）
        if (Engine.harvest(state, i, game.ui.seed)) {
          Audio.play('harvest');
          Render.float(Render.icon(f.crop), x, y, '', true);
          Render.barnPulse();
        } else barnFullWarning();
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
        if (n > 0) {
          Audio.play('collect');
          Render.float(Render.icon(Engine.machineDef(m).recipe.out) + '×' + n, x, y, '', true);
          Render.barnPulse();
        }
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
    } else if (act === 'boat-load') {
      const n = Engine.loadBoatAll(state);
      if (n > 0) {
        Audio.play('collect');
        Render.float('🚢+' + n, x, y);
        Render.ticker(Engine.boatReady(state.boat) ? 'ふなびんが満載！ しゅっこうできる' : `${n}こ 積んだ`);
      } else {
        Audio.play('nope');
        Render.ticker('積めるものが無い（注文に要るぶんは残してある）');
      }
    } else if (act === 'boat-ship') {
      const res = Engine.shipBoat(state);
      if (res) { Audio.play('finish'); Render.float('+🪙' + res.coins, x, y); Render.float('+⭐' + res.xp, x, y + 18, 'xp'); }
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
    } else if (act === 'buy-decor') {
      buy(() => Engine.buyDecor(state, id), decorHint(id));
    }
    Render.sync(state, game.ui);
  }

  const recipeText = (def) => Object.entries(def.recipe.in).map(([k, n]) => Render.nameOf(k) + '×' + n).join(' + ');

  function fieldHint() {
    const up = Engine.nextFieldPrice(game.state);
    if (!up) return 'これ以上は広げられない';
    return game.state.level < up.level ? `畑を増やすのは Lv${up.level} から` : `あと 🪙${up.price - Math.floor(game.state.coins)} 足りない`;
  }

  function decorHint(id) {
    const def = Data.decor(id);
    if (!def) return '';
    if (game.state.level < def.level) return `${def.name}は Lv${def.level} から`;
    return `あと 🪙${def.price - Math.floor(game.state.coins)} 足りない`;
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

  /**
   * 主ボタン。実ったものを収穫し、空いた畑へ選んでいるタネを植え直す。
   * 収穫と植え直しを別々のボタンにしていたとき、この2つだけで全操作の71%を占めていた
   * （待ちの無いゲームでは、その往復に判断が無い）。1タップにまとめてある。
   */
  function doHarvest() {
    const state = game.state;
    const before = Math.floor(state.coins);
    // 穫れたものを飛ばしたいので、収穫する前に見ておく（収穫後は植え直した作物になっている）
    const reaped = state.fields.find((f, i) => i < state.fieldsOwned && Engine.isReady(f, state.now));
    const grain = Render.icon(reaped ? reaped.crop : game.ui.seed);
    const n = Engine.harvestAll(state, game.ui.seed);
    const sown = n > 0 ? 0 : Engine.plantAll(state, game.ui.seed);   // 実りが無ければ、まくだけ

    if (n > 0) {
      Audio.play(n >= 3 ? 'harvestMany' : 'harvest', n);
      const box = $('#btn-harvest').getBoundingClientRect();
      // 穫れたものが倉庫へ飛ぶ。数が多いほど粒を増やす（多すぎても散らかるので上限）
      for (let k = 0; k < Math.min(5, n); k++) {
        Render.float(grain, box.left + box.width * (0.25 + 0.12 * k), box.top - k * 3, '', true);
      }
      Render.barnPulse();
      const spent = before - Math.floor(state.coins);
      const planted = state.fields.filter((f, i) => i < state.fieldsOwned && f.crop).length;
      const short = state.fieldsOwned - planted;
      if (short > 0) {
        // **畑が1秒で回るので、タネ代は毎秒出ていく。** 手元が尽きると静かに畑が空く。
        // 倉庫に売れるものがあるなら、売り場へ案内する（自力で抜けられると気づきにくい）
        Render.ticker(`${n}こ 収穫した（タネ代が足りず ${short}マス 空いている）`);
        if (Engine.barnUsed(state) > 0) {
          game.ui.tab = 'shop';
          game.ui.shopTab = 'sell';
          Render.invalidate();
        }
      } else {
        Render.ticker(`${n}こ 収穫して、${Render.nameOf(game.ui.seed)}を植え直した（🪙${spent}）`);
      }
    } else if (sown > 0) {
      Audio.play('plant');
      Render.ticker(`${Render.nameOf(game.ui.seed)}を ${sown}マス まいた`);
    } else if (Engine.barnFree(state) < 1) {
      barnFullWarning();
    } else {
      Audio.play('nope');
      const c = Data.crop(game.ui.seed);
      Render.ticker(c && state.coins < c.cost ? `まだ実っていない（タネ代も足りない）` : 'まだ実っていない');
    }
    Render.sync(state, game.ui);
  }

  /** 副ボタン。出来たものを取り出して、余っている材料で全部仕込む。 */
  function doWorkAll() {
    const state = game.state;
    const { got, queued } = Engine.workAll(state);
    if (got > 0 || queued > 0) {
      Audio.play(got > 0 ? 'collect' : 'craft');
      const box = $('#btn-work').getBoundingClientRect();
      if (got > 0) { Render.float('+' + got, box.left + box.width / 2, box.top, '', true); Render.barnPulse(); }
      Render.ticker([got > 0 ? `${got}こ 取り出した` : '', queued > 0 ? `${queued}こ 仕込んだ` : '']
        .filter(Boolean).join('・'));
    } else if (state.machines.some((m) => m.done) && Engine.barnFree(state) < 1) {
      barnFullWarning();
    } else {
      Audio.play('nope');
      Render.ticker('材料が足りない（注文に要るぶんは残してある）');
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
      // 音を切ると BGM も止まる。**戻したときに鳴り直さないと、もう二度と鳴らない**
      if (game.settings.sound) wakeMusic();
      sound.textContent = game.settings.sound ? '🔊 音: オン' : '🔇 音: オフ';
      Audio.play('tap');
    });
    rows.appendChild(sound);

    const bgmLabel = () => (game.settings.music ? '🎵 BGM: オン' : '🎵 BGM: オフ');
    const bgm = el('button', 'menu', bgmLabel());
    bgm.addEventListener('click', () => {
      game.settings = Store.save({ settings: { music: !game.settings.music } }).settings;
      if (game.settings.music) wakeMusic(); else Audio.stopMusic();
      bgm.textContent = bgmLabel();
    });
    rows.appendChild(bgm);

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
    const chart = recentChart(game.record.recent, game.record.bestScore, 1);
    if (chart) nodes.push(chart);
    nodes.push(el('h3', '', `じっせき（${game.state.achieved.length}/${Data.ACHIEVEMENTS.length}）`));
    const grid = el('div', 'achieves');
    for (const a of Data.ACHIEVEMENTS) {
      const done = game.state.achieved.includes(a.id);
      const now = Engine.achieveCount(game.state, a.on);
      const card = el('div', 'achieve' + (done ? ' done' : ''));
      card.appendChild(el('span', 'ico', done ? a.emoji : '🔒'));
      card.appendChild(el('span', 'nm', a.name));
      card.appendChild(el('span', 'sub', done ? 'かんりょう' : `${Math.min(now, a.goal)} / ${a.goal}`));
      const bar = el('span', 'bar');
      const fill = el('i');
      fill.style.width = Math.min(100, (now / a.goal) * 100) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
      grid.appendChild(card);
    }
    nodes.push(grid);

    Render.sheet(nodes);
  }

  /**
   * 直近の3分チャレンジを棒で並べる。**最高記録1つでは、伸びているかが分からない。**
   * 1回目は棒が1本しか出ないので、比べるものが無いうちは出さない。
   * 幅はいちばん高い回を基準にする（絶対値で引くと、序盤はどれも潰れて見える）。
   */
  const RECENT_MAX = 5;
  function recentChart(recent, best, offset = 0) {
    const list = (recent || []).slice(0, RECENT_MAX);
    if (list.length < 2) return null;
    const top = Math.max(best || 0, ...list.map((r) => r.score));
    const box = el('div', 'recent');
    list.forEach((r, i) => {
      const row = el('div', 'recent-row' + (top > 0 && r.score >= top ? ' top' : ''));
      // 「いま」は終わったばかりの回のこと。メニューから見るときは、いちばん上でも1回まえ
      const ago = offset + i;
      row.appendChild(el('span', 'when', ago === 0 ? 'いま' : `${ago}回まえ`));
      const bar = el('span', 'bar');
      const fill = el('i');
      fill.style.width = Math.max(4, (r.score / (top || 1)) * 100) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el('span', 'num', String(r.score)));
      box.appendChild(row);
    });
    return box;
  }

  function stat(value, label) {
    const box = el('div');
    box.appendChild(el('b', '', String(value)));
    box.appendChild(el('small', '', label));
    return box;
  }

  function showHelp() {
    // **短くする。** 長いと「はじめる」が画面の外へ出て、初めての人が始められない
    // （320x568 で実際にそうなっていた）。細かい説明は各パネルの見出しに置いてある。
    const rows = el('div', 'rows');
    const ok = el('button', 'menu primary', 'はじめる！');
    ok.addEventListener('click', () => Render.closeSheet());
    rows.appendChild(ok);

    Render.sheet([
      el('h2', '', 'あそびかた'),
      Render.rich('p', '', '🧺 したの大きいボタンで **収穫と植え直しが1タップ**。いちばん長い作物でも9秒。'),
      Render.rich('p', '', '⏱ まとめてまいた畑は **順番に実る**。だから待たされない。'),
      Render.rich('p', '', '🏭 となりのボタンで、出来たものを取り出して **まとめて仕込む**。'),
      Render.rich('p', '', '📦 ちゅうもんを届けるとコインと経験値。Lv7からは **ふなびん** も来る。'),
      rows
    ]);
  }

  function showResult() {
    if (game.resultShown === game.state) return;
    game.resultShown = game.state;
    const s = game.state;
    const best = Math.max(game.record.bestScore, Engine.score(s));
    // 直近5回。**新しいものを先頭に**（下に伸びると、見たい回が画面の外へ出る）
    const recent = [{ score: Engine.score(s), level: s.level, combo: s.bestCombo }]
      .concat(game.record.recent || []).slice(0, RECENT_MAX);
    game.record = Store.save({
      record: {
        bestScore: best,
        bestLevel: Math.max(game.record.bestLevel, s.level),
        bestCombo: Math.max(game.record.bestCombo, s.bestCombo),
        delivered: game.record.delivered + s.stats.delivered,
        games: game.record.games + 1,
        recent
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
    const chart = recentChart(game.record.recent, best);
    if (chart) { nodes.push(el('h3', '', 'ここ数回')); nodes.push(chart); }

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
