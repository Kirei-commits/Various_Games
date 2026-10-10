// 遊びやすさ。ボット（人と同じ操作だけで遊ぶ）に実際に遊ばせて確かめる。数値は tools/measure.mjs で測ったもの
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, playOut } from './helpers.mjs';

const ctx = load();
const MID = { atk: 10, rate: 6, base: 6, ammo: 2, start: 1 };
const MAX = { atk: 30, rate: 20, base: 20, ammo: 4, start: 3 };

test('序盤（ステージ1〜5）は強化なしでクリアできる', () => {
  for (let n = 1; n <= 5; n++) {
    let win = 0;
    for (let s = 1; s <= 3; s++) if (playOut(ctx, { n, seed: s }).win) win++;
    assert.ok(win >= 2, `stage ${n}: ${win}/3`);
  }
});

test('1回のプレイは3分前後（2分〜4分）', () => {
  for (const n of [1, 10]) {
    const r = playOut(ctx, { n, seed: 2, meta: MID });
    assert.ok(r.win);
    assert.ok(r.S.t > 120 && r.S.t < 240, `stage ${n}: ${r.S.t.toFixed(0)}秒`);
  }
});

test('強化しないと先へ進めず、強化すれば進める（強化に意味がある）', () => {
  assert.ok(!playOut(ctx, { n: 40, seed: 1 }).win, '強化なしで40はクリアできない');
  assert.ok(playOut(ctx, { n: 40, seed: 1, meta: MID }).win || playOut(ctx, { n: 40, seed: 2, meta: MID }).win, '中くらいの強化なら40をクリアできる');
  assert.ok(!playOut(ctx, { n: 99, seed: 1, meta: MID }).win, '中くらいでは99はクリアできない');
  assert.ok(playOut(ctx, { n: 99, seed: 1, meta: MAX }).win, '最大まで強化すれば99をクリアできる');
});

test('難易度で手ごたえが変わる', () => {
  const hp = d => { let s = 0; for (let i = 1; i <= 3; i++) { const r = playOut(ctx, { n: 18, diff: d, seed: i }); s += r.win ? r.S.baseHp / r.S.baseMax : -1; } return s; };
  assert.ok(hp('easy') > hp('hard'));
});

test('エンドレスはいつか終わり、ウェーブが進む', () => {
  const r = playOut(ctx, { endless: true, seed: 3, maxSec: 1500 });
  assert.equal(r.S.phase, 'lose');
  assert.ok(r.S.wave >= 8, `wave ${r.S.wave}`);
});
