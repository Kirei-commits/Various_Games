/**
 * ログインボーナス。純粋ロジック（「今日」は必ず引数で受け取る）。
 *
 * 判定は端末のカレンダー日（YYYY-MM-DD）で行う。
 * 連続日数は7日で一巡し、7日目がいちばん大きい。1日でも空くと1日目に戻る。
 */
(function (global) {
  'use strict';

  var CYCLE = 7;

  // 各日の報酬。type は 'coins' | 'lure' | 'boost'。
  var REWARDS = [
    { day: 1, items: [{ type: 'coins', amount: 200 }] },
    { day: 2, items: [{ type: 'coins', amount: 300 }] },
    { day: 3, items: [{ type: 'lure', id: 'shrimp', amount: 5 }] },
    { day: 4, items: [{ type: 'coins', amount: 500 }] },
    { day: 5, items: [{ type: 'boost', id: 'boost_quick', amount: 1 }] },
    { day: 6, items: [{ type: 'coins', amount: 800 }] },
    { day: 7, items: [{ type: 'coins', amount: 1500 }, { type: 'boost', id: 'boost_rare', amount: 1 }] }
  ];

  /** Date から 'YYYY-MM-DD'（ローカル時刻）を作る。 */
  function dateKey(d) {
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function parseKey(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  /** 2つの日付キーの差（日数）。片方でも不正なら null。 */
  function daysBetween(a, b) {
    var da = parseKey(a), db = parseKey(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  }

  function rewardFor(day) {
    var idx = ((Math.round(day) - 1) % CYCLE + CYCLE) % CYCLE;
    return REWARDS[idx];
  }

  /** 今日ぶんがまだなら true。 */
  function pending(state, today) {
    return state.bonusDate !== today;
  }

  /**
   * 今日ぶんを受け取る。state を書き換え、受け取った内容を返す。
   * すでに受け取り済みなら { claimed:false }。
   */
  function claim(state, today) {
    if (!pending(state, today)) return { claimed: false, streak: state.bonusStreak };
    var gap = daysBetween(state.bonusDate, today);
    var streak = (gap === 1) ? (state.bonusStreak || 0) + 1 : 1;
    var reward = rewardFor(streak);

    for (var i = 0; i < reward.items.length; i++) {
      var it = reward.items[i];
      if (it.type === 'coins') {
        state.coins += it.amount;
      } else if (it.type === 'lure') {
        state.lures[it.id] = (state.lures[it.id] || 0) + it.amount;
      } else if (it.type === 'boost') {
        state.boostStock[it.id] = (state.boostStock[it.id] || 0) + it.amount;
      }
    }
    state.bonusDate = today;
    state.bonusStreak = streak;
    return { claimed: true, streak: streak, day: reward.day, items: reward.items.slice() };
  }

  global.FQ = global.FQ || {};
  global.FQ.Bonus = {
    CYCLE: CYCLE,
    REWARDS: REWARDS,
    dateKey: dateKey,
    daysBetween: daysBetween,
    rewardFor: rewardFor,
    pending: pending,
    claim: claim
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
