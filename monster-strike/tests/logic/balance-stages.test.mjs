/**
 * 追加のステージと難しいステージの難しさ（balance.test.mjs から分けた。CI で並列に走らせるため）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, seededRandom } from './helpers.mjs';
import { play } from './bot.mjs';

const mods = loadAll();

/*
 * 2026-09-30 追加の3ステージ（最初の4体・80回）:
 *   ほのおの火山  greedy 12ターンで勝ち / casual 0.64
 *   こおりの神殿  greedy 13ターンで勝ち / casual 0.43
 *   やみの古城    greedy 14ターンで勝ち / casual 0.35（ボス HP 100000）
 * 後のステージほど難しく、ガチャのキャラ（属性の有利・ゲージアビリティ）で楽になる作り。
 */
test('追加の3ステージ: 上手なプレイヤーは最初の4体で勝ち、ふつうのプレイヤーには後ほど難しい', () => {
  const N = 80;
  const rates = [2, 3, 4].map((stage) => {
    const g = play(mods, { policy: 'greedy', stage });
    assert.equal(g.state, 'won', `ステージ${stage}: ${g.state} wave ${g.wave}`);
    let w = 0;
    for (let i = 0; i < N; i++) if (play(mods, { policy: 'casual', stage, random: seededRandom(1000 + i * 7919) }).state === 'won') w++;
    return w / N;
  });
  assert.ok(rates[0] >= 0.45 && rates[0] <= 0.8, `火山 ${rates[0]}`);
  assert.ok(rates[2] >= 0.2 && rates[2] <= 0.55, `古城 ${rates[2]}`);
  assert.ok(rates[0] > rates[1] && rates[1] > rates[2], `難しくなっていく ${rates.join(' / ')}`);
});

/** 最初の5体と、★5 の5体（ガチャで引いた想定） */
function team(ids) {
  const sv = JSON.parse(JSON.stringify(mods.M.newSave(mods.D)));
  for (const id of ids) sv.owned[id] = { luck: 0 };
  mods.M.setParty(sv, mods.D, ids);
  return { ...mods, D: { ...mods.D, units: mods.M.partyUnits(sv, mods.D) } };
}

test('難しいステージ: 天空の聖域と終焉の魔界はガチャの強いキャラで挑む。魔界のほうが難しい', () => {
  const N = 60;
  const strong = team(['AH', 'AI', 'AJ', 'AK', 'AL']);
  const rate = (m, stage) => {
    let w = 0;
    for (let i = 0; i < N; i++) if (play(m, { policy: 'casual', stage, random: seededRandom(1000 + i * 7919) }).state === 'won') w++;
    return w / N;
  };
  assert.ok(rate(mods, 5) <= 0.1, '最初の5体では、ふつうのプレイヤーは天空の聖域にほとんど勝てない');
  for (const stage of [5, 6]) assert.equal(play(strong, { policy: 'greedy', stage }).state, 'won', `★5 の5体なら上手なプレイヤーは勝てる（${stage}）`);
  const sky = rate(strong, 5), abyss = rate(strong, 6);
  assert.ok(sky >= 0.15 && sky <= 0.6, `天空 ${sky}`);
  assert.ok(abyss < sky && abyss <= 0.35, `魔界 ${abyss}`);
});
