/**
 * ステージのバランスを自動プレイで測る。
 * 数値（HP・攻撃力・ターン数）を触ってここが落ちたら、「バグ」ではなく
 * 「意図した難しさの変更か」を判断し、意図的なら期待値と理由をコミットに残す。
 *
 * 測った値（2026-09-29, teamHp 32000 / ドラゴン HP 45000）:
 *   greedy: 10ターンで勝ち、HP 21000 残り
 *   casual: 勝率 0.73、勝ったときの中央 17ターン
 *   random: 勝率 0.00、ボスまで 97% が到達
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

test('でたらめに撃つと勝てないが、ボスまではたどり着ける', () => {
  const res = many('random');
  const rate = res.filter((r) => r.state === 'won').length / GAMES;
  assert.ok(rate <= 0.1, `勝率 ${rate}`);
  const boss = res.filter((r) => r.wave >= 1).length / GAMES;
  assert.ok(boss >= 0.7, `ボス到達 ${boss}`);
});
