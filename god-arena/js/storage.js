/**
 * localStorage への永続化。
 * プライベートモードでは読み書きの両方が例外を投げるので、必ず try/catch で包む。
 * 使えない環境でも既定値でゲームが成立することを保証する。
 */
(function (global) {
  'use strict';

  const KEY = 'god-arena/v1';

  const DEFAULTS = {
    settings: {
      level: 'normal',      // AI の強さ
      opponents: 3,         // 対戦相手の数（1..5）
      sound: true,
      speed: 'normal',      // AI の演出速度 slow|normal|fast
      autoDefend: false,    // 防御をAIに任せる
      showLog: true
    },
    record: { wins: 0, losses: 0, games: 0, bestDamage: 0, kills: 0 }
  };

  /** 既定値に定義の無いキーは捨てる。ここに書き忘れると保存しても復元されない。 */
  function merge(base, patch) {
    const out = {};
    for (const k of Object.keys(base)) {
      const b = base[k], p = patch && patch[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, p || {});
      else out[k] = (p === undefined || typeof p !== typeof b) ? b : p;
    }
    return out;
  }

  function read() {
    try {
      const raw = global.localStorage.getItem(KEY);
      if (!raw) return merge(DEFAULTS, {});
      return merge(DEFAULTS, JSON.parse(raw));
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
  function load() { return (cache = cache || read()); }
  function save(patch) {
    cache = merge(load(), patch || {});
    write(cache);
    return cache;
  }
  function reset() { cache = merge(DEFAULTS, {}); write(cache); return cache; }

  global.GA = global.GA || {};
  global.GA.Store = { KEY, DEFAULTS, merge, load, save, reset, read, write };
})(typeof window !== 'undefined' ? window : globalThis);
