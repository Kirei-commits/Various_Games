/*
 * 学習データ（8章の主要データモデル）と AI 利用の監査ログ（FR-053, NFR-05）
 * 純粋。保存先（localStorage など）と時刻は呼び出し側から渡す。
 *
 *   User         state.user
 *   Enrollment   state.enrollments[unitId]   （状態・現在のステップ・開始/修了日時・計測 Metric も持つ）
 *   Submission   state.submissions[]
 *   Explanation  state.explanations[]
 *   AiLog        state.aiLog[]               （ハッシュの鎖で改ざんを検知する）
 *   PracticeRepo state.repo                  （gitsim の repo）
 *   Journal      state.journal[]
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const { sha256, clone } = RGA.core;

  const KEY = 'renshu-ginko-v1';
  const KEY_SECRET = 'renshu-ginko-apikey';
  const MAX_SUBMISSIONS = 400;
  const GENESIS = '0'.repeat(64);

  function defaultState() {
    return {
      version: 1,
      user: null,
      enrollments: {},
      submissions: [],
      explanations: [],
      journal: [],
      aiLog: [],
      repo: null,
      retry: [],
      hack: null,
      titles: {},
      settings: { model: 'claude-opus-5-5', monthlyBudgetUsd: 3, tutorStopped: false, rememberKey: false, sound: true, lang: 'js', names: {} },
      spend: { month: '', usd: 0 },
      seen: {},
    };
  }

  function newEnrollment(unitId, time) {
    return {
      unitId, status: 'in-progress', step: 'understand', startedAt: time, finishedAt: null,
      done: {}, predicted: {}, practice: { stage: 'parsons', passed: {}, streak: {} }, exercise: {}, currentEx: null,
      gate: { passed: false, attempts: 0 }, aion: { spec: '', code: '', note: '', rows: [], review: { what: '', risk: '' }, adopted: false, branch: '', prId: null },
      metrics: { off: RGA.rules.emptyMetric(), on: RGA.rules.emptyMetric() }, estimate: null,
      tutorOffCount: 0, tutorOnCount: 0, chat: [],
    };
  }

  // ---- 読み込み・保存（API キーは「この端末に保存」を選んだときだけ localStorage、それ以外はセッション限り） ----
  function load(local, session) {
    let state = defaultState();
    try {
      const raw = local && local.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) state = { ...state, ...parsed, settings: { ...state.settings, ...parsed.settings } };
      }
    } catch (e) { /* 壊れたデータは無視して最初から */ }
    let key = '';
    try { key = (session && session.getItem(KEY_SECRET)) || (local && local.getItem(KEY_SECRET)) || ''; } catch (e) { key = ''; }
    state.settings.apiKey = key;
    return state;
  }
  function save(state, local, session) {
    const { apiKey, ...settings } = state.settings;
    const data = { ...state, settings };
    try {
      local.setItem(KEY, JSON.stringify(data));
      if (apiKey && settings.rememberKey) { local.setItem(KEY_SECRET, apiKey); session && session.removeItem(KEY_SECRET); }
      else if (apiKey) { session && session.setItem(KEY_SECRET, apiKey); local.removeItem(KEY_SECRET); }
      else { local.removeItem(KEY_SECRET); session && session.removeItem(KEY_SECRET); }
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- 書き出したデータの読み込み（Q-12: 当面はブラウザ保存なので、バックアップと端末の移行に使う） ----
  // 戻り値: { state } か { error }。API キーなどの設定は今の端末のものを残す
  function importData(text, current) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'JSON として読めません' }; }
    if (!data || data.version !== 1) return { error: '練習銀行アカデミーの書き出しファイルではありません（version が違います）' };
    if (!data.user || typeof data.user.id !== 'string') return { error: '学習者の情報がありません' };
    const base = defaultState();
    const lists = ['submissions', 'explanations', 'journal', 'aiLog'];
    for (const k of lists) if (data[k] !== undefined && !Array.isArray(data[k])) return { error: k + ' の形が違います' };
    if (data.enrollments !== undefined && (typeof data.enrollments !== 'object' || Array.isArray(data.enrollments))) return { error: 'enrollments の形が違います' };
    const state = { ...base, ...data, settings: { ...base.settings, ...(current && current.settings) } };
    const log = verifyLog(state.aiLog || []);
    return { state, logOk: log.ok, logCount: log.count };
  }

  // ---- 監査ログ（ハッシュの鎖） ----
  function entryHash(prevHash, body) {
    return sha256(prevHash + '\n' + JSON.stringify(body));
  }
  // entry: { unitId, kind, input, output, masking, source, model }。input/output は伏せ字にしてから渡すこと
  function appendLog(log, entry, time, learnerId) {
    const prev = log.length ? log[log.length - 1].hash : GENESIS;
    const body = {
      seq: log.length + 1,
      time: new Date(time).toISOString(),
      learnerId: learnerId || '',
      unitId: entry.unitId || '',
      kind: entry.kind,
      source: entry.source || '',
      model: entry.model || '',
      input: entry.input || '',
      output: entry.output || '',
      masking: entry.masking || { blocked: false, labels: [] },
    };
    return [...log, { ...body, prevHash: prev, hash: entryHash(prev, body) }];
  }
  function verifyLog(log) {
    let prev = GENESIS;
    for (let i = 0; i < log.length; i++) {
      const { prevHash, hash, ...body } = log[i];
      if (prevHash !== prev || entryHash(prev, body) !== hash) return { ok: false, count: log.length, brokenAt: i };
      prev = hash;
    }
    return { ok: true, count: log.length, brokenAt: -1 };
  }

  // ---- 計測（FR-050） ----
  function addMetric(enrollment, mode, field, amount) {
    const e = clone(enrollment);
    e.metrics[mode] = { ...RGA.rules.emptyMetric(), ...e.metrics[mode] };
    e.metrics[mode][field] += amount;
    return e;
  }

  function monthOf(time) {
    return new Date(time).toISOString().slice(0, 7);
  }
  // 今月の LLM 利用料（月が変わったら0から）
  function spentThisMonth(state, time) {
    return state.spend && state.spend.month === monthOf(time) ? state.spend.usd : 0;
  }
  function addSpend(state, usd, time) {
    const month = monthOf(time);
    const base = state.spend && state.spend.month === month ? state.spend.usd : 0;
    return { ...state, spend: { month, usd: base + (usd || 0) } };
  }

  function pushCapped(list, item, max) {
    const out = [...list, item];
    return out.length > max ? out.slice(out.length - max) : out;
  }

  RGA.store = { KEY, KEY_SECRET, MAX_SUBMISSIONS, defaultState, importData, newEnrollment, load, save, appendLog, verifyLog, entryHash, addMetric, spentThisMonth, addSpend, pushCapped, monthOf };
})(globalThis);
