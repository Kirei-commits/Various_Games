/**
 * UIの組み立てと進行。ロジックは各モジュールに置き、ここでは繋ぐだけにする。
 *
 * 操作は「押す／離す」の1系統に統一している（端末で分岐させない）:
 *   押す   … キャスト / 合わせ / 巻き始め / 結果を閉じる
 *   離す   … 巻きを止める
 * ボタンと釣り場（Canvas）のどちらでも同じように効く。
 *
 * 起動の流れ:
 *   ログイン画面（新規作成 / 続きから / 復元）→ [新規なら控えの画面] →
 *   ログインボーナス → ゲーム本体
 */
(function (global) {
  'use strict';

  var FQ = global.FQ;
  var Fish = FQ.Fish, Progress = FQ.Progress, Angler = FQ.Angler, World = FQ.World;
  var Gear = FQ.Gear, Parts = FQ.Parts, Boost = FQ.Boost, Bonus = FQ.Bonus;
  var Achievements = FQ.Achievements, Store = FQ.Store, Account = FQ.Account;
  var Tackle = FQ.Tackle, Sfx = FQ.Sfx, Render = FQ.Render;

  var ADMIN_CODE = 'aaa';

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

  var $ = function (id) { return document.getElementById(id); };

  var state = null;
  var game = FQ.Game.create({ random: rng });
  var running = false;
  var lastStatus = '';
  var idleMessage = 'キャストして釣りをはじめよう';

  // ---------------------------------------------------------------- 共通

  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
  function today() { return Bonus.dateKey(new Date()); }

  function toast(text, kind) {
    var d = document.createElement('div');
    d.className = 'toast' + (kind ? ' toast-' + kind : '');
    d.textContent = text;
    $('toasts').appendChild(d);
    global.setTimeout(function () { d.classList.add('out'); }, 2600);
    global.setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3200);
  }

  function persist() { if (state) Account.save(state); }

  /** 買い物の価格。管理者モードなら 0 円。 */
  function buyOpts() { return { free: !!(state && state.admin) }; }
  function priceOf(cost) { return (state && state.admin) ? 0 : cost; }

  // ---------------------------------------------------------------- ログイン画面

  function showSavedList() {
    var users = Account.list();
    $('saved-list').textContent = users.length
      ? 'この端末のデータ: ' + users.map(function (u) { return u.name; }).join('、')
      : 'この端末にはまだデータがありません。';
  }

  function switchGateTab(which) {
    var isNew = which === 'new';
    $('gate-tab-new').classList.toggle('is-active', isNew);
    $('gate-tab-load').classList.toggle('is-active', !isNew);
    $('gate-tab-new').setAttribute('aria-selected', isNew ? 'true' : 'false');
    $('gate-tab-load').setAttribute('aria-selected', isNew ? 'false' : 'true');
    $('form-new').hidden = !isNew;
    $('form-load').hidden = isNew;
  }

  $('gate-tab-new').addEventListener('click', function () { switchGateTab('new'); });
  $('gate-tab-load').addEventListener('click', function () { switchGateTab('load'); });

  $('form-new').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('new-name').value, pass = $('new-pass').value;
    var r = Account.create(name, pass, { random: rng });
    if (!r.ok) { $('new-error').textContent = r.error; return; }
    $('new-error').textContent = '';
    showMemo(r.name, pass);
  });

  $('form-load').addEventListener('submit', function (e) {
    e.preventDefault();
    var r = Account.login($('load-name').value, $('load-pass').value);
    if (!r.ok) { $('load-error').textContent = r.error; return; }
    $('load-error').textContent = '';
    $('gate').hidden = true;
    startGame();
  });

  $('btn-restore').addEventListener('click', function () {
    var code = $('restore-code').value;
    var r = Account.restore(code);
    if (!r.ok && r.error === 'exists') {
      if (!global.confirm('「' + r.name + '」は既にあります。上書きしますか？')) return;
      r = Account.restore(code, { overwrite: true });
    }
    if (!r.ok) { $('restore-error').textContent = r.error; return; }
    $('restore-error').textContent = '';
    $('gate').hidden = true;
    startGame();
    toast('「' + r.name + '」を復元しました', 'good');
  });

  function showMemo(name, pass) {
    $('memo-name').textContent = name;
    $('memo-pass').textContent = pass;
    $('memo-code').value = Account.backupCode() || '';
    $('memo-ok').checked = false;
    $('btn-memo-done').disabled = true;
    $('gate').hidden = true;
    $('memo').hidden = false;
  }

  $('memo-ok').addEventListener('change', function () {
    $('btn-memo-done').disabled = !$('memo-ok').checked;
  });

  $('btn-copy').addEventListener('click', function () {
    var text = 'つりクエスト\n名前: ' + $('memo-name').textContent +
      '\nパスワード: ' + $('memo-pass').textContent +
      '\nバックアップコード:\n' + $('memo-code').value;
    copyText(text, 'メモをコピーしました');
  });

  $('btn-memo-done').addEventListener('click', function () {
    $('memo').hidden = true;
    startGame();
  });

  function copyText(text, okMessage) {
    var done = function () { toast(okMessage, 'good'); };
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      // clipboard API が使えない環境（file:// など）向け
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? okMessage : 'コピーできませんでした。手で控えてください', ok ? 'good' : 'bad');
    }
  }

  $('btn-logout').addEventListener('click', function () {
    persist();
    Account.logout();
    global.location.reload();
  });

  // ---------------------------------------------------------------- ログインボーナス

  function showBonusIfAny(afterwards) {
    if (!Bonus.pending(state, today())) { afterwards(); return; }
    var streak = Bonus.daysBetween(state.bonusDate, today()) === 1 ? (state.bonusStreak || 0) + 1 : 1;
    var reward = Bonus.rewardFor(streak);

    $('bonus-day').textContent = streak + '日目（' + reward.day + '日目の報酬）';
    $('bonus-items').innerHTML = reward.items.map(function (it) {
      if (it.type === 'coins') return '<div class="bonus-item">💰 ' + fmt(it.amount) + ' ポイント</div>';
      if (it.type === 'lure') return '<div class="bonus-item">🎣 ' + Gear.lure(it.id).name + ' ×' + it.amount + '</div>';
      return '<div class="bonus-item">' + Boost.byId(it.id).icon + ' ' + Boost.byId(it.id).name + ' ×' + it.amount + '</div>';
    }).join('');
    $('bonus-track').innerHTML = Bonus.REWARDS.map(function (r) {
      return '<span class="bonus-pip' + (r.day <= reward.day ? ' on' : '') + '">' + r.day + '</span>';
    }).join('');

    $('bonus').hidden = false;
    $('btn-bonus-ok').onclick = function () {
      var got = Bonus.claim(state, today());
      $('bonus').hidden = true;
      if (got.claimed) {
        Sfx.play('achieve');
        toast('ログインボーナス ' + got.streak + '日目を受け取りました', 'gold');
        var gained = Achievements.evaluate(state, null);
        for (var i = 0; i < gained.length; i++) {
          state.achievements.push(gained[i]);
          toast('実績解除: ' + Achievements.byId(gained[i]).name, 'gold');
        }
      }
      persist();
      renderAll();
      afterwards();
    };
  }

  // ---------------------------------------------------------------- 表示

  function setStatus(text) {
    if (text === lastStatus) return;
    lastStatus = text;
    $('status').textContent = text;
  }

  function syncHud() {
    var p = Progress.levelProgress(state.xp);
    $('hud-level').textContent = 'Lv.' + p.level;
    $('hud-xp-fill').style.width = (p.ratio * 100).toFixed(1) + '%';
    $('hud-xp-text').textContent = p.need
      ? fmt(p.into) + ' / ' + fmt(p.need) + ' P' : 'MAX';

    var a = Angler.levelProgress(state.anglerXp);
    $('hud-angler').textContent = 'Lv.' + a.level;
    $('hud-angler-fill').style.width = (a.ratio * 100).toFixed(1) + '%';
    $('hud-angler-text').textContent = a.need ? a.into + ' / ' + a.need : 'MAX';

    $('hud-title').textContent = Achievements.titleOf(state);
    $('hud-coins').textContent = fmt(state.coins);
    $('hud-user').textContent = '👤 ' + (Account.current() || 'ゲスト');

    var phase = World.phaseAt(state.clock);
    var weather = World.weatherOf(state.weather);
    $('hud-env').textContent = phase.icon + ' ' + World.formatClock(state.clock) + ' ' + weather.icon;
    $('hud-env').title = phase.name + ' / ' + weather.name;

    $('hud-combo').textContent = '🔥 ' + state.combo;
    $('hud-combo').classList.toggle('hot', state.combo >= 3);

    var active = [];
    for (var id in state.boostActive) {
      var b = Boost.byId(id);
      if (b && state.boostActive[id] > 0) active.push(b.icon + state.boostActive[id]);
    }
    $('hud-boost').hidden = active.length === 0;
    $('hud-boost').textContent = active.join(' ');

    var lure = Gear.lure(state.lure);
    var stock = state.lure === 'none' ? '' : '（残り' + (state.lures[state.lure] || 0) + '）';
    var eq = Parts.equipped(state.parts, state.ownedParts);
    $('hint').textContent = 'エサ: ' + lure.name + stock +
      ' ／ 竿: ' + Gear.rod(state.rod).name + ' ／ 糸: ' + Gear.line(state.line).name +
      ' ／ ' + eq.reel.name;

    var breakAt = Tackle.resolve(state, World.weatherOf(state.weather)).breakAt;
    $('tension-danger').style.left = (breakAt * 100).toFixed(1) + '%';
    $('tension-danger').style.width = ((1 - breakAt) * 100).toFixed(1) + '%';
  }

  var ACTION_LABEL = {
    idle: 'キャスト', casting: '…', waiting: 'アタリを待つ',
    bite: '合わせる！', fight: '押し続けて巻く', result: 'つぎへ'
  };

  function syncAction() {
    var ph = game.state.phase;
    $('action').textContent = ACTION_LABEL[ph] || 'キャスト';
    $('action').dataset.phase = ph;
    $('action').disabled = ph === 'casting';
    $('gauges').hidden = ph !== 'fight';
  }

  function syncGauges() {
    if (game.state.phase !== 'fight') return;
    var t = game.state.tension;
    $('tension-fill').style.width = (t * 100).toFixed(1) + '%';
    $('tension-fill').classList.toggle('warn', t >= game.state.breakAt - 0.15);
    $('progress-fill').style.width = (game.state.progress * 100).toFixed(1) + '%';
  }

  // ---------------------------------------------------------------- パネル

  /**
   * 図鑑のサムネイル。魚が30種あるので、毎回 canvas を作り直すと
   * 1匹釣るたびに描画が詰まる（実際にE2Eが並列で総崩れになった）。
   * 一度だけ描いて data URL にし、以降は <img> の src を使い回す。
   */
  var thumbCache = {};
  function thumbUrl(fish, locked) {
    var key = locked ? '__locked' : fish.id;
    if (thumbCache[key]) return thumbCache[key];
    var c = document.createElement('canvas');
    c.width = 168; c.height = 96;
    var g = c.getContext('2d');
    if (locked) {
      g.globalAlpha = 0.28;
      Render.drawFish(g, 84, 48, 120, -1, { color: '#8b93a7', accent: '#5c6478', belly: '#aab2c4' }, 0);
    } else {
      Render.drawFish(g, 84, 48, 120, -1, fish, 0);
    }
    thumbCache[key] = c.toDataURL('image/png');
    return thumbCache[key];
  }

  function renderDex() {
    var list = Fish.all();
    var got = 0;
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var rec = state.dex[f.id];
      if (rec) got++;
      html += '<article class="dex-card' + (rec ? '' : ' locked') + '" data-fish="' + f.id + '">' +
        '<img class="thumb" alt="" src="' + thumbUrl(f, !rec) + '">' +
        '<div class="dex-body">' +
        '<h3>' + (rec ? f.name : '？？？') + '</h3>' +
        '<p class="rarity">' + stars(f.stars) + '</p>' +
        (rec
          ? '<p class="dex-stat">釣った数 <b>' + rec.count + '</b> ／ 最大 <b>' + rec.maxSize.toFixed(1) + 'cm</b></p>' +
            '<p class="dex-stat">最高 <b>' + fmt(rec.bestPoints) + ' P</b></p>' +
            '<p class="dex-note">' + f.note + '</p>'
          : '<p class="dex-stat">まだ釣っていない</p>' +
            '<p class="dex-note">サイズ ' + f.min + '〜' + f.max + 'cm</p>') +
        '</div></article>';
    }
    $('dex-list').innerHTML = html;
    $('dex-count').textContent = got + ' / ' + list.length;
  }

  function renderLures() {
    var host = $('lure-list');
    host.innerHTML = '';
    Gear.LURES.forEach(function (l) {
      var row = document.createElement('div');
      row.className = 'shop-row' + (state.lure === l.id ? ' equipped' : '');
      row.dataset.lure = l.id;
      var own = l.id === 'none' ? '∞' : String(state.lures[l.id] || 0);
      row.innerHTML = '<div class="shop-info"><h3>' + l.name +
        ' <span class="own">所持 ' + own + '</span></h3><p>' + l.desc + '</p></div>';

      var actions = document.createElement('div');
      actions.className = 'shop-actions';
      if (l.cost > 0) {
        [1, 10].forEach(function (n) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'buy';
          b.dataset.buy = l.id;
          b.dataset.count = String(n);
          b.textContent = '×' + n + '  ' + fmt(priceOf(l.cost) * n) + 'P';
          b.disabled = state.coins < priceOf(l.cost) * n;
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
      host.appendChild(row);
    });
  }

  function renderBoosts() {
    var host = $('boost-list');
    host.innerHTML = '';
    Boost.LIST.forEach(function (b) {
      var stock = state.boostStock[b.id] || 0;
      var left = state.boostActive[b.id] || 0;
      var row = document.createElement('div');
      row.className = 'shop-row' + (left > 0 ? ' equipped' : '');
      row.dataset.boost = b.id;
      row.innerHTML = '<div class="shop-info"><h3>' + b.icon + ' ' + b.name +
        ' <span class="own">所持 ' + stock + (left > 0 ? ' / 残り' + left + 'キャスト' : '') + '</span></h3>' +
        '<p>' + b.desc + '（' + b.casts + 'キャスト）</p></div>';

      var actions = document.createElement('div');
      actions.className = 'shop-actions';
      [1, 5].forEach(function (n) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'buy';
        btn.dataset.buyBoost = b.id;
        btn.dataset.count = String(n);
        btn.textContent = '×' + n + '  ' + fmt(priceOf(b.cost) * n) + 'P';
        btn.disabled = state.coins < priceOf(b.cost) * n;
        btn.addEventListener('click', function () { buyBoost(b.id, n); });
        actions.appendChild(btn);
      });
      var use = document.createElement('button');
      use.type = 'button';
      use.className = 'equip';
      use.dataset.useBoost = b.id;
      use.textContent = '使う';
      use.disabled = stock <= 0;
      use.addEventListener('click', function () { useBoost(b.id); });
      actions.appendChild(use);
      row.appendChild(actions);
      host.appendChild(row);
    });
  }

  function renderParts() {
    var host = $('part-list');
    host.innerHTML = '';
    Parts.SLOTS.forEach(function (slot) {
      var h = document.createElement('h3');
      h.className = 'part-slot';
      h.textContent = slot.label;
      host.appendChild(h);

      slot.list.forEach(function (item) {
        var owned = item.cost === 0 || state.ownedParts.indexOf(item.id) !== -1;
        var on = state.parts[slot.key] === item.id;
        var row = document.createElement('div');
        row.className = 'shop-row' + (on ? ' equipped' : '');
        row.dataset.part = item.id;

        var swatch = item.color || (item.bottom || '#888');
        row.innerHTML = '<span class="swatch" style="background:' + swatch + '"></span>' +
          '<div class="shop-info"><h3>' + item.name + '</h3><p>' + item.desc + '</p></div>';

        var actions = document.createElement('div');
        actions.className = 'shop-actions';
        if (!owned) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'buy';
          b.dataset.buyPart = item.id;
          b.textContent = fmt(priceOf(item.cost)) + 'P で買う';
          b.disabled = state.coins < priceOf(item.cost);
          b.addEventListener('click', function () { buyPart(item.id); });
          actions.appendChild(b);
        } else {
          var eq = document.createElement('button');
          eq.type = 'button';
          eq.className = 'equip';
          eq.dataset.equipPart = item.id;
          eq.textContent = on ? '装備中' : '装備する';
          eq.disabled = on;
          eq.addEventListener('click', function () { equipPart(slot.key, item.id); });
          actions.appendChild(eq);
        }
        row.appendChild(actions);
        host.appendChild(row);
      });
    });
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
      b.textContent = fmt(priceOf(next.cost)) + 'P で強化';
      b.disabled = state.coins < priceOf(next.cost);
      b.addEventListener('click', function () { upgrade(kind); });
      box.appendChild(b);
    }
    host.appendChild(box);
  }

  function renderAdmin() {
    $('admin-state').hidden = !state.admin;
    $('form-admin').hidden = !!state.admin;
  }

  function renderShop() {
    renderLures();
    renderBoosts();
    renderParts();
    renderUpgrade('rod', $('rod-upgrade'));
    renderUpgrade('line', $('line-upgrade'));
    renderAdmin();
  }

  function renderAngler() {
    var lv = Angler.levelFromXp(state.anglerXp);
    $('angler-count').textContent = 'Lv.' + lv + ' / ' + Angler.LEVEL_MAX;
    $('perk-list').innerHTML = Angler.describe(lv).map(function (p) {
      return '<div class="perk"><span>' + p.label + '</span><b>' + p.value + '</b></div>';
    }).join('');
    if (lv >= Angler.LEVEL_MAX) {
      $('perk-next').innerHTML = '<p class="maxed">最大レベルに到達しています</p>';
      return;
    }
    var now = Angler.describe(lv), next = Angler.describe(lv + 1);
    $('perk-next').innerHTML = next.map(function (p, i) {
      return '<div class="perk"><span>' + p.label + '</span><b>' + now[i].value + ' → ' + p.value + '</b></div>';
    }).join('');
  }

  function renderRecords() {
    var host = $('record-list');
    host.innerHTML = '';
    if (!state.records.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'まだ記録がありません。';
      host.appendChild(li);
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
      host.appendChild(item);
    }

    var rate = state.casts ? Math.round(state.catches / state.casts * 100) : 0;
    var rows = [
      ['キャスト', fmt(state.casts) + ' 回'],
      ['釣り上げ', fmt(state.catches) + ' 匹'],
      ['バラシ', fmt(state.misses) + ' 回'],
      ['成功率', rate + ' %'],
      ['最高コンボ', fmt(state.bestCombo)],
      ['通算ポイント', fmt(state.xp) + ' P'],
      ['図鑑', Object.keys(state.dex).length + ' / ' + Fish.count],
      ['連続ログイン', fmt(state.bonusStreak) + ' 日']
    ];
    $('stat-list').innerHTML = rows.map(function (r) {
      return '<div class="stat"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');

    $('backup-code').value = Account.backupCode() || '';
  }

  function renderAchievements() {
    var host = $('achievement-list');
    host.innerHTML = '';
    Achievements.LIST.forEach(function (a) {
      var done = state.achievements.indexOf(a.id) !== -1;
      var d = document.createElement('div');
      d.className = 'ach' + (done ? ' done' : '');
      d.dataset.ach = a.id;
      d.innerHTML = '<span class="ach-mark">' + (done ? '🏅' : '🔒') + '</span>' +
        '<div><h3>' + a.name + '</h3><p>' + a.desc + '</p>' +
        '<p class="ach-title">称号: ' + a.title + '</p></div>';
      host.appendChild(d);
    });
  }

  /**
   * パネルの描画は重い（図鑑30枚・ショップ40行）。毎キャスト・毎釣果で
   * 全部作り直すとゲームがカクつくので、表示中のパネルだけを描き、
   * 隠れているものは「あとで描く」印を立てておく。
   */
  var TABS = ['dex', 'shop', 'angler', 'records', 'achievements'];
  var RENDERERS = {
    dex: renderDex, shop: renderShop, angler: renderAngler,
    records: renderRecords, achievements: renderAchievements
  };
  var dirty = {};
  var activeTab = 'dex';

  function renderActive() {
    if (!state || !dirty[activeTab]) return;
    dirty[activeTab] = false;
    RENDERERS[activeTab]();
  }

  /** 引数なしで全パネルを、名前を渡すとそのパネルだけを「要再描画」にする。 */
  function invalidate(name) {
    if (name) dirty[name] = true;
    else for (var i = 0; i < TABS.length; i++) dirty[TABS[i]] = true;
    renderActive();
  }

  function renderAll() {
    if (!state) return;
    syncHud(); syncAction(); invalidate();
  }

  // ---------------------------------------------------------------- 買い物

  function grantAchievements() {
    var gained = Achievements.evaluate(state, null);
    for (var i = 0; i < gained.length; i++) {
      state.achievements.push(gained[i]);
      Sfx.play('achieve');
      toast('実績解除: ' + Achievements.byId(gained[i]).name, 'gold');
    }
    return gained.length > 0;
  }

  function buyLure(id, n) {
    var r = Gear.tryBuyLure(id, n, state.coins, buyOpts());
    if (!r.ok) { toast(r.reason === 'poor' ? 'ポイントが足りない' : '買えません', 'bad'); return; }
    state.coins = r.coins;
    state.lures[id] = (state.lures[id] || 0) + r.count;
    Sfx.play('buy');
    toast(Gear.lure(id).name + ' を ' + r.count + ' 個 購入', 'good');
    persist(); syncHud(); invalidate('shop');
  }

  function equipLure(id) {
    if (id !== 'none' && !(state.lures[id] > 0)) return;
    state.lure = id;
    Sfx.play('buy');
    persist(); syncHud(); invalidate('shop');
  }

  function buyBoost(id, n) {
    var r = Boost.tryBuy(id, n, state.coins, buyOpts());
    if (!r.ok) { toast(r.reason === 'poor' ? 'ポイントが足りない' : '買えません', 'bad'); return; }
    state.coins = r.coins;
    state.boostStock[id] = (state.boostStock[id] || 0) + r.count;
    Sfx.play('buy');
    toast(Boost.byId(id).name + ' を ' + r.count + ' 個 購入', 'good');
    persist(); syncHud(); invalidate('shop');
  }

  function useBoost(id) {
    if (!(state.boostStock[id] > 0)) return;
    var r = Boost.activate(state.boostActive, id);
    if (!r.ok) return;
    state.boostStock[id] -= 1;
    state.boostActive = r.active;
    Sfx.play('levelup');
    toast(Boost.byId(id).name + ' 発動！ あと' + r.casts + 'キャスト', 'gold');
    persist(); syncHud(); invalidate('shop');
  }

  function buyPart(id) {
    var r = Parts.tryBuy(id, state.coins, state.ownedParts, buyOpts());
    if (!r.ok) { toast(r.reason === 'poor' ? 'ポイントが足りない' : '買えません', 'bad'); return; }
    state.coins = r.coins;
    state.ownedParts.push(id);
    state.parts[r.slot] = id;      // 買ったらそのまま装備する
    Sfx.play('buy');
    toast(Parts.byId(id).name + ' を購入して装備した', 'good');
    grantAchievements();
    persist(); syncHud(); invalidate('shop'); invalidate('achievements');
  }

  function equipPart(slot, id) {
    state.parts[slot] = id;
    Sfx.play('buy');
    persist(); syncHud(); invalidate('shop');
  }

  function upgrade(kind) {
    var level = kind === 'rod' ? state.rod : state.line;
    var r = Gear.tryUpgrade(kind, level, state.coins, buyOpts());
    if (!r.ok) { toast(r.reason === 'poor' ? 'ポイントが足りない' : 'これ以上強化できない', 'bad'); return; }
    state.coins = r.coins;
    if (kind === 'rod') state.rod = r.level; else state.line = r.level;
    Sfx.play('levelup');
    toast((kind === 'rod' ? '竿' : '糸') + ' を強化した', 'good');
    grantAchievements();
    persist(); syncHud(); invalidate('shop'); invalidate('achievements');
  }

  $('form-admin').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('admin-code').value.trim();
    $('admin-code').value = '';
    if (code !== ADMIN_CODE) { toast('そのコードは使えません', 'bad'); return; }
    state.admin = true;
    Sfx.play('achieve');
    toast('🛠 管理者モード: 全商品が0円になりました', 'gold');
    persist(); invalidate('shop');
  });

  $('btn-admin-off').addEventListener('click', function () {
    state.admin = false;
    toast('管理者モードを解除しました');
    persist(); invalidate('shop');
  });

  // ---------------------------------------------------------------- 釣り

  function castContext() {
    var weather = World.weatherOf(state.weather);
    return {
      level: state.level,
      phase: World.phaseAt(state.clock).id,
      weather: state.weather,
      tackle: Tackle.resolve(state, weather)
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
    state.boostActive = Boost.consume(state.boostActive);
    if (usedUp) { state.lure = 'none'; toast('エサを使い切った', 'bad'); }

    Sfx.play('cast');
    global.setTimeout(function () { Sfx.play('splash'); }, 620);
    persist(); syncHud(); syncAction(); invalidate('shop');
  }

  var MISS_TEXT = {
    early: 'アワセが早すぎた！ 魚が逃げていった',
    late: 'アワセが遅かった… エサだけ取られた',
    break: 'ラインブレイク！ 巻きすぎた',
    escape: '時間切れ。走られて根に潜られた'
  };

  function onLanded(ev) {
    var tackle = Tackle.resolve(state, World.weatherOf(state.weather));
    var res = Store.applyCatch(state, {
      fish: ev.fish, size: ev.size, pointMul: tackle.pointMul
    });
    Sfx.play('land', ev.fish.stars);
    idleMessage = ev.fish.name + ' ' + ev.size.toFixed(1) + 'cm ／ +' + fmt(res.points) + ' P';
    if (res.isNew) toast('図鑑に追加: ' + ev.fish.name, 'gold');
    if (res.isBiggest && !res.isNew) toast('自己最大サイズ更新！', 'good');
    if (res.combo >= 3) toast('コンボ ' + res.combo + '（×' + Progress.comboMultiplier(res.combo - 1).toFixed(1) + '）', 'good');
    if (res.leveledTo) {
      Sfx.play('levelup');
      toast('釣果レベルアップ！ Lv.' + res.leveledTo + ' — レアが出やすくなった', 'gold');
    }
    if (res.anglerLeveledTo) {
      Sfx.play('levelup');
      toast('釣り人レベルアップ！ Lv.' + res.anglerLeveledTo + ' — 釣りが快適になった', 'gold');
    }
    for (var i = 0; i < res.achievements.length; i++) {
      Sfx.play('achieve');
      toast('実績解除: ' + Achievements.byId(res.achievements[i]).name, 'gold');
    }
    persist();
    renderAll();
  }

  function onMissed(ev) {
    var tackle = Tackle.resolve(state, World.weatherOf(state.weather));
    var res = Store.applyMiss(state, { guard: tackle.comboGuard, random: rng });
    Sfx.play(ev.reason === 'break' ? 'snap' : 'miss');
    idleMessage = MISS_TEXT[ev.reason] || 'バラしてしまった';
    if (res.kept > 0) toast('コンボ保護！ ' + res.kept + ' まで残った', 'good');
    if (res.anglerLeveledTo) toast('釣り人レベルアップ！ Lv.' + res.anglerLeveledTo, 'gold');
    persist();
    syncHud(); invalidate('angler'); invalidate('records');
  }

  function handleEvent(ev) {
    if (!ev) return;
    if (ev.type === 'bite') {
      Sfx.play('bite');
      if (global.navigator.vibrate) { try { global.navigator.vibrate(30); } catch (e) {} }
    } else if (ev.type === 'landed') onLanded(ev);
    else if (ev.type === 'missed') onMissed(ev);
    syncAction();
  }

  function press() {
    if (!state) return;
    Sfx.unlock();
    var ph = game.state.phase;
    if (ph === 'idle') { doCast(); return; }
    if (ph === 'waiting' || ph === 'bite') { handleEvent(game.strike()); return; }
    if (ph === 'fight') { game.setReeling(true); return; }
    if (ph === 'result') { game.dismiss(); syncAction(); return; }
  }

  function release() {
    if (state && game.state.phase === 'fight') game.setReeling(false);
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

  bindHold($('action'));
  bindHold($('scene'));
  global.addEventListener('blur', release);
  global.addEventListener('keydown', function (e) {
    if (!running) return;
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (e.repeat) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (t && t.tagName === 'BUTTON' && t !== $('action')) return;
    e.preventDefault();
    press();
  });
  global.addEventListener('keyup', function (e) {
    if (e.code === 'Space' || e.code === 'Enter') release();
  });

  // ---------------------------------------------------------------- タブ・設定

  TABS.forEach(function (name) {
    $('tab-' + name).addEventListener('click', function () {
      TABS.forEach(function (other) {
        var on = other === name;
        $('tab-' + other).classList.toggle('is-active', on);
        $('tab-' + other).setAttribute('aria-selected', on ? 'true' : 'false');
        $('panel-' + other).hidden = !on;
      });
      activeTab = name;
      renderActive();
    });
  });

  $('btn-sound').addEventListener('click', function () {
    state.settings.sound = !state.settings.sound;
    Sfx.setEnabled(state.settings.sound);
    $('btn-sound').textContent = state.settings.sound ? '🔊' : '🔇';
    $('btn-sound').setAttribute('aria-pressed', state.settings.sound ? 'true' : 'false');
    persist();
  });

  $('btn-backup-copy').addEventListener('click', function () {
    copyText($('backup-code').value, 'バックアップコードをコピーしました');
  });

  $('btn-reset').addEventListener('click', function () {
    if (!global.confirm('このデータの進捗をすべて消去します。よろしいですか？')) return;
    state = Store.defaults();
    game.reset();
    idleMessage = 'キャストして釣りをはじめよう';
    persist();
    renderAll();
    toast('データを消去しました');
  });

  // ---------------------------------------------------------------- ループ

  var last = 0;

  function statusText() {
    switch (game.state.phase) {
      case 'casting': return '仕掛けが飛んでいく…';
      case 'waiting': return 'アタリを待つ…（早合わせに注意）';
      case 'bite': return '⚡ 合わせろ！';
      case 'fight': return '押し続けて巻く。テンションを赤に入れない';
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
    Render.draw($('scene'), {
      time: now,
      timePhase: World.phaseAt(state.clock).id,
      weather: state.weather,
      gamePhase: s.phase,
      phaseT: s.t,
      waitRatio: s.waitMs ? Math.min(1, s.t / s.waitMs) : 0,
      tension: s.tension,
      progress: s.progress,
      reeling: s.reeling,
      fish: s.fish,
      size: s.size,
      result: s.result,
      parts: Parts.effects(state.parts, state.ownedParts)
    }, dt);

    global.requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- 起動

  function startGame() {
    state = Store.fromSaved(Account.load());
    Sfx.setEnabled(state.settings.sound);
    $('btn-sound').textContent = state.settings.sound ? '🔊' : '🔇';
    $('btn-sound').setAttribute('aria-pressed', state.settings.sound ? 'true' : 'false');

    $('app').hidden = false;
    renderAll();

    if (!Account.persistent()) {
      toast('この環境では保存できません（進捗は閉じると消えます）', 'bad');
    }

    showBonusIfAny(function () {
      if (running) return;
      running = true;
      global.requestAnimationFrame(frame);
    });
  }

  function boot() {
    if (params.get('reset') === '1') {
      try { global.localStorage.clear(); } catch (e) {}
      Account._reset();
      // 消したら URL から reset を外す。付けたままだとリロードやログアウトのたびに
      // 消え続けてしまう（実際に E2E で踏んだ）。
      try {
        params.delete('reset');
        var q = params.toString();
        global.history.replaceState(null, '', global.location.pathname + (q ? '?' + q : ''));
      } catch (e) {}
    }
    showSavedList();
    if (Account.current()) {
      $('gate').hidden = true;
      startGame();
    } else {
      $('gate').hidden = false;
      $('new-name').focus();
    }
  }

  boot();

  // テスト用の口。?debug=1 のときだけ debug が生える。
  FQ.app = {
    get state() { return state; },
    game: game,
    render: renderAll,
    account: Account
  };
  if (DEBUG) {
    FQ.app.debug = {
      skipWait: function (opts) {
        game.skipWait();
        if (opts && opts.holdBite) game.holdBite(60000);
      },
      grant: function (n) {
        state.xp += n; state.coins += n;
        state.level = Progress.levelFromXp(state.xp);
        persist(); renderAll();
      },
      setLevelXp: function (lv) {
        state.xp = Progress.totalFor(lv);
        state.level = Progress.levelFromXp(state.xp);
        persist(); renderAll();
      },
      setAnglerXp: function (lv) {
        state.anglerXp = Angler.totalFor(lv);
        state.anglerLevel = Angler.levelFromXp(state.anglerXp);
        persist(); renderAll();
      },
      forceFish: function (id) {
        var f = Fish.byId(id);
        if (!f) return false;
        game.state.fish = f;
        game.state.size = (f.min + f.max) / 2;
        game.state.limitMs = f.fightMs * FQ.Game.FIGHT_LIMIT_MUL;
        return true;
      },
      giveLure: function (id, n) { state.lures[id] = (state.lures[id] || 0) + n; persist(); renderAll(); },
      giveBoost: function (id, n) { state.boostStock[id] = (state.boostStock[id] || 0) + n; persist(); renderAll(); },
      setWeather: function (w) { state.weather = w; persist(); syncHud(); },
      setClock: function (m) { state.clock = World.normalizeMinutes(m); persist(); syncHud(); },
      setBonusDate: function (d) { state.bonusDate = d; persist(); },
      today: today
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
