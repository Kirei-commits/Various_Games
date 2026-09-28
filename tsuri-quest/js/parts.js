/**
 * 装飾品とパーツ（リール・ウキ・ロッドカラー）。純粋データと計算。
 *
 * 竿・糸（Gear）が「強化して段階的に上がるもの」なのに対して、
 * こちらは「買って持ち替えるもの」。見た目が変わることを重視している。
 * 効果は控えめにして、Gear の強化を置き換えてしまわないようにする。
 */
(function (global) {
  'use strict';

  // リール: 巻き取り速度と、離したときにテンションが緩む速さ。
  var REELS = [
    { id: 'reel_basic',    name: '手巻きリール',     cost: 0,    reelMul: 1.00, drainMul: 1.00, color: '#8b6b4a', desc: '最初から持っている一台。' },
    { id: 'reel_light',    name: '軽量スピニング',   cost: 400,  reelMul: 1.06, drainMul: 1.05, color: '#c9d2da', desc: '軽い。緩めるのが少し速い。' },
    { id: 'reel_power',    name: 'パワーギア',       cost: 1000, reelMul: 1.14, drainMul: 1.00, color: '#4a5a6a', desc: '巻き上げ重視。大物向け。' },
    { id: 'reel_silky',    name: 'シルキードラグ',   cost: 2200, reelMul: 1.10, drainMul: 1.20, color: '#e0b062', desc: 'テンションの上げ下げがしやすい。' },
    { id: 'reel_electric', name: '電動リール',       cost: 4800, reelMul: 1.26, drainMul: 1.15, color: '#3f8fd0', desc: '深場からでも一気に。' },
    { id: 'reel_legend',   name: '黄金のリール',     cost: 9000, reelMul: 1.35, drainMul: 1.25, color: '#ffcc4d', desc: '所有していること自体が誇り。' }
  ];

  // ウキ: 見た目が大きく変わる。効果は合わせの猶予がわずかに伸びるだけ。
  var FLOATS = [
    { id: 'float_red',    name: '赤白ウキ',   cost: 0,    biteBonusMs: 0,   top: '#ffffff', bottom: '#ff5f6d', stem: '#ffb703', desc: '定番。視認性は十分。' },
    { id: 'float_lemon',  name: 'レモンウキ', cost: 300,  biteBonusMs: 60,  top: '#fff7c2', bottom: '#ffd400', stem: '#ff9f1c', desc: '曇天でもよく見える。' },
    { id: 'float_aqua',   name: 'アクアウキ', cost: 600,  biteBonusMs: 110, top: '#e6fbff', bottom: '#2fc9e8', stem: '#0f6f8a', desc: '涼しげ。凪の海によく映える。' },
    { id: 'float_lime',   name: 'ライムウキ', cost: 900,  biteBonusMs: 150, top: '#f0ffe0', bottom: '#7ed957', stem: '#2f7a2f', desc: '沈み込みが目で追いやすい。' },
    { id: 'float_neon',   name: 'ネオンウキ', cost: 1500, biteBonusMs: 200, top: '#ffe9ff', bottom: '#c04cff', stem: '#5a1a8a', desc: '夜釣りの相棒。' },
    { id: 'float_gold',   name: '黄金ウキ',   cost: 3000, biteBonusMs: 280, top: '#fff6d0', bottom: '#ffbf00', stem: '#a8700a', desc: '見栄えと実用を兼ねる。' }
  ];

  // ロッドカラー: 完全に見た目だけ。効果はゼロ。
  var SKINS = [
    { id: 'skin_bamboo', name: '竹',             cost: 0,    color: '#5b3a24', desc: '素の竹の色。' },
    { id: 'skin_black',  name: 'マットブラック', cost: 250,  color: '#25282e', desc: '締まって見える。' },
    { id: 'skin_cherry', name: 'チェリーレッド', cost: 500,  color: '#b4322f', desc: '海の上でよく目立つ。' },
    { id: 'skin_deep',   name: 'ディープブルー', cost: 800,  color: '#1f4b8f', desc: '空と海になじむ。' },
    { id: 'skin_mint',   name: 'ミントグリーン', cost: 1200, color: '#3fae86', desc: '軽やかな印象。' },
    { id: 'skin_gold',   name: 'ゴールド',       cost: 2500, color: '#d9a326', desc: '全部そろえた人のための色。' }
  ];

  var SLOTS = [
    { key: 'reel',  label: 'リール',       list: REELS },
    { key: 'float', label: 'ウキ',         list: FLOATS },
    { key: 'skin',  label: 'ロッドカラー', list: SKINS }
  ];

  var BY_ID = {};
  var SLOT_OF = {};
  for (var i = 0; i < SLOTS.length; i++) {
    for (var j = 0; j < SLOTS[i].list.length; j++) {
      BY_ID[SLOTS[i].list[j].id] = SLOTS[i].list[j];
      SLOT_OF[SLOTS[i].list[j].id] = SLOTS[i].key;
    }
  }

  function byId(id) { return BY_ID[id] || null; }
  function slotOf(id) { return SLOT_OF[id] || null; }
  function listOf(slot) {
    for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].key === slot) return SLOTS[i].list;
    return [];
  }
  function defaultOf(slot) { return listOf(slot)[0]; }

  /** 装備中のパーツを解決する。未知のIDや未所持は初期装備に落とす。 */
  function equipped(parts, owned) {
    var out = {};
    for (var i = 0; i < SLOTS.length; i++) {
      var slot = SLOTS[i].key;
      var id = parts && parts[slot];
      var item = BY_ID[id];
      var free = item && item.cost === 0;
      var has = owned && owned.indexOf && owned.indexOf(id) !== -1;
      out[slot] = (item && slotOf(id) === slot && (free || has)) ? item : defaultOf(slot);
    }
    return out;
  }

  /** 装備の合計効果。 */
  function effects(parts, owned) {
    var e = equipped(parts, owned);
    return {
      reelMul: e.reel.reelMul,
      drainMul: e.reel.drainMul,
      biteBonusMs: e.float.biteBonusMs,
      rodColor: e.skin.color,
      reelColor: e.reel.color,
      float: e.float
    };
  }

  /** 購入判定。状態は書き換えず、新しい値を返す。 */
  function tryBuy(id, coins, owned, opts) {
    var item = BY_ID[id];
    if (!item) return { ok: false, reason: 'unknown' };
    if (item.cost === 0) return { ok: false, reason: 'free' };
    if (owned && owned.indexOf(id) !== -1) return { ok: false, reason: 'owned' };
    var cost = (opts && opts.free) ? 0 : item.cost;
    if (coins < cost) return { ok: false, reason: 'poor', cost: cost };
    return { ok: true, cost: cost, coins: coins - cost, slot: slotOf(id) };
  }

  global.FQ = global.FQ || {};
  global.FQ.Parts = {
    REELS: REELS, FLOATS: FLOATS, SKINS: SKINS, SLOTS: SLOTS,
    byId: byId, slotOf: slotOf, listOf: listOf, defaultOf: defaultOf,
    equipped: equipped, effects: effects, tryBuy: tryBuy
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
