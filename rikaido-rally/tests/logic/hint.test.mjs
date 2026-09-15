import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRR } from './helpers.mjs';

const RR = loadRR();
const { Hint, Judge, Banks } = RR;

const q = Banks.get('java').questions.find((x) => x.id === 'java-eq-1');
const blank = () => Judge.evaluate(q, '');

test('段階は必ず前へ進み、最終段で模範解答を開示する', () => {
  const seen = [];
  for (let i = 1; i <= Hint.REVEAL_STAGE; i++) {
    const h = Hint.next(q, blank(), i);
    assert.equal(h.stage, i);
    assert.ok(h.text, `${i}段目が空`);
    seen.push(h.kind);
  }
  assert.equal(seen[seen.length - 1], 'reveal');
  assert.ok(Hint.next(q, blank(), Hint.REVEAL_STAGE).reveal);
});

test('段数を超えて呼んでも最終段に留まる（行き止まりにしない）', () => {
  const h = Hint.next(q, blank(), 99);
  assert.equal(h.stage, Hint.REVEAL_STAGE);
  assert.ok(h.reveal);
  assert.ok(h.text.includes(q.model));
});

test('1段目は足りない観点の名前を出すが、認める語そのものは出さない', () => {
  const h = Hint.next(q, blank(), 1);
  assert.equal(h.kind, 'focus');
  assert.ok(h.text.includes('結果'), '観点名が出ていない');
  assert.ok(!h.text.includes('参照'), '1段目で答えの語を漏らしている');
});

test('誤解を検出したときは1段目でそれを指摘する', () => {
  const r = Judge.evaluate(q, 'true です。同じだから。');
  assert.ok(r.traps.length > 0);
  const h = Hint.next(q, r, 1);
  assert.ok(h.text.includes(q.criteria.traps[0].hint));
});

test('頭出しは1文字目と文字数だけを見せる', () => {
  assert.equal(Hint.mask('equals'), 'e○○○○○（6文字）');
  assert.equal(Hint.mask('参照'), '参○（2文字）');
  const h = Hint.next(q, blank(), 4);
  assert.equal(h.kind, 'mask');
  assert.ok(h.text.includes('○'));
});

test('著者のヒントが足りない問題でも、段が空振りしない', () => {
  const thin = { hints: ['ひとつだけ'], model: 'もはん', criteria: { required: [{ key: 'A', any: ['りんご'] }] } };
  const r = Judge.evaluate(thin, '');
  for (let i = 1; i <= Hint.REVEAL_STAGE; i++) assert.ok(Hint.next(thin, r, i).text);
  assert.equal(Hint.next(thin, r, 3).kind, 'mask', 'hints[1] が無ければ頭出しへ繰り上がる');
});

test('全問題：どの段のヒントも空にならない', () => {
  for (const bank of Banks.all()) {
    for (const question of bank.questions) {
      const r = Judge.evaluate(question, '');
      for (let i = 1; i <= Hint.REVEAL_STAGE; i++) {
        assert.ok(Hint.next(question, r, i).text, `${question.id} の ${i}段目が空`);
      }
    }
  }
});
