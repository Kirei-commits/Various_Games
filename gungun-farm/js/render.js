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
      btnHarvest: $('#btn-harvest'), btnPlant: $('#btn-plant'),
      harvestLabel: $('#harvest-label'), plantLabel: $('#plant-label'), plantIco: $('#plant-ico'),
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

    const ready = state.fields.filter((f, i) => i < state.fieldsOwned && Engine.isReady(f, state.now)).length;
    refs.btnHarvest.disabled = ready === 0 || Engine.barnFree(state) < 1;
    refs.harvestLabel.textContent = ready ? `ぜんぶ収穫 ${ready}` : 'ぜんぶ収穫';

    const crop = Data.crop(ui.seed);
    const empty = state.fields.filter((f, i) => i < state.fieldsOwned && !f.crop).length;
    refs.btnPlant.disabled = !crop || empty === 0 || state.coins < crop.cost;
    refs.plantIco.textContent = crop ? icon(ui.seed) : '🌱';
    refs.plantLabel.textContent = crop && empty ? `ぜんぶ植える ${Math.min(empty, Math.floor(state.coins / crop.cost))}` : 'ぜんぶ植える';

    const deliverable = state.orders.filter((o) => Engine.canDeliver(state, o)).length;
    badge(refs.badgeOrder, deliverable);
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
        live.push({ el: plant, set: (s) => { plant.style.setProperty('--s', (0.4 + 0.6 * growth(s.fields[i], s.now)).toFixed(3)); } });
      }
      frag.appendChild(cell);
    }
    refs.fields.replaceChildren(frag);
  }

  /* ---------------------------------------------------------------- 下の段 */

  const TITLES = {
    seed: ['たね', 'えらんだタネを畑にタップ'],
    work: ['こうぼう', '材料がそろうと仕込める'],
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
      return 'order|' + state.combo + '|' + state.orders
        .map((o) => o.id + ':' + (Engine.canDeliver(state, o) ? 1 : 0)).join(',') + '|' +
        Object.entries(state.barn).map(([k, v]) => k + v).join(',');
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
      card.appendChild(el('span', 'sub', locked ? nameOf(c.id) : `🪙${c.cost} ・ ${c.sec}秒`));
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

  /** ちゅうもん */
  function orderPanel(state) {
    const wrap = el('div');
    if (!state.orders.length) {
      wrap.appendChild(el('p', 'empty-note', 'つぎの注文をまっています…'));
      return wrap;
    }
    for (const o of state.orders) {
      const row = el('div', 'order');
      const want = el('div', 'want');
      for (const [id, n] of Object.entries(o.want)) {
        const have = state.barn[id] || 0;
        const chip = el('span', have >= n ? '' : 'lack', `${icon(id)}${have}/${n}`);
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
    hud(state, ui);
    fields(state, ui);
    panel(state, ui);
    paint(state);
  }

  /** 形が変わっていなくても作り直したいとき（タブを切り替えた直後など） */
  function invalidate() { sigFields = sigPanel = ''; }

  /* ---------------------------------------------------------------- 演出 */

  function ticker(text, kind) {
    refs.ticker.textContent = text;
    refs.ticker.classList.remove('hit');
    void refs.ticker.offsetWidth;      // アニメーションをやり直させる
    refs.ticker.classList.add('hit');
    refs.ticker.dataset.kind = kind || '';
  }

  /** +120 のような浮き文字。座標は押したところに出す。 */
  function float(text, x, y, cls) {
    const n = el('span', cls || '', text);
    n.style.left = Math.round(x) + 'px';
    n.style.top = Math.round(y) + 'px';
    refs.floats.appendChild(n);
    setTimeout(() => n.remove(), 950);
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
  global.GF.Render = { init, sync, invalidate, paint, ticker, float, levelUp, sheet, closeSheet, el, icon, nameOf, growth, refs: () => refs };
})(typeof window !== 'undefined' ? window : globalThis);
