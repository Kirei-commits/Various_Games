import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRR } from './helpers.mjs';

const RR = loadRR();
const { Grade } = RR;

const rec = (over = {}) => Object.assign(
  { level: 3, hintsUsed: 0, revealed: false, optionalHit: 0, optionalTotal: 0, cleared: true }, over);

test('ヒントが増えるほど到達点は必ず下がる（同点で並ばない）', () => {
  const scores = [0, 1, 2, 3, 4].map((h) => Grade.scoreOne(rec({ hintsUsed: h })));
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i] < scores[i - 1], `${i}回目で下がっていない`);
  assert.equal(scores[0], 1);
});

test('模範解答を見てからの正解は、どのヒント回数より低い', () => {
  const revealed = Grade.scoreOne(rec({ hintsUsed: 5, revealed: true }));
  assert.ok(revealed < Grade.BASE_BY_HINTS[Grade.BASE_BY_HINTS.length - 1]);
});

test('加点観点は上限つきで、1.0 を超えない', () => {
  assert.equal(Grade.scoreOne(rec({ hintsUsed: 1, optionalHit: 2, optionalTotal: 2 })), 0.85);
  assert.equal(Grade.scoreOne(rec({ hintsUsed: 0, optionalHit: 2, optionalTotal: 2 })), 1);
});

test('毎問ヒント1回で加点を満額取っても A には届かない（伴走ぶんは必ず差が出る）', () => {
  const helped = [1, 2, 3, 4, 5].map((L) => rec({ level: L, hintsUsed: 1, optionalHit: 1, optionalTotal: 1 }));
  assert.ok(Grade.scoreRally(helped) < 90, `A の下限に届いてしまう: ${Grade.scoreRally(helped)}`);
});

test('レベルが高い問題ほど重い。ただし差は2倍まで', () => {
  assert.ok(Grade.levelWeight(5) > Grade.levelWeight(1));
  assert.equal(Grade.levelWeight(5) / Grade.levelWeight(1), 2);
});

test('全問一発正解は A、全問ヒント2回は A にならない', () => {
  const perfect = [1, 2, 3, 4, 5].map((L) => rec({ level: L }));
  assert.equal(Grade.gradeOf(Grade.scoreRally(perfect)).grade, 'A');

  const struggled = [1, 2, 3, 4, 5].map((L) => rec({ level: L, hintsUsed: 2 }));
  assert.notEqual(Grade.gradeOf(Grade.scoreRally(struggled)).grade, 'A');
});

test('全問で模範解答を見たら E', () => {
  const worst = [1, 2, 3, 4, 5].map((L) => rec({ level: L, hintsUsed: 5, revealed: true }));
  assert.equal(Grade.gradeOf(Grade.scoreRally(worst)).grade, 'E');
});

test('評価の境目は A>B>C>D>E の順で、隙間も重なりも無い', () => {
  // Grade.SCALE は vm の中で作られた配列なので、realm をまたぐ deepEqual は使わない
  const g = Array.from(Grade.SCALE, (s) => s.grade);
  assert.equal(g.join(','), 'A,B,C,D,E');
  for (let i = 1; i < Grade.SCALE.length; i++) {
    assert.ok(Grade.SCALE[i].min < Grade.SCALE[i - 1].min);
  }
  assert.equal(Grade.gradeOf(0).grade, 'E');
  assert.equal(Grade.gradeOf(100).grade, 'A');
  for (const s of Grade.SCALE) assert.equal(Grade.gradeOf(s.min).grade, s.grade, `${s.grade} の下限ちょうどが ${s.grade} でない`);
});

test('次の評価までの差分は、そのぶん足せば実際に上がる値になっている', () => {
  for (const score of [12, 39.9, 55, 74.9, 89.9]) {
    const n = Grade.toNext(score);
    assert.ok(n, `${score} で次が取れない`);
    assert.equal(Grade.gradeOf(score + n.need).grade, n.grade);
  }
  assert.equal(Grade.toNext(100), null);
});

test('弱点は失点の大きい順に並ぶ。取りこぼしが無ければ空', () => {
  const recs = [
    rec({ level: 5, hintsUsed: 3, qid: 'big' }),
    rec({ level: 1, hintsUsed: 1, qid: 'small' }),
    rec({ level: 4, hintsUsed: 0, qid: 'clean' })
  ];
  const w = Grade.weakPoints(recs);
  assert.equal(Array.from(w, (x) => x.qid).join(','), 'big,small');
  assert.equal(Grade.weakPoints([rec()]).length, 0);
});
