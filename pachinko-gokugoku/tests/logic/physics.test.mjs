// 物理（src/pure/physics.js）: 球が流れる割合が目標どおりか、止まり球・はみ出しが無いか
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, shoot } from './helpers.mjs';

const mods = load();
const T = mods.cfg.targets;

test('左打ち: ヘソ入賞率が目標の範囲、止まり球もはみ出しも無い', () => {
  let heso = 0, launched = 0;
  for (const seed of [1, 2, 3]) {
    const s = shoot(mods, { balls: 500, seed });
    assert.equal(s.stuck, 0, `止まり球 ${s.stuck}（seed ${seed}）`);
    assert.equal(s.escaped, 0, `盤面の外へ ${s.escaped}`);
    assert.equal(s.attacker + s.denchu, 0, '左打ちでアタッカー・電チューに入らない');
    heso += s.heso; launched += s.launched;
  }
  const rate = heso / launched;
  assert.ok(rate >= T.hesoRate[0] && rate <= T.hesoRate[1], `ヘソ入賞率 1/${(1 / rate).toFixed(1)}`);
});

test('右打ち＋アタッカー開放: ほとんどアタッカーに入り、ヘソには入らない', () => {
  const s = shoot(mods, { balls: 400, strong: true, attacker: true, seed: 4 });
  assert.equal(s.stuck, 0); assert.equal(s.escaped, 0);
  assert.ok(s.attacker / s.launched >= T.attackerCatch, `アタッカー ${s.attacker}/${s.launched}`);
  assert.ok(s.heso <= 2, `右打ちでヘソ ${s.heso}`);
});

test('右打ち＋電チュー開放: ほとんど電チューに入る', () => {
  const s = shoot(mods, { balls: 400, strong: true, denchu: true, seed: 5 });
  assert.equal(s.stuck, 0); assert.equal(s.escaped, 0);
  assert.ok(s.denchu / s.launched >= T.denchuCatch, `電チュー ${s.denchu}/${s.launched}`);
});

test('同じシードなら同じ結果（決定的）', () => {
  assert.deepEqual(shoot(mods, { balls: 120, seed: 9 }), shoot(mods, { balls: 120, seed: 9 }));
});

test('ワープ率を0にするとヘソにほぼ入らない（ステージ経由が主な入賞ルート）', () => {
  const m = load({ physics: { warpRate: 0 } });
  const s = shoot(m, { balls: 400, seed: 6 });
  assert.ok(s.heso / s.launched < 0.05, `ワープなしのヘソ ${s.heso}/${s.launched}`);
});
