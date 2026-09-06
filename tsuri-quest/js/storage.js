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
    settings: { sound: true },

    // 釣り人（主人公）のレベル。釣果レベルとは別で、釣りの快適さを上げる
    anglerXp: 0,
    anglerLevel: 1,

    // 装飾品・パーツ
    parts: { reel: 'reel_basic', float: 'float_red', skin: 'skin_bamboo' },
    ownedParts: [],      // 購入済みパーツのID（自由キーの配列）

    // ブーストアイテム
    boostStock: {},      // id -> 所持数
    boostActive: {},     // id -> 残りキャスト数

    // ログインボーナス
    bonusDate: '',       // 最後に受け取った日 'YYYY-MM-DD'
    bonusStreak: 0,

    // 管理者コードによる「全商品0円」モード
    admin: false
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

  // 自由なキーを持つので merge() の型チェックを通さないもの
  var FREEFORM = ['dex', 'records', 'achievements', 'ownedParts', 'boostStock', 'boostActive'];

  function defaults() { return normalize(clone(DEFAULTS)); }

  /** 保存値から導出できるものを計算し直す（レベルは xp が真、level は表示用の写し）。 */
  function normalize(st) {
    st.level = global.FQ.Progress.levelFromXp(st.xp);
    st.anglerLevel = global.FQ.Angler.levelFromXp(st.anglerXp);
    return st;
  }

  /** 保存されていたオブジェクトから状態を作る（アカウントのスロットから読むとき用）。 */
  function fromSaved(saved) { return normalize(merge(DEFAULTS, saved, FREEFORM)); }

  function load() {
    var raw = null;
    try {
      raw = global.localStorage ? global.localStorage.getItem(KEY) : null;
    } catch (e) { raw = null; }
    if (!raw) return defaults();
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    return normalize(merge(DEFAULTS, parsed, FREEFORM));
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
    var Angler = global.FQ.Angler;
    var at = now == null ? Date.now() : now;
    var fish = catchInfo.fish;
    var size = catchInfo.size;

    state.combo = (state.combo || 0) + 1;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;

    // 天候・ブーストなどの倍率は呼び出し側で掛け合わせて pointMul として渡す
    var points = P.pointsFor({
      fish: fish, size: size, combo: state.combo - 1,
      weatherMul: catchInfo.pointMul == null ? catchInfo.weatherMul : catchInfo.pointMul
    });

    var before = state.level;
    var anglerBefore = state.anglerLevel;
    state.xp += points;
    state.coins += points;
    state.catches += 1;
    state.level = P.levelFromXp(state.xp);
    state.anglerXp += Angler.xpFor({ type: 'landed', stars: fish.stars });
    state.anglerLevel = Angler.levelFromXp(state.anglerXp);

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
      anglerLeveledTo: state.anglerLevel > anglerBefore ? state.anglerLevel : null,
      isNew: isNew,
      isBiggest: isBiggest,
      achievements: gained
    };
  }

  /**
   * バラシ。コンボが切れる。
   * 釣り人レベルの「コンボ保護」が当たると半分だけ残る（opts.guard と opts.random）。
   */
  function applyMiss(state, opts) {
    var Angler = global.FQ.Angler;
    state.misses += 1;
    var lost = state.combo || 0;
    var guard = (opts && opts.guard) || 0;
    var rng = (opts && opts.random) || Math.random;
    var kept = 0;
    if (guard > 0 && lost > 1 && rng() < guard) kept = Math.floor(lost / 2);
    state.combo = kept;

    var anglerBefore = state.anglerLevel;
    state.anglerXp += Angler.xpFor({ type: 'missed' });
    state.anglerLevel = Angler.levelFromXp(state.anglerXp);

    return {
      lostCombo: lost, kept: kept,
      anglerLeveledTo: state.anglerLevel > anglerBefore ? state.anglerLevel : null
    };
  }

  global.FQ = global.FQ || {};
  global.FQ.Store = {
    KEY: KEY,
    RECORD_MAX: RECORD_MAX,
    DEFAULTS: DEFAULTS,
    defaults: defaults,
    merge: function (saved) { return merge(DEFAULTS, saved, FREEFORM); },
    fromSaved: fromSaved,
    load: load,
    save: save,
    clear: clear,
    applyCatch: applyCatch,
    applyMiss: applyMiss
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
