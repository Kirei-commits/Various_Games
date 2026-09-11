/**
 * 進行役。入力の受付、AIの手番の駆動、演出の間の管理をまとめて持つ。
 * ルールは engine、描画は render に閉じ込め、ここには「いつ何を呼ぶか」だけを書く。
 */
(function (global) {
  'use strict';

  const Items = global.GA.Items;
  const Engine = global.GA.Engine;
  const AI = global.GA.AI;
  const Store = global.GA.Store;
  const Audio = global.GA.Audio;
  const Render = global.GA.Render;

  const $ = (sel) => document.querySelector(sel);

  const SPEED = { slow: 1500, normal: 900, fast: 380 };
  const NAMES = ['アレス', 'ヘラ', 'ロキ', 'フレイ', 'イズン', 'トール'];

  const game = {
    state: null,
    ui: { selected: new Set(), targetId: null, filter: 'all' },
    settings: null,
    record: null,
    busy: false,     // 演出中は入力を止める
    timer: null
  };

  const delay = () => SPEED[game.settings.speed] || SPEED.normal;
  const wait = (ms) => new Promise((res) => { game.timer = setTimeout(res, ms); });

  const me = () => game.state.players.find((p) => p.isHuman);
  const isMyTurn = () => game.state.phase === 'turn' && Engine.current(game.state).isHuman;
  const isMyDefense = () => game.state.phase === 'defense'
    && Engine.byId(game.state, game.state.pending.targetId).isHuman
    && !game.settings.autoDefend;

  // ── 局面ごとに押せる手札 ───────────────────────────────
  function playable(item) {
    if (game.busy) return false;
    if (isMyDefense()) return Items.isShield(item);
    if (!isMyTurn()) return false;
    if (Items.isShield(item)) return false;          // 防具と反射具は受ける時だけ使う
    const sel = [...game.ui.selected].map(findItem).filter(Boolean);
    if (!sel.length) return true;
    // 武器どうしは重ねられる。食料・魔法は1つだけ。
    return sel[0].kind === 'weapon' && item.kind === 'weapon';
  }

  function findItem(uid) {
    return me().hand.find((i) => i.uid === uid) || null;
  }

  function selectedItems() {
    return [...game.ui.selected].map(findItem).filter(Boolean);
  }

  // ── 描画 ───────────────────────────────────────────────
  function refresh() {
    const s = game.state;
    // 手札から消えたものを選択から外す
    for (const uid of [...game.ui.selected]) if (!findItem(uid)) game.ui.selected.delete(uid);

    Render.players(s, game.ui);
    Render.hand(s, game.ui, playable);
    Render.log(s);
    Render.record(game.record);
    syncButtons();
  }

  function syncButtons() {
    const s = game.state;
    const defending = isMyDefense();
    const sel = selectedItems();
    const weaponsPicked = sel.length > 0 && sel.every((i) => i.kind === 'weapon');
    const supportPicked = sel.length === 1 && (sel[0].kind === 'food' || sel[0].kind === 'magic');

    $('#btn-attack').hidden = defending;
    $('#btn-use').hidden = defending;
    $('#btn-pray').hidden = defending;
    $('#btn-guard').hidden = !defending;
    $('#btn-take').hidden = !defending;

    if (defending) {
      const shields = sel.filter(Items.isShield);
      $('#btn-guard').disabled = game.busy || shields.length === 0;
      $('#btn-take').disabled = game.busy;
      const preview = Engine.resolveDamage(s.pending.weapons, shields);
      let text = '防具をえらぶか、そのまま受ける';
      if (shields.length) {
        text = `この防御なら ${preview.damage} ダメージ（${preview.blocked} 防げる）`;
        if (preview.reflected > 0) text += ` / ${preview.reflected} 撃ち返す`;
      }
      Render.hint(text, preview.damage >= me().hp);
      return;
    }

    const mine = isMyTurn() && !game.busy;
    $('#btn-attack').disabled = !(mine && weaponsPicked && game.ui.targetId !== null
      && Engine.byId(s, game.ui.targetId) && Engine.byId(s, game.ui.targetId).alive);
    $('#btn-use').disabled = !(mine && supportPicked);
    $('#btn-pray').disabled = !(mine && Engine.canPray(s));

    if (!mine) { Render.hint(s.phase === 'over' ? '決着' : '相手の手番です'); return; }
    if (weaponsPicked) {
      const total = sel.reduce((a, b) => a + b.power, 0);
      Render.hint(game.ui.targetId === null
        ? `${sel.length}個えらんだ（計${total}）— 狙う相手をタップ`
        : `${Engine.byId(s, game.ui.targetId).name} に 計${total} の攻撃`);
    } else if (supportPicked) {
      Render.hint(`${sel[0].name} を使う`);
    } else if (!Engine.canPray(s)) {
      Render.hint('武器を持っている間は祈れません。武器をえらんで相手をタップ');
    } else {
      Render.hint('攻め手がありません。「いのる」で神器を授かりましょう');
    }
  }

  // ── 行動 ───────────────────────────────────────────────
  async function humanAttack() {
    if ($('#btn-attack').disabled) return;
    const uids = selectedItems().map((i) => i.uid);
    const targetId = game.ui.targetId;
    game.ui.selected.clear();
    Engine.attack(game.state, targetId, uids);
    Audio.play('attack');
    await announceAttack();
    drive();
  }

  async function humanUse() {
    if ($('#btn-use').disabled) return;
    const item = selectedItems()[0];
    game.ui.selected.clear();
    const out = Engine.useItem(game.state, item.uid);
    Audio.play(out.healed ? 'heal' : 'pray');
    Render.stage(null, `${item.name} を使った`);
    if (out.healed) Render.pop('heal', `+${out.healed}`);
    game.busy = true; refresh();
    await wait(delay() * 0.6);
    game.busy = false;
    drive();
  }

  async function humanPray() {
    if ($('#btn-pray').disabled) return;
    game.ui.selected.clear();
    const out = Engine.pray(game.state);
    Audio.play('pray');
    Render.stage(null, `神器を ${out.items.length} 個 授かった`);
    game.busy = true; refresh();
    await wait(delay() * 0.6);
    game.busy = false;
    drive();
  }

  async function humanDefend(useItems) {
    if (!isMyDefense() || game.busy) return;
    const uids = useItems ? selectedItems().filter(Items.isShield).map((i) => i.uid) : [];
    game.ui.selected.clear();
    await resolveDefense(uids);
  }

  /** 攻撃の宣言を見せる */
  async function announceAttack() {
    const p = game.state.pending;
    const a = Engine.byId(game.state, p.attackerId);
    const t = Engine.byId(game.state, p.targetId);
    const names = p.weapons.map((w) => w.name).join(' + ');
    Render.stage(`ROUND ${game.state.round}`, `${a.name} の ${names}！ → ${t.name}（計${p.total}）`);
    game.busy = true;
    refresh();
    await wait(delay() * 0.75);
    game.busy = false;
    refresh();
  }

  /** 防御を確定してダメージを出す（人間・AI共通） */
  async function resolveDefense(uids) {
    const s = game.state;
    // defend() の後は pending が消え、決着ならログに 'over' が足される。
    // 先に攻守のIDを控えておく（ログ末尾から取ると 'over' を拾って壊れる）。
    const targetId = s.pending.targetId;
    const attackerId = s.pending.attackerId;
    const res = Engine.defend(s, uids);
    game.busy = true;

    if (res.reflected > 0) {
      Audio.play('block');
      const dn = Engine.byId(s, targetId).name;
      Render.stage(null, res.damage > 0
        ? `${dn} は ${res.reflected} 撃ち返した！（${res.damage} くらった）`
        : `${dn} は完全に防ぎ、${res.reflected} 撃ち返した！`);
      Render.pop('ref', `↩${res.reflected}`);
      Render.shake(attackerId);
      if (res.damage > 0) Render.shake(targetId);
    } else if (res.blocked > 0 && res.damage === 0) {
      Audio.play('block');
      Render.stage(null, '完全に防いだ！');
      Render.pop('blk', 'GUARD');
    } else if (res.damage > 0) {
      Audio.play('hit');
      Render.stage(null, `${Engine.byId(s, targetId).name} に ${res.damage} ダメージ`);
      Render.pop('dmg', `-${res.damage}`);
      Render.shake(targetId);
      if (res.damage > game.record.bestDamage && Engine.byId(s, targetId).isHuman === false) {
        game.record = Store.save({ record: Object.assign({}, game.record, { bestDamage: res.damage }) }).record;
      }
    } else {
      Render.stage(null, 'かすりもしなかった');
    }
    refresh();
    await wait(delay() * 0.8);

    const fallen = [];
    if (res.defeated) fallen.push(Engine.byId(s, targetId).name);
    if (res.attackerDefeated) fallen.push(Engine.byId(s, attackerId).name);
    if (fallen.length) {
      Audio.play('defeat');
      Render.stage(null, fallen.length > 1
        ? `${fallen.join(' と ')} が相打ちで倒れた`
        : `${fallen[0]} は倒れた`);
      refresh();
      await wait(delay() * 0.85);
    }
    game.busy = false;
    drive();
  }

  // ── AI ────────────────────────────────────────────────
  async function aiTurn() {
    const s = game.state;
    const p = Engine.current(s);
    game.busy = true;
    Render.stage(`ROUND ${s.round}`, `${p.name} の番…`);
    refresh();
    await wait(delay() * 0.55);
    game.busy = false;

    const act = AI.chooseAction(s, p.level);
    if (act.type === 'attack') {
      Engine.attack(s, act.targetId, act.uids);
      Audio.play('attack');
      await announceAttack();
      drive();
      return;
    }
    if (act.type === 'use') {
      const item = p.hand.find((i) => i.uid === act.uid);
      const out = Engine.useItem(s, act.uid, act.targetId);
      Audio.play(out.healed ? 'heal' : 'pray');
      Render.stage(null, `${p.name} は ${item ? item.name : 'アイテム'} を使った`);
      game.busy = true; refresh();
      await wait(delay() * 0.7);
      game.busy = false;
      drive();
      return;
    }
    Engine.pray(s);
    Audio.play('pray');
    Render.stage(null, `${p.name} は祈った`);
    game.busy = true; refresh();
    await wait(delay() * 0.6);
    game.busy = false;
    drive();
  }

  async function aiDefend() {
    const s = game.state;
    const defender = Engine.byId(s, s.pending.targetId);
    game.busy = true;
    refresh();
    await wait(delay() * 0.5);
    game.busy = false;
    const uids = AI.chooseDefense(s, defender.isHuman ? 'hard' : defender.level);
    await resolveDefense(uids);
  }

  // ── 進行 ───────────────────────────────────────────────
  function drive() {
    const s = game.state;
    refresh();
    if (s.phase === 'over') { finish(); return; }
    if (s.phase === 'defense') {
      const d = Engine.byId(s, s.pending.targetId);
      if (d.isHuman && !game.settings.autoDefend) {
        Render.stage(null, `${Engine.byId(s, s.pending.attackerId).name} の攻撃！ 受けますか？`);
        refresh();
        return;
      }
      aiDefend();
      return;
    }
    if (Engine.current(s).isHuman) {
      Render.stage(`ROUND ${s.round}`, 'あなたの番です');
      refresh();
      return;
    }
    aiTurn();
  }

  function finish() {
    const s = game.state;
    const draw = s.winner === null;                       // 反射での相打ちで起きる
    const won = !draw && Engine.byId(s, s.winner).isHuman;
    const rec = Object.assign({}, game.record);
    rec.games++;
    if (draw) rec.draws++;
    else if (won) rec.wins++;
    else rec.losses++;
    rec.kills += me().stats.kills;
    game.record = Store.save({ record: rec }).record;

    Audio.play(won ? 'win' : 'lose');
    $('#overlay-kicker').textContent = draw ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT');
    $('#overlay-title').textContent = draw ? '相打ち' : (won ? '勝利' : '敗北');
    const stats = me().stats;
    const parts = [
      `与ダメージ ${stats.dealt}`,
      `防いだ ${stats.blocked}`,
      `撃ち返し ${stats.reflected}`,
      `撃破 ${stats.kills}人`
    ];
    $('#overlay-sub').textContent = parts.join(' ／ ')
      + (!draw && !won ? `　—　${Engine.byId(s, s.winner).name} の勝ち` : '');
    $('#overlay').hidden = false;
    Render.stage('RESULT', draw ? '相打ち…' : (won ? 'あなたの勝利！' : '敗北…'));
    refresh();
  }

  // ── 新しい対戦 ─────────────────────────────────────────
  function newGame() {
    clearTimeout(game.timer);
    const n = Math.max(1, Math.min(5, game.settings.opponents));
    const names = ['あなた', ...NAMES.slice(0, n)];
    game.state = Engine.create({
      names,
      humans: 1,
      levels: names.map((_, i) => (i === 0 ? 'normal' : game.settings.level))
    });
    game.ui.selected.clear();
    game.ui.targetId = null;
    game.busy = false;
    $('#overlay').hidden = true;
    Render.stage('ROUND 1', 'あなたの番です');
    drive();
  }

  // ── 入力 ───────────────────────────────────────────────
  function bind() {
    $('#hand').addEventListener('click', (ev) => {
      const card = ev.target.closest('.card');
      if (!card || card.disabled) return;
      const uid = card.dataset.uid;
      const item = findItem(uid);
      if (!item || !playable(item)) return;
      if (game.ui.selected.has(uid)) game.ui.selected.delete(uid);
      else {
        // 食料・魔法は1つだけ。武器や防具は重ねられる。
        if (!Items.isShield(item) && item.kind !== 'weapon') game.ui.selected.clear();
        const cur = selectedItems();
        const sameGroup = (a, b) =>
          a.kind === b.kind || (Items.isShield(a) && Items.isShield(b));
        if (cur.length && !sameGroup(cur[0], item)) game.ui.selected.clear();
        game.ui.selected.add(uid);
      }
      Audio.play('select');
      refresh();
    });

    $('#opponents').addEventListener('click', (ev) => {
      const card = ev.target.closest('.pcard');
      if (!card) return;
      const id = Number(card.dataset.player);
      const p = Engine.byId(game.state, id);
      if (!p || !p.alive || !isMyTurn() || game.busy) return;
      game.ui.targetId = game.ui.targetId === id ? null : id;
      Audio.play('select');
      refresh();
      // 武器を選んだ状態で相手をタップしたら、そのまま攻撃に入る
      if (game.ui.targetId !== null && !$('#btn-attack').disabled) humanAttack();
    });

    $('#filters').addEventListener('click', (ev) => {
      const chip = ev.target.closest('.chip');
      if (!chip) return;
      game.ui.filter = chip.dataset.filter;
      for (const c of $('#filters').querySelectorAll('.chip')) c.classList.toggle('is-on', c === chip);
      refresh();
    });

    $('#btn-attack').addEventListener('click', humanAttack);
    $('#btn-use').addEventListener('click', humanUse);
    $('#btn-pray').addEventListener('click', humanPray);
    $('#btn-guard').addEventListener('click', () => humanDefend(true));
    $('#btn-take').addEventListener('click', () => humanDefend(false));

    $('#btn-settings').addEventListener('click', () => { $('#settings').hidden = false; });
    $('#btn-close-settings').addEventListener('click', () => { $('#settings').hidden = true; });
    $('#btn-restart').addEventListener('click', () => { $('#settings').hidden = true; newGame(); });
    $('#btn-rematch').addEventListener('click', () => { $('#overlay').hidden = true; newGame(); });
    $('#btn-close-overlay').addEventListener('click', () => { $('#overlay').hidden = true; });

    const opt = (id, key, fromEl, toEl) => {
      const node = $(id);
      toEl(node, game.settings[key]);
      node.addEventListener('change', () => {
        game.settings = Store.save({ settings: Object.assign({}, game.settings, { [key]: fromEl(node) }) }).settings;
        Audio.setEnabled(game.settings.sound);
        refresh();
      });
    };
    opt('#opt-level', 'level', (n) => n.value, (n, v) => { n.value = v; });
    opt('#opt-opponents', 'opponents', (n) => Number(n.value), (n, v) => { n.value = String(v); });
    opt('#opt-speed', 'speed', (n) => n.value, (n, v) => { n.value = v; });
    opt('#opt-sound', 'sound', (n) => n.checked, (n, v) => { n.checked = v; });
    opt('#opt-autodefend', 'autoDefend', (n) => n.checked, (n, v) => { n.checked = v; });

    document.addEventListener('keydown', (ev) => {
      if (ev.target.matches('input, select, textarea')) return;
      const k = ev.key.toLowerCase();
      if (k === 'a') humanAttack();
      else if (k === 'p') humanPray();
      else if (k === 'u') humanUse();
      else if (k === 'g') humanDefend(true);
      else if (k === 't') humanDefend(false);
      else if (k === 'escape') { $('#settings').hidden = true; $('#overlay').hidden = true; }
    });
  }

  /** 固定シードの擬似乱数（mulberry32）。?seed= を付けると同じ展開を再現できる。 */
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * URLのクエリで対戦条件を上書きする。
   * 不具合の再現とE2Eテストを決定的にするために用意している。
   *   ?seed=42  … 引きを固定
   *   ?speed=fast&opponents=1&level=hard
   */
  function applyQuery(settings) {
    let q;
    try { q = new URLSearchParams(global.location.search); } catch (e) { return settings; }
    const out = Object.assign({}, settings);
    if (q.has('speed') && ['slow', 'normal', 'fast'].includes(q.get('speed'))) out.speed = q.get('speed');
    if (q.has('level') && ['easy', 'normal', 'hard'].includes(q.get('level'))) out.level = q.get('level');
    if (q.has('opponents')) {
      const n = Number(q.get('opponents'));
      if (n >= 1 && n <= 5) out.opponents = n;
    }
    if (q.get('sound') === 'off') out.sound = false;
    if (q.has('seed')) {
      const seed = Number(q.get('seed')) || 1;
      Engine.setRandom(seeded(seed));
      AI.setRandom(seeded(seed + 977));
    }
    return out;
  }

  function boot() {
    const saved = Store.load();
    game.settings = applyQuery(saved.settings);
    game.record = saved.record;
    Audio.setEnabled(game.settings.sound);
    Render.init();
    Render.elementLegend();
    bind();
    newGame();
  }

  global.GA = global.GA || {};
  global.GA.game = game;
  global.GA.boot = boot;
  global.GA.newGame = newGame;
  global.GA.refresh = refresh;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
