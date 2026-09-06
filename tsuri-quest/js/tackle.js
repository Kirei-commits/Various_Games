/**
 * 「いま釣りに効いている補正」を1か所に集める。
 *
 * 竿・糸・エサ・パーツ・釣り人レベル・ブースト・天候と、効くものが増えたので、
 * どこで何が掛かっているか分からなくなるのを防ぐためにここへ集約した。
 * game.js はこの結果だけを受け取り、個々の道具を知らない。
 */
(function (global) {
  'use strict';

  // 糸の限界は 1.0 未満に保つ。1.0 にすると絶対に切れなくなってゲームが成立しない。
  var BREAK_CAP = 0.97;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /**
   * @param {object} state セーブデータ
   * @param {object} weather World.weatherOf() の結果
   * @returns 補正をすべて掛け合わせた結果と、その内訳
   */
  function resolve(state, weather) {
    var FQ = global.FQ;
    var rod = FQ.Gear.rod(state.rod);
    var line = FQ.Gear.line(state.line);
    var lure = FQ.Gear.lure(state.lure);
    var parts = FQ.Parts.effects(state.parts, state.ownedParts);
    var perks = FQ.Angler.perks(FQ.Angler.levelFromXp(state.anglerXp));
    var boost = FQ.Boost.effects(state.boostActive);
    var w = weather || { waitMul: 1, ampMul: 1, pointMul: 1 };

    return {
      rod: rod, line: line, lure: lure, parts: parts, perks: perks, boost: boost,

      // アタリまでの待ち時間
      waitMul: lure.waitMul * w.waitMul * perks.waitMul * boost.waitMul,
      // 合わせの猶予（魚ごとの reactionMs に足す）
      biteBonusMs: rod.reactionBonusMs + parts.biteBonusMs + perks.biteBonusMs,
      // 取り込みの速さ
      reelMul: rod.reelRate * parts.reelMul * perks.reelMul,
      // 巻きを止めたときにテンションが緩む速さ
      drainMul: parts.drainMul,
      // 糸が切れるテンション
      breakAt: clamp(line.breakAt + perks.breakBonus + boost.breakBonus, 0.5, BREAK_CAP),
      // レア寄せ・大物寄せ
      rareBoost: lure.rareBoost * boost.rareBoost,
      bigBias: lure.bigBias + boost.bigBias,
      // 引きの荒さ（天候）
      ampMul: w.ampMul,
      // 獲得ポイントの倍率
      pointMul: w.pointMul * boost.pointMul,
      // バラしたときにコンボが残る確率
      comboGuard: perks.comboGuard
    };
  }

  global.FQ = global.FQ || {};
  global.FQ.Tackle = { BREAK_CAP: BREAK_CAP, resolve: resolve };
})(typeof globalThis !== 'undefined' ? globalThis : this);
