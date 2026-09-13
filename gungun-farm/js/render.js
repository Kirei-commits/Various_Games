/**
 * 描画。state を受け取って DOM を作るだけで、ルールの判断はしない。
 * 押したときの意味は data-act 属性に載せ、購読は main.js 側でまとめて行う（委譲）。
 *
 * 毎フレーム全部を作り直すと、押した瞬間のへこみもスクロール位置も消える。
 * そこで「形が変わったときだけ作り直し、伸び縮みするところだけ毎フレーム塗る」。
 * 形の変化は sig（署名）の文字列比較で見る。
 */
(function (global) {
  'use strict';

  const Data = global.GF.Data;
  const Engine = global.GF.Engine;

  const $ = (sel) => document.querySelector(sel);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  let refs = null;
  let sigFields = '';
  let sigPanel = '';
  /** 毎フレーム塗り直すところ。{el, set(state)} */
  let live = [];

  function init() {
    refs = {
      level: $('#level'), xpfill: $('#xpfill'), coins: $('#coins'),
      barn: $('#barn'), barnStat: $('#barn-stat'),
      timer: $('#timer'), timeleft: $('#timeleft'),
      fields: $('#fields'), ticker: $('#ticker'),
      panelTitle: $('#panel-title'), panelNote: $('#panel-note'), panelBody: $('#panel-body'),
      btnHarvest: $('#btn-harvest'),
      btnWork: $('#btn-work'),
      harvestLabel: $('#harvest-label'), harvestIco: $('#harvest-ico'), workLabel: $('#work-label'),
      badgeWork: $('#badge-work'), badgeOrder: $('#badge-order'), badgeShop: $('#badge-shop'),
      tabs: [...document.querySelectorAll('.tab')],
      floats: $('#floats'), pop: $('#pop'), sheet: $('#sheet')
    };
    sigFields = sigPanel = '';
    return refs;
  }

  const icon = (id) => (Data.item(id) ? Data.item(id).emoji : '❓');
  const nameOf = (id) => (Data.item(id) ? Data.item(id).name : id);
  const pct = (v) => Math.max(0, Math.min(1, v)) * 100 + '%';

  /** 育ち具合 0..1 */
  function growth(f, now) {
    if (!f.crop) return 0;
    const c = Data.crop(f.crop);
    const total = c.sec * 1000;
    return Math.max(0, Math.min(1, 1 - (f.readyAt - now) / total));
  }

  /* ---------------------------------------------------------------- 上の段 */

  function hud(state, ui) {
    refs.level.textContent = state.level;
    refs.xpfill.style.width = state.level >= Data.MAX_LEVEL ? '100%' : pct(state.xp / state.xpNext);
    refs.coins.textContent = Math.floor(state.coins);
    const used = Engine.barnUsed(state), cap = Engine.barnCap(state);
    refs.barn.textContent = used + '/' + cap;
    refs.barnStat.classList.toggle('full', used >= cap);

    if (state.mode === 'rush') {
      refs.timer.hidden = false;
      const left = Engine.timeLeft(state);
      const s = Math.ceil(left / 1000);
      refs.timeleft.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      refs.timer.classList.toggle('hurry', left <= 30_000);
    } else {
      refs.timer.hidden = true;
    }

    // 主ボタン: 実ったものを収穫して、空いた畑へ選んでいるタネを植え直す（1タップ）
    const crop = Data.crop(ui.seed);
    const ready = state.fields.filter((f, i) => i < state.fieldsOwned && Engine.isReady(f, state.now)).length;
    const empty = state.fields.filter((f, i) => i < state.fieldsOwned && !f.crop).length;
    const canSow = !!crop && state.coins >= crop.cost && empty > 0;
    refs.btnHarvest.disabled = (ready === 0 || Engine.barnFree(state) < 1) && !canSow;
    refs.harvestIco.textContent = ready ? '🧺' : crop ? icon(ui.seed) : '🌱';
    refs.harvestLabel.textContent = ready ? `しゅうかく ${ready}` : canSow ? 'たねをまく' : 'しゅうかく';

    // 副ボタン: 出来たものを取り出して、余った材料で全部仕込む
    const done = state.machines.reduce((a, m) => a + m.done, 0);
    const ready2 = state.machines.some((m, i) => Engine.canQueue(state, i));
    refs.btnWork.disabled = done === 0 && !ready2;
    refs.workLabel.textContent = done ? `とりだす ${done}` : 'ぜんぶ仕込む';

    const boat = state.boat;
    const boatAction = boat && (Engine.boatReady(boat) || Engine.boatLoadable(state) > 0) ? 1 : 0;
    const deliverable = state.orders.filter((o) => Engine.canDeliver(state, o)).length;
    badge(refs.badgeOrder, deliverable + boatAction);
    const collectable = state.machines.filter((m) => m.done > 0).length;
    badge(refs.badgeWork, collectable);
    badge(refs.badgeShop, used >= cap ? '!' : 0);

    for (const t of refs.tabs) t.classList.toggle('is-on', t.dataset.tab === ui.tab);
  }

  function badge(node, n) {
    if (!n) { node.hidden = true; return; }
    node.hidden = false;
    node.textContent = n;
  }

  /* ---------------------------------------------------------------- 畑 */

  function fields(state, ui) {
    const sig = [state.fieldsOwned, ui.seed, state.level,
      state.fields.map((f, i) => f.crop + ':' + (Engine.isReady(f, state.now) ? 1 : 0)).join(',')].join('|');
    if (sig === sigFields) return;
    sigFields = sig;

    const frag = document.createDocumentFragment();
    live = live.filter((l) => !refs.fields.contains(l.el));

    for (let i = 0; i < Data.FIELD_SLOTS; i++) {
      const f = state.fields[i];
      const locked = i >= state.fieldsOwned;
      const ready = !locked && Engine.isReady(f, state.now);
      const cell = el('button', 'field' + (locked ? ' locked' : ready ? ' ready' : f.crop ? '' : ' empty'));
      cell.dataset.act = locked ? 'buy-field' : 'field';
      cell.dataset.i = String(i);
      cell.setAttribute('aria-label', locked ? '畑を増やす' : f.crop ? nameOf(f.crop) : '空いた畑');

      const plant = el('span', 'plant');
      if (locked) plant.textContent = '🔒';
      else if (!f.crop) plant.textContent = icon(ui.seed);
      else plant.textContent = growth(f, state.now) < 0.45 ? '🌱' : icon(f.crop);
      cell.appendChild(plant);

      if (locked) {
        const up = Data.FIELD_UPGRADES[i - Data.FIELDS_AT_START];
        const next = i === state.fieldsOwned;
        if (up) cell.appendChild(el('span', 'lock-price', next ? (state.level < up.level ? 'Lv' + up.level : '🪙' + up.price) : ''));
      } else if (f.crop && !ready) {
        const bar = el('span', 'prog');
        const fill = el('i');
        bar.appendChild(fill);
        cell.appendChild(bar);
        live.push({ el: fill, set: (s) => { fill.style.width = pct(growth(s.fields[i], s.now)); } });
        // 芽から作物への切り替えも、大きさと同じく毎フレーム側で面倒を見る。
        // 署名（sig）は「実ったかどうか」しか見ていないので、作り直しに任せると
        // 育っても芽のままになる（他の畑が実った拍子にだけ絵が変わっていた）
        live.push({ el: plant, set: (s) => {
          const g = growth(s.fields[i], s.now);
          plant.style.setProperty('--s', (0.4 + 0.6 * g).toFixed(3));
          const want = g < 0.45 ? '🌱' : icon(s.fields[i].crop || f.crop);
          if (plant.textContent !== want) plant.textContent = want;
        } });
      }
      frag.appendChild(cell);
    }
    refs.fields.replaceChildren(frag);
  }

  /* ---------------------------------------------------------------- 下の段 */

  const TITLES = {
    seed: ['たね', '短いほど稼ぎ・長いほど手が空く'],
    work: ['こうぼう', '1台ずつなら注文ぶんも使える'],
    order: ['ちゅうもん', '早いほどオマケが増える'],
    shop: ['みせ', '売って、広げて、増やす']
  };

  function panel(state, ui) {
    const sig = panelSig(state, ui);
    if (sig === sigPanel) return;
    sigPanel = sig;
    live = live.filter((l) => !refs.panelBody.contains(l.el));

    const [title, note] = TITLES[ui.tab] || TITLES.seed;
    refs.panelTitle.textContent = title;
    refs.panelNote.textContent = ui.tab === 'order'
      ? `コンボ ×${Engine.comboMul(state).toFixed(2)}`
      : note;

    const body = ({ seed: seedPanel, work: workPanel, order: orderPanel, shop: shopPanel }[ui.tab] || seedPanel)(state, ui);
    refs.panelBody.replaceChildren(body);
  }

  /**
   * パネルを作り直すかどうかの署名。
   * **コインの数をそのまま入れてはいけない。** 収穫のたびに数字が変わるので
   * 毎フレーム DOM が作り直され、押そうとしたカードが指の下で差し替わる
   * （通しプレイで、こうぼうのカードを押しても一度も仕込めない状態になった）。
   * 入れてよいのは「見た目が変わる条件」——買えるか／出せるか、だけ。
   */
  function panelSig(state, ui) {
    if (ui.tab === 'seed') {
      return 'seed|' + state.level + '|' + ui.seed + '|' + Data.CROPS
        .map((c) => (c.level > state.level ? 'x' : state.coins >= c.cost ? '1' : '0')).join('');
    }
    if (ui.tab === 'work') {
      const next = Data.MACHINES.find((def) => !Engine.ownsMachine(state, def.id));
      return 'work|' + state.level + '|' + (next ? next.id : '-') + '|' + state.machines
        .map((m, i) => m.id + m.queue.length + ':' + m.done + ':' + (Engine.canQueue(state, i) ? 1 : 0)).join(',');
    }
    if (ui.tab === 'order') {
      const b = state.boat;
      const boatSig = b
        ? b.id + ':' + Object.entries(b.loaded).map(([k, v]) => k + v).join(',') + ':' + Engine.boatLoadable(state)
        : '-';
      return 'order|' + state.combo + '|' + state.orders
        .map((o) => o.id + ':' + (Engine.canDeliver(state, o) ? 1 : 0)).join(',') + '|' +
        Object.entries(state.barn).map(([k, v]) => k + v).join(',') + '|' + boatSig;
    }
    const buys = [state.coins >= Data.barnPrice(state.barnUp) ? 1 : 0];
    const up = Engine.nextFieldPrice(state);
    buys.push(up ? (state.level >= up.level && state.coins >= up.price ? 1 : 0) : 'x');
    for (const def of Data.MACHINES) {
      if (def.price <= 0 || Engine.ownsMachine(state, def.id)) continue;
      buys.push(def.id + (state.level >= def.level && state.coins >= def.price ? 1 : 0));
    }
    return 'shop|' + ui.shopTab + '|' + state.level + '|' + ui.qty + '|' + Engine.barnCap(state) + '|' + state.fieldsOwned + '|' +
      Object.entries(state.barn).map(([k, v]) => k + v).join(',') + '|' + buys.join(',');
  }

  /** タネ */
  function seedPanel(state, ui) {
    const grid = el('div', 'grid');
    for (const c of Data.CROPS) {
      const locked = c.level > state.level;
      const poor = !locked && state.coins < c.cost;
      const card = el('button', 'card' + (ui.seed === c.id ? ' on' : '') + (locked ? ' off' : poor ? ' off' : ''));
      card.dataset.act = locked ? 'noop' : 'seed';
      card.dataset.id = c.id;
      card.appendChild(el('span', 'ico', locked ? '🔒' : icon(c.id)));
      card.appendChild(el('span', 'nm', locked ? 'Lv' + c.level : nameOf(c.id)));
      // 「いくら払って、いくらのものが穫れるか」を出す。
      // 1枠の値打ち（売値）が上位作物のごほうびなので、そこが見えないと選べない
      // 絵文字を入れると折り返して行がそろわなくなる。数字だけで詰める
      card.appendChild(el('span', 'sub', locked ? nameOf(c.id) : `${c.sec}秒 ${c.cost}→${Data.item(c.id).sell}`));
      grid.appendChild(card);
    }
    return grid;
  }

  /** こうぼう */
  function workPanel(state, ui) {
    const grid = el('div', 'grid wide');
    state.machines.forEach((m, i) => {
      const def = Engine.machineDef(m);
      const canQ = Engine.canQueue(state, i);
      // 動いている機械を薄く（off）出すと「壊れている」ように見える。
      // 薄くするのは「材料も無く、中身も空」のときだけ。
      const idle = !canQ && !m.queue.length && !m.done;
      const card = el('button', 'card' + (m.done ? ' on' : idle ? ' off' : ''));
      card.dataset.act = 'machine';
      card.dataset.i = String(i);
      card.setAttribute('aria-label', def.name);
      card.appendChild(el('span', 'ico', def.emoji));
      card.appendChild(el('span', 'nm', def.name));
      const recipe = Object.entries(def.recipe.in).map(([id, n]) => icon(id) + n).join('') + '→' + icon(def.recipe.out);
      card.appendChild(el('span', 'sub', recipe));
      const dots = el('span', 'slots', '●'.repeat(m.queue.length + m.done) + '○'.repeat(Math.max(0, def.slots - m.queue.length - m.done)));
      card.appendChild(dots);
      const bar = el('span', 'bar');
      const fill = el('i');
      bar.appendChild(fill);
      card.appendChild(bar);
      if (m.done) card.appendChild(el('i', 'pill ok', String(m.done)));
      live.push({
        el: fill,
        set: (s) => {
          const mm = s.machines[i];
          if (!mm || !mm.queue.length) { fill.style.width = '0%'; return; }
          const job = mm.queue[0];
          fill.style.width = pct(1 - (job.readyAt - s.now) / (job.readyAt - job.startedAt));
        }
      });
      grid.appendChild(card);
    });

    const next = Data.MACHINES.find((def) => !Engine.ownsMachine(state, def.id));
    if (next) {
      const hint = el('div', 'empty-note');
      hint.style.gridColumn = '1 / -1';
      hint.textContent = state.level >= next.level
        ? `つぎは ${next.emoji}${next.name}（みせで 🪙${next.price}）`
        : `${next.emoji}${next.name} は Lv${next.level} から`;
      grid.appendChild(hint);
    }
    return grid;
  }

  /** ふなびん。少しずつ積める大きな注文 */
  function boatCard(state) {
    const boat = state.boat;
    const row = el('div', 'boat' + (Engine.boatReady(boat) ? ' full' : ''));

    const head = el('div', 'boat-head');
    head.appendChild(el('span', 'boat-title', '🚢 ふなびん'));
    head.appendChild(el('span', 'reward', `🪙${boat.coins} ・ ⭐${boat.xp}`));
    row.appendChild(head);

    const want = el('div', 'want');
    for (const [id, n] of Object.entries(boat.want)) {
      const got = Math.min(boat.loaded[id] || 0, n);
      const chip = el('span', got >= n ? 'done' : (state.barn[id] || 0) > 0 ? '' : 'lack', `${icon(id)}${got}/${n}`);
      chip.title = nameOf(id);
      want.appendChild(chip);
    }
    row.appendChild(want);

    const ready = Engine.boatReady(boat);
    // 判定は engine の同じ関数を見る。ここで書き直すと、押せるのに何も積めないボタンになる
    const loadable = Engine.boatLoadable(state);
    const go = el('button', 'go boat-go', ready ? 'しゅっこう！' : loadable ? `つむ ${loadable}` : 'つむ');
    go.dataset.act = ready ? 'boat-ship' : 'boat-load';
    go.disabled = !ready && loadable === 0;
    row.appendChild(go);

    const ttl = el('div', 'ttl');
    const fill = el('i');
    ttl.appendChild(fill);
    row.appendChild(ttl);
    live.push({
      el: fill,
      set: (s2) => {
        if (!s2.boat) return;
        const left = (s2.boat.expiresAt - s2.now) / s2.boat.ttl;
        fill.style.width = pct(left);
        ttl.classList.toggle('soon', left < 0.3);
      }
    });
    return row;
  }

  /** ちゅうもん */
  function orderPanel(state) {
    const wrap = el('div');
    if (state.boat) wrap.appendChild(boatCard(state));
    if (!state.orders.length) {
      wrap.appendChild(el('p', 'empty-note', 'つぎの注文をまっています…'));
      return wrap;
    }
    for (const o of state.orders) {
      const row = el('div', 'order');
      const want = el('div', 'want');
      for (const [id, n] of Object.entries(o.want)) {
        const have = state.barn[id] || 0;
        // 足りているぶんだけ出す。「6/3」は読みにくい
        const chip = el('span', have >= n ? '' : 'lack', `${icon(id)}${Math.min(have, n)}/${n}`);
        chip.title = nameOf(id);
        want.appendChild(chip);
      }
      row.appendChild(want);

      const go = el('button', 'go', 'とどける');
      go.dataset.act = 'deliver';
      go.dataset.id = String(o.id);
      go.disabled = !Engine.canDeliver(state, o);
      row.appendChild(go);

      const head = el('div', 'order-head');
      head.appendChild(el('span', 'reward', `🪙${o.coins} ・ ⭐${o.xp}`));
      const x = el('button', 'x', '✕');
      x.dataset.act = 'dismiss';
      x.dataset.id = String(o.id);
      x.setAttribute('aria-label', 'この注文をことわる');
      head.appendChild(x);
      row.appendChild(head);

      const ttl = el('div', 'ttl');
      const fill = el('i');
      ttl.appendChild(fill);
      row.appendChild(ttl);
      live.push({
        el: fill,
        set: (s) => {
          const cur = s.orders.find((x2) => x2.id === o.id);
          if (!cur) return;
          const left = (cur.expiresAt - s.now) / cur.ttl;
          fill.style.width = pct(left);
          ttl.classList.toggle('soon', left < 0.3);
        }
      });
      wrap.appendChild(row);
    }
    return wrap;
  }

  /** みせ。うるとかうを1タップで行き来できるようにして、内側スクロールに隠さない */
  function shopPanel(state, ui) {
    const wrap = el('div');
    const head = el('div', 'order-head');
    const seg = el('div', 'seg');
    for (const [id, label] of [['sell', 'うる'], ['buy', 'かう']]) {
      const b = el('button', 'seg-btn' + (ui.shopTab === id ? ' on' : ''), label);
      b.dataset.act = 'shop-tab';
      b.dataset.id = id;
      seg.appendChild(b);
    }
    head.appendChild(seg);
    if (ui.shopTab === 'sell') {
      const qty = el('button', 'qty', '×' + ui.qty);
      qty.dataset.act = 'qty';
      qty.setAttribute('aria-label', '一度に売る数');
      head.appendChild(qty);
    }
    wrap.appendChild(head);
    wrap.appendChild(ui.shopTab === 'buy' ? buySection(state) : sellSection(state));
    return wrap;
  }

  function sellSection(state) {
    const ids = Object.keys(state.barn).filter((id) => state.barn[id] > 0);
    if (!ids.length) return el('p', 'empty-note', '倉庫はからっぽ。\n畑で育てて、持ってこよう！');

    const grid = el('div', 'grid');
    ids.sort((a, b) => Data.item(b).sell - Data.item(a).sell);
    for (const id of ids) {
      const card = el('button', 'card');
      card.dataset.act = 'sell';
      card.dataset.id = id;
      card.appendChild(el('span', 'ico', icon(id)));
      card.appendChild(el('span', 'nm', nameOf(id)));
      card.appendChild(el('span', 'sub', '🪙' + Data.item(id).sell));
      card.appendChild(el('i', 'pill', String(state.barn[id])));
      grid.appendChild(card);
    }
    return grid;
  }

  function buySection(state) {
    const buy = el('div', 'grid wide');

    const barnP = Data.barnPrice(state.barnUp);
    buy.appendChild(buyCard('buy-barn', '', '📦', `倉庫 +${Data.BARN_STEP}`, `🪙${barnP}`, state.coins >= barnP));

    const up = Engine.nextFieldPrice(state);
    if (up) {
      const ok = state.level >= up.level && state.coins >= up.price;
      buy.appendChild(buyCard('buy-field', '', '🟩', '畑を増やす',
        state.level < up.level ? `Lv${up.level}から` : `🪙${up.price}`, ok));
    }

    let rest = 0;
    for (const def of Data.MACHINES) {
      if (def.price <= 0 || Engine.ownsMachine(state, def.id)) continue;
      const known = state.level >= def.level;
      buy.appendChild(buyCard('buy-machine', def.id, known ? def.emoji : '🔒', def.name,
        known ? `🪙${def.price}` : `Lv${def.level}から`, known && state.coins >= def.price));
      rest++;
    }
    if (!rest && !up) buy.appendChild(el('p', 'empty-note', '機械も畑もぜんぶ揃った！🎉'));
    return buy;
  }

  function buyCard(act, id, ico, name, sub, ok) {
    const card = el('button', 'card' + (ok ? '' : ' off'));
    card.dataset.act = act;
    if (id) card.dataset.id = id;
    card.appendChild(el('span', 'ico', ico));
    card.appendChild(el('span', 'nm', name));
    card.appendChild(el('span', 'sub', sub));
    return card;
  }

  /* ---------------------------------------------------------------- 毎フレーム */

  function paint(state) {
    for (const l of live) { if (l.el.isConnected) l.set(state); }
    live = live.filter((l) => l.el.isConnected);
  }

  function sync(state, ui) {
    sky(state);
    hud(state, ui);
    fields(state, ui);
    panel(state, ui);
    paint(state);
  }

  /** 形が変わっていなくても作り直したいとき（タブを切り替えた直後など） */
  function invalidate() { sigFields = sigPanel = ''; lastPhase = -1; }

  /* ------------------------------------------------------------ 一日の色 */

  /**
   * 農園の一日。待ち時間が無いので、**一日も速く回せる**（3分で一巡）。
   * 空の色だけを動かし、カードやボタンの色には触らない（読みにくくしない）。
   * 夜も黒くはしない——明るいゲームなので、濃い青どまり。
   */
  const DAY_MS = 180_000;
  const SKY = [
    // **昼と夜には平らな時間を作る。** 隣の色へずっと補間していると、
    // 青と桃が混ざる帯（＝くすんだ灰色）が長く居座って、明るいゲームに見えなくなる。
    // 平らにすると、夕焼けだけが短く劇的に通り過ぎる。
    { at: 0.00, top: [0x9f, 0xdc, 0xff], bot: [0xff, 0xdd, 0xb4], sun: [0xff, 0xd2, 0x8a] },  // 朝
    { at: 0.12, top: [0x7f, 0xd8, 0xff], bot: [0xa9, 0xed, 0xb4], sun: [0xff, 0xd8, 0x3d] },  // 昼
    { at: 0.50, top: [0x7f, 0xd8, 0xff], bot: [0xa9, 0xed, 0xb4], sun: [0xff, 0xd8, 0x3d] },  // 昼（ここまで平ら）
    // 夕は橙に振らない。**土の色（茶）と近づいて畑が読めなくなる。**
    // 桃〜藤にすると夕焼けらしさは出たまま、茶色から離れる
    { at: 0.62, top: [0xff, 0x92, 0xa6], bot: [0xd3, 0xb0, 0xe8], sun: [0xff, 0x7a, 0x5c] },  // 夕
    { at: 0.74, top: [0x5b, 0x6d, 0xba], bot: [0x9d, 0xb6, 0xdc], sun: [0xe8, 0xef, 0xff] },  // 夜
    { at: 0.90, top: [0x5b, 0x6d, 0xba], bot: [0x9d, 0xb6, 0xdc], sun: [0xe8, 0xef, 0xff] },  // 夜（ここまで平ら）
    { at: 1.00, top: [0x9f, 0xdc, 0xff], bot: [0xff, 0xdd, 0xb4], sun: [0xff, 0xd2, 0x8a] }   // 朝へ戻る
  ];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  /** 0..1 のうちどの時間帯か */
  function skyAt(phase) {
    for (let i = 1; i < SKY.length; i++) {
      if (phase <= SKY[i].at) {
        const a = SKY[i - 1], b = SKY[i];
        const t = (phase - a.at) / (b.at - a.at || 1);
        return { top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t), sun: mix(a.sun, b.sun, t) };
      }
    }
    return SKY[0];
  }

  let lastPhase = -1;
  /** 空の色を進める。色が目に見えて変わるときだけ書き換える（毎フレーム触らない） */
  function sky(state) {
    const phase = (state.now % DAY_MS) / DAY_MS;
    if (Math.abs(phase - lastPhase) < 0.004 && lastPhase >= 0) return;
    lastPhase = phase;
    const c = skyAt(phase);
    const root = document.documentElement.style;
    root.setProperty('--sky1', rgb(c.top));
    root.setProperty('--sky2', rgb(c.bot));
    root.setProperty('--sun', rgb(c.sun));
    root.setProperty('--sky-mid', rgb(mix(c.top, c.bot, 0.5)));
  }

  /* ---------------------------------------------------------------- 演出 */

  function ticker(text, kind) {
    refs.ticker.textContent = text;
    refs.ticker.classList.remove('hit');
    void refs.ticker.offsetWidth;      // アニメーションをやり直させる
    refs.ticker.classList.add('hit');
    refs.ticker.dataset.kind = kind || '';
  }

  /**
   * +120 のような浮き文字。座標は押したところに出す。
   * `toBarn` を立てると倉庫の表示めがけて飛ぶ——穫ったものが仕舞われた感じになる。
   */
  function float(text, x, y, cls, toBarn) {
    const n = el('span', cls || '', text);
    n.style.left = Math.round(x) + 'px';
    n.style.top = Math.round(y) + 'px';
    if (toBarn && refs.barnStat) {
      const box = refs.barnStat.getBoundingClientRect();
      n.style.setProperty('--dx', Math.round(box.left + box.width / 2 - x) + 'px');
      n.style.setProperty('--dy', Math.round(box.top + box.height / 2 - y) + 'px');
      n.classList.add('to-barn');
    }
    refs.floats.appendChild(n);
    setTimeout(() => n.remove(), 950);
  }

  /** 倉庫の表示を弾ませる。受け取ったことが分かる */
  function barnPulse() {
    if (!refs.barnStat) return;
    refs.barnStat.classList.remove('got');
    void refs.barnStat.offsetWidth;
    refs.barnStat.classList.add('got');
  }

  function levelUp(level, unlocks, done) {
    const box = el('div', 'box');
    box.appendChild(el('div', 'big-lv', `Lv.${level}`));
    box.appendChild(el('div', '', 'レベルアップ！'));
    if (unlocks && unlocks.length) {
      const row = el('div', 'unlocks');
      for (const u of unlocks) row.appendChild(el('span', '', `${u.emoji} ${u.name}`));
      box.appendChild(row);
    }
    const conf = el('div', 'confetti');
    const marks = ['🌟', '🎉', '🌻', '🍀', '🎊'];
    for (let i = 0; i < 14; i++) {
      const c = el('i', '', marks[i % marks.length]);
      c.style.left = Math.random() * 100 + '%';
      c.style.animationDelay = (Math.random() * 0.4).toFixed(2) + 's';
      conf.appendChild(c);
    }
    refs.pop.replaceChildren(box, conf);
    refs.pop.hidden = false;
    setTimeout(() => { refs.pop.hidden = true; refs.pop.replaceChildren(); if (done) done(); }, 1200);
  }

  function sheet(nodes) {
    const box = el('div', 'box');
    for (const n of nodes) box.appendChild(n);
    refs.sheet.replaceChildren(box);
    refs.sheet.hidden = false;
  }
  const closeSheet = () => { refs.sheet.hidden = true; refs.sheet.replaceChildren(); };

  global.GF = global.GF || {};
  global.GF.Render = { init, sync, invalidate, paint, ticker, float, barnPulse, skyAt, DAY_MS, levelUp, sheet, closeSheet, el, icon, nameOf, growth, refs: () => refs };
})(typeof window !== 'undefined' ? window : globalThis);
