import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Judge from '../../js/core/judge.js';
import * as Rally from '../../js/core/rally.js';
import { coverage } from '../../js/core/banks.js';
import { BANKS } from './helpers.mjs';

const every = (fn) => {
  for (const bank of BANKS) for (const q of bank.questions) fn(q, bank);
};

test('問題集は2つあり、どちらも単元ごとに L1〜L5 が揃っている', () => {
  assert.ok(BANKS.length >= 2);
  for (const bank of BANKS) {
    for (const c of coverage(bank)) {
      for (let L = 1; L <= 5; L++) {
        assert.ok(c.levels[L] >= 1, `${bank.id}/${c.unit.id} に L${L} が無い`);
      }
    }
  }
});

test('設問文をそのまま貼り付けても正解にならない（問題が答えを漏らしていない）', () => {
  every((q) => {
    assert.equal(Judge.evaluate(q, q.prompt).correct, false, `${q.id} は設問文だけで正解になる`);
  });
});

test('模範解答には、必ず出典と「なぜその基準か」が添えられている', () => {
  every((q) => {
    assert.ok(q.source && q.source.length > 5, `${q.id} の出典が薄い`);
    assert.ok(q.why && q.why.length > 20, `${q.id} の基準の理由が薄い`);
  });
});

test('必須観点は多くても3つ。レベルが上がるほど増える傾向にする', () => {
  every((q) => {
    assert.ok(q.criteria.required.length >= 1 && q.criteria.required.length <= 3,
      `${q.id} の必須観点が ${q.criteria.required.length} 件`);
  });
  for (const bank of BANKS) {
    const avg = (lv) => {
      const qs = bank.questions.filter((q) => q.level === lv);
      return qs.reduce((a, q) => a + q.criteria.required.length, 0) / qs.length;
    };
    assert.ok(avg(5) >= avg(1), `${bank.id}: L5 の必須観点が L1 より少ない`);
  }
});

test('誤解検出は、それ自体では正誤を動かさない', () => {
  every((q) => {
    for (const t of q.criteria.traps || []) {
      for (const w of t.any) {
        assert.equal(Judge.evaluate(q, w).correct, false, `${q.id}: 誤解の語 "${w}" だけで正解になる`);
      }
    }
  });
});

test('どの問題も、いずれかのラリーで実際に出題されうる', () => {
  // レベルの階段は結果で動くので、順調な人・少し詰まる人・かなり詰まる人の3通りを回す。
  // 全問一発正解だけだと段が 2→3→4→5→5 にしか進まず、L1 に一度も触れない。
  const seen = new Set();
  for (const bank of BANKS) {
    for (let seed = 0; seed < 120; seed++) {
      const history = { [bank.id]: {} };
      bank.units.forEach((u, i) => { history[bank.id][u.id] = { plays: 1, lastScore: (seed + i * 17) % 100, lastAt: i }; });

      for (const hist of [{}, history]) {
        for (const wrongTimes of [0, 1, 2]) {
          const sess = Rally.create(bank, hist, seed);
          for (let i = 0; i < sess.size; i++) {
            seen.add(Rally.current(sess).id);
            for (let w = 0; w < wrongTimes; w++) Rally.submit(sess, 'まったく的外れな回答');
            Rally.submit(sess, Rally.current(sess).model);
            Rally.advance(sess);
          }
        }
      }
    }
    for (const q of bank.questions) {
      assert.ok(seen.has(q.id), `${q.id} は一度も出題されなかった（品揃えか選定規則の穴）`);
    }
  }
});
