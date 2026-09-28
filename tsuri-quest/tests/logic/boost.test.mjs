import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ } from './helpers.mjs';

const { Boost } = loadFQ(['boost.js']);

test('アイテムはIDが重複せず、効果と表示がそろっている', () => {
  const ids = new Set();
  for (const b of Boost.LIST) {
    assert.equal(ids.has(b.id), false, `IDが重複: ${b.id}`);
    ids.add(b.id);
    assert.ok(b.name && b.desc && b.icon, `${b.id}: 表示用の文言が欠けている`);
    assert.ok(b.cost > 0, `${b.id}: 値段が不正`);
    assert.ok(b.casts > 0, `${b.id}: 効果時間が不正`);
    assert.ok(Object.keys(b.effect).length > 0, `${b.id}: 効果が空`);
  }
});

test('何も発動していなければ素の値', () => {
  const e = Boost.effects(null);
  assert.deepEqual(
    { p: e.pointMul, r: e.rareBoost, b: e.bigBias, w: e.waitMul, k: e.breakBonus },
    { p: 1, r: 1, b: 0, w: 1, k: 0 }
  );
});

test('発動中のブーストが効果に反映され、重ねがけできる', () => {
  const one = Boost.effects({ boost_point: 5 });
  assert.equal(one.pointMul, 2);

  const many = Boost.effects({ boost_point: 5, boost_rare: 3, boost_big: 1, boost_quick: 2, boost_guard: 4 });
  assert.equal(many.pointMul, 2);
  assert.equal(many.rareBoost, 2);
  assert.ok(many.bigBias > 0);
  assert.ok(many.waitMul < 1);
  assert.ok(many.breakBonus > 0);
});

test('残り0や未知のIDは効果に数えない', () => {
  const e = Boost.effects({ boost_point: 0, nonexistent: 99 });
  assert.equal(e.pointMul, 1);
});

test('キャストごとに1つ減り、0になったら消える', () => {
  let active = { boost_point: 2, boost_quick: 1 };
  active = Boost.consume(active);
  assert.deepEqual(Object.keys(active), ['boost_point']);
  assert.equal(active.boost_point, 1);
  active = Boost.consume(active);
  assert.equal(Object.keys(active).length, 0);
  assert.equal(Object.keys(Boost.consume(null)).length, 0, '空でも落ちない');
});

test('同じ種類を重ねると長いほうが残る（短いもので上書きしない）', () => {
  const item = Boost.byId('boost_point');
  const first = Boost.activate({}, 'boost_point');
  assert.equal(first.active.boost_point, item.casts);

  const again = Boost.activate({ boost_point: item.casts + 5 }, 'boost_point');
  assert.equal(again.active.boost_point, item.casts + 5, '残りが短くなってしまった');

  assert.equal(Boost.activate({}, 'nonexistent').ok, false);
});

test('購入はポイントが足りるときだけ通り、管理者モードでは0円', () => {
  const b = Boost.byId('boost_rare');
  assert.equal(Boost.tryBuy('boost_rare', 5, b.cost * 5 - 1).reason, 'poor');
  const r = Boost.tryBuy('boost_rare', 5, b.cost * 5);
  assert.equal(r.ok, true);
  assert.equal(r.count, 5);
  assert.equal(r.coins, 0);
  assert.equal(Boost.tryBuy('boost_rare', 5, 0, { free: true }).ok, true);
  assert.equal(Boost.tryBuy('boost_rare', 0, 9999).count, 1, '0個指定は1個として扱う');
});
