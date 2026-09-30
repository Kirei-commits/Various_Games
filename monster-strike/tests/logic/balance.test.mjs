/**
 * ステージのバランスを自動プレイで測る。
 * 数値（HP・攻撃力・ターン数）を触ってここが落ちたら、「バグ」ではなく
 * 「意図した難しさの変更か」を判断し、意図的なら期待値と理由をコミットに残す。
 *
 * 測った値（2026-09-29 フェーズ6〜8, SS・超アンチ・翼の当たり判定あり）
 * はじまりの草原（チームHP 34000 / ドラゴン HP 75000、敵の攻撃は フェーズ5 の 1.15倍）:
 *   greedy: 10ターンで勝ち、HP 24058 残り。SS 1回、ダメージウォールに触れたのは0回（3回は超アンチで無効）
 *   casual: 勝率 0.81、勝ったときの中央 14ターン
 *           SS を使わないと 0.41、アビリティを外すと 0.50、友情コンボを外すと 0.11、属性とキラーを外すと 0.59
 *   random: 勝率 0.00、ボスまで 95% が到達
 * からくりの塔（3ウェーブ / ボス HP 55000）:
 *   greedy: 14ターンで勝ち、HP 22773 残り。SS 3回、ワープ2回、ハートで 3833 回復
 *   casual: 勝率 0.59、SS を使わないと 0.24
 * 翼に当たり判定が付いて壁との間で跳ね返れるようになり、はじまりの草原が簡単になった（0.99）ので
 * ドラゴンの HP と敵の攻撃を上げた。SS は強すぎないよう B の倍率 1.9・C のメテオ 3600 にした。
 *
 * 2026-09-30 ゲージショット（成功で攻撃力1.2倍＋ゲージアビリティ）を入れたら草原の casual が 0.91 になったので
 * ドラゴンの HP を 75000 → 88000 にした。bot は greedy は毎回、casual は半分、random は 2割ゲージに成功する。
 *   はじまりの草原 casual 0.81（SS なし 0.42、アビリティなし 0.47、友情なし 0.18、属性なし 0.62）
 *   からくりの塔 casual 0.65（SS なし 0.35）
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
  const teamHp = mods.D.units.reduce((a, u) => a + u.hp, 0);
  assert.ok(r.hp >= teamHp * 0.3, `残りHP ${r.hp}`);
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

test('属性とキラーは、ふつうのプレイヤーの勝ち負けを分けるほど効く', () => {
  const noElement = { ...mods, D: { units: mods.D.units.map((u) => ({ ...u, element: undefined, killers: [],
    combo: u.combo && { ...u.combo, element: undefined } })), stage: mods.D.stage } };
  const rate = (m) => {
    let w = 0;
    for (let i = 0; i < GAMES; i++) if (play(m, { policy: 'casual', random: seededRandom(1000 + i * 7919) }).state === 'won') w++;
    return w / GAMES;
  };
  const withE = rate(mods), without = rate(noElement);
  assert.ok(withE - without >= 0.1, `属性あり ${withE} / なし ${without}`);
});

test('SS は勝ち負けを分けるほど効くが、使わなくても勝てることはある', () => {
  const rate = (o) => {
    let w = 0;
    for (let i = 0; i < GAMES; i++) if (play(mods, { policy: 'casual', random: seededRandom(1000 + i * 7919), ...o }).state === 'won') w++;
    return w / GAMES;
  };
  const withSS = rate({}), without = rate({ ss: false });
  assert.ok(withSS - without >= 0.2, `SS あり ${withSS} / なし ${without}`);
  assert.ok(without >= 0.2, `SS なしでも ${without}`);
});

test('からくりの塔: 上手なプレイヤーは勝ち、ふつうのプレイヤーには はじまりの草原より難しい', () => {
  const g = play(mods, { policy: 'greedy', stage: 1 });
  assert.equal(g.state, 'won');
  assert.ok(g.turns >= 8 && g.turns <= 24, `${g.turns}ターン`);
  assert.ok(g.stats.ss >= 1 && g.stats.warps + g.stats.minesCollected + g.stats.items >= 1, 'ギミックとアイテムを使う');
  let w = 0, r = 0;
  for (let i = 0; i < GAMES; i++) {
    if (play(mods, { policy: 'casual', stage: 1, random: seededRandom(1000 + i * 7919) }).state === 'won') w++;
    if (play(mods, { policy: 'random', stage: 1, random: seededRandom(2000 + i * 7919) }).state === 'won') r++;
  }
  assert.ok(w / GAMES >= 0.35 && w / GAMES <= 0.75, `ふつう ${w / GAMES}`);
  assert.ok(r / GAMES <= 0.1, `でたらめ ${r / GAMES}`);
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
