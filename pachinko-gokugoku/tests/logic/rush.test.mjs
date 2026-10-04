// RUSH の継続率: 理論値（1-(1-p)^100）と、実際の抽選で RUSH をまわした実測値が一致するか
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, simulateRush } from './helpers.mjs';

const mods = load();
const th = mods.Spec.theory(mods.cfg);

test('実際の抽選で2万回 RUSH をまわすと継続率が理論値どおり', () => {
  const sets = 20000, got = simulateRush(mods, sets);
  const sd = Math.sqrt(th.continuation * (1 - th.continuation) / sets);
  assert.ok(Math.abs(got - th.continuation) < 4 * sd, `実測 ${got} / 理論 ${th.continuation}`);
  const [lo, hi] = mods.cfg.targets.continuation;
  assert.ok(got > lo - 0.01 && got < hi + 0.01, `実測 ${got} が目標から外れすぎ`);
});

test('目標の継続率を変えると当りの個数が追従する', () => {
  for (const target of [0.5, 0.7, 0.9]) {
    const m = load({ spec: { rush: { targetContinuation: target } } });
    const t = m.Spec.theory(m.cfg);
    assert.ok(Math.abs(t.continuation - target) < 0.002, `目標 ${target} → 理論 ${t.continuation}`);
  }
});

test('RUSH の当りは ALL 1500個（10R）', () => {
  assert.equal(th.payoutFever, 1500);
});
