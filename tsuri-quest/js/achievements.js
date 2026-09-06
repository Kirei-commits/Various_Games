/**
 * 実績と称号。判定はすべて純粋関数（state と 直近の釣果 を見るだけ）。
 * 称号は「達成済みのうち rank が最大のもの」を表示する。
 */
(function (global) {
  'use strict';

  var LIST = [
    { id: 'first',    rank: 1, name: '初漁',        title: '見習い釣り師',   desc: 'はじめて1匹釣り上げる',
      check: function (st) { return st.catches >= 1; } },
    { id: 'ten',      rank: 2, name: '十匹',        title: '常連',           desc: '通算10匹釣り上げる',
      check: function (st) { return st.catches >= 10; } },
    { id: 'five_kind',rank: 3, name: '五目釣り',    title: '目利き',         desc: '5種類の魚を釣る',
      check: function (st) { return Object.keys(st.dex || {}).length >= 5; } },
    { id: 'combo10',  rank: 4, name: '連鎖の達人',  title: '入れ食いの主',   desc: 'コンボを10まで伸ばす',
      check: function (st) { return (st.bestCombo || 0) >= 10; } },
    { id: 'big100',   rank: 5, name: '大物ハンター', title: 'ランカー',      desc: '100cm を超える魚を釣る',
      check: function (st, ev) { return biggest(st) >= 100 || (ev && ev.size >= 100); } },
    { id: 'rich',     rank: 6, name: '一攫千金',    title: '大漁旗',         desc: '1匹で500ポイント以上を得る',
      check: function (st, ev) { return bestPoints(st) >= 500 || (ev && ev.points >= 500); } },
    { id: 'kue',      rank: 7, name: '磯の王',      title: '荒磯の覇者',     desc: 'クエを釣り上げる',
      check: function (st) { return !!(st.dex && st.dex.kue); } },
    { id: 'gear_max', rank: 8, name: '完全装備',    title: '道具の求道者',   desc: '竿と糸を最大まで強化する',
      check: function (st) { return st.rod >= 5 && st.line >= 5; } },
    { id: 'ryugu',    rank: 9, name: '深淵を覗く',  title: '龍宮の使い',     desc: 'リュウグウノツカイを釣り上げる',
      check: function (st) { return !!(st.dex && st.dex.ryugu); } },
    { id: 'complete', rank: 10, name: '図鑑完成',   title: '海を知る者',     desc: '7種類すべてを釣り上げる',
      check: function (st) { return Object.keys(st.dex || {}).length >= 7; } },
    { id: 'master',   rank: 11, name: '名人',       title: '釣聖',           desc: 'レベル30に到達する',
      check: function (st) { return (st.level || 1) >= 30; } }
  ];

  var BY_ID = {};
  for (var i = 0; i < LIST.length; i++) BY_ID[LIST[i].id] = LIST[i];

  function biggest(st) {
    var best = 0;
    for (var k in st.dex || {}) if (st.dex[k].maxSize > best) best = st.dex[k].maxSize;
    return best;
  }
  function bestPoints(st) {
    var best = 0;
    for (var k in st.dex || {}) if (st.dex[k].bestPoints > best) best = st.dex[k].bestPoints;
    return best;
  }

  /** 新たに達成した実績のIDを返す（state は書き換えない）。 */
  function evaluate(state, event) {
    var have = state.achievements || [];
    var gained = [];
    for (var i = 0; i < LIST.length; i++) {
      var a = LIST[i];
      if (have.indexOf(a.id) !== -1) continue;
      var ok = false;
      try { ok = !!a.check(state, event); } catch (e) { ok = false; }
      if (ok) gained.push(a.id);
    }
    return gained;
  }

  /** 現在の称号。未達成なら既定の称号。 */
  function titleOf(state) {
    var have = state.achievements || [];
    var best = null;
    for (var i = 0; i < have.length; i++) {
      var a = BY_ID[have[i]];
      if (a && (!best || a.rank > best.rank)) best = a;
    }
    return best ? best.title : '無名の釣り人';
  }

  global.FQ = global.FQ || {};
  global.FQ.Achievements = {
    LIST: LIST,
    byId: function (id) { return BY_ID[id] || null; },
    evaluate: evaluate,
    titleOf: titleOf
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
