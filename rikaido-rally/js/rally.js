/**
 * ラリーの進行と、出題の選定。
 *
 * ここが「どうやって制御しているか」の本体。画面の『しくみ』パネルは、
 * この中の定数（UNIT_RULES / LADDER_RULES / PICK_COST）と、session に残った
 * 選定理由をそのまま表示しているだけで、説明文を別に持っていない。
 * ＝ 説明とコードがずれない。
 *
 *   1. 単元を自動生成する  … 履歴を見て、主単元と補単元を選び、ラリー名を組み立てる
 *   2. レベルを階段状に動かす … 一発正解で1段上げ、ヒント2回以上で1段下げる
 *   3. その段に一番近い問題を取る … 主単元を優先しつつ、段が合わなければ補単元から借りる
 */
(function (global) {
  'use strict';
  const RR = (global.RR = global.RR || {});
  const { Banks, Judge, Hint, Grade } = RR;

  const SIZE = 5;              // 1ラリーの問題数
  const START_LEVEL = 2;       // 1問目のレベル。1にすると全員が満点付近に寄って差が出ない

  /** 単元を選ぶ優先順位。上から順に見る。 */
  const UNIT_RULES = [
    { key: 'unplayed', text: 'まだ一度も出していない単元を最優先する' },
    { key: 'weak', text: '直近の理解度スコアが低い単元を次に優先する' },
    { key: 'oldest', text: '同点なら、最後にやってから間が空いている方を選ぶ' }
  ];

  /** レベルの上げ下げ。前問の結果だけで決める。 */
  const LADDER_RULES = [
    { key: 'up', cond: 'ヒント0回で正解', delta: +1, text: '一発で当てた → 1段上げる' },
    { key: 'stay', cond: 'ヒント1回で正解', delta: 0, text: '少し詰まった → 同じ段でもう一問' },
    { key: 'down', cond: 'ヒント2回以上、または模範解答を見た', delta: -1, text: '手が止まった → 1段下げて土台を固める' }
  ];

  /** 問題を取るときの重み。小さいほど先に選ばれる。 */
  const PICK_COST = {
    levelDistance: 3,   // 狙った段からのずれ1段ぶん
    mainUnit: 0,        // 主単元
    supportUnit: 1,     // 補単元（段が合わないときの借り先）
    otherUnit: 4        // それ以外（最後の逃げ道）
  };

  /** 固定シードの擬似乱数（mulberry32）。?seed= で並びを再現できるようにするため。 */
  function seededRandom(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clampLevel = (n) => Math.max(Banks.MIN_LEVEL, Math.min(Banks.MAX_LEVEL, n));

  /** 履歴から単元1つぶんの成績を取り出す（無ければ未受験として返す） */
  function unitStat(history, bankId, unitId) {
    const h = (history && history[bankId] && history[bankId][unitId]) || null;
    return h ? { played: h.plays || 0, lastScore: h.lastScore, lastAt: h.lastAt || 0 }
             : { played: 0, lastScore: null, lastAt: 0 };
  }

  /**
   * 単元を自動生成する。
   * 主単元と補単元を選び、そのラリーの名前と理由を組み立てて返す。
   */
  function composePlan(bank, history, rng) {
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

    const reason = main.stat.played === 0
      ? `「${main.unit.label}」はまだ出題していないため、最優先で選びました。`
      : `「${main.unit.label}」は直近の理解度が ${main.stat.lastScore} 点で、いまいちばん低い単元です。`;

    return {
      bankId: bank.id,
      main: main.unit,
      support: support.unit === main.unit ? null : support.unit,
      title: support.unit === main.unit
        ? main.unit.label
        : `${main.unit.label} ＋ ${support.unit.label}（補）`,
      reason,
      supportReason: support.unit === main.unit ? ''
        : `同じ段の問題を主単元から出し切ったときは「${support.unit.label}」から借ります。`,
      ranked: ranked.map((r) => ({ id: r.unit.id, label: r.unit.label, played: r.stat.played, lastScore: r.stat.lastScore })),
      plannedLadder: plannedLadder()
    };
  }

  /** すべて一発正解だった場合に辿るレベル（予定表の表示に使う） */
  function plannedLadder() {
    const out = [];
    let lv = START_LEVEL;
    for (let i = 0; i < SIZE; i++) { out.push(lv); lv = clampLevel(lv + 1); }
    return out;
  }

  /** 前問の結果から次の段を決める */
  function nextLevel(prevLevel, rec) {
    const rule = (rec.revealed || rec.hintsUsed >= 2) ? LADDER_RULES[2]
      : rec.hintsUsed === 1 ? LADDER_RULES[1]
      : LADDER_RULES[0];
    return { level: clampLevel(prevLevel + rule.delta), rule };
  }

  /** 狙った段にいちばん近い未出題の問題を取る。理由も一緒に返す。 */
  function pick(bank, plan, usedIds, target, rng) {
    const rank = (q) => q.unit === plan.main.id ? PICK_COST.mainUnit
      : (plan.support && q.unit === plan.support.id) ? PICK_COST.supportUnit
      : PICK_COST.otherUnit;

    const pool = bank.questions
      .filter((q) => !usedIds.includes(q.id))
      .map((q) => ({ q, cost: Math.abs(q.level - target) * PICK_COST.levelDistance + rank(q), jitter: rng() }))
      .sort((a, b) => a.cost - b.cost || a.jitter - b.jitter);

    if (!pool.length) return null;
    const best = pool[0];
    const unitLabel = (Banks.unit(bank, best.q.unit) || {}).label || best.q.unit;
    const gap = best.q.level - target;
    const reason = gap === 0
      ? `狙いのレベル${target}に、単元「${unitLabel}」の未出題が残っていたのでそれを出しました。`
      : `狙いはレベル${target}でしたが、残っている中で最も近いのが単元「${unitLabel}」のレベル${best.q.level}でした。`;
    return { question: best.q, reason, target, considered: pool.length };
  }

  /** 新しい記録（1問ぶん）を作る */
  function makeRecord(question, bank, target, rule, reason) {
    return {
      qid: question.id, unit: question.unit,
      unitLabel: (Banks.unit(bank, question.unit) || {}).label || question.unit,
      level: question.level, prompt: question.prompt,
      targetLevel: target, levelRule: rule ? rule.text : '1問目は既定の開始レベル',
      pickReason: reason,
      attempts: 0, hintsUsed: 0, revealed: false, cleared: false,
      inputs: [], hintLog: [], optionalHit: 0, optionalTotal: (question.criteria.optional || []).length,
      missedKeys: [], score: 0
    };
  }

  /** ラリーを1つ始める */
  function create(bankId, history, seed) {
    const bank = Banks.get(bankId);
    const rng = seededRandom(seed === undefined ? (Date.now() & 0x7fffffff) : seed);
    const plan = composePlan(bank, history || {}, rng);
    const first = pick(bank, plan, [], START_LEVEL, rng);

    const session = {
      bankId: bank.id, bankName: bank.name, seed,
      plan, size: SIZE, index: 0,
      records: [makeRecord(first.question, bank, START_LEVEL, null, first.reason)],
      questions: [first.question],
      phase: 'asking', lastResult: null, lastHint: null, summary: null,
      startedAt: Date.now(), rng
    };
    return session;
  }

  const current = (s) => s.questions[s.index];
  const currentRecord = (s) => s.records[s.index];

  /** 回答を1つ受け取る。正誤とヒントを返す。 */
  function submit(session, text) {
    if (session.phase === 'result') return null;
    const q = current(session);
    const rec = currentRecord(session);
    const result = Judge.evaluate(q, text);

    rec.inputs.push({ text: String(text == null ? '' : text), correct: result.correct });
    session.lastResult = result;

    if (result.correct) {
      rec.cleared = true;
      rec.optionalHit = result.optional.filter((o) => o.hit).length;
      rec.missedKeys = [];
      rec.score = Grade.scoreOne(rec);
      session.lastHint = null;
      session.phase = 'cleared';
      return { result, hint: null };
    }

    rec.attempts += 1;
    rec.hintsUsed = Math.min(rec.attempts, Hint.REVEAL_STAGE);
    rec.missedKeys = result.missing.map((m) => m.key);
    const hint = Hint.next(q, result, rec.attempts);
    if (hint.reveal) rec.revealed = true;
    rec.hintLog.push({ stage: hint.stage, kind: hint.kind, label: hint.label, text: hint.text });
    session.lastHint = hint;
    session.phase = 'hinting';
    return { result, hint };
  }

  /** 正解したあと、次の問題へ進む。最後の1問なら結果へ。 */
  function advance(session) {
    if (session.phase !== 'cleared') return false;
    const bank = Banks.get(session.bankId);
    const prev = currentRecord(session);

    if (session.index + 1 >= session.size) {
      session.phase = 'result';
      session.summary = summarize(session);
      return true;
    }

    const step = nextLevel(prev.level, prev);
    const used = session.questions.map((q) => q.id);
    const picked = pick(bank, session.plan, used, step.level, session.rng);
    if (!picked) { session.phase = 'result'; session.summary = summarize(session); return true; }

    session.index += 1;
    session.questions.push(picked.question);
    session.records.push(makeRecord(picked.question, bank, step.level, step.rule, picked.reason));
    session.lastResult = null;
    session.lastHint = null;
    session.phase = 'asking';
    return true;
  }

  /** 結果をまとめる */
  function summarize(session) {
    const score = Grade.scoreRally(session.records);
    const grade = Grade.gradeOf(score);
    const byUnit = {};
    for (const r of session.records) {
      if (!r.cleared) continue;
      (byUnit[r.unit] = byUnit[r.unit] || { unit: r.unit, label: r.unitLabel, scores: [] }).scores.push(Grade.scoreOne(r));
    }
    return {
      score, grade,
      next: Grade.toNext(score),
      weak: Grade.weakPoints(session.records),
      levelPath: session.records.map((r) => r.level),
      plannedLadder: session.plan.plannedLadder,
      hintTotal: session.records.reduce((a, r) => a + r.hintsUsed, 0),
      perfect: session.records.filter((r) => r.hintsUsed === 0).length,
      units: Object.values(byUnit).map((u) => ({
        unit: u.unit, label: u.label,
        score: Math.round((u.scores.reduce((a, b) => a + b, 0) / u.scores.length) * 1000) / 10
      }))
    };
  }

  RR.Rally = {
    SIZE, START_LEVEL, UNIT_RULES, LADDER_RULES, PICK_COST,
    seededRandom, clampLevel, unitStat, composePlan, plannedLadder, nextLevel, pick,
    create, submit, advance, summarize, current, currentRecord
  };
})(typeof window !== 'undefined' ? window : globalThis);
