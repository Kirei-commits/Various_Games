/**
 * ラリーの進行と、出題の選定。
 *
 * ここが「どうやって制御しているか」の本体。画面の『しくみ』パネルは、
 * この中の定数（MODES / UNIT_RULES / LADDER_RULES / PICK_COST）と、session に残った
 * 選定理由をそのまま表示しているだけで、説明文を別に持っていない。＝ 説明とコードがずれない。
 *
 * 出題の決め方は3通り（MODES）。
 *   おまかせ … 履歴から弱い単元を選び、前問の出来でレベルを上下させる
 *   レベル別 … 指定したレベルだけを並べる
 *   復習     … これまでに出た問題から、飛ばした・詰まった順に並べ直す
 */
import { MIN_LEVEL, MAX_LEVEL, unitLabel, levelName } from './banks.js';
import * as Judge from './judge.js';
import * as Hint from './hint.js';
import * as Grade from './grade.js';
import * as Choice from './choice.js';

export const SIZE = 10;            // 1ラリーの問題数
export const START_LEVEL = 2;      // おまかせの1問目。1にすると全員が満点付近に寄って差が出ない

/** 出題の決め方 */
export const MODES = [
  { key: 'auto', label: 'おまかせ', note: '弱い単元から選び、出来に合わせてレベルを上げ下げします' },
  { key: 'level', label: 'レベル別', note: '選んだレベルの問題だけを出します' },
  { key: 'review', label: '復習（過去に出た問題）', note: '飛ばした問題・詰まった問題から順に出し直します' }
];

/** 単元を選ぶ優先順位（おまかせ）。上から順に見る。 */
export const UNIT_RULES = [
  { key: 'unplayed', text: 'まだ一度も出していない単元を最優先する' },
  { key: 'weak', text: '直近の理解度スコアが低い単元を次に優先する' },
  { key: 'oldest', text: '同点なら、最後にやってから間が空いている方を選ぶ' }
];

/** レベルの上げ下げ（おまかせ）。前問の結果だけで決める。 */
export const LADDER_RULES = [
  { key: 'up', cond: 'ヒント0回で正解', delta: +1, text: '一発で当てた → 1段上げる' },
  { key: 'stay', cond: 'ヒント1回で正解', delta: 0, text: '少し詰まった → 同じ段でもう一問' },
  { key: 'down', cond: 'ヒント2回以上・答えを見た・飛ばした', delta: -1, text: '手が止まった → 1段下げて土台を固める' }
];

/** 復習で先に出す順番 */
export const REVIEW_RULES = [
  { key: 'skipped', text: '「わからない」で飛ばした問題を最優先する' },
  { key: 'revealed', text: '次に、答えを見て通した問題' },
  { key: 'hinted', text: '次に、ヒントを多く使った問題' },
  { key: 'oldest', text: '同じなら、最後に解いてから間が空いている方' }
];

/** 問題を取るときの重み。小さいほど先に選ばれる。 */
export const PICK_COST = {
  levelDistance: 3,   // 狙った段からのずれ1段ぶん
  mainUnit: 0,        // 主単元
  supportUnit: 1,     // 補単元（段が合わないときの借り先）
  otherUnit: 4        // それ以外（最後の逃げ道）
};

/** 固定シードの擬似乱数（mulberry32）。?seed= で並びを再現できるようにするため。 */
export function seededRandom(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clampLevel = (n) => Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, n));

/** 履歴から単元1つぶんの成績を取り出す（無ければ未受験として返す） */
export function unitStat(history, bankId, unitId) {
  const h = (history && history[bankId] && history[bankId][unitId]) || null;
  return h ? { played: h.plays || 0, lastScore: h.lastScore, lastAt: h.lastAt || 0 }
           : { played: 0, lastScore: null, lastAt: 0 };
}

/* ── 単元の自動生成（おまかせ） ─────────────── */

export function composePlan(bank, history, rng) {
  const ranked = bank.units.map((u) => {
    const s = unitStat(history, bank.id, u.id);
    return {
      unit: u, stat: s,
      // 未受験(0) → 低スコア → 古いもの、の順に並ぶキー
      key: [s.played === 0 ? 0 : 1, s.lastScore == null ? 0 : s.lastScore, s.lastAt, rng()]
    };
  }).sort((a, b) => {
    for (let i = 0; i < 4; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
    return 0;
  });

  const main = ranked[0];
  const support = ranked[1] || ranked[0];

  return {
    mode: 'auto',
    main: main.unit,
    support: support.unit === main.unit ? null : support.unit,
    title: support.unit === main.unit
      ? main.unit.label
      : `${main.unit.label} ＋ ${support.unit.label}（補）`,
    reason: main.stat.played === 0
      ? `「${main.unit.label}」はまだ出題していないため、最優先で選びました。`
      : `「${main.unit.label}」は直近の理解度が ${main.stat.lastScore} 点で、いまいちばん低い単元です。`,
    supportReason: support.unit === main.unit ? ''
      : `同じ段の問題を主単元から出し切ったときは「${support.unit.label}」から借ります。`,
    ranked: ranked.map((r) => ({ id: r.unit.id, label: r.unit.label, played: r.stat.played, lastScore: r.stat.lastScore })),
    plannedLadder: plannedLadder()
  };
}

/** すべて一発正解だった場合に辿るレベル（予定表の表示に使う） */
export function plannedLadder(size = SIZE) {
  const out = [];
  let lv = START_LEVEL;
  for (let i = 0; i < size; i++) { out.push(lv); lv = clampLevel(lv + 1); }
  return out;
}

/** 前問の結果から次の段を決める（おまかせのみ） */
export function nextLevel(prevLevel, rec) {
  const rule = (rec.skipped || rec.revealed || rec.hintsUsed >= 2) ? LADDER_RULES[2]
    : rec.hintsUsed === 1 ? LADDER_RULES[1]
    : LADDER_RULES[0];
  return { level: clampLevel(prevLevel + rule.delta), rule };
}

/* ── 出題の選定 ───────────────────────────── */

/** 狙った段にいちばん近い未出題の問題を取る。理由も一緒に返す。 */
export function pick(bank, plan, usedIds, target, rng, pool = bank.questions) {
  const rank = (q) => plan.main && q.unit === plan.main.id ? PICK_COST.mainUnit
    : (plan.support && q.unit === plan.support.id) ? PICK_COST.supportUnit
    : PICK_COST.otherUnit;

  const ranked = pool
    .filter((q) => !usedIds.includes(q.id))
    .map((q) => ({ q, cost: Math.abs(q.level - target) * PICK_COST.levelDistance + rank(q), jitter: rng() }))
    .sort((a, b) => a.cost - b.cost || a.jitter - b.jitter);

  if (!ranked.length) return null;
  const best = ranked[0];
  const label = unitLabel(bank, best.q.unit);
  const gap = best.q.level - target;
  const reason = gap === 0
    ? `狙いのレベル${target}に、単元「${label}」の未出題が残っていたのでそれを出しました。`
    : `狙いはレベル${target}でしたが、残っている中で最も近いのが単元「${label}」のレベル${best.q.level}でした。`;
  return { question: best.q, reason, target, considered: ranked.length };
}

/** 復習の並び。飛ばした → 答えを見た → ヒントが多い → 古い、の順。 */
export function reviewOrder(pool, attempts, rng) {
  return pool.map((q) => {
    const a = attempts[q.id] || {};
    return {
      q,
      key: [
        a.lastSkipped ? 0 : 1,
        a.lastRevealed ? 0 : 1,
        -(a.lastHints || 0),
        a.lastAt || 0,
        rng()
      ]
    };
  }).sort((x, y) => {
    for (let i = 0; i < x.key.length; i++) if (x.key[i] !== y.key[i]) return x.key[i] - y.key[i];
    return 0;
  }).map((x) => x.q);
}

const reviewReason = (q, attempts) => {
  const a = attempts[q.id] || {};
  if (a.lastSkipped) return '前に「わからない」で飛ばした問題です。';
  if (a.lastRevealed) return '前は答えを見て通した問題です。';
  if (a.lastHints) return `前はヒントを ${a.lastHints} 回使った問題です。`;
  return 'これまでに出た問題です。';
};

/* ── ラリーを組み立てる ───────────────────── */

/** 新しい記録（1問ぶん）を作る */
function makeRecord(question, bank, target, rule, reason, rng, choiceMode) {
  return {
    qid: question.id, unit: question.unit,
    unitLabel: unitLabel(bank, question.unit),
    level: question.level, prompt: question.prompt,
    targetLevel: target, levelRule: rule ? rule.text : 'この決め方では段を動かしません',
    pickReason: reason,
    choiceMode: choiceMode && Choice.hasChoices(question),
    choiceOrder: choiceMode && Choice.hasChoices(question) ? Choice.order(question, rng) : [],
    eliminated: [],
    attempts: 0, hintsUsed: 0, revealed: false, cleared: false, skipped: false,
    inputs: [], hintLog: [], optionalHit: 0, optionalTotal: (question.criteria.optional || []).length,
    missedKeys: [], score: 0
  };
}

/**
 * ラリーを1つ始める。
 * @param {object} bank 問題集
 * @param {object} history 単元ごとの成績（おまかせの単元選びに使う）
 * @param {object|number} options { seed, mode, level, attempts, size, choiceMode }。数値ならシードとして扱う
 */
export function create(bank, history, options = {}) {
  const o = typeof options === 'number' ? { seed: options } : (options || {});
  const rng = seededRandom(o.seed === undefined ? (Date.now() & 0x7fffffff) : o.seed);
  const attempts = o.attempts || {};
  const choiceMode = o.choiceMode !== false;

  let mode = MODES.some((m) => m.key === o.mode) ? o.mode : 'auto';
  const level = clampLevel(Number(o.level) || 3);
  let fellBack = '';

  let pool = bank.questions;
  if (mode === 'review') {
    pool = bank.questions.filter((q) => attempts[q.id]);
    if (pool.length < 1) {
      fellBack = 'まだ解いた問題がないので、おまかせで出題します。';
      mode = 'auto';
      pool = bank.questions;
    }
  }

  const size = Math.max(1, Math.min(o.size || SIZE, pool.length));
  const plan = buildPlan({ bank, history, rng, mode, level, pool, attempts, size, fellBack });

  const session = {
    bank, bankId: bank.id, bankName: bank.name, seed: o.seed,
    mode, level, choiceMode, pool, attempts,
    plan, size, index: 0,
    records: [], questions: [],
    phase: 'asking', lastResult: null, lastHint: null, summary: null,
    startedAt: Date.now(), rng
  };

  const first = nextPick(session, START_LEVEL);
  session.questions.push(first.question);
  session.records.push(makeRecord(first.question, bank, first.target, null, first.reason, rng, choiceMode));
  return session;
}

function buildPlan({ bank, history, rng, mode, level, pool, attempts, size, fellBack }) {
  if (mode === 'level') {
    const have = pool.filter((q) => q.level === level).length;
    return {
      mode, main: null, support: null,
      title: `レベル${level}（${levelName(level)}）`,
      reason: `レベル${level}を選んだので、その段の問題だけを出します`
        + `（この問題集にはレベル${level}が ${have} 問あります${have < size ? '。足りないぶんは近い段から借ります' : ''}）。`,
      supportReason: '', ranked: [], plannedLadder: new Array(size).fill(level), fellBack
    };
  }
  if (mode === 'review') {
    return {
      mode, main: null, support: null,
      title: '復習（これまでに出た問題）',
      reason: `これまでに出た ${pool.length} 問から、飛ばした問題・詰まった問題を先に出し直します。`,
      supportReason: '', ranked: [], plannedLadder: [], fellBack,
      queue: reviewOrder(pool, attempts, rng).map((q) => q.id)
    };
  }
  return Object.assign(composePlan(bank, history, rng), { plannedLadder: plannedLadder(size), fellBack });
}

/** 次に出す問題を、決め方に応じて取る */
function nextPick(session, target) {
  const used = session.questions.map((q) => q.id);

  if (session.mode === 'review') {
    const nextId = session.plan.queue.find((id) => !used.includes(id));
    const question = session.pool.find((q) => q.id === nextId);
    if (!question) return null;
    return { question, target: question.level, reason: reviewReason(question, session.attempts) };
  }

  const wanted = session.mode === 'level' ? session.level : target;
  return pick(session.bank, session.plan, used, wanted, session.rng, session.pool);
}

export const current = (s) => s.questions[s.index];
export const currentRecord = (s) => s.records[s.index];

/** いまの問題を選択式で出しているか */
export const isChoiceMode = (s) => !!currentRecord(s).choiceMode;

/* ── 回答 ─────────────────────────────────── */

/** 記述式の回答 */
export function submit(session, text) {
  if (session.phase === 'result' || session.phase === 'cleared' || session.phase === 'skipped') return null;
  const q = current(session);
  const rec = currentRecord(session);
  const result = Judge.evaluate(q, text);

  rec.inputs.push({ text: String(text == null ? '' : text), correct: result.correct });
  session.lastResult = result;

  if (result.correct) {
    rec.optionalHit = result.optional.filter((o) => o.hit).length;
    return clear(session, rec);
  }
  rec.missedKeys = result.missing.map((m) => m.key);
  return miss(session, rec, q, { result, choiceMode: false });
}

/** 選択式の回答 */
export function choose(session, text) {
  if (session.phase === 'result' || session.phase === 'cleared' || session.phase === 'skipped') return null;
  const q = current(session);
  const rec = currentRecord(session);
  const correct = Choice.isCorrect(q, text);

  rec.inputs.push({ text: String(text == null ? '' : text), correct });
  session.lastResult = {
    correct, choice: text, correctChoice: Choice.correctText(q),
    prepared: { raw: String(text == null ? '' : text), norm: Judge.normalize(text) },
    required: [], optional: [], traps: [], missing: [], coverage: correct ? 1 : 0
  };

  if (correct) return clear(session, rec);
  return miss(session, rec, q, { result: null, choiceMode: true });
}

function clear(session, rec) {
  rec.cleared = true;
  rec.score = Grade.scoreOne(rec);
  session.lastHint = null;
  session.phase = 'cleared';
  return { result: session.lastResult, hint: null };
}

function miss(session, rec, q, { result, choiceMode }) {
  rec.attempts += 1;
  rec.hintsUsed = Math.min(rec.attempts, Hint.REVEAL_STAGE);

  // 選択式の2段目は、誤りの選択肢を1つ消す
  let eliminated = '';
  if (choiceMode && rec.hintsUsed === 2) {
    eliminated = Choice.pickEliminated(q, rec.eliminated, session.rng) || '';
    if (eliminated) rec.eliminated.push(eliminated);
  }

  const hint = Hint.next(q, { attempt: rec.attempts, result, choiceMode, eliminated });
  if (hint.reveal) rec.revealed = true;
  rec.hintLog.push({ stage: hint.stage, kind: hint.kind, label: hint.label, text: hint.text });
  session.lastHint = hint;
  session.phase = 'hinting';
  return { result: session.lastResult, hint };
}

/**
 * 「わからない」で飛ばす。
 * 正解しないと進めない作りだけだと、詰まった人がそこで終わってしまう。
 * 飛ばした問題は 0点で、復習のときに真っ先に出し直す（飛ばし得にはしない）。
 */
export function skip(session) {
  if (session.phase === 'result' || session.phase === 'cleared' || session.phase === 'skipped') return null;
  const q = current(session);
  const rec = currentRecord(session);
  rec.skipped = true;
  rec.revealed = true;
  rec.score = 0;
  session.lastHint = {
    stage: Hint.REVEAL_STAGE, kind: 'reveal', label: '答え', reveal: true,
    text: rec.choiceMode
      ? `答えは「${Choice.correctText(q)}」でした。`
      : `模範解答：${q.model}`
  };
  session.phase = 'skipped';
  return { skipped: true, hint: session.lastHint };
}

/** 正解（または飛ばし）のあと、次の問題へ進む。最後の1問なら結果へ。 */
export function advance(session) {
  if (session.phase !== 'cleared' && session.phase !== 'skipped') return false;
  const prev = currentRecord(session);

  if (session.index + 1 >= session.size) return finish(session);

  const step = session.mode === 'auto'
    ? nextLevel(prev.level, prev)
    : { level: session.mode === 'level' ? session.level : prev.level, rule: null };

  const picked = nextPick(session, step.level);
  if (!picked) return finish(session);

  session.index += 1;
  session.questions.push(picked.question);
  session.records.push(makeRecord(
    picked.question, session.bank, picked.target ?? step.level, step.rule, picked.reason,
    session.rng, session.choiceMode));
  session.lastResult = null;
  session.lastHint = null;
  session.phase = 'asking';
  return true;
}

function finish(session) {
  session.phase = 'result';
  session.summary = summarize(session);
  return true;
}

/* ── 結果 ─────────────────────────────────── */

export function summarize(session) {
  const score = Grade.scoreRally(session.records);
  const grade = Grade.gradeOf(score);
  const byUnit = {};
  for (const r of session.records) {
    if (!Grade.isDone(r)) continue;
    (byUnit[r.unit] = byUnit[r.unit] || { unit: r.unit, label: r.unitLabel, scores: [] }).scores.push(Grade.scoreOne(r));
  }
  return {
    score, grade,
    next: Grade.toNext(score),
    weak: Grade.weakPoints(session.records),
    levelPath: session.records.map((r) => r.level),
    plannedLadder: session.plan.plannedLadder,
    hintTotal: session.records.reduce((a, r) => a + r.hintsUsed, 0),
    perfect: session.records.filter((r) => r.cleared && r.hintsUsed === 0).length,
    skipped: session.records.filter((r) => r.skipped).length,
    size: session.size,
    units: Object.values(byUnit).map((u) => ({
      unit: u.unit, label: u.label,
      score: Math.round((u.scores.reduce((a, b) => a + b, 0) / u.scores.length) * 1000) / 10
    }))
  };
}
