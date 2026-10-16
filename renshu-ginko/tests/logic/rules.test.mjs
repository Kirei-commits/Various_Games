import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const R = RGA.rules;
const { UNITS } = RGA.content;
const u1 = UNITS[0];

test('SHA-256 が標準のテストベクタと一致する', () => {
  assert.equal(RGA.core.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(RGA.core.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(RGA.core.sha256('a'.repeat(1000)), '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  assert.equal(RGA.core.sha256('練習銀行').length, 64);
});

test('FR-001 自己評価から開始レベルを提案する', () => {
  assert.equal(R.suggestStart({ read: 0, debug: 0, git: 0, security: 0, review: 0 }).unitId, 'L1-01');
  assert.equal(R.suggestStart({ read: 3, debug: 3, git: 2, security: 2, review: 1 }).unitId, 'L2-01');
  // デバッグに自信が無ければ合計が高くても L1
  assert.equal(R.suggestStart({ read: 3, debug: 1, git: 3, security: 3, review: 3 }).level, 1);
});

test('FR-002 前提が未修了の単元を見分ける / FR-003 次にやる1単元', () => {
  const l203 = R.unitById('L2-03');
  assert.deepEqual(R.missingPrereqs(l203, {}), ['L2-01']);
  assert.deepEqual(R.missingPrereqs(l203, { 'L2-01': { status: 'done' } }), []);
  assert.equal(R.nextUnit({ user: { startLevel: 1 }, enrollments: {} }).id, 'L1-01');
  assert.equal(R.nextUnit({ user: { startLevel: 1 }, enrollments: { 'L1-01': { status: 'done' } } }).id, 'L1-02');
  assert.equal(R.nextUnit({ user: { startLevel: 1 }, enrollments: { 'L1-03': { status: 'in-progress' } } }).id, 'L1-03');
  assert.equal(R.nextUnit({ user: { startLevel: 2 }, enrollments: {} }).id, 'L1-01', 'L2 の前提が無いうちは L1 の前提なし単元から');
  const allL1 = Object.fromEntries(UNITS.filter((u) => u.level === 1).map((u) => [u.id, { status: 'done' }]));
  assert.equal(R.nextUnit({ user: { startLevel: 1 }, enrollments: allL1 }).id, 'L2-01');
});

test('FR-021 同じ段階で2問続けて正解したら次の段階を提案する（失敗しても数え直さない）', () => {
  const [p1, p2] = R.exercisesOf(u1, 'parsons');
  let p = R.applyPracticeResult({}, u1, p1, true);
  assert.equal(p.suggestNext, false);
  p = R.applyPracticeResult(p, u1, p2, false);
  assert.equal(p.suggestNext, false);
  p = R.applyPracticeResult(p, u1, p2, true);
  assert.equal(p.suggestNext, true);
  assert.equal(p.complete, false);
  const s = R.exercisesOf(u1, 'scratch')[0];
  p = R.applyPracticeResult(p, u1, s, true);
  assert.equal(p.complete, true);
  assert.equal(R.nextStage('parsons'), 'blank');
});

test('FR-012 説明ゲートは観点ごとに採点し、足りない観点を返す', () => {
  const rub = u1.gate;
  const ng = R.scoreExplanation(rub, { what: '金額を円記号とカンマ区切りの文字列にして返す', risk: '' });
  assert.equal(ng.pass, false);
  assert.ok(ng.missing.some((m) => m.includes('マイナス')), JSON.stringify(ng.missing));
  assert.ok(ng.missing.some((m) => m.includes('どこが危ないか')));
  const ok = R.scoreExplanation(rub, { what: '金額を¥とカンマ区切りの文字列にし、マイナスなら符号を前に付ける', risk: '小数は四捨五入で丸めるので端数が消える。文字列が渡されると壊れる' });
  assert.equal(ok.pass, true, JSON.stringify(ok));
  // 全角や大文字でも拾う
  assert.equal(R.scoreExplanation(rub, { what: '金額を￥とカンマ区切りで表示し、マイナスの符号を付ける', risk: 'ＮａＮ が来たときにおかしな表示になる危険' }).pass, true);
});

test('FR-014 取り込み前の説明は未入力なら拒否、観点は助言だけ', () => {
  const rv = u1.aiTask.review;
  assert.equal(R.checkAdoptExplanation(rv, { what: '', risk: '' }).ok, false);
  const r = R.checkAdoptExplanation(rv, { what: '明細の1行を作る関数です', risk: '大きい金額で表示がおかしくなるかも' });
  assert.equal(r.ok, true);
  assert.ok(r.advice.length >= 1);
});

test('AIオン: 仕様の網羅で AI の下書きが変わる', () => {
  const t = u1.aiTask;
  assert.equal(R.specCoverage(t, '明細の1行を作る').complete, false);
  assert.equal(R.specCoverage(t, '出金のときはマイナスで表示する。メモが無いときは付けない。').complete, true);
});

test('FR-031 正解と5行以上一致する回答を見つける / 3行を超えるコードブロックは伏せる', () => {
  const sol = UNITS[1].exercises.find((e) => e.stage === 'scratch').solution;
  assert.equal(R.leaksSolution('こう書けます:\n```js\n' + sol + '\n```', sol), true);
  const four = sol.split('\n').slice(0, 4).join('\n');
  assert.equal(R.leaksSolution(four, sol), false, '4行までは漏えいとみなさない');
  assert.equal(R.leaksSolution('ループの中で total を更新しましょう。', sol), false);
  assert.ok(!R.limitCodeBlocks('```js\na\nb\nc\nd\n```').includes('a\nb'));
  assert.ok(R.limitCodeBlocks('```\na\nb\n```').includes('a\nb'));
});

test('FR-032 / 6章 チューターの回数: AIオフは10回、AIオンは無制限', () => {
  assert.equal(R.tutorQuota({ tutorOffCount: 3 }, 'off').remaining, 7);
  assert.equal(R.tutorQuota({ tutorOffCount: 12 }, 'off').remaining, 0);
  assert.equal(R.tutorQuota({ tutorOnCount: 99 }, 'on').limited, false);
});

test('FR-042 静的解析', () => {
  const lint = R.lintFile('src/a.js', "var x = 1;\nif (a == b) eval('x');\nconst s = 'a == b';\nconsole.log(x);\nconst k = 'sk-ant-api03-abcdefghijklmnopqrstu';");
  const rules = lint.map((l) => l.rule + ':' + l.line);
  assert.ok(rules.includes('no-var:1'));
  assert.ok(rules.includes('eqeqeq:2'));
  assert.ok(rules.includes('no-eval:2'));
  assert.ok(!rules.includes('eqeqeq:3'), '文字列の中は対象外');
  assert.ok(rules.includes('no-console:4'));
  assert.ok(rules.includes('no-secret:5'));
  assert.deepEqual(R.lintFile('src/a.js', 'if (a === b && c !== d) x = 1;'), []);
});

test('CI: src を全部読み込んで tests を全部実行する', () => {
  const tree = { ...RGA.content.REPO_TEMPLATE, 'src/format.js': u1.aiTask.good, 'tests/format.test.js': u1.aiTask.tests };
  const job = R.ciJob(tree);
  const results = RGA.runner.runJob(job);
  const ci = R.summarizeCi(job, results, R.lintTree(tree));
  assert.equal(ci.status, 'success', JSON.stringify(ci));
  assert.equal(ci.tests.length, 6);
  const bad = { ...tree, 'src/format.js': u1.aiTask.buggy };
  const ci2 = R.summarizeCi(R.ciJob(bad), RGA.runner.runJob(R.ciJob(bad)), R.lintTree(bad));
  assert.equal(ci2.status, 'failure');
});

test('テストを書く課題: 正しい実装で通り、狙った変異体で落ちれば合格', () => {
  const u = R.unitById('L1-04');
  const ex = u.exercises.find((e) => e.id === 'L1-04-p1');
  const weak = "test('件数', () => { expect(latest([{ date: '2026-04-01' }], 1).length).toBe(1); });";
  const g = R.gradeExercise(u, ex, RGA.runner.runJob(R.exerciseJob(u, ex, weak)), weak);
  assert.equal(g.pass, false);
  assert.equal(g.rows[0].pass, true, '正しい実装では通る');
  assert.equal(g.rows[1].pass, false, '古い順の変異体を見逃す');
});

test('runner: 構文エラー・実行時エラー・テスト0本を区別する', () => {
  const run = RGA.runner.runSuite;
  assert.match(run({ sources: ['function ('], tests: '' }).error, /構文エラー/);
  const r = run({ sources: ['function f() { return x; }'], tests: "test('t', () => { expect(f()).toBe(1); });" });
  assert.match(r.results[0].error, /ReferenceError/);
  assert.match(run({ sources: [''], tests: '' }).error, /1つもありません/);
  const f = run({ sources: ['const f = () => 2;'], tests: "test('t', () => { expect(f()).toBe(1); });" });
  assert.deepEqual([f.results[0].expected, f.results[0].actual], ['1', '2']);
});
