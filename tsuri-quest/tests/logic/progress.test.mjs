import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ } from './helpers.mjs';

const { Fish, Progress } = loadFQ(['fish.js', 'progress.js']);
const aji = Fish.byId('aji');
const ryugu = Fish.byId('ryugu');

test('必要ポイントは単調増加し、最大レベルで打ち切られる', () => {
  for (let lv = 1; lv < Progress.LEVEL_MAX - 1; lv++) {
    assert.ok(Progress.req(lv + 1) > Progress.req(lv), `Lv${lv} の必要量が増えていない`);
  }
  assert.equal(Progress.req(Progress.LEVEL_MAX), Infinity);
});

test('累計ポイントからレベルが正しく求まる（各境界のちょうど手前と直後）', () => {
  assert.equal(Progress.levelFromXp(0), 1);
  for (let lv = 1; lv < Progress.LEVEL_MAX; lv++) {
    const need = Progress.totalFor(lv + 1);
    assert.equal(Progress.levelFromXp(need - 1), lv, `Lv${lv + 1} の1手前で上がってしまう`);
    assert.equal(Progress.levelFromXp(need), lv + 1, `Lv${lv + 1} ちょうどで上がらない`);
  }
  assert.equal(Progress.levelFromXp(1e9), Progress.LEVEL_MAX, '最大レベルを超えない');
});

test('レベル内の進捗は 0〜1 に収まり、最大レベルでは 1 になる', () => {
  for (const xp of [0, 39, 40, 500, 5000, 50000]) {
    const p = Progress.levelProgress(xp);
    assert.ok(p.ratio >= 0 && p.ratio <= 1, `ratio が範囲外: ${p.ratio}`);
    if (p.need) assert.equal(p.into + Progress.totalFor(p.level), xp);
  }
  const max = Progress.levelProgress(Progress.totalFor(Progress.LEVEL_MAX));
  assert.equal(max.level, Progress.LEVEL_MAX);
  assert.equal(max.ratio, 1);
  assert.equal(max.need, 0);
});

test('サイズ倍率は最小で0.6倍、最大で2.0倍、その間は単調増加', () => {
  assert.ok(Math.abs(Progress.sizeMultiplier(aji, aji.min) - 0.6) < 1e-9);
  assert.ok(Math.abs(Progress.sizeMultiplier(aji, aji.max) - 2.0) < 1e-9);
  let prev = -1;
  for (let s = aji.min; s <= aji.max; s += 0.5) {
    const m = Progress.sizeMultiplier(aji, s);
    assert.ok(m > prev, 'サイズ倍率が単調でない');
    prev = m;
  }
  // 範囲外の値を渡してもクランプされる
  assert.equal(Progress.sizeMultiplier(aji, aji.min - 100), 0.6);
  assert.equal(Progress.sizeMultiplier(aji, aji.max + 100), 2.0);
});

test('コンボ倍率は 1.0 から 2.0 で頭打ちになる', () => {
  assert.equal(Progress.comboMultiplier(0), 1);
  assert.ok(Math.abs(Progress.comboMultiplier(5) - 1.5) < 1e-9);
  assert.ok(Math.abs(Progress.comboMultiplier(Progress.COMBO_CAP) - 2) < 1e-9);
  assert.equal(Progress.comboMultiplier(999), Progress.comboMultiplier(Progress.COMBO_CAP));
  assert.equal(Progress.comboMultiplier(-3), 1, '負の値でも 1 を下回らない');
});

test('ポイントは 大きさ × 希少性 で決まる', () => {
  // 同じ相対サイズなら、希少な魚のほうが必ず高い
  const small = Progress.pointsFor({ fish: aji, size: aji.max });
  const big = Progress.pointsFor({ fish: ryugu, size: ryugu.min });
  assert.ok(big > small, '伝説の最小が、コモンの最大を下回っている');

  // 同じ魚ならサイズが大きいほど高い
  assert.ok(
    Progress.pointsFor({ fish: aji, size: aji.max }) >
    Progress.pointsFor({ fish: aji, size: aji.min }) * 3,
    'サイズによる差が小さすぎる'
  );

  // コンボと天候の倍率が掛かる
  const base = Progress.pointsFor({ fish: aji, size: 22 });
  assert.ok(Progress.pointsFor({ fish: aji, size: 22, combo: 10 }) > base);
  assert.ok(Progress.pointsFor({ fish: aji, size: 22, weatherMul: 1.2 }) > base);

  // どんな条件でも 1 ポイントは下回らない
  assert.ok(Progress.pointsFor({ fish: aji, size: aji.min, weatherMul: 0 }) >= 1);
});
