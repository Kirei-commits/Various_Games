import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Hint from '../../js/core/hint.js';
import * as Judge from '../../js/core/judge.js';
import * as Choice from '../../js/core/choice.js';
import { BANKS, bankById } from './helpers.mjs';

const q = bankById('java').questions.find((x) => x.id === 'java-eq-1');
const blank = () => Judge.evaluate(q, '');

test('ヒントは3段。段は必ず前へ進み、最後で答えを開示する', () => {
  assert.equal(Hint.REVEAL_STAGE, 3);
  const kinds = [];
  for (let i = 1; i <= Hint.REVEAL_STAGE; i++) {
    const h = Hint.next(q, { attempt: i, result: blank() });
    assert.equal(h.stage, i);
    assert.ok(h.text, `${i}段目が空`);
    kinds.push(h.kind);
  }
  assert.equal(kinds.join(','), 'author,narrow,reveal');
  assert.ok(Hint.next(q, { attempt: Hint.REVEAL_STAGE, result: blank() }).reveal);
});

test('1段目から中身のある手がかりを出す（観点の名前だけで足踏みさせない）', () => {
  const h = Hint.next(q, { attempt: 1, result: blank() });
  assert.equal(h.kind, 'author');
  assert.equal(h.text, q.hints[0], '著者が書いた誘導がそのまま出ていない');
  assert.ok(!h.text.includes('観点'), '観点の名前を並べただけのヒントに戻っている');
});

test('段数を超えて呼んでも最終段に留まる（行き止まりにしない）', () => {
  const h = Hint.next(q, { attempt: 99, result: blank() });
  assert.equal(h.stage, Hint.REVEAL_STAGE);
  assert.ok(h.reveal);
  assert.ok(h.text.includes(q.model));
});

test('誤解を検出したときは1段目でそれを指摘してから誘導する', () => {
  const r = Judge.evaluate(q, 'true です。同じだから。');
  assert.ok(r.traps.length > 0);
  const h = Hint.next(q, { attempt: 1, result: r });
  assert.ok(h.text.startsWith(q.criteria.traps[0].hint));
  assert.ok(h.text.includes(q.hints[0]));
});

test('選択式の2段目は誤答を1つ消す。1段目では答えを出さない', () => {
  const one = Hint.next(q, { attempt: 1, result: blank(), choiceMode: true });
  assert.ok(!one.text.includes(Choice.correctText(q)));

  const gone = q.choices[2];
  const two = Hint.next(q, { attempt: 2, result: blank(), choiceMode: true, eliminated: gone });
  assert.ok(two.text.includes(gone), '消した選択肢が伝わっていない');
  assert.ok(!two.text.includes(Choice.correctText(q)), '2段目で答えを出している');

  const three = Hint.next(q, { attempt: 3, result: blank(), choiceMode: true });
  assert.ok(three.reveal);
  assert.ok(three.text.includes(Choice.correctText(q)));
});

test('記述式の2段目は、著者の2つ目の誘導か、不足語の頭出し', () => {
  const two = Hint.next(q, { attempt: 2, result: blank() });
  assert.equal(two.text, q.hints[1]);

  const thin = { hints: ['ひとつだけ'], model: 'りんごです', criteria: { required: [{ key: 'A', any: ['りんご'] }] } };
  const h = Hint.next(thin, { attempt: 2, result: Judge.evaluate(thin, '') });
  assert.equal(h.kind, 'narrow');
  assert.ok(h.text.includes('○'), '頭出しに繰り上がっていない');
});

test('頭出しは1文字目と文字数だけを見せる', () => {
  assert.equal(Hint.mask('equals'), 'e○○○○○（6文字）');
  assert.equal(Hint.mask('参照'), '参○（2文字）');
});

test('全問題：どの段のヒントも空にならない（記述式・選択式とも）', () => {
  for (const bank of BANKS) {
    for (const question of bank.questions) {
      const r = Judge.evaluate(question, '');
      for (const choiceMode of [false, true]) {
        for (let i = 1; i <= Hint.REVEAL_STAGE; i++) {
          assert.ok(Hint.next(question, { attempt: i, result: r, choiceMode }).text,
            `${question.id} の ${i}段目が空`);
        }
      }
    }
  }
});
