/**
 * 保存。localStorage は読み書きの両方が例外を投げうる（プライベートモード・容量超過）ので、
 * 触るところは必ず1か所にまとめて try/catch で包む。
 *
 * 保存するもの
 *   settings … 役割・選んでいる問題集・表示設定
 *   history  … 単元ごとの成績（次のラリーの単元を自動で選ぶのに使う）
 *   rallies  … ラリーの履歴（最大50件）
 *   authored … 講師が資料から作った問題集
 *   studio   … 講師の生成設定（達成基準・生成プロンプト・生成エンジン）
 */
import { gradeOf } from './grade.js';

export const KEY = 'rikaido-rally.v2';

/** 既定の生成プロンプト。講師が書き換えられるが、置き換えても形は変えない。 */
export const DEFAULT_PROMPT = `アップロードされた資料から、受講者の理解度を測る問題を作ってください。

- 用語の暗記ではなく「なぜそうなるか」「どんなときにどうなるか」を答えさせること
- 資料に書かれていないことは問わないこと
- 1問につき、正解と認める観点は最大3つまで
- 設問文の中に答えの語をそのまま書かないこと`;

/** 既定の達成基準。「この資料を読んだ人に、何ができていてほしいか」を書く。 */
export const DEFAULT_RUBRIC = `この資料の要点を、用語と理由の両方を使って自分の言葉で説明できる。`;

export const DEFAULTS = {
  settings: { role: null, bank: 'java', teacher: false, theme: 'light' },
  history: {},          // history[bankId][unitId] = { plays, lastScore, bestScore, lastAt }
  rallies: [],          // [{ at, bankId, unitTitle, score, grade }] 新しい順・最大50件
  authored: [],         // 講師が作った問題集（bank の形そのまま）
  studio: { rubric: DEFAULT_RUBRIC, prompt: DEFAULT_PROMPT, engine: 'local', perUnit: 5, passGrade: 'B' }
};

const clone = (v) => JSON.parse(JSON.stringify(v));

/** localStorage への唯一の入口。差し替えられるようにしておく（テストと、無効な環境のため）。 */
let backend = null;
export function useStorage(impl) { backend = impl; }
function storage() {
  if (backend) return backend;
  return globalThis.localStorage;
}

/** 既定に無いキーは捨てる。壊れた保存データで画面が落ちないようにするため。 */
export function merge(saved) {
  const out = clone(DEFAULTS);
  if (!saved || typeof saved !== 'object') return out;
  for (const group of ['settings', 'studio']) {
    if (saved[group] && typeof saved[group] === 'object') {
      for (const k of Object.keys(DEFAULTS[group])) {
        if (k in saved[group]) out[group][k] = saved[group][k];
      }
    }
  }
  if (saved.history && typeof saved.history === 'object') out.history = saved.history;
  if (Array.isArray(saved.rallies)) out.rallies = saved.rallies.slice(0, 50);
  if (Array.isArray(saved.authored)) out.authored = saved.authored.filter(looksLikeBank);
  return out;
}

/** 復元した問題集が最低限の形をしているか。壊れたものを混ぜると出題側で落ちる。 */
export function looksLikeBank(b) {
  return !!b && typeof b.id === 'string' && !!b.id
    && Array.isArray(b.units) && b.units.length > 0
    && Array.isArray(b.questions) && b.questions.length > 0;
}

export function load() {
  try {
    return merge(JSON.parse(storage().getItem(KEY)));
  } catch (e) {
    return clone(DEFAULTS);
  }
}

export function save(data) {
  try {
    storage().setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

/** ラリーの結果を履歴に畳み込む */
export function record(data, session) {
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
export function progress(data, bankId) {
  const runs = data.rallies.filter((r) => r.bankId === bankId);
  if (!runs.length) return { runs: 0, best: null, last: null, bestGrade: null, trend: [] };
  const best = Math.max(...runs.map((r) => r.score));
  return {
    runs: runs.length, best, last: runs[0].score,
    bestGrade: (gradeOf(best) || {}).grade || null,
    trend: runs.slice(0, 8).map((r) => r.score).reverse()
  };
}

/** 講師が作った問題集を足す／差し替える */
export function putAuthored(data, bank) {
  const i = data.authored.findIndex((b) => b.id === bank.id);
  if (i >= 0) data.authored[i] = bank; else data.authored.push(bank);
  return data;
}

export function removeAuthored(data, bankId) {
  data.authored = data.authored.filter((b) => b.id !== bankId);
  delete data.history[bankId];
  data.rallies = data.rallies.filter((r) => r.bankId !== bankId);
  return data;
}

export function reset() {
  try { storage().removeItem(KEY); } catch (e) { /* 消せなくても続行する */ }
  return clone(DEFAULTS);
}
