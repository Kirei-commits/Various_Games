/**
 * UIの組み立てと進行。ロジックは各モジュールに置き、ここでは繋ぐだけにする。
 *
 * 操作は「押す／離す」の1系統に統一している（端末で分岐させない）:
 *   押す   … キャスト / 合わせ / 巻き始め / 結果を閉じる
 *   離す   … 巻きを止める
 * ボタンと釣り場（Canvas）のどちらでも同じように効く。
 */
(function (global) {
  'use strict';

  var FQ = global.FQ;
  var Fish = FQ.Fish, Progress = FQ.Progress, World = FQ.World, Gear = FQ.Gear;
  var Achievements = FQ.Achievements, Store = FQ.Store, Sfx = FQ.Sfx, Render = FQ.Render;

  var params = new URLSearchParams(global.location.search);
  var DEBUG = params.get('debug') === '1';

  /** 種を与えたときだけ決定的になる乱数（テスト用）。 */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var seedParam = params.get('seed');
  var rng = seedParam == null ? Math.random : mulberry32(parseInt(seedParam, 10) || 1);

  if (params.get('reset') === '1') Store.clear();

  var state = Store.load();
  var game = FQ.Game.create({ random: rng });

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    level: $('hud-level'), title: $('hud-title'), xpFill: $('hud-xp-fill'), xpText: $('hud-xp-text'),
    coins: $('hud-coins'), env: $('hud-env'), combo: $('hud-combo'), sound: $('btn-sound'),
    scene: $('scene'), status: $('status'), gauges: $('gauges'),
    tensionFill: $('tension-fill'), tensionDanger: $('tension-danger'), progressFill: $('progress-fill'),
    action: $('action'), hint: $('hint'),
    dexList: $('dex-list'), lureList: $('lure-list'), rodUpgrade: $('rod-upgrade'),
    lineUpgrade: $('line-upgrade'), recordList: $('record-list'), statList: $('stat-list'),
    achievementList: $('achievement-list'), toasts: $('toasts'), reset: $('btn-reset')
  };

  var TABS = ['dex', 'shop', 'records', 'achievements'];
  var lastStatus = '';
  var idleMessage = 'キャストして釣りをはじめよう';

  // ---------------------------------------------------------------- 表示

  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

  function setStatus(text) {
    if (text === lastStatus) return;
    lastStatus = text;
    el.status.textContent = text;
  }

  function toast(text, kind) {
    var d = document.createElement('div');
    d.className = 'toast' + (kind ? ' toast-' + kind : '');
    d.textContent = text;
    el.toasts.appendChild(d);
    global.setTimeout(function () { d.classList.add('out'); }, 2600);
    global.setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3200);
  }

  function syncHud() {
    var p = Progress.levelProgress(state.xp);
    el.level.textContent = 'Lv.' + p.level;
    el.title.textContent = Achievements.titleOf(state);
    el.xpFill.style.width = (p.ratio * 100).toFixed(1) + '%';
    el.xpText.textContent = p.need
      ? fmt(p.into) + ' / ' + fmt(p.need) + ' P'
      : 'MAX（通算 ' + fmt(state.xp) + ' P）';
    el.coins.textContent = fmt(state.coins);

    var phase = World.phaseAt(state.clock);
    var weather = World.weatherOf(state.weather);
    el.env.textContent = phase.icon + ' ' + World.formatClock(state.clock) + ' ' + weather.icon;
    el.env.title = phase.name + ' / ' + weather.name;

    el.combo.textContent = '🔥 ' + state.combo;
    el.combo.classList.toggle('hot', state.combo >= 3);

    var lure = Gear.lure(state.lure);
    var stock = state.lure === 'none' ? '' : '（残り' + (state.lures[state.lure] || 0) + '）';
    el.hint.textContent = 'エサ: ' + lure.name + stock +
      ' ／ 竿: ' + Gear.rod(state.rod).name + ' ／ 糸: ' + Gear.line(state.line).name;

    el.tensionDanger.style.left = (Gear.line(state.line).breakAt * 100).toFixed(1) + '%';
    el.tensionDanger.style.width = ((1 - Gear.line(state.line).breakAt) * 100).toFixed(1) + '%';
  }

  var ACTION_LABEL = {
    idle: 'キャスト',
    casting: '…',
    waiting: 'アタリを待つ',
    bite: '合わせる！',
    fight: '押し続けて巻く',
    result: 'つぎへ'
  };

  function syncAction() {
    var ph = game.state.phase;
    el.action.textContent = ACTION_LABEL[ph] || 'キャスト';
    el.action.dataset.phase = ph;
    el.action.disabled = ph === 'casting';
    el.gauges.hidden = ph !== 'fight';
  }

  function syncGauges() {
    if (game.state.phase !== 'fight') return;
    var t = game.state.tension;
    el.tensionFill.style.width = (t * 100).toFixed(1) + '%';
    el.tensionFill.classList.toggle('warn', t >= game.state.breakAt - 0.15);
    el.progressFill.style.width = (game.state.progress * 100).toFixed(1) + '%';
  }

  // ---------------------------------------------------------------- パネル

  function fishThumb(fish, locked) {
    var c = document.createElement('canvas');
    c.className = 'thumb';
    c.width = 168; c.height = 96;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 168, 96);
    if (locked) {
      g.save();
      g.globalAlpha = 0.28;
      Render.drawFish(g, 84, 48, 120, -1, { color: '#8b93a7', accent: '#5c6478', belly: '#aab2c4' }, 0);
      g.restore();
    } else {
      Render.drawFish(g, 84, 48, 120, -1, fish, 0);
    }
    return c;
  }

  function renderDex() {
    el.dexList.innerHTML = '';
    var list = Fish.all();
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var rec = state.dex[f.id];
      var card = document.createElement('article');
      card.className = 'dex-card' + (rec ? '' : ' locked');
      card.dataset.fish = f.id;
      card.appendChild(fishThumb(f, !rec));

      var body = document.createElement('div');
      body.className = 'dex-body';
      body.innerHTML =
        '<h3>' + (rec ? f.name : '？？？') + '</h3>' +
        '<p class="rarity">' + stars(f.stars) + '</p>' +
        (rec
          ? '<p class="dex-stat">釣った数 <b>' + rec.count + '</b> ／ 最大 <b>' + rec.maxSize.toFixed(1) + 'cm</b></p>' +
            '<p class="dex-stat">最高 <b>' + fmt(rec.bestPoints) + ' P</b></p>' +
            '<p class="dex-note">' + f.note + '</p>'
          : '<p class="dex-stat">まだ釣っていない</p>' +
            '<p class="dex-note">サイズ ' + f.min + '〜' + f.max + 'cm</p>');
      card.appendChild(body);
      el.dexList.appendChild(card);
    }
  }

  function renderShop() {
    // エサ・ルアー
    el.lureList.innerHTML = '';
    var lures = Gear.LURES;
    for (var i = 0; i < lures.length; i++) {
      (function (l) {
        var row = document.createElement('div');
        row.className = 'lure-row' + (state.lure === l.id ? ' equipped' : '');
        row.dataset.lure = l.id;
        var own = l.id === 'none' ? '∞' : String(state.lures[l.id] || 0);
        var info = document.createElement('div');
        info.className = 'lure-info';
        info.innerHTML = '<h3>' + l.name + ' <span class="own">所持 ' + own + '</span></h3>' +
          '<p>' + l.desc + '</p>';
        row.appendChild(info);

        var actions = document.createElement('div');
        actions.className = 'lure-actions';
        if (l.cost > 0) {
          [1, 10].forEach(function (n) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'buy';
            b.dataset.buy = l.id;
            b.dataset.count = String(n);
            b.textContent = '×' + n + '  ' + fmt(l.cost * n) + 'P';
            b.disabled = state.coins < l.cost * n;
            b.addEventListener('click', function () { buyLure(l.id, n); });
            actions.appendChild(b);
          });
        }
        var eq = document.createElement('button');
        eq.type = 'button';
        eq.className = 'equip';
        eq.dataset.equip = l.id;
        eq.textContent = state.lure === l.id ? '装備中' : '装備する';
        eq.disabled = state.lure === l.id || (l.cost > 0 && !(state.lures[l.id] > 0));
        eq.addEventListener('click', function () { equipLure(l.id); });
        actions.appendChild(eq);
        row.appendChild(actions);
        el.lureList.appendChild(row);
      })(lures[i]);
    }

    renderUpgrade('rod', el.rodUpgrade);
    renderUpgrade('line', el.lineUpgrade);
  }

  function renderUpgrade(kind, host) {
    var level = kind === 'rod' ? state.rod : state.line;
    var list = kind === 'rod' ? Gear.RODS : Gear.LINES;
    var cur = list[Math.min(list.length, Math.max(1, level)) - 1];
    var next = level < list.length ? list[level] : null;
    host.innerHTML = '';
    host.dataset.kind = kind;

    var now = document.createElement('div');
    now.className = 'up-now';
    now.innerHTML = '<h3>' + cur.name + ' <span class="lvtag">Lv.' + level + '/' + list.length + '</span></h3>' +
      '<p>' + cur.desc + '</p>';
    host.appendChild(now);

    var box = document.createElement('div');
    box.className = 'up-next';
    if (!next) {
      box.innerHTML = '<p class="maxed">最大まで強化済み</p>';
    } else {
      box.innerHTML = '<p>つぎ: <b>' + next.name + '</b><br><span class="up-desc">' + next.desc + '</span></p>';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'buy';
      b.id = 'upgrade-' + kind;
      b.textContent = fmt(next.cost) + 'P で強化';
      b.disabled = state.coins < next.cost;
      b.addEventListener('click', function () { upgrade(kind); });
      box.appendChild(b);
    }
    host.appendChild(box);
  }

  function renderRecords() {
    el.recordList.innerHTML = '';
    if (!state.records.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'まだ記録がありません。';
      el.recordList.appendChild(li);
    }
    for (var i = 0; i < state.records.length; i++) {
      var r = state.records[i];
      var f = Fish.byId(r.id);
      var item = document.createElement('li');
      item.className = 'record';
      item.innerHTML = '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="rname">' + (f ? f.name : r.id) + '</span>' +
        '<span class="rsize">' + r.size.toFixed(1) + 'cm</span>' +
        '<span class="rpoint">' + fmt(r.points) + ' P</span>';
      el.recordList.appendChild(item);
    }

    var rate = state.casts ? Math.round(state.catches / state.casts * 100) : 0;
    var rows = [
      ['キャスト', fmt(state.casts) + ' 回'],
      ['釣り上げ', fmt(state.catches) + ' 匹'],
      ['バラシ', fmt(state.misses) + ' 回'],
      ['成功率', rate + ' %'],
      ['最高コンボ', fmt(state.bestCombo)],
      ['通算ポイント', fmt(state.xp) + ' P']
    ];
    el.statList.innerHTML = rows.map(function (r) {
      return '<div class="stat"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');
  }

  function renderAchievements() {
    el.achievementList.innerHTML = '';
    var list = Achievements.LIST;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var done = state.achievements.indexOf(a.id) !== -1;
      var d = document.createElement('div');
      d.className = 'ach' + (done ? ' done' : '');
      d.dataset.ach = a.id;
      d.innerHTML = '<span class="ach-mark">' + (done ? '🏅' : '🔒') + '</span>' +
        '<div><h3>' + a.name + '</h3><p>' + a.desc + '</p>' +
        '<p class="ach-title">称号: ' + a.title + '</p></div>';
      el.achievementList.appendChild(d);
    }
  }

  function renderAll() {
    syncHud(); syncAction(); renderDex(); renderShop(); renderRecords(); renderAchievements();
  }

  // ---------------------------------------------------------------- 操作

  function persist() { Store.save(state); }

  function buyLure(id, n) {
    var r = Gear.tryBuyLure(id, n, state.coins);
    if (!r.ok) { toast(r.reason === 'poor' ? 'ポイントが足りない' : '買えません', 'bad'); return; }
    state.coins = r.coins;
    state.lures[id] = (state.lures[id] || 0) + r.count;
    Sfx.play('buy');
    toast(Gear.lure(id).name + ' を ' + r.count + ' 個 購入', 'good');
    persist(); syncHud(); renderShop();
  }

  function equipLure(id) {
    if (id !== 'none' && !(state.lures[id] > 0)) return;
    state.lure = id;
    Sfx.play('buy');
    persist(); syncHud(); renderShop();
  }

  function upgrade(kind) {
    var level = kind === 'rod' ? state.rod : state.line;
    var r = Gear.tryUpgrade(kind, level, state.coins);
    if (!r.ok) { toast(r.reason === 'poor' ? 'ポイントが足りない' : 'これ以上強化できない', 'bad'); return; }
    state.coins = r.coins;
    if (kind === 'rod') state.rod = r.level; else state.line = r.level;
    var gained = Achievements.evaluate(state, null);
    for (var i = 0; i < gained.length; i++) {
      state.achievements.push(gained[i]);
      toast('実績解除: ' + Achievements.byId(gained[i]).name, 'gold');
    }
    Sfx.play('levelup');
    toast((kind === 'rod' ? '竿' : '糸') + ' を強化した', 'good');
    persist(); syncHud(); renderShop(); renderAchievements();
  }

  function castContext() {
    var lure = Gear.lure(state.lure);
    var weather = World.weatherOf(state.weather);
    return {
      level: state.level,
      phase: World.phaseAt(state.clock).id,
      weather: state.weather,
      lure: lure,
      rod: Gear.rod(state.rod),
      line: Gear.line(state.line),
      weatherWaitMul: weather.waitMul,
      weatherAmpMul: weather.ampMul
    };
  }

  function doCast() {
    // エサを1つ消費してから投げる。切らしたら素エサに戻す。
    if (state.lure !== 'none') {
      if (state.lures[state.lure] > 0) state.lures[state.lure] -= 1;
      else state.lure = 'none';
    }
    var usedUp = state.lure !== 'none' && state.lures[state.lure] === 0;

    if (!game.cast(castContext())) return;

    state.casts += 1;
    state.clock = World.advance(state.clock);
    state.weather = World.nextWeather(state.weather, rng);
    if (usedUp) { state.lure = 'none'; toast('エサを使い切った', 'bad'); }

    Sfx.play('cast');
    global.setTimeout(function () { Sfx.play('splash'); }, 620);
    persist(); syncHud(); syncAction(); renderShop();
  }

  var MISS_TEXT = {
    early: 'アワセが早すぎた！ 魚が逃げていった',
    late:  'アワセが遅かった… エサだけ取られた',
    break: 'ラインブレイク！ 巻きすぎた',
    escape: '時間切れ。走られて根に潜られた'
  };

  function onLanded(ev) {
    var res = Store.applyCatch(state, {
      fish: ev.fish, size: ev.size, weatherMul: World.weatherOf(state.weather).pointMul
    });
    Sfx.play('land', ev.fish.stars);
    idleMessage = ev.fish.name + ' ' + ev.size.toFixed(1) + 'cm ／ +' + fmt(res.points) + ' P';
    if (res.isNew) toast('図鑑に追加: ' + ev.fish.name, 'gold');
    if (res.isBiggest && !res.isNew) toast('自己最大サイズ更新！', 'good');
    if (res.combo >= 3) toast('コンボ ' + res.combo + '（×' + Progress.comboMultiplier(res.combo - 1).toFixed(1) + '）', 'good');
    if (res.leveledTo) {
      Sfx.play('levelup');
      toast('レベルアップ！ Lv.' + res.leveledTo + ' — レアが出やすくなった', 'gold');
    }
    for (var i = 0; i < res.achievements.length; i++) {
      Sfx.play('achieve');
      toast('実績解除: ' + Achievements.byId(res.achievements[i]).name, 'gold');
    }
    persist();
    renderAll();
  }

  function onMissed(ev) {
    Store.applyMiss(state);
    Sfx.play(ev.reason === 'break' ? 'snap' : 'miss');
    idleMessage = MISS_TEXT[ev.reason] || 'バラしてしまった';
    persist();
    syncHud(); renderRecords();
  }

  function handleEvent(ev) {
    if (!ev) return;
    if (ev.type === 'bite') { Sfx.play('bite'); if (global.navigator.vibrate) try { global.navigator.vibrate(30); } catch (e) {} }
    else if (ev.type === 'landed') onLanded(ev);
    else if (ev.type === 'missed') onMissed(ev);
    else if (ev.type === 'ready') { syncAction(); }
    syncAction();
  }

  /** 押した瞬間の処理。フェーズごとに意味が変わる。 */
  function press() {
    Sfx.unlock();
    var ph = game.state.phase;
    if (ph === 'idle') { doCast(); return; }
    if (ph === 'waiting' || ph === 'bite') { handleEvent(game.strike()); return; }
    if (ph === 'fight') { game.setReeling(true); return; }
    if (ph === 'result') { game.dismiss(); syncAction(); return; }
  }

  function release() {
    if (game.state.phase === 'fight') game.setReeling(false);
  }

  function bindHold(node) {
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (node.setPointerCapture && e.pointerId != null) {
        try { node.setPointerCapture(e.pointerId); } catch (err) {}
      }
      press();
    });
    node.addEventListener('pointerup', function (e) { e.preventDefault(); release(); });
    node.addEventListener('pointercancel', release);
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  bindHold(el.action);
  bindHold(el.scene);
  global.addEventListener('blur', release);
  global.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (e.repeat) return;
    var t = e.target;
    if (t && (t.tagName === 'BUTTON' && t !== el.action)) return;
    e.preventDefault();
    press();
  });
  global.addEventListener('keyup', function (e) {
    if (e.code === 'Space' || e.code === 'Enter') release();
  });

  // タブ
  TABS.forEach(function (name) {
    $('tab-' + name).addEventListener('click', function () {
      TABS.forEach(function (other) {
        var tab = $('tab-' + other), panel = $('panel-' + other);
        var on = other === name;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        panel.hidden = !on;
      });
    });
  });

  el.sound.addEventListener('click', function () {
    state.settings.sound = !state.settings.sound;
    Sfx.setEnabled(state.settings.sound);
    el.sound.textContent = state.settings.sound ? '🔊' : '🔇';
    el.sound.setAttribute('aria-pressed', state.settings.sound ? 'true' : 'false');
    persist();
  });

  el.reset.addEventListener('click', function () {
    if (!global.confirm('すべての進捗を消去します。よろしいですか？')) return;
    Store.clear();
    state = Store.load();
    game.reset();
    idleMessage = 'キャストして釣りをはじめよう';
    renderAll();
    toast('データを消去しました');
  });

  // ---------------------------------------------------------------- ループ

  var last = 0;

  function statusText() {
    var s = game.state;
    switch (s.phase) {
      case 'casting': return '仕掛けが飛んでいく…';
      case 'waiting': return 'アタリを待つ…（早合わせに注意）';
      case 'bite': return '⚡ 合わせろ！';
      case 'fight': return '押し続けて巻く。テンションを赤に入れない';
      case 'result': return idleMessage;
      default: return idleMessage;
    }
  }

  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(64, now - last); // タブ復帰時の巨大な dt を切る
    last = now;

    handleEvent(game.tick(dt));
    syncGauges();
    setStatus(statusText());

    var s = game.state;
    Render.draw(el.scene, {
      time: now,
      timePhase: World.phaseAt(state.clock).id,
      weather: state.weather,
      gamePhase: s.phase,
      phaseT: s.t,
      waitRatio: s.waitMs ? Math.min(1, s.t / s.waitMs) : 0,
      tension: s.tension,
      progress: s.progress,
      fish: s.fish,
      size: s.size,
      result: s.result
    }, dt);

    global.requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- 起動

  Sfx.setEnabled(state.settings.sound);
  el.sound.textContent = state.settings.sound ? '🔊' : '🔇';
  el.sound.setAttribute('aria-pressed', state.settings.sound ? 'true' : 'false');
  renderAll();
  global.requestAnimationFrame(frame);

  // テスト用の口。?debug=1 のときだけ生える。
  FQ.app = {
    get state() { return state; },
    game: game,
    render: renderAll
  };
  if (DEBUG) {
    FQ.app.debug = {
      skipWait: function () { game.skipWait(); },
      grant: function (n) { state.xp += n; state.coins += n; state.level = Progress.levelFromXp(state.xp); persist(); renderAll(); },
      setLevelXp: function (lv) { state.xp = Progress.totalFor(lv); state.level = Progress.levelFromXp(state.xp); persist(); renderAll(); },
      forceFish: function (id) {
        var f = Fish.byId(id);
        if (!f) return false;
        game.state.fish = f;
        game.state.size = (f.min + f.max) / 2;
        game.state.limitMs = f.fightMs * FQ.Game.FIGHT_LIMIT_MUL;
        return true;
      },
      giveLure: function (id, n) { state.lures[id] = (state.lures[id] || 0) + n; persist(); renderAll(); },
      setWeather: function (w) { state.weather = w; persist(); syncHud(); },
      setClock: function (m) { state.clock = World.normalizeMinutes(m); persist(); syncHud(); }
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
