/**
 * ポイント計算とレベル。純粋関数のみ。
 *
 * 「ポイント」は2つの意味を持つので分けている:
 *   xp    … 累計獲得ポイント。減らない。レベルはこれで決まる。
 *   coins … 所持ポイント。道具の購入で減る。
 * 同じ額が同時に増える。分けておかないと「買い物したらレベルが下がる」ことになる。
 */
(function (global) {
  'use strict';

  var LEVEL_MAX = 30;
  var COMBO_CAP = 10;

  /** level から level+1 へ上がるのに必要なポイント。 */
  function req(level) {
    if (level >= LEVEL_MAX) return Infinity;
    return Math.round(40 * Math.pow(level, 1.3));
  }

  /** その level に到達するまでの累計必要ポイント。 */
  function totalFor(level) {
    var sum = 0;
    for (var lv = 1; lv < level; lv++) sum += req(lv);
    return sum;
  }

  function levelFromXp(xp) {
    var lv = 1, need = req(1);
    while (lv < LEVEL_MAX && xp >= need) { xp -= need; lv++; need = req(lv); }
    return lv;
  }

  /** 現在レベル内での進捗 { into, need, ratio }。最大レベルでは need=0, ratio=1。 */
  function levelProgress(xp) {
    var lv = levelFromXp(xp);
    if (lv >= LEVEL_MAX) return { level: lv, into: 0, need: 0, ratio: 1 };
    var into = xp - totalFor(lv);
    var need = req(lv);
    return { level: lv, into: into, need: need, ratio: need ? into / need : 1 };
  }

  /** サイズ倍率。最小サイズで 0.6 倍、最大サイズで 2.0 倍。 */
  function sizeMultiplier(fish, size) {
    var span = fish.max - fish.min;
    var t = span > 0 ? (size - fish.min) / span : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return 0.6 + 1.4 * Math.pow(t, 1.2);
  }

  /** 連続ヒットのコンボ倍率。1.0 〜 2.0。 */
  function comboMultiplier(combo) {
    var c = combo < 0 ? 0 : (combo > COMBO_CAP ? COMBO_CAP : combo);
    return 1 + 0.1 * c;
  }

  /** 釣果1匹あたりの獲得ポイント。 */
  function pointsFor(opts) {
    var mul = sizeMultiplier(opts.fish, opts.size) *
      comboMultiplier(opts.combo || 0) *
      (opts.weatherMul == null ? 1 : opts.weatherMul);
    return Math.max(1, Math.round(opts.fish.base * mul));
  }

  global.FQ = global.FQ || {};
  global.FQ.Progress = {
    LEVEL_MAX: LEVEL_MAX,
    COMBO_CAP: COMBO_CAP,
    req: req,
    totalFor: totalFor,
    levelFromXp: levelFromXp,
    levelProgress: levelProgress,
    sizeMultiplier: sizeMultiplier,
    comboMultiplier: comboMultiplier,
    pointsFor: pointsFor
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
