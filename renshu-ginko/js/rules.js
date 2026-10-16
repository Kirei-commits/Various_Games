/*
 * 学習のルール（純粋。DOM・乱数・時計に触れない）
 * 要件IDは仕様プロンプト v0.1 の4章・6章・7章。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const { norm, includesAny } = RGA.core;
  const C = RGA.content;

  const unitById = (id) => C.UNITS.find((u) => u.id === id);

  // ---- FR-001 自己評価から開始レベルと開始単元を提案する ----
  function suggestStart(answers) {
    const v = (k) => Number(answers[k] ?? 0);
    const total = C.SURVEY.reduce((s, q) => s + v(q.id), 0);
    // L2 は「AIなしでデバッグできる」が前提。読解とデバッグがともに「だいたい」以上で、合計も高いときだけ提案する
    const l2 = v('read') >= 2 && v('debug') >= 2 && total >= 10;
    const level = l2 ? 2 : 1;
    const unit = C.UNITS.find((u) => u.level === level);
    const reasons = [];
    if (l2) reasons.push('コードの読解とデバッグに自信があるので、L2「独り立ち」から始めるのがおすすめです。');
    else if (v('read') < 2) reasons.push('まずは関数を読んで説明するところから。L1「新卒入門」の最初の単元がおすすめです。');
    else reasons.push('L1 の単元で、AIオフで基礎を確かめてから AI を解禁する流れに慣れましょう。');
    if (l2 && v('git') < 2) reasons.push('Git に不安があれば、L1-05「小さなコミットとPR」をいつでも先にできます。');
    return { level, unitId: unit.id, total, reasons };
  }

  // ---- FR-002 前提単元を修了していなければ「おすすめしない」 ----
  function missingPrereqs(unit, enrollments) {
    return unit.prereq.filter((id) => !(enrollments[id] && enrollments[id].status === 'done'));
  }

  // ---- FR-003 次にやる1単元 ----
  function nextUnit(state) {
    const enr = state.enrollments || {};
    const inProgress = C.UNITS.find((u) => enr[u.id] && enr[u.id].status === 'in-progress');
    if (inProgress) return inProgress;
    const startLevel = (state.user && state.user.startLevel) || 1;
    const candidates = C.UNITS.filter((u) => !(enr[u.id] && enr[u.id].status === 'done'));
    const ready = candidates.filter((u) => u.level >= startLevel && missingPrereqs(u, enr).length === 0);
    // 開始レベルより上で前提がそろっているもの → 前提がそろっているもの → 残り、の順
    return ready[0] || candidates.find((u) => missingPrereqs(u, enr).length === 0) || candidates[0] || null;
  }

  // ---- 練習問題の採点のための実行内容を組み立てる ----
  function assembleAnswer(ex, input) {
    if (ex.stage === 'parsons') return (input.order || []).join('\n');
    if (ex.stage === 'blank') return C.fillBlanks(ex.template, input.blanks || []);
    return input.code || '';
  }

  // 実行する「ジョブ」（runner.runJob が受け取る形）を作る
  function exerciseJob(unit, ex, answer) {
    if (ex.mode === 'tests') {
      return { kind: 'many', suites: [{ sources: [unit.reference], tests: answer }, ...unit.mutants.map((m) => ({ sources: [m.code], tests: answer }))] };
    }
    return { sources: [answer], tests: ex.tests };
  }

  // 実行結果を採点する。rows は画面に出す行（FR-022: 失敗したテスト名と期待値）
  // パーソンズ問題は、テストが通っても「使わない行」を含んでいたら不合格（return の後ろに置くと動いてしまうため）
  function usedDistractors(ex, answer) {
    if (ex.stage !== 'parsons' || typeof answer !== 'string') return [];
    const lines = answer.split('\n');
    return (ex.distractors || []).filter((d) => lines.includes(d));
  }
  function gradeExercise(unit, ex, result, answer) {
    const extra = usedDistractors(ex, answer).map((d) => ({ name: '使わない行が入っています: ' + d.trim(), pass: false, detail: 'この行は正しいコードには要りません。外してみましょう' }));
    const g0 = gradeRaw(unit, ex, result);
    return extra.length ? { ...g0, pass: false, rows: [...g0.rows, ...extra] } : g0;
  }
  function gradeRaw(unit, ex, result) {
    if (ex.mode !== 'tests') {
      return { pass: !!result.ok, error: result.error || null, rows: (result.results || []).map((r) => ({ ...r })) };
    }
    const [ref, ...muts] = result;
    const rows = [];
    let error = null;
    if (ref.error) error = ref.error;
    const refOk = !!ref.ok;
    rows.push({ name: '正しい実装で、あなたのテストが全部通る', pass: refOk, detail: refOk ? '' : failedSummary(ref) });
    // 変異体は「この問題で見つけるべきもの」だけを数える
    const targets = ex.targets || targetMutants(ex.id, unit);
    unit.mutants.forEach((m, i) => {
      if (!targets.includes(m.id)) return;
      const r = muts[i];
      const killed = !r.error && r.results.some((x) => !x.pass);
      rows.push({ name: '変異体「' + m.name + '」を見つける', pass: killed, detail: killed ? 'テストが落ちて、欠陥に気づけました' : 'この変異体でも全部のテストが通ってしまいます' });
    });
    return { pass: rows.every((r) => r.pass), error, rows };
  }
  function failedSummary(r) {
    if (r.error) return r.error;
    const f = r.results.find((x) => !x.pass);
    if (!f) return '';
    return '「' + f.name + '」' + (f.expected ? ' 期待: ' + f.expected + ' / 実際: ' + f.actual : ' ' + (f.error || ''));
  }
  // テストを書く課題で、問題ごとに見つけるべき変異体
  const MUTANT_TARGETS = {
    'L1-04-p1': ['asc'], 'L1-04-p2': ['plus1'], 'L1-04-b1': ['asc'], 'L1-04-b2': ['mutate'],
    'L1-04-f1': [], 'L1-04-f2': [], 'L1-04-s1': ['asc', 'plus1', 'mutate'],
  };
  function targetMutants(exId) {
    return MUTANT_TARGETS[exId] || [];
  }

  // ---- FR-020/021 足場の段階 ----
  const STAGE_ORDER = C.STAGES.map((s) => s.id);
  function exercisesOf(unit, stage) {
    return unit.exercises.filter((e) => e.stage === stage);
  }
  // 提出の結果を練習の進み具合に反映する（新しいオブジェクトを返す）
  // 連続正解 = 同じ段階の問題を続けて解けた数。途中で落ちてもやり直し扱いで、数え直しにはしない（C-06: 失敗を罰にしない）
  function applyPracticeResult(practice, unit, ex, pass) {
    const p = { stage: 'parsons', passed: {}, streak: {}, ...practice };
    p.passed = { ...p.passed };
    p.streak = { ...p.streak };
    if (pass && !p.passed[ex.id]) {
      p.passed[ex.id] = true;
      p.streak[ex.stage] = (p.streak[ex.stage] || 0) + 1;
    }
    const list = exercisesOf(unit, ex.stage);
    const allPassed = list.every((e) => p.passed[e.id]);
    // 2回連続で正解したら（1問しかない段階はその1問で）次の段階を提案する
    p.suggestNext = ex.stage !== 'scratch' && (p.streak[ex.stage] >= 2 || allPassed);
    p.complete = exercisesOf(unit, 'scratch').every((e) => p.passed[e.id]);
    return p;
  }
  function nextStage(stage) {
    const i = STAGE_ORDER.indexOf(stage);
    return STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.length - 1)];
  }

  // ---- FR-012 説明ゲートの採点（ルール採点。LLM採点は tutor.js で上乗せする） ----
  const MIN_CHARS = 12;
  function scoreField(text, spec) {
    const matched = [];
    const missing = [];
    for (const pt of spec.points) (includesAny(text, pt.any) ? matched : missing).push(pt.label);
    const longEnough = norm(text).replace(/\s/g, '').length >= MIN_CHARS;
    return { ok: longEnough && matched.length >= spec.min, matched, missing: matched.length >= spec.min ? [] : missing, longEnough, need: spec.min };
  }
  function scoreExplanation(rubric, answer) {
    const what = scoreField(answer.what || '', rubric.what);
    const risk = scoreField(answer.risk || '', rubric.risk);
    const missing = [];
    if (!what.longEnough) missing.push('「何をするか」をもう少し具体的に（' + MIN_CHARS + '文字以上）');
    else if (!what.ok) missing.push(...what.missing.map((m) => '何をするか: ' + m));
    if (!risk.longEnough) missing.push('「どこが危ないか」をもう少し具体的に（' + MIN_CHARS + '文字以上）');
    else if (!risk.ok) missing.push(...risk.missing.map((m) => 'どこが危ないか: ' + m + '（どれか' + risk.need + 'つ）'));
    return { pass: what.ok && risk.ok, what, risk, missing };
  }

  // ---- FR-014 AIの生成コードを取り込む前の説明（未入力なら拒否） ----
  function checkAdoptExplanation(review, answer) {
    const what = (answer.what || '').trim();
    const risk = (answer.risk || '').trim();
    const missing = [];
    if (what.length < 10) missing.push('「このコードは何をするか」を10文字以上で書いてください');
    if (risk.length < 10) missing.push('「どこが危ないか」を10文字以上で書いてください');
    // 採点はしない（取り込みを止めるのは未入力のときだけ）。気づいていない観点は助言として返す
    const advice = review ? review.points.filter((pt) => !includesAny(answer.risk || '', pt.any)).map((pt) => pt.label) : [];
    return { ok: missing.length === 0, missing, advice };
  }

  // ---- AIオンでの仕様の網羅（AIの生成結果を左右する） ----
  function specCoverage(aiTask, spec) {
    const missing = aiTask.specGroups.filter((gr) => !includesAny(spec, gr.any)).map((gr) => gr.label);
    return { complete: missing.length === 0 && norm(spec).trim().length >= 20, missing };
  }

  // ---- FR-052 / NFR-04 AIへ送る前のマスキング検査 ----
  const SENSITIVE = [
    { type: 'email', label: 'メールアドレス', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
    { type: 'phone', label: '電話番号', re: /(?<![\d-])(?:\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|0\d{1,4}-\d{1,4}-\d{3,4}|0[5789]0\d{8}|0\d{9})(?![\d-])/g },
    { type: 'account', label: '口座番号', re: /(?:口座(?:番号)?|account(?:\s*(?:no|number))?|acct)[\s:：#は=\-'"]{0,6}\d{7}(?!\d)/gi },
    { type: 'account', label: '口座番号', re: /(?<![\d-])\d{3}-\d{7}(?![\d-])/g },
    { type: 'card', label: 'カード番号', re: /(?<!\d)(?:\d{4}[- ]){3}\d{4}(?!\d)|(?<![\d.])(?:4\d{15}|5[1-5]\d{14})(?!\d)/g },
    { type: 'apikey', label: 'APIキー', re: /sk-ant-[A-Za-z0-9_-]{10,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { type: 'apikey', label: 'APIキー・パスワード', re: /(?:api[_-]?key|secret|token|password|passwd|pwd|パスワード)["']?\s*[:=：]\s*["']?[A-Za-z0-9_\-/+=.!@#$%^&*]{8,}/gi },
  ];
  function detectSensitive(text) {
    const s = String(text || '');
    const findings = [];
    for (const rule of SENSITIVE) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(s))) {
        findings.push({ type: rule.type, label: rule.label, index: m.index, length: m[0].length });
        if (m[0].length === 0) rule.re.lastIndex++;
      }
    }
    findings.sort((a, b) => a.index - b.index);
    return { blocked: findings.length > 0, findings, labels: [...new Set(findings.map((f) => f.label))] };
  }
  // ログには伏せ字にして残す（NFR-03: 秘密情報を平文で保存しない）
  function redact(text) {
    const s = String(text || '');
    const { findings } = detectSensitive(s);
    let out = '';
    let pos = 0;
    for (const f of findings) {
      if (f.index < pos) continue;
      out += s.slice(pos, f.index) + '［' + f.label + '］';
      pos = f.index + f.length;
    }
    return out + s.slice(pos);
  }

  // ---- FR-031 / 6章 正解コードと一致する5行以上を含む回答は破棄する ----
  function codeLines(text) {
    return String(text || '').split('\n')
      .map((l) => l.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim())
      .filter((l) => l && !/^[{}()[\];,]+$/.test(l) && !l.startsWith('//'));
  }
  function leaksSolution(reply, solution, minRun) {
    const run = minRun || 5;
    const sol = codeLines(solution);
    const out = codeLines(reply);
    if (sol.length < run || out.length < run) return false;
    const solSet = new Map();
    for (let i = 0; i + run <= sol.length; i++) solSet.set(sol.slice(i, i + run).join('\n'), true);
    for (let i = 0; i + run <= out.length; i++) if (solSet.has(out.slice(i, i + run).join('\n'))) return true;
    return false;
  }
  // 6章「疑似コード（3行以内）」: 4行以上のコードブロックは見せない
  function limitCodeBlocks(reply) {
    return String(reply || '').replace(/```[^\n]*\n([\s\S]*?)```/g, (whole, body) => {
      const lines = body.split('\n').filter((l) => l.trim());
      return lines.length > 3 ? '（コードは3行以内の疑似コードにする決まりなので、ここは省きました）' : whole;
    });
  }

  // ---- FR-032 / 6章 チューターへの質問回数（AIオフは10回、AIオンは無制限） ----
  const TUTOR_LIMIT_OFF = 10;
  function tutorQuota(enrollment, aiMode) {
    if (aiMode === 'on') return { limited: false, remaining: Infinity, used: (enrollment && enrollment.tutorOnCount) || 0 };
    const used = (enrollment && enrollment.tutorOffCount) || 0;
    return { limited: true, used, remaining: Math.max(0, TUTOR_LIMIT_OFF - used), limit: TUTOR_LIMIT_OFF };
  }

  // ---- FR-042 CIの静的解析 ----
  const LINT_RULES = [
    { id: 'no-eval', level: 'error', msg: 'eval / new Function は使わない（任意のコードが動く）', re: /\beval\s*\(|new\s+Function\s*\(/ },
    { id: 'eqeqeq', level: 'error', msg: '== / != ではなく === / !== を使う', re: /[^=!<>]==[^=]|!=[^=]/ },
    { id: 'no-secret', level: 'error', msg: '秘密情報らしき文字列がある', test: (line) => SENSITIVE.filter((r) => r.type === 'apikey').some((r) => { r.re.lastIndex = 0; return r.re.test(line); }) },
    { id: 'no-var', level: 'warning', msg: 'var ではなく const / let を使う', re: /(^|[^\w$.])var\s/ },
    { id: 'no-console', level: 'warning', msg: 'console.log が残っている', re: /\bconsole\.log\s*\(/ },
    { id: 'no-innerhtml', level: 'warning', msg: 'innerHTML への代入は XSS の入口になりやすい', re: /\.innerHTML\s*=/ },
  ];
  function stripStrings(line) {
    // 文字列と行末コメントの中身は解析の対象外にする（'==' という文字列などで誤検知しないため）
    return line.replace(/\/\/.*$/, '').replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '""');
  }
  function lintFile(path, content) {
    const out = [];
    String(content).split('\n').forEach((raw, i) => {
      const line = stripStrings(raw);
      for (const r of LINT_RULES) {
        const hit = r.test ? r.test(raw) : r.re.test(line);
        if (hit) out.push({ path, line: i + 1, rule: r.id, level: r.level, msg: r.msg });
      }
    });
    return out;
  }
  function lintTree(tree) {
    return Object.keys(tree).filter((p) => p.startsWith('src/') && p.endsWith('.js')).sort().flatMap((p) => lintFile(p, tree[p]));
  }

  // ---- CI でテストを動かすジョブ（src/*.js をすべて読み込み、tests/*.test.js をすべて実行） ----
  function ciJob(tree) {
    const files = Object.keys(tree).sort();
    const sources = files.filter((p) => p.startsWith('src/') && p.endsWith('.js')).map((p) => tree[p]);
    const tests = files.filter((p) => p.startsWith('tests/') && p.endsWith('.test.js'));
    return { kind: 'many', files: tests, suites: tests.map((p) => ({ sources, tests: tree[p] })) };
  }
  function summarizeCi(job, results, lint) {
    const tests = [];
    job.files.forEach((file, i) => {
      const r = results[i];
      if (r.error) tests.push({ file, name: '(読み込み)', pass: false, error: r.error });
      for (const t of r.results || []) tests.push({ file, ...t });
    });
    const errors = lint.filter((l) => l.level === 'error');
    const testsOk = tests.length > 0 && tests.every((t) => t.pass);
    return { status: testsOk && errors.length === 0 ? 'success' : 'failure', tests, lint, testsOk, lintOk: errors.length === 0 };
  }

  // ---- FR-050/051 計測 ----
  function emptyMetric() {
    return { ms: 0, failures: 0, hints: 0, questions: 0, submissions: 0 };
  }
  function metricRows(enrollment) {
    const m = (enrollment && enrollment.metrics) || {};
    const off = { ...emptyMetric(), ...(m.off || {}) };
    const on = { ...emptyMetric(), ...(m.on || {}) };
    const est = (enrollment && enrollment.estimate) || {};
    return [
      { mode: 'AIオフ', minutes: off.ms / 60000, failures: off.failures, hints: off.hints, questions: off.questions, estimate: est.off },
      { mode: 'AIオン', minutes: on.ms / 60000, failures: on.failures, hints: on.hints, questions: on.questions, estimate: est.on },
    ];
  }

  RGA.rules = {
    unitById, suggestStart, missingPrereqs, nextUnit,
    assembleAnswer, exerciseJob, gradeExercise, targetMutants,
    STAGE_ORDER, exercisesOf, applyPracticeResult, nextStage,
    scoreExplanation, checkAdoptExplanation, specCoverage, MIN_CHARS,
    detectSensitive, redact, leaksSolution, limitCodeBlocks, codeLines,
    TUTOR_LIMIT_OFF, tutorQuota,
    lintFile, lintTree, ciJob, summarizeCi,
    emptyMetric, metricRows,
  };
})(globalThis);
