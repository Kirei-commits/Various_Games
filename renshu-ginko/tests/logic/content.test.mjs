// コンテンツの検査: お手本は通り、バグ入りは落ち、AIの下書きは仕様どおりに振る舞う
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const { UNITS, STAGES, AREAS } = RGA.content;
const { runSuite, runJob } = RGA.runner;
const R = RGA.rules;

test('単元がそろっている（L1 10本・L2 10本）、レベル → ID の順に並ぶ', () => {
  assert.equal(UNITS.filter((u) => u.level === 1).length, 10);
  assert.equal(UNITS.filter((u) => u.level === 2).length, 10);
  assert.deepEqual(UNITS.map((u) => u.id), UNITS.map((u) => u.id).slice().sort());
  assert.equal(new Set(UNITS.map((u) => u.id)).size, UNITS.length);
});

test('単元のメタデータがそろっている（3章）', () => {
  for (const u of UNITS) {
    assert.ok(AREAS.some((a) => a.id === u.area), u.id);
    assert.ok(u.goals.length >= 1 && u.goals.length <= 3, u.id + ' 学習目標は1〜3個');
    assert.ok(u.evidence && u.estMinutes > 0, u.id);
    for (const pre of u.prereq) assert.ok(UNITS.some((x) => x.id === pre), u.id + ' の前提 ' + pre);
    assert.ok(u.predict.length >= 1, u.id);
    for (const q of u.predict) assert.ok(q.answer >= 0 && q.answer < q.choices.length, u.id);
    assert.ok(u.gate.what.points.length >= u.gate.what.min && u.gate.risk.points.length >= u.gate.risk.min, u.id);
  }
});

test('練習は4段階（parsons 2・blank 2・fix 2・scratch 1）で、ヒントは3段階（FR-020/023）', () => {
  for (const u of UNITS) {
    const count = Object.fromEntries(STAGES.map((s) => [s.id, R.exercisesOf(u, s.id).length]));
    assert.deepEqual(count, { parsons: 2, blank: 2, fix: 2, scratch: 1 }, u.id);
    for (const ex of u.exercises) assert.equal(ex.hints.length, 3, ex.id);
  }
});

function grade(u, ex, answer) {
  const result = runJob(R.exerciseJob(u, ex, answer));
  return R.gradeExercise(u, ex, result, answer);
}

for (const u of UNITS) {
  test(u.id + ' のお手本はすべて合格し、手を付けていない状態では不合格', () => {
    for (const ex of u.exercises) {
      const ok = grade(u, ex, ex.solution);
      assert.ok(ok.pass, ex.id + ' のお手本が不合格: ' + JSON.stringify(ok));
      if (ex.stage === 'fix' || ex.stage === 'scratch') {
        const ng = grade(u, ex, ex.code);
        assert.ok(!ng.pass, ex.id + ' の初期コードが合格してしまう');
      }
      if (ex.stage === 'parsons') {
        // 使わない行を混ぜると不合格（どこに混ぜても）
        for (let i = 1; i < ex.lines.length; i++) {
          const order = [...ex.lines.slice(0, i), ...ex.distractors, ...ex.lines.slice(i)];
          assert.ok(!grade(u, ex, order.join('\n')).pass, ex.id + ' 使わない行を ' + i + ' 行目に入れても合格してしまう');
        }
      }
      if (ex.stage === 'blank') {
        const empty = RGA.content.fillBlanks(ex.template, []);
        assert.ok(!grade(u, ex, empty).pass, ex.id + ' 空欄のままで合格してしまう');
      }
    }
  });

  test(u.id + ' AIの下書き: 良い版は受け入れテストに通り、仕様不足の版は落ちる', () => {
    const t = u.aiTask;
    const good = runSuite({ sources: [t.good], tests: t.tests });
    assert.ok(good.ok, u.id + ' 良い版が落ちる: ' + JSON.stringify(good));
    const bad = runSuite({ sources: [t.buggy], tests: t.tests });
    assert.ok(!bad.ok, u.id + ' 仕様不足の版が通ってしまう');
    assert.ok(t.specGroups.length >= 1 && t.file.startsWith('src/') && t.testFile.startsWith('tests/'));
    assert.deepEqual(R.lintFile(t.file, t.good).filter((l) => l.level === 'error'), [], u.id + ' 良い版が静的解析で落ちる');
  });
}

test('AIの下書きを全部いっしょに読み込んでも名前がぶつからない（CI は src/ を全部読む）', () => {
  const sources = [RGA.content.REPO_TEMPLATE['src/bank.js'], ...UNITS.map((u) => u.aiTask.good)];
  for (const u of UNITS) {
    const r = runSuite({ sources, tests: u.aiTask.tests });
    assert.ok(r.ok, u.id + ': ' + JSON.stringify(r));
  }
});

test('練習銀行のプレビュー（成長の演出）は全部の機能がそろうと動く', () => {
  const sources = UNITS.map((u) => u.aiTask.good);
  const exprs = UNITS.flatMap((u) => u.demos.map((d) => d.expr));
  const out = RGA.runner.runEvals({ sources, evals: exprs });
  out.forEach((o, i) => assert.ok(!o.error, exprs[i] + ' → ' + o.error));
});
