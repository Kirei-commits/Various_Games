/**
 * セーブデータと、釣果を状態へ反映する処理。
 *
 * 重要: 新しい設定・進捗キーは必ず DEFAULTS に書くこと。
 * merge() は DEFAULTS に無いキーを捨てるので、書き忘れると
 * 「保存しているのに復元されない」不具合になる（五目並べで実際に出した）。
 *
 * localStorage は読み書きの両方が例外を投げうる（プライベートモード等）。
 * 必ず try/catch で包み、使えなくても既定値でゲームが続くようにする。
 */
(function (global) {
  'use strict';

  var KEY = 'tsuri-quest/v1';
  var RECORD_MAX = 10;

  var DEFAULTS = {
    version: 1,
    xp: 0,
    coins: 0,
    level: 1,
    combo: 0,
    bestCombo: 0,
    casts: 0,
    catches: 0,
    misses: 0,
    clock: 300,          // ゲーム内時刻（分）。5:00 スタート
    weather: 'sunny',
    rod: 1,
    line: 1,
    lure: 'none',
    lures: { shrimp: 0, jig: 0, glow: 0, chum: 0 },
    dex: {},             // fishId -> { count, maxSize, bestPoints, firstAt }
    records: [],         // 上位 RECORD_MAX 件 { id, size, points, at }
    achievements: [],
    settings: { sound: true }
  };

  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function clone(v) {
    if (Array.isArray(v)) return v.map(clone);
    if (isPlainObject(v)) {
      var o = {};
      for (var k in v) o[k] = clone(v[k]);
      return o;
    }
    return v;
  }

  /**
   * DEFAULTS を骨格に、保存値を重ねる。DEFAULTS に無いキーは捨てる。
   * dex / records / achievements は自由キーなのでそのまま採用する。
   */
  function merge(defaults, saved, freeform) {
    var out = clone(defaults);
    if (!isPlainObject(saved)) return out;
    for (var k in defaults) {
      if (!(k in saved)) continue;
      var d = defaults[k], s = saved[k];
      if (freeform && freeform.indexOf(k) !== -1) {
        if (Array.isArray(d) ? Array.isArray(s) : isPlainObject(s)) out[k] = clone(s);
        continue;
      }
      if (isPlainObject(d)) out[k] = merge(d, s);
      else if (Array.isArray(d)) out[k] = Array.isArray(s) ? clone(s) : clone(d);
      else if (typeof d === typeof s) out[k] = s;
    }
    return out;
  }

  var FREEFORM = ['dex', 'records', 'achievements'];

  function defaults() { return clone(DEFAULTS); }

  function load() {
    var raw = null;
    try {
      raw = global.localStorage ? global.localStorage.getItem(KEY) : null;
    } catch (e) { raw = null; }
    if (!raw) return defaults();
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    var st = merge(DEFAULTS, parsed, FREEFORM);
    st.level = global.FQ.Progress.levelFromXp(st.xp);
    return st;
  }

  /** 保存できたときだけ true。localStorage が無い/拒否される環境では false。 */
  function save(state) {
    try {
      if (!global.localStorage) return false;
      global.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) { return false; }
  }

  function clear() {
    try {
      if (!global.localStorage) return false;
      global.localStorage.removeItem(KEY);
      return true;
    } catch (e) { return false; }
  }

  /**
   * 釣果を state に反映する。state を書き換え、起きたことをまとめて返す。
   * ポイントは xp（累計・減らない）と coins（所持・使える）の両方に加算する。
   */
  function applyCatch(state, catchInfo, now) {
    var P = global.FQ.Progress;
    var A = global.FQ.Achievements;
    var at = now == null ? Date.now() : now;
    var fish = catchInfo.fish;
    var size = catchInfo.size;

    state.combo = (state.combo || 0) + 1;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;

    var points = P.pointsFor({
      fish: fish, size: size, combo: state.combo - 1,
      weatherMul: catchInfo.weatherMul
    });

    var before = state.level;
    state.xp += points;
    state.coins += points;
    state.catches += 1;
    state.level = P.levelFromXp(state.xp);

    var entry = state.dex[fish.id];
    var isNew = !entry;
    if (isNew) entry = state.dex[fish.id] = { count: 0, maxSize: 0, bestPoints: 0, firstAt: at };
    entry.count += 1;
    var isBiggest = size > entry.maxSize;
    if (isBiggest) entry.maxSize = size;
    if (points > entry.bestPoints) entry.bestPoints = points;

    state.records.push({ id: fish.id, size: size, points: points, at: at });
    state.records.sort(function (a, b) { return b.points - a.points || b.size - a.size; });
    if (state.records.length > RECORD_MAX) state.records.length = RECORD_MAX;

    var gained = A.evaluate(state, { fish: fish, size: size, points: points });
    for (var i = 0; i < gained.length; i++) state.achievements.push(gained[i]);

    return {
      points: points,
      combo: state.combo,
      leveledTo: state.level > before ? state.level : null,
      isNew: isNew,
      isBiggest: isBiggest,
      achievements: gained
    };
  }

  /** バラシ。コンボが切れる。 */
  function applyMiss(state) {
    state.misses += 1;
    var lost = state.combo || 0;
    state.combo = 0;
    return { lostCombo: lost };
  }

  global.FQ = global.FQ || {};
  global.FQ.Store = {
    KEY: KEY,
    RECORD_MAX: RECORD_MAX,
    DEFAULTS: DEFAULTS,
    defaults: defaults,
    merge: function (saved) { return merge(DEFAULTS, saved, FREEFORM); },
    load: load,
    save: save,
    clear: clear,
    applyCatch: applyCatch,
    applyMiss: applyMiss
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
