import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ } from './helpers.mjs';

const { Gear } = loadFQ(['gear.js']);

test('竿と糸は5段階で、性能もコストも単調に上がる', () => {
  for (const [name, list, key] of [['竿', Gear.RODS, 'reelRate'], ['糸', Gear.LINES, 'breakAt']]) {
    assert.equal(list.length, 5, `${name}の段階数`);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i][key] > list[i - 1][key], `${name}: ${key} が上がっていない`);
      assert.ok(list[i].cost > list[i - 1].cost, `${name}: コストが上がっていない`);
    }
    assert.equal(list[0].cost, 0, `${name}: 初期装備は無料であるべき`);
  }
  // 糸の限界は 1.0 未満（1.0 だと絶対に切れなくなる）
  for (const l of Gear.LINES) assert.ok(l.breakAt > 0 && l.breakAt < 1);
});

test('レベル指定は範囲外でもクランプされる', () => {
  assert.equal(Gear.rod(0).level, 1);
  assert.equal(Gear.rod(99).level, 5);
  assert.equal(Gear.line(-5).level, 1);
  assert.equal(Gear.line(99).level, 5);
  assert.equal(Gear.lure('nonexistent').id, 'none', '未知のエサは素エサに落とす');
});

test('強化はポイントが足りるときだけ成功し、所持ポイントが正しく減る', () => {
  const cost = Gear.upgradeCost('rod', 1);
  assert.equal(Gear.tryUpgrade('rod', 1, cost - 1).ok, false, 'ポイント不足で通ってしまう');
  assert.equal(Gear.tryUpgrade('rod', 1, cost - 1).reason, 'poor');

  const r = Gear.tryUpgrade('rod', 1, cost);
  assert.equal(r.ok, true);
  assert.equal(r.level, 2);
  assert.equal(r.coins, 0);

  assert.equal(Gear.upgradeCost('rod', 5), null, '最大からは強化できない');
  assert.equal(Gear.tryUpgrade('rod', 5, 999999).reason, 'max');
});

test('全段階を強化しきるのに必要な総ポイントが竿と糸で等しい', () => {
  const total = (list) => list.reduce((a, x) => a + x.cost, 0);
  assert.equal(total(Gear.RODS), total(Gear.LINES), 'どちらかが得すぎる設定になっている');
});

test('エサはコストどおりに買え、素エサは買えない', () => {
  assert.equal(Gear.tryBuyLure('none', 1, 9999).ok, false, '素エサは購入対象にしない');
  const jig = Gear.lure('jig');
  assert.equal(Gear.tryBuyLure('jig', 10, jig.cost * 10 - 1).ok, false);
  const r = Gear.tryBuyLure('jig', 10, jig.cost * 10);
  assert.equal(r.ok, true);
  assert.equal(r.count, 10);
  assert.equal(r.coins, 0);
  assert.equal(Gear.tryBuyLure('jig', 0, 99999).count, 1, '0個指定は1個として扱う');
});

test('管理者モードでは0円で買える・強化できる', () => {
  const r = Gear.tryUpgrade('rod', 1, 0, { free: true });
  assert.equal(r.ok, true);
  assert.equal(r.cost, 0);
  assert.equal(r.coins, 0);
  assert.equal(Gear.upgradeCost('rod', 1, { free: true }), 0);
  assert.equal(Gear.upgradeCost('rod', 5, { free: true }), null, '最大は0円でも強化できない');

  const b = Gear.tryBuyLure('chum', 10, 0, { free: true });
  assert.equal(b.ok, true);
  assert.equal(b.cost, 0);
  assert.equal(b.count, 10);
  assert.equal(Gear.tryBuyLure('none', 1, 0, { free: true }).ok, false, '素エサは0円でも買わせない');
});

test('高いエサほど効果が強い（値段と性能が逆転していない）', () => {
  const buyable = Gear.LURES.filter((l) => l.cost > 0);
  const score = (l) => (1 - l.waitMul) + (l.rareBoost - 1) + l.bigBias;
  for (let i = 1; i < buyable.length; i++) {
    assert.ok(buyable[i].cost > buyable[i - 1].cost, 'エサの値段が昇順でない');
  }
  const chum = Gear.lure('chum');
  for (const l of buyable) {
    if (l.id === 'chum') continue;
    assert.ok(score(chum) > score(l), '最高級のエサが最強になっていない');
  }
});
