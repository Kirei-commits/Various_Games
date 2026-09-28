/**
 * ブーストアイテム。純粋ロジック。
 *
 * 効果時間は「実時間」ではなく「キャスト数」で数える。
 * 実時間だと、閉じているあいだに切れて損した気分になるため。
 * 複数を同時に使えるが、同じ種類は重ねず残りキャスト数を上書きする（最大値を採用）。
 */
(function (global) {
  'use strict';

  var LIST = [
    { id: 'boost_point', name: 'ポイント2倍', icon: '💰', cost: 500, casts: 10,
      effect: { pointMul: 2.0 }, desc: '獲得ポイントが2倍になる。' },
    { id: 'boost_rare',  name: 'レアラッシュ', icon: '✨', cost: 800, casts: 10,
      effect: { rareBoost: 2.0 }, desc: 'レアな魚が寄ってくる。エサの効果とも重なる。' },
    { id: 'boost_big',   name: '大物ブースト', icon: '📏', cost: 600, casts: 10,
      effect: { bigBias: 0.7 }, desc: '同じ魚でもサイズが上振れする。' },
    { id: 'boost_quick', name: '高速アタリ',   icon: '⚡', cost: 400, casts: 15,
      effect: { waitMul: 0.5 }, desc: 'アタリまでの待ち時間が半分になる。' },
    { id: 'boost_guard', name: '糸切れ防止',   icon: '🛡️', cost: 700, casts: 10,
      effect: { breakBonus: 0.10 }, desc: '糸が切れるテンションの限界が上がる。' }
  ];

  var BY_ID = {};
  for (var i = 0; i < LIST.length; i++) BY_ID[LIST[i].id] = LIST[i];

  function byId(id) { return BY_ID[id] || null; }

  /** 発動中のブーストをまとめた効果。何も無ければ素の値。 */
  function effects(active) {
    var out = { pointMul: 1, rareBoost: 1, bigBias: 0, waitMul: 1, breakBonus: 0 };
    if (!active) return out;
    for (var id in active) {
      var item = BY_ID[id];
      if (!item || !(active[id] > 0)) continue;
      var e = item.effect;
      if (e.pointMul) out.pointMul *= e.pointMul;
      if (e.rareBoost) out.rareBoost *= e.rareBoost;
      if (e.bigBias) out.bigBias += e.bigBias;
      if (e.waitMul) out.waitMul *= e.waitMul;
      if (e.breakBonus) out.breakBonus += e.breakBonus;
    }
    return out;
  }

  /** 1キャストぶん消費する。0になったものは消える。新しいオブジェクトを返す。 */
  function consume(active) {
    var out = {};
    if (!active) return out;
    for (var id in active) {
      if (!BY_ID[id]) continue;
      var left = active[id] - 1;
      if (left > 0) out[id] = left;
    }
    return out;
  }

  /** 発動する。同じ種類が残っていたら長いほうを採用する。 */
  function activate(active, id) {
    var item = BY_ID[id];
    if (!item) return { ok: false, reason: 'unknown' };
    var out = {};
    for (var k in active || {}) if (BY_ID[k]) out[k] = active[k];
    out[id] = Math.max(out[id] || 0, item.casts);
    return { ok: true, active: out, casts: out[id] };
  }

  /** 購入判定。所持数は呼び出し側が持つ。 */
  function tryBuy(id, count, coins, opts) {
    var item = BY_ID[id];
    if (!item) return { ok: false, reason: 'unknown' };
    var n = Math.max(1, Math.round(count || 1));
    var unit = (opts && opts.free) ? 0 : item.cost;
    var total = unit * n;
    if (coins < total) return { ok: false, reason: 'poor', cost: total };
    return { ok: true, count: n, cost: total, coins: coins - total };
  }

  global.FQ = global.FQ || {};
  global.FQ.Boost = {
    LIST: LIST,
    byId: byId,
    effects: effects,
    consume: consume,
    activate: activate,
    tryBuy: tryBuy
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
