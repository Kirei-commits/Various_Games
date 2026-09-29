/**
 * ステージのバランスを自動プレイで測る。
 * 数値（HP・攻撃力・ターン数）を触ってここが落ちたら、「バグ」ではなく
 * 「意図した難しさの変更か」を判断し、意図的なら期待値と理由をコミットに残す。
 *
 * 測った値（2026-09-29 フェーズ4, ダメージウォール・重力バリアあり, teamHp 34000 / ドラゴン HP 55000）:
 *   greedy: 11ターンで勝ち、HP 19700 残り。ダメージウォールに触れたのは1回（2回はアンチで無効）
 *   casual: 勝率 0.75、勝ったときの中央 17ターン
 *           アビリティを外すと 0.43、友情コンボを外すと 0.04
 *   random: 勝率 0.00、ボスまで 100% が到達
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, seededRandom } from './helpers.mjs';
import { play } from './bot.mjs';

const mods = loadAll();
const GAMES = 150;
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

function many(policy) {
  const res = [];
  for (let i = 0; i < GAMES; i++) res.push(play(mods, { policy, random: seededRandom(1000 + i * 7919) }));
  return res;
}

test('上手なプレイヤー（全候補を先読み）は余裕を持って勝つ', () => {
  const r = play(mods, { policy: 'greedy' });
  assert.equal(r.state, 'won');
  assert.ok(r.turns >= 6 && r.turns <= 16, `${r.turns}ターン`);
  assert.ok(r.hp >= mods.D.stage.teamHp * 0.3, `残りHP ${r.hp}`);
  assert.ok(r.stats.weak > 0, '弱点をねらう価値がある');
});

test('ふつうのプレイヤーは、だいたい勝てるが負けることもある', () => {
  const res = many('casual');
  const rate = res.filter((r) => r.state === 'won').length / GAMES;
  assert.ok(rate >= 0.55 && rate <= 0.9, `勝率 ${rate}`);
  const t = median(res.filter((r) => r.state === 'won').map((r) => r.turns));
  assert.ok(t >= 10 && t <= 24, `中央 ${t}ターン`);
});

test('友情コンボはふつうのプレイヤーの勝ち負けを分けるほど効く', () => {
  const noCombo = { ...mods, D: { units: mods.D.units.map((u) => ({ ...u, combo: null })), stage: mods.D.stage } };
  const rate = (m) => {
    let w = 0;
    for (let i = 0; i < GAMES; i++) if (play(m, { policy: 'casual', random: seededRandom(1000 + i * 7919) }).state === 'won') w++;
    return w / GAMES;
  };
  const withC = rate(mods), without = rate(noCombo);
  assert.ok(withC - without >= 0.3, `コンボあり ${withC} / なし ${without}`);
  const g = play(mods, { policy: 'greedy' });
  assert.ok(g.stats.combos >= 3, `上手なプレイヤーはコンボをねらう（${g.stats.combos}回）`);
});

test('アビリティ（アンチダメージウォール・アンチ重力バリア）はギミックへの備えとして効く', () => {
  const noAbility = { ...mods, D: { units: mods.D.units.map((u) => ({ ...u, abilities: [] })), stage: mods.D.stage } };
  const run = (m) => {
    let w = 0, dw = 0, turns = 0;
    for (let i = 0; i < GAMES; i++) {
      const r = play(m, { policy: 'casual', random: seededRandom(1000 + i * 7919) });
      if (r.state === 'won') w++;
      dw += r.stats.dwHits; turns += r.turns;
    }
    return { rate: w / GAMES, dwPerTurn: dw / turns };
  };
  const withA = run(mods), without = run(noAbility);
  assert.ok(withA.rate - without.rate >= 0.15, `アビリティあり ${withA.rate} / なし ${without.rate}`);
  assert.ok(without.dwPerTurn > withA.dwPerTurn, 'アビリティが無いとダメージウォールで削られる回数が増える');
});

test('上手なプレイヤーはダメージウォールをほとんど踏まない', () => {
  const g = play(mods, { policy: 'greedy' });
  assert.ok(g.stats.dwHits <= 3, `${g.stats.dwHits}回`);
});

test('でたらめに撃つと勝てないが、ボスまではたどり着ける', () => {
  const res = many('random');
  const rate = res.filter((r) => r.state === 'won').length / GAMES;
  assert.ok(rate <= 0.1, `勝率 ${rate}`);
  const boss = res.filter((r) => r.wave >= 1).length / GAMES;
  assert.ok(boss >= 0.7, `ボス到達 ${boss}`);
});
