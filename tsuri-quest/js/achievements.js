/**
 * 実績と称号。判定はすべて純粋関数（state と 直近の釣果 を見るだけ）。
 * 称号は「達成済みのうち rank が最大のもの」を表示する。
 */
(function (global) {
  'use strict';

  var LIST = [
    { id: 'first',      rank: 1,  name: '初漁',         title: '見習い釣り師',   desc: 'はじめて1匹釣り上げる',
      check: function (st) { return st.catches >= 1; } },
    { id: 'ten',        rank: 2,  name: '十匹',         title: '常連',           desc: '通算10匹釣り上げる',
      check: function (st) { return st.catches >= 10; } },
    { id: 'kind10',     rank: 3,  name: '十目釣り',     title: '目利き',         desc: '10種類の魚を釣る',
      check: function (st) { return kinds(st) >= 10; } },
    { id: 'combo10',    rank: 4,  name: '連鎖の達人',   title: '入れ食いの主',   desc: 'コンボを10まで伸ばす',
      check: function (st) { return (st.bestCombo || 0) >= 10; } },
    { id: 'big100',     rank: 5,  name: '大物ハンター', title: 'ランカー',       desc: '100cm を超える魚を釣る',
      check: function (st, ev) { return biggest(st) >= 100 || (ev && ev.size >= 100); } },
    { id: 'login7',     rank: 6,  name: '皆勤賞',       title: '毎日の人',       desc: 'ログインボーナスを7日連続で受け取る',
      check: function (st) { return (st.bonusStreak || 0) >= 7; } },
    { id: 'rich',       rank: 7,  name: '一攫千金',     title: '大漁旗',         desc: '1匹で500ポイント以上を得る',
      check: function (st, ev) { return bestPoints(st) >= 500 || (ev && ev.points >= 500); } },
    { id: 'kind20',     rank: 8,  name: '二十目釣り',   title: '海の博物学者',   desc: '20種類の魚を釣る',
      check: function (st) { return kinds(st) >= 20; } },
    { id: 'kue',        rank: 9,  name: '磯の王',       title: '荒磯の覇者',     desc: 'クエを釣り上げる',
      check: function (st) { return !!(st.dex && st.dex.kue); } },
    { id: 'dressed',    rank: 10, name: '洒落者',       title: '道楽者',         desc: '装飾品・パーツを6つ買う',
      check: function (st) { return (st.ownedParts || []).length >= 6; } },
    { id: 'gear_max',   rank: 11, name: '完全装備',     title: '道具の求道者',   desc: '竿と糸を最大まで強化する',
      check: function (st) { return st.rod >= 5 && st.line >= 5; } },
    { id: 'angler_max', rank: 12, name: '熟練',         title: '手練れ',         desc: '釣り人レベルを最大にする',
      check: function (st) { return (st.anglerLevel || 1) >= 20; } },
    { id: 'ryugu',      rank: 13, name: '深淵を覗く',   title: '龍宮の使い',     desc: 'リュウグウノツカイを釣り上げる',
      check: function (st) { return !!(st.dex && st.dex.ryugu); } },
    { id: 'rabuka',     rank: 14, name: '生きた化石',   title: '古代の目撃者',   desc: 'ラブカを釣り上げる',
      check: function (st) { return !!(st.dex && st.dex.rabuka); } },
    { id: 'daiouika',   rank: 15, name: '海の伝説',     title: '深海の覇者',     desc: 'ダイオウイカを釣り上げる',
      check: function (st) { return !!(st.dex && st.dex.daiouika); } },
    { id: 'complete',   rank: 16, name: '図鑑完成',     title: '海を知る者',     desc: '30種類すべてを釣り上げる',
      check: function (st) { return kinds(st) >= 30; } },
    { id: 'master',     rank: 17, name: '名人',         title: '釣聖',           desc: '釣果レベルを30にする',
      check: function (st) { return (st.level || 1) >= 30; } }
  ];

  var BY_ID = {};
  for (var i = 0; i < LIST.length; i++) BY_ID[LIST[i].id] = LIST[i];

  function kinds(st) { return Object.keys(st.dex || {}).length; }

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
