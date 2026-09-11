/**
 * 描画。state と UI の選択状態を受け取って DOM を作るだけで、ルール判断はしない。
 * イベントの purpose は data 属性に載せ、購読は main.js 側で行う（委譲）。
 */
(function (global) {
  'use strict';

  const Items = global.GA.Items;
  const Engine = global.GA.Engine;

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  let refs = null;
  function init() {
    refs = {
      opponents: $('#opponents'),
      self: $('#self'),
      hand: $('#hand'),
      handCount: $('#hand-count'),
      stage: $('#stage'),
      stageText: $('#stage-text'),
      stageKicker: $('#stage-kicker'),
      stageFx: $('#stage-fx'),
      log: $('#log'),
      hint: $('#hint'),
      elements: $('#elements'),
      record: $('#record')
    };
    return refs;
  }

  /** プレイヤー1人分のカード */
  function playerCard(state, p, ui, clickable) {
    const card = el('div', 'pcard');
    card.dataset.player = String(p.id);
    card.setAttribute('role', 'listitem');
    if (!p.alive) card.classList.add('is-dead');
    if (state.turn === p.id && state.phase !== 'over') card.classList.add('is-turn');
    if (ui.targetId === p.id) card.classList.add('is-target');
    if (clickable && p.alive) {
      card.tabIndex = 0;
      card.setAttribute('aria-label', `${p.name} を狙う（HP ${p.hp}）`);
    }

    const name = el('div', 'pname');
    name.appendChild(el('span', null, p.name));
    if (!p.isHuman) name.appendChild(el('span', 'ptag', (global.GA.AI.LEVELS[p.level] || {}).label || 'AI'));
    if (!p.alive) name.appendChild(el('span', 'ptag', '敗退'));
    card.appendChild(name);

    const bar = el('div', 'hpbar');
    const fill = el('div', 'hpfill');
    const ratio = Math.max(0, p.hp / p.maxHp);
    fill.style.width = (ratio * 100).toFixed(1) + '%';
    if (ratio <= 0.3) fill.classList.add('low');
    bar.appendChild(fill);
    card.appendChild(bar);

    const meta = el('div', 'pmeta');
    const hp = el('span', 'hpnum', `HP ${p.hp} / ${p.maxHp}`);
    meta.appendChild(hp);
    meta.appendChild(el('span', null, `手札 ${p.hand.length}`));
    card.appendChild(meta);
    return card;
  }

  function players(state, ui) {
    refs.opponents.replaceChildren();
    for (const p of state.players) {
      if (p.isHuman) continue;
      refs.opponents.appendChild(playerCard(state, p, ui, true));
    }
    refs.self.replaceChildren();
    for (const p of state.players) {
      if (!p.isHuman) continue;
      refs.self.appendChild(playerCard(state, p, ui, false));
    }
  }

  /** 手札の1枚 */
  function itemCard(item, { selected, disabled }) {
    const b = el('button', `card el-${item.element}`);
    b.type = 'button';
    b.dataset.uid = item.uid;
    b.setAttribute('role', 'listitem');
    if (selected) b.classList.add('is-sel');
    if (disabled) { b.classList.add('is-off'); b.disabled = true; }

    b.appendChild(el('span', 'kind-badge', Items.KIND_LABEL[item.kind] || ''));
    b.appendChild(el('div', 'cname', item.name));
    b.appendChild(el('div', 'cpow', String(item.power)));
    const meta = el('div', 'cmeta');
    const e = Items.element(item.element);
    meta.appendChild(el('span', `el-${item.element}`, `${e.sym} ${e.label}`));
    b.appendChild(meta);
    b.appendChild(el('div', 'cdesc', Items.describe(item)));
    b.setAttribute('aria-label', `${item.name} ${Items.describe(item)}`);
    return b;
  }

  const MATCH = {
    all: () => true,
    weapon: (i) => i.kind === 'weapon',
    defense: (i) => i.kind === 'defense',
    support: (i) => i.kind === 'food' || i.kind === 'magic'
  };

  /**
   * 手札を描く。
   * @param {(item)=>boolean} isPlayable いま押せるか（局面で変わる）
   */
  function hand(state, ui, isPlayable) {
    const me = state.players.find((p) => p.isHuman) || state.players[0];
    refs.handCount.textContent = String(me.hand.length);
    refs.hand.replaceChildren();

    const filter = MATCH[ui.filter] || MATCH.all;
    const list = me.hand.filter(filter);
    if (!list.length) {
      refs.hand.appendChild(el('p', 'empty-hand',
        me.hand.length ? 'この種類の手札はありません' : '手札がありません。「いのる」で神器を授かりましょう'));
      return;
    }
    const order = { weapon: 0, defense: 1, food: 2, magic: 3 };
    const sorted = list.slice().sort((a, b) =>
      (order[a.kind] - order[b.kind]) || (b.power - a.power));
    for (const item of sorted) {
      refs.hand.appendChild(itemCard(item, {
        selected: ui.selected.has(item.uid),
        disabled: !isPlayable(item)
      }));
    }
  }

  function stage(kicker, text) {
    if (kicker !== undefined && kicker !== null) refs.stageKicker.textContent = kicker;
    if (text !== undefined && text !== null) refs.stageText.textContent = text;
  }

  function hint(text, warn) {
    refs.hint.textContent = text || '';
    refs.hint.classList.toggle('warn', !!warn);
  }

  /** 中央に数字を浮かせる */
  function pop(kind, text) {
    const n = el('div', `pop ${kind}`, text);
    refs.stageFx.appendChild(n);
    if (kind === 'dmg') {
      refs.stage.classList.remove('flash');
      void refs.stage.offsetWidth;
      refs.stage.classList.add('flash');
    }
    setTimeout(() => n.remove(), 1000);
  }

  function shake(playerId) {
    const card = document.querySelector(`.pcard[data-player="${playerId}"]`);
    if (!card) return;
    card.classList.remove('is-hit');
    void card.offsetWidth;
    card.classList.add('is-hit');
    setTimeout(() => card.classList.remove('is-hit'), 400);
  }

  // ── ログ ───────────────────────────────────────────────
  const nameOf = (state, id) => (state.players[id] ? state.players[id].name : '？');
  const itemNames = (ids) => ids.map((id) => (Items.byId(id) || { name: id }).name).join('・');

  function logLine(state, e) {
    const line = el('div', 'line');
    const add = (cls, t) => line.appendChild(el('span', cls, t));
    switch (e.t) {
      case 'attack':
        add('', `${nameOf(state, e.actor)} → ${nameOf(state, e.target)}：`);
        add('b', itemNames(e.items));
        add('', ` 計${e.total}`);
        break;
      case 'resolve':
        if (e.items.length) { add('', `${nameOf(state, e.target)} は `); add('blk', itemNames(e.items)); add('', ' で防御。'); }
        else add('', `${nameOf(state, e.target)} は無防備。`);
        if (e.damage > 0) { add('', ' ダメージ '); add('dmg', String(e.damage)); }
        else add('ok', ' 完全に防いだ！');
        if (e.defeated) add('dmg', ` — ${nameOf(state, e.target)} 敗退！`);
        break;
      case 'pray':
        add('', `${nameOf(state, e.actor)} は祈った → `);
        add('b', itemNames(e.items));
        if (e.dropped) add('', `（${e.dropped}個は持ちきれず消えた）`);
        break;
      case 'use': {
        const item = Items.byId(e.item) || { name: e.item };
        add('', `${nameOf(state, e.actor)} は `);
        add('b', item.name);
        add('', ' を使った。');
        if (e.healed) { add('ok', ` HP +${e.healed}`); }
        if (e.drawn) { add('', ` アイテム ${e.drawn}個を授かった`); }
        if (e.stolen) { add('', ` ${nameOf(state, e.victim)} から ${e.stolen}個うばった`); }
        break;
      }
      case 'over':
        add('b', e.winner === null ? '引き分け' : `${nameOf(state, e.winner)} の勝利！`);
        break;
      default:
        add('', e.text || '');
    }
    return line;
  }

  function log(state, limit) {
    refs.log.replaceChildren();
    const entries = state.log.slice(-(limit || 40));
    for (const e of entries) refs.log.appendChild(logLine(state, e));
    refs.log.scrollTop = refs.log.scrollHeight;
  }

  function elementLegend() {
    refs.elements.replaceChildren();
    for (const key of [...Items.ATTACK_ELEMENTS, 'all']) {
      const e = Items.element(key);
      refs.elements.appendChild(el('span', `el-${key}`, `${e.sym} ${e.label}`));
    }
  }

  function record(rec) {
    refs.record.replaceChildren();
    const cells = [
      ['勝', rec.wins], ['敗', rec.losses],
      ['総戦', rec.games], ['最大ダメージ', rec.bestDamage]
    ];
    for (const [label, value] of cells) {
      const d = el('div');
      d.appendChild(el('b', null, String(value)));
      d.appendChild(document.createTextNode(label));
      refs.record.appendChild(d);
    }
  }

  global.GA = global.GA || {};
  global.GA.Render = {
    init, players, hand, stage, hint, pop, shake, log, elementLegend, record,
    itemCard, playerCard
  };
})(typeof window !== 'undefined' ? window : globalThis);
