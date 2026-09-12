import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGA, seededRandom, setHand, toPlain, autoPlay, mixSeed } from './helpers.mjs';

function fresh(seed = 5) {
  const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
  GA.Engine.setRandom(seededRandom(seed));
  GA.AI.setRandom(seededRandom(seed + 1));
  return GA;
}

/**
 * 難易度どうしを戦わせて勝率を返す。先後は1局ごとに入れ替える。
 * シードは mixSeed で撹拌する（等差のシードだと系列が相関して勝率が偏る）。
 */
function duel(a, b, games = 300) {
  let wins = 0, decided = 0, draws = 0;
  for (let i = 0; i < games; i++) {
    const seed = mixSeed(i);
    const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
    GA.Engine.setRandom(seededRandom(seed));
    GA.AI.setRandom(seededRandom((seed ^ 0xABCD) >>> 0));
    const levels = i % 2 === 0 ? [a, b] : [b, a];
    const s = GA.Engine.create({ names: ['A', 'B'], humans: 0, levels });
    const r = autoPlay(GA, s, levels, 800);
    assert.equal(s.phase, 'over', `i=${i} で決着しない（${r.turns}手）`);
    if (r.winner === null) { draws++; continue; }
    decided++;
    if (levels[r.winner] === a) wins++;
  }
  return { rate: wins / decided, wins, decided, draws };
}

test('致死の攻撃は必ず防ぐ（出し惜しみしない）', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0, hp: 10 });
  setHand(GA, s.players[0], ['inferno']);                 // 火14
  setHand(GA, s.players[1], ['flameshield', 'armor']);    // 火9 / 無11
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const uids = toPlain(AI.chooseDefense(s, 'hard'));
  const picked = s.players[1].hand.filter((i) => uids.includes(i.uid));
  assert.deepEqual(picked.map((i) => i.id), ['flameshield'], '火を防げる方を選ぶ');
  const res = Engine.defend(s, uids);
  assert.ok(res.damage < 10, `致死を回避できていない (${res.damage})`);
});

test('防げない属性の防具は使わない（無駄撃ちしない）', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['ember']);              // 火6
  setHand(GA, s.players[1], ['iceshield', 'rod']);   // 水9 / 雷9
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  assert.deepEqual(toPlain(AI.chooseDefense(s, 'hard')), []);
});

test('倒しきれる相手がいれば止めを刺す', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B', 'C'], humans: 0 });
  s.players[1].hp = 4;    // 瀕死
  s.players[2].hp = 40;
  s.players[1].hand = [];
  setHand(GA, s.players[0], ['sword']);  // 無9
  const act = toPlain(AI.chooseAction(s, 'hard'));
  assert.equal(act.type, 'attack');
  assert.equal(act.targetId, 1);
});

test('武器が無ければ祈る', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], []);
  assert.equal(toPlain(AI.chooseAction(s, 'hard')).type, 'pray');
});

test('瀕死なら回復を優先する', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  s.players[0].hp = 8;
  setHand(GA, s.players[0], ['herb', 'stone']);
  const act = toPlain(AI.chooseAction(s, 'hard'));
  assert.equal(act.type, 'use');
});

test('AIが返す行動は必ず実行できる（100局面）', () => {
  for (let seed = 0; seed < 100; seed++) {
    const GA = fresh(seed);
    const { Engine, AI } = GA;
    const s = Engine.create({ names: ['A', 'B', 'C'], humans: 0 });
    const p = Engine.current(s);
    const act = toPlain(AI.chooseAction(s, ['easy', 'normal', 'hard'][seed % 3]));
    assert.doesNotThrow(() => {
      if (act.type === 'attack') Engine.attack(s, act.targetId, act.uids);
      else if (act.type === 'use') Engine.useItem(s, act.uid, act.targetId);
      else Engine.pray(s);
    }, `seed=${seed} act=${JSON.stringify(act)} hand=${p.hand.map((i) => i.id)}`);
  }
});

test('AI同士の対戦は必ず決着する（30局）', () => {
  for (let seed = 0; seed < 30; seed++) {
    const GA = fresh(seed * 17 + 3);
    const s = GA.Engine.create({ names: ['A', 'B', 'C', 'D'], humans: 0 });
    const r = autoPlay(GA, s, ['normal', 'normal', 'normal', 'normal']);
    // 反射での相打ちで winner が null になることはある。決着していることを見る。
    assert.equal(s.phase, 'over', `seed=${seed} で決着しない（${r.turns}手）`);
    assert.ok(r.turns < 500, `長すぎる（${r.turns}手）`);
  }
});

test('相打ちがありふれてはいない（300局）', () => {
  // 相打ちが「起こりうる」ことは reflect.test.mjs で局面を作って確かめている。
  // ここでは頻度だけを見る（起きる確率が数%なので、下限を課すとフレーキーになる）。
  const r = duel('normal', 'normal', 300);
  assert.ok(r.draws / 300 <= 0.08, `相打ちが多すぎる: ${r.draws}/300`);
});

test('難易度の序列が保たれている（各300局・先後入れ替え・撹拌シード）', () => {
  // 撹拌シード600局での実測: 71.7% / 64.0% / 60.1%（それぞれ ±4pt 程度）
  // 閾値は実測の95%信頼区間の下限より、さらに下に置く。
  const hardEasy = duel('hard', 'easy');
  const normalEasy = duel('normal', 'easy');
  const hardNormal = duel('hard', 'normal');

  assert.ok(hardEasy.rate >= 0.62,
    `ゴッド vs かけだし が低い: ${hardEasy.wins}/${hardEasy.decided}`);
  assert.ok(normalEasy.rate >= 0.55,
    `ベテラン vs かけだし が低い: ${normalEasy.wins}/${normalEasy.decided}`);
  assert.ok(hardNormal.rate >= 0.54,
    `ゴッド vs ベテラン が低い: ${hardNormal.wins}/${hardNormal.decided}`);

  // 序列そのものも確かめる（数値だけ通って順番が崩れるのを防ぐ）
  assert.ok(hardEasy.rate > normalEasy.rate,
    `ゴッドの優位がベテランを超えていない: ${hardEasy.rate.toFixed(3)} vs ${normalEasy.rate.toFixed(3)}`);
});

test('見えている情報からしか相手の防具を読まない', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  const before = toPlain(AI.readDefenses(s, 1));
  for (const el of Object.keys(before)) assert.equal(before[el], 1, '戦う前から偏りがある');

  // 火を防いだ実績があれば火は厚いと読み、雷を素通しさせたら薄いと読む
  setHand(GA, s.players[0], ['ember', 'spark']);
  setHand(GA, s.players[1], ['flameshield']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid, s.players[0].hand[1].uid]);
  Engine.defend(s, [s.players[1].hand[0].uid]);
  const after = toPlain(AI.readDefenses(s, 1));
  assert.ok(after.fire > 1, '防いだ属性を厚く見ていない');
  assert.ok(after.thunder < 1, '素通りした属性を薄く見ていない');
});

test('1局の長さが極端にならない（中央値が現実的）', () => {
  const lengths = [];
  for (let seed = 0; seed < 20; seed++) {
    const GA = fresh(seed * 11 + 1);
    const s = GA.Engine.create({ names: ['A', 'B'], humans: 0 });
    lengths.push(autoPlay(GA, s, ['normal', 'normal']).turns);
  }
  lengths.sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  assert.ok(median >= 8, `短すぎる (中央値 ${median}手)`);
  assert.ok(median <= 160, `長すぎる (中央値 ${median}手)`);
});
