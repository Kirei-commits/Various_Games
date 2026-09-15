import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRR } from './helpers.mjs';

const RR = loadRR();
const { Judge, Banks } = RR;

test('正規化：全角・大文字・空白・句読点の差を吸収する', () => {
  assert.equal(Judge.normalize('ＥＱＵＡＬＳ　です。'), 'equalsです');
  assert.equal(Judge.normalize('「いとしの エリー」'), 'いとしのエリー');
  assert.equal(Judge.normalize('１９７８年'), '1978年');
});

test('正規化：= と + は落とさない（== が空文字になると何にでも一致してしまう）', () => {
  assert.equal(Judge.normalize('a == b'), 'a==b');
  assert.ok(Judge.normalize('==').length === 2);
});

test('緩い照合：ひらがな／カタカナと長音の揺れを吸収する', () => {
  const p = Judge.prepare('えりーは めんばー です');
  assert.ok(Judge.contains(p, 'エリー'));
  assert.ok(Judge.contains(p, 'メンバ'));
  assert.ok(!Judge.contains(p, 'まったく別の語'));
});

test('空の候補語は一致しない（誤って全問正解になるのを防ぐ）', () => {
  const p = Judge.prepare('なんでもよい文字列');
  assert.equal(Judge.contains(p, ''), false);
  assert.equal(Judge.contains(p, '。。。'), false);
});

test('正解は必須観点だけで決まる。加点と誤解検出は正誤を動かさない', () => {
  const q = {
    criteria: {
      required: [{ key: 'A', any: ['りんご'] }],
      optional: [{ key: 'B', any: ['みかん'] }],
      traps: [{ key: 'C', any: ['ぶどう'], hint: 'ぶどうではありません' }]
    }
  };
  const onlyRequired = Judge.evaluate(q, 'りんごです');
  assert.equal(onlyRequired.correct, true);
  assert.equal(onlyRequired.optional[0].hit, false);

  const withTrap = Judge.evaluate(q, 'りんごとぶどう');
  assert.equal(withTrap.correct, true, '誤解検出が当たっても正解は覆らない');
  assert.equal(withTrap.traps.length, 1);

  const onlyOptional = Judge.evaluate(q, 'みかんです');
  assert.equal(onlyOptional.correct, false, '加点だけでは正解にならない');
});

test('空回答は必ず不正解', () => {
  const q = { criteria: { required: [{ key: 'A', any: ['りんご'] }] } };
  assert.equal(Judge.evaluate(q, '').correct, false);
  assert.equal(Judge.evaluate(q, '   ').correct, false);
});

test('判定には、当たった語がそのまま残る（画面の根拠表示がここに依存している）', () => {
  const q = { criteria: { required: [{ key: 'A', any: ['equals', 'イコール'] }] } };
  const r = Judge.evaluate(q, 'EQUALS を使う');
  assert.equal(r.required[0].matched, 'equals');
  assert.equal(r.coverage, 1);
});

test('全問題：模範解答は自分の基準で正解になり、中身の無い回答は通らない', () => {
  const junk = ['', 'わかりません', 'あ', '？'];
  for (const bank of Banks.all()) {
    for (const q of bank.questions) {
      assert.equal(Judge.evaluate(q, q.model).correct, true, `${q.id} の模範解答が通らない`);
      for (const j of junk) {
        assert.equal(Judge.evaluate(q, j).correct, false, `${q.id} が "${j}" で正解になる`);
      }
    }
  }
});
