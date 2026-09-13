/**
 * localStorage への永続化。
 * プライベートモードでは読み書きの両方が例外を投げるので、必ず try/catch で包む。
 * 使えない環境でも既定値でゲームが成立することを保証する。
 */
(function (global) {
  'use strict';

  const KEY = 'gungun-farm/v1';
  const FARM_KEY = 'gungun-farm/farm/v1';
  /** 農園データの形。data.js の中身を変えたら上げる（古い保存は捨てる） */
  const FARM_VERSION = 1;

  const DEFAULTS = {
    settings: {
      sound: true,
      mode: 'free',        // free | rush
      tab: 'seed',         // 最後に開いていた下の段
      seed: 'wheat'        // 選んでいるタネ
    },
    record: {
      bestScore: 0,        // 3分チャレンジの最高（稼いだコイン）
      bestLevel: 1,
      bestCombo: 0,
      delivered: 0,
      games: 0,
      // 直近の3分チャレンジ（新しい順・最大5件）。**伸びているかが見えないと、
      // もう一度やる理由が「なんとなく」になる。** 最高記録1つでは分からない
      recent: []
    }
  };

  /**
   * 既定値に定義の無いキーは捨てる。ここに書き忘れると保存しても復元されない。
   * **配列は丸ごと差し替える**（中身を混ぜない）。`typeof [] === 'object'` なので、
   * 配列だと明示しておかないと、壊れた保存の `{}` がそのまま配列の席に座る。
   */
  function merge(base, patch) {
    const out = {};
    for (const k of Object.keys(base)) {
      const b = base[k], p = patch && patch[k];
      if (Array.isArray(b)) out[k] = Array.isArray(p) ? p : b;
      else if (b && typeof b === 'object') out[k] = merge(b, p || {});
      else out[k] = (p === undefined || typeof p !== typeof b) ? b : p;
    }
    return out;
  }

  function read() {
    try {
      const raw = global.localStorage.getItem(KEY);
      return merge(DEFAULTS, raw ? JSON.parse(raw) : {});
    } catch (e) {
      return merge(DEFAULTS, {});
    }
  }

  function write(data) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(merge(DEFAULTS, data)));
      return true;
    } catch (e) {
      return false;
    }
  }

  let cache = null;
  const load = () => (cache = cache || read());
  function save(patch) {
    cache = merge(load(), patch || {});
    write(cache);
    return cache;
  }
  function reset() { cache = merge(DEFAULTS, {}); write(cache); return cache; }

  /**
   * のんびりモードの農園そのものを保存する。閉じても続きから遊べるように。
   * 3分チャレンジは保存しない（途中から再開できたら記録の意味が無い）。
   */
  function saveFarm(state) {
    if (!state || state.mode !== 'free') return false;
    try {
      global.localStorage.setItem(FARM_KEY, JSON.stringify({ v: FARM_VERSION, state }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadFarm() {
    try {
      const raw = global.localStorage.getItem(FARM_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== FARM_VERSION || !data.state) return null;
      const s = data.state;
      // 形が合わないものは捨てる。壊れた保存で起動できなくなる方が困る。
      if (!Array.isArray(s.fields) || !Array.isArray(s.machines) || typeof s.coins !== 'number') return null;
      // あとから足した項目を埋める（埋めないと、古い保存で新しい仕掛けが動かない）
      return global.GF && global.GF.Engine ? global.GF.Engine.normalize(s) : s;
    } catch (e) {
      return null;
    }
  }

  function clearFarm() {
    try { global.localStorage.removeItem(FARM_KEY); return true; } catch (e) { return false; }
  }

  global.GF = global.GF || {};
  global.GF.Store = { KEY, FARM_KEY, FARM_VERSION, DEFAULTS, merge, load, save, reset, read, write, saveFarm, loadFarm, clearFarm };
})(typeof window !== 'undefined' ? window : globalThis);
