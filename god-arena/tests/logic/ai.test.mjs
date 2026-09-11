import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGA, seededRandom, setHand, toPlain, autoPlay } from './helpers.mjs';

function fresh(seed = 5) {
  const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
  GA.Engine.setRandom(seededRandom(seed));
  GA.AI.setRandom(seededRandom(seed + 1));
  return GA;
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

test('相打ちは起こるが、ありふれてはいない（200局）', () => {
  let draws = 0, total = 0;
  for (let seed = 0; seed < 200; seed++) {
    const GA = fresh(seed * 13 + 2);
    const s = GA.Engine.create({ names: ['A', 'B'], humans: 0 });
    const r = autoPlay(GA, s, ['normal', 'normal']);
    if (s.phase !== 'over') continue;
    total++;
    if (r.winner === null) draws++;
  }
  assert.equal(total, 200, '決着しない局がある');
  assert.ok(draws / total <= 0.12, `相打ちが多すぎる: ${draws}/${total}`);
});

test('ゴッドは かけだし より強い（タイマン120局・先後入れ替え）', () => {
  let godWins = 0, games = 0;
  for (let seed = 0; seed < 120; seed++) {
    const GA = fresh(seed * 31 + 7);
    const godFirst = seed % 2 === 0;
    const levels = godFirst ? ['hard', 'easy'] : ['easy', 'hard'];
    const s = GA.Engine.create({ names: ['A', 'B'], humans: 0, levels });
    const r = autoPlay(GA, s, levels);
    if (r.winner === null) continue;
    games++;
    if (levels[r.winner] === 'hard') godWins++;
  }
  assert.ok(games >= 105, `決着した局が少なすぎる (${games})`);
  // 実測 76.7%（反射の読みが入って伸びた）。運の要素をみて 66% を下限にする。
  assert.ok(godWins / games >= 0.66, `ゴッドの勝率が低い: ${godWins}/${games}`);
});

test('ベテランは かけだし より強い（タイマン120局）', () => {
  let wins = 0, games = 0;
  for (let seed = 0; seed < 120; seed++) {
    const GA = fresh(seed * 31 + 7);
    const levels = seed % 2 === 0 ? ['normal', 'easy'] : ['easy', 'normal'];
    const s = GA.Engine.create({ names: ['A', 'B'], humans: 0, levels });
    const r = autoPlay(GA, s, levels);
    if (r.winner === null) continue;
    games++;
    if (levels[r.winner] === 'normal') wins++;
  }
  assert.ok(wins / games >= 0.56, `ベテランの勝率が低い: ${wins}/${games}`);
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
