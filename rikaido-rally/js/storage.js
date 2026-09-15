/**
 * localStorage への保存。
 * 読み書きの両方が例外を投げうる（プライベートモード、容量超過）ので必ず try/catch で包む。
 *
 * 保存するのは「単元ごとの成績」と「ラリーの履歴」だけ。
 * 単元ごとの成績は、次のラリーの単元を選ぶのに使う（＝ 苦手が自動で回ってくる）。
 */
(function (global) {
  'use strict';
  const RR = (global.RR = global.RR || {});
  const KEY = 'rikaido-rally.v1';

  const DEFAULTS = {
    settings: { bank: 'java', teacher: false },
    // history[bankId][unitId] = { plays, lastScore, bestScore, lastAt }
    history: {},
    // rallies = [{ at, bankId, unitTitle, score, grade }] 新しい順、最大50件
    rallies: []
  };

  const clone = (v) => JSON.parse(JSON.stringify(v));

  /** 既定に無いキーは捨てる。壊れた保存データで画面が落ちないようにするため。 */
  function merge(saved) {
    const out = clone(DEFAULTS);
    if (!saved || typeof saved !== 'object') return out;
    if (saved.settings && typeof saved.settings === 'object') {
      for (const k of Object.keys(DEFAULTS.settings)) {
        if (k in saved.settings) out.settings[k] = saved.settings[k];
      }
    }
    if (saved.history && typeof saved.history === 'object') out.history = saved.history;
    if (Array.isArray(saved.rallies)) out.rallies = saved.rallies.slice(0, 50);
    return out;
  }

  function load() {
    try {
      return merge(JSON.parse(global.localStorage.getItem(KEY)));
    } catch (e) {
      return clone(DEFAULTS);
    }
  }

  function save(data) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** ラリーの結果を履歴に畳み込む */
  function record(data, session) {
    const s = session.summary;
    if (!s) return data;
    const bankId = session.bankId;
    const bank = (data.history[bankId] = data.history[bankId] || {});
    for (const u of s.units) {
      const cur = bank[u.unit] || { plays: 0, lastScore: null, bestScore: null, lastAt: 0 };
      bank[u.unit] = {
        plays: cur.plays + 1,
        lastScore: u.score,
        bestScore: cur.bestScore == null ? u.score : Math.max(cur.bestScore, u.score),
        lastAt: Date.now()
      };
    }
    data.rallies.unshift({
      at: Date.now(), bankId, unitTitle: session.plan.title,
      score: s.score, grade: s.grade.grade
    });
    data.rallies = data.rallies.slice(0, 50);
    return data;
  }

  /** 問題集ごとの到達状況（Aまであとどれくらいか、の表示に使う） */
  function progress(data, bankId) {
    const runs = data.rallies.filter((r) => r.bankId === bankId);
    if (!runs.length) return { runs: 0, best: null, last: null, bestGrade: null };
    const best = Math.max(...runs.map((r) => r.score));
    return {
      runs: runs.length, best, last: runs[0].score,
      bestGrade: (RR.Grade.gradeOf(best) || {}).grade || null,
      trend: runs.slice(0, 8).map((r) => r.score).reverse()
    };
  }

  function reset() {
    try { global.localStorage.removeItem(KEY); } catch (e) { /* 消せなくても続行する */ }
    return clone(DEFAULTS);
  }

  RR.Store = { KEY, DEFAULTS, merge, load, save, record, progress, reset };
})(typeof window !== 'undefined' ? window : globalThis);
