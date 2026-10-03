/**
 * v7: ウルトラ進化を前提にした難しさ（ステージ8〜10・ゴッド）。重いので別のファイル（CI で並列に走る）。
 *
 * 2026-10-03 測った値（ウルトラ進化した ★5 の5体 AH〜AL、ラック10、ノーマル。casual 16回）:
 *   煉獄の火口 / 星海の回廊 / 混沌の玉座 … 下の MEASURED
 *   +5 の ★5（ウルトラ進化なし）は3つとも最初のウェーブで負ける
 * ゴッド（敵の HP ×250・攻撃 ×6）: 終焉の魔界はウルトラ進化した LR なら greedy 28ターンで勝ち（casual 0.88）、
 *   ウルトラ進化した ★5 では 80ターンで倒しきれない
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, seededRandom } from './helpers.mjs';
import { play } from './bot.mjs';

const mods = loadAll();

function team(ids, { plus = 5, ultra = false } = {}) {
  const sv = JSON.parse(JSON.stringify(mods.M.newSave(mods.D)));
  for (const id of ids) sv.owned[id] = { luck: 10, plus, stock: 0, ultra };
  mods.M.setParty(sv, mods.D, ids);
  return { ...mods, D: { ...mods.D, units: mods.M.partyUnits(sv, mods.D) } };
}
const SSR = ['AH', 'AI', 'AJ', 'AK', 'AL'], LR = ['BD', 'BE', 'BF', 'BG', 'BH'];

test('ステージ8〜10: ウルトラ進化なしの ★5 では勝てず、ウルトラ進化した ★5 なら上手な人は勝てる。後のステージほど難しい', () => {
  const plain = team(SSR), ultra = team(SSR, { ultra: true });
  assert.notEqual(play(plain, { policy: 'greedy', stage: 7, mode: 'normal' }).state, 'won', '+5 の ★5 では煉獄の火口に勝てない');
  const N = 12;
  const rates = [7, 8, 9].map((stage) => {
    assert.equal(play(ultra, { policy: 'greedy', stage, mode: 'normal' }).state, 'won', `ステージ${stage + 1}`);
    let w = 0;
    for (let i = 0; i < N; i++) if (play(ultra, { policy: 'casual', stage, mode: 'normal', random: seededRandom(1000 + i * 7919) }).state === 'won') w++;
    return w / N;
  });
  assert.ok(rates[0] >= 0.3, `煉獄の火口 ${rates[0]}`);
  assert.ok(rates[0] > rates[2] && rates[1] > rates[2], `混沌の玉座がいちばん難しい ${rates.join(' / ')}`);
  assert.ok(rates[2] <= 0.45, `混沌の玉座 ${rates[2]}`);
});

test('ゴッド: 終焉の魔界はウルトラ進化した LR なら勝てるが、ウルトラ進化した ★5 では勝てない', () => {
  assert.equal(play(team(LR, { ultra: true }), { policy: 'greedy', stage: 6, mode: 'god' }).state, 'won');
  assert.notEqual(play(team(SSR, { ultra: true }), { policy: 'greedy', stage: 6, mode: 'god', maxTurns: 40 }).state, 'won');
});
