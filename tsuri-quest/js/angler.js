/**
 * 釣り人（主人公）のレベル。純粋ロジック。
 *
 * 釣果レベル（Progress）とは役割が違う:
 *   釣果レベル … 何が釣れるか（レアの出現率）
 *   釣り人レベル … 釣りそのものの快適さ（合わせやすさ・待ち時間・巻き取り・糸の粘り）
 * 片方に両方の役割を持たせると「レベルを上げる意味」が一本しかなくなるので分けている。
 *
 * 経験値は釣果ポイントとは別で、「行動」に対して入る。
 * ポイントを使い切っても釣り人は成長するし、バラしても少しは進む。
 */
(function (global) {
  'use strict';

  var LEVEL_MAX = 20;

  /** level から level+1 へ上がるのに必要な経験値。 */
  function req(level) {
    if (level >= LEVEL_MAX) return Infinity;
    return Math.round(12 * Math.pow(level, 1.25));
  }

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

  function levelProgress(xp) {
    var lv = levelFromXp(xp);
    if (lv >= LEVEL_MAX) return { level: lv, into: 0, need: 0, ratio: 1 };
    var into = xp - totalFor(lv);
    var need = req(lv);
    return { level: lv, into: into, need: need, ratio: need ? into / need : 1 };
  }

  /** 行動ごとの獲得経験値。バラしても 1 は入る（何もしないより前に進む）。 */
  function xpFor(event) {
    if (!event) return 0;
    if (event.type === 'landed') return 3 + (event.stars || 1) * 2;
    if (event.type === 'missed') return 1;
    return 0;
  }

  // Lv1 と Lv20 の値。あいだは線形補間する。
  var PERKS = {
    biteBonusMs: [0, 700],   // 合わせの猶予が伸びる
    waitMul:     [1, 0.70],  // アタリまでが短くなる
    reelMul:     [1, 1.30],  // 取り込みが速くなる
    breakBonus:  [0, 0.06],  // 糸が切れにくくなる
    comboGuard:  [0, 0.50]   // バラしてもコンボが残る確率
  };

  function perks(level) {
    var lv = level < 1 ? 1 : (level > LEVEL_MAX ? LEVEL_MAX : level);
    var t = (lv - 1) / (LEVEL_MAX - 1);
    var out = {};
    for (var k in PERKS) out[k] = PERKS[k][0] + (PERKS[k][1] - PERKS[k][0]) * t;
    return out;
  }

  /** 画面に出すための「いま何が良くなっているか」。 */
  function describe(level) {
    var p = perks(level);
    return [
      { label: '合わせの猶予', value: '+' + Math.round(p.biteBonusMs) + 'ms' },
      { label: 'アタリの速さ', value: Math.round((1 - p.waitMul) * 100) + '% 短縮' },
      { label: '取り込みの速さ', value: '+' + Math.round((p.reelMul - 1) * 100) + '%' },
      { label: '糸の粘り', value: '+' + (p.breakBonus * 100).toFixed(1) + 'pt' },
      { label: 'コンボ保護', value: Math.round(p.comboGuard * 100) + '%' }
    ];
  }

  global.FQ = global.FQ || {};
  global.FQ.Angler = {
    LEVEL_MAX: LEVEL_MAX,
    req: req,
    totalFor: totalFor,
    levelFromXp: levelFromXp,
    levelProgress: levelProgress,
    xpFor: xpFor,
    perks: perks,
    describe: describe
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
