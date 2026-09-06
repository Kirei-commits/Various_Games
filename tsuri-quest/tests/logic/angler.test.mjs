import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ } from './helpers.mjs';

const { Angler } = loadFQ(['angler.js']);

test('必要経験値は単調増加し、最大レベルで打ち切られる', () => {
  for (let lv = 1; lv < Angler.LEVEL_MAX - 1; lv++) {
    assert.ok(Angler.req(lv + 1) > Angler.req(lv), `Lv${lv} の必要量が増えていない`);
  }
  assert.equal(Angler.req(Angler.LEVEL_MAX), Infinity);
});

test('経験値からレベルが正しく求まる（各境界のちょうど手前と直後）', () => {
  assert.equal(Angler.levelFromXp(0), 1);
  for (let lv = 1; lv < Angler.LEVEL_MAX; lv++) {
    const need = Angler.totalFor(lv + 1);
    assert.equal(Angler.levelFromXp(need - 1), lv);
    assert.equal(Angler.levelFromXp(need), lv + 1);
  }
  assert.equal(Angler.levelFromXp(1e9), Angler.LEVEL_MAX, '最大レベルを超えない');
});

test('釣ってもバラしても経験値が入り、レアなほど多い', () => {
  assert.ok(Angler.xpFor({ type: 'missed' }) > 0, 'バラシで何も入らない');
  assert.ok(Angler.xpFor({ type: 'landed', stars: 1 }) > Angler.xpFor({ type: 'missed' }));
  for (let s = 2; s <= 5; s++) {
    assert.ok(
      Angler.xpFor({ type: 'landed', stars: s }) > Angler.xpFor({ type: 'landed', stars: s - 1 }),
      `★${s} のほうが少ない`
    );
  }
  assert.equal(Angler.xpFor(null), 0);
  assert.equal(Angler.xpFor({ type: 'bite' }), 0, '当たっただけでは入らない');
});

test('恩恵はレベルとともに一方向に良くなる（悪くなる項目がない）', () => {
  let prev = Angler.perks(1);
  for (let lv = 2; lv <= Angler.LEVEL_MAX; lv++) {
    const p = Angler.perks(lv);
    assert.ok(p.biteBonusMs > prev.biteBonusMs, `Lv${lv}: 合わせの猶予が伸びていない`);
    assert.ok(p.waitMul < prev.waitMul, `Lv${lv}: 待ち時間が短くなっていない`);
    assert.ok(p.reelMul > prev.reelMul, `Lv${lv}: 取り込みが速くなっていない`);
    assert.ok(p.breakBonus > prev.breakBonus, `Lv${lv}: 糸が強くなっていない`);
    assert.ok(p.comboGuard > prev.comboGuard, `Lv${lv}: コンボ保護が上がっていない`);
    prev = p;
  }
});

test('Lv1 は素の状態で、恩恵は行き過ぎない', () => {
  const p1 = Angler.perks(1);
  assert.equal(p1.biteBonusMs, 0);
  assert.equal(p1.waitMul, 1);
  assert.equal(p1.reelMul, 1);
  assert.equal(p1.breakBonus, 0);
  assert.equal(p1.comboGuard, 0);

  const max = Angler.perks(Angler.LEVEL_MAX);
  assert.ok(max.waitMul > 0.5, '待ち時間が短くなりすぎ（釣りが成立しない）');
  assert.ok(max.breakBonus < 0.2, '糸が強くなりすぎ');
  assert.ok(max.comboGuard < 1, 'コンボが絶対に切れなくなっている');
});

test('レベルの範囲外を渡してもクランプされる', () => {
  assert.deepEqual(Angler.perks(0), Angler.perks(1));
  assert.deepEqual(Angler.perks(999), Angler.perks(Angler.LEVEL_MAX));
});

test('画面に出す説明はレベルごとに5項目そろう', () => {
  for (const lv of [1, 10, Angler.LEVEL_MAX]) {
    const rows = Angler.describe(lv);
    assert.equal(rows.length, 5);
    for (const r of rows) {
      assert.ok(r.label && r.value, `Lv${lv}: 表示が欠けている`);
    }
  }
});
