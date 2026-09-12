import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGA, seededRandom, setHand, toPlain } from './helpers.mjs';

function fresh(seed = 21) {
  const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
  GA.Engine.setRandom(seededRandom(seed));
  GA.AI.setRandom(seededRandom(seed + 1));
  return GA;
}

/** A が B に状態異常をかけた直後の状態を作る */
function hexed(GA, effectId, opts = {}) {
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0, hp: opts.hp || 40 });
  setHand(GA, s.players[0], [effectId]);
  if (opts.victimHand) setHand(GA, s.players[1], opts.victimHand);
  const out = Engine.useItem(s, s.players[0].hand[0].uid, 1);
  return { s, out };
}

test('どくは相手の手番のはじめに削り、ターン数が尽きると消える', () => {
  const GA = fresh();
  const { Engine } = GA;
  const { s } = hexed(GA, 'poisonmist', { victimHand: ['apple'] });

  // useItem → endTurn で B の手番が始まり、そこで1回目の毒が入る
  assert.equal(s.turn, 1);
  assert.equal(s.players[1].hp, 36, '1回目の毒');
  assert.equal(Engine.statusOf(s.players[1], 'poison').turns, 2);

  // 手番だけを進める（祈ると武器を引いてしまい、毒の刻みだけを見られない）
  const roundTrip = () => { Engine.endTurn(s); Engine.endTurn(s); };
  roundTrip();
  assert.equal(s.players[1].hp, 32, '2回目の毒');
  roundTrip();
  assert.equal(s.players[1].hp, 28, '3回目の毒');
  assert.equal(Engine.statusOf(s.players[1], 'poison'), null, '3ターンで切れる');

  roundTrip();
  assert.equal(s.players[1].hp, 28, '切れた後は減らない');
});

test('どくで倒れると手番はそのまま次の人へ渡る', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B', 'C'], humans: 0 });
  s.players[1].hp = 3;
  setHand(GA, s.players[0], ['poisonmist']);
  setHand(GA, s.players[1], ['apple']);
  Engine.useItem(s, s.players[0].hand[0].uid, 1);

  assert.equal(s.players[1].alive, false, 'どくで倒れる');
  assert.equal(s.players[1].status.length, 0, '倒れたら状態異常も消える');
  assert.equal(s.turn, 2, 'Bを飛ばしてCの番');
  assert.ok(toPlain(s.log).some((e) => e.t === 'fall' && e.cause === 'poison'));
});

test('どくで最後のひとりになれば決着する', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  s.players[1].hp = 2;
  setHand(GA, s.players[0], ['poisonmist']);
  Engine.useItem(s, s.players[0].hand[0].uid, 1);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 0);
});

test('ふうじは相手の手札で最も総合力の高い属性を封じる', () => {
  const GA = fresh();
  const { Engine } = GA;
  // 火が合計24で最大（雷は10）
  const { s } = hexed(GA, 'sealward', { victimHand: ['inferno', 'flameblade', 'boltspear'] });
  const seal = Engine.statusOf(s.players[1], 'seal');
  assert.equal(seal.element, 'fire');
});

test('封じられた属性は攻撃にも防御にも使えない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const { s } = hexed(GA, 'sealward', { victimHand: ['inferno', 'flameshield', 'sword'] });
  const B = s.players[1];
  assert.equal(Engine.statusOf(B, 'seal').element, 'fire');

  const fire = B.hand.find((i) => i.id === 'inferno');
  const plain = B.hand.find((i) => i.id === 'sword');
  assert.equal(Engine.isUsable(B, fire), false);
  assert.equal(Engine.isUsable(B, plain), true);
  // 「出せる武器」としては数えない
  assert.deepEqual(toPlain(Engine.weaponsOf(B)).map((i) => i.id), ['sword']);
  assert.deepEqual(toPlain(Engine.defensesOf(B)).map((i) => i.id), []);
  assert.throws(() => Engine.attack(s, 0, [fire.uid]), /封じられた属性/);
  assert.equal(B.hand.length, 3, '差し戻されている');
});

test('封じで攻め手が無くなったら祈れる', () => {
  const GA = fresh();
  const { Engine } = GA;
  const { s } = hexed(GA, 'sealward', { victimHand: ['inferno', 'flameblade'] });
  // 火しか持っておらず、それが封じられた → 攻撃できないので祈れる
  assert.equal(Engine.canPray(s), true);
  assert.doesNotThrow(() => Engine.pray(s));
});

test('封じられた属性は防御にも出せない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const { s } = hexed(GA, 'sealward', { victimHand: ['flameshield', 'flameblade'] });
  setHand(GA, s.players[1], []);
  Engine.pray(s);                               // B の手番を消化して A へ戻す
  setHand(GA, s.players[0], ['sword']);
  setHand(GA, s.players[1], ['flameshield']);
  s.turn = 0;
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  assert.throws(() => Engine.defend(s, [s.players[1].hand[0].uid]), /封じられた属性/);
});

test('のろいは防御力を半分にする', () => {
  const GA = fresh();
  const { Engine } = GA;
  const { s } = hexed(GA, 'hexward', { victimHand: ['armor'] });   // 無属性11
  assert.ok(Engine.statusOf(s.players[1], 'curse'));
  assert.equal(Engine.defenseScaleOf(s.players[1]), 0.5);

  setHand(GA, s.players[0], ['cannon']);      // 無14
  s.turn = 0;
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const preview = Engine.previewDefense(s, [s.players[1].hand[0].uid]);
  assert.equal(preview.blocked, 5, '11 → 5 に目減りする');
  const res = Engine.defend(s, [s.players[1].hand[0].uid]);
  assert.equal(res.damage, 9);
});

test('のろい中は反射できる量も半分になる', () => {
  const GA = fresh();
  const { Engine } = GA;
  const { s } = hexed(GA, 'hexward', { victimHand: ['backfire'] });   // 火の反射7
  setHand(GA, s.players[0], ['inferno']);     // 火14
  s.turn = 0;
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const res = Engine.defend(s, [s.players[1].hand[0].uid]);
  assert.equal(res.reflected, 3, '7 → 3');
  assert.equal(res.damage, 11);
});

test('同じ状態異常の重ねがけでターン数は伸びない（長い方を採る）', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[1], ['apple']);
  setHand(GA, s.players[0], ['poisonmist', 'poisonmist']);
  Engine.useItem(s, s.players[0].hand[0].uid, 1);
  assert.equal(Engine.statusOf(s.players[1], 'poison').turns, 2);
  Engine.pray(s);                                    // B
  Engine.useItem(s, s.players[0].hand[0].uid, 1);    // A が重ねがけ
  const st = Engine.statusOf(s.players[1], 'poison');
  assert.equal(st.turns, 2, '3にならず、長い方の残りに揃う');
  assert.equal(s.players[1].status.length, 1, '重複して積まれない');
});

test('状態異常は自分にはかけられない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['poisonmist']);
  assert.throws(() => Engine.useItem(s, s.players[0].hand[0].uid, 0), /対象が不正/);
  assert.equal(s.players[0].hand.length, 1, '差し戻されている');
});

test('狙い先が必要なアイテムを Items が判別できる', () => {
  const GA = fresh();
  const { Items } = GA;
  for (const id of ['poisonmist', 'sealward', 'hexward', 'plunder']) {
    assert.equal(Items.needsTarget(Items.byId(id)), true, `${id} は狙い先が必要`);
  }
  for (const id of ['cure', 'oracle', 'apple', 'sword', 'flameshield']) {
    assert.equal(Items.needsTarget(Items.byId(id)), false, `${id} は狙い先が不要`);
  }
});

test('AIは状態異常を、効きそうな相手に使う', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B', 'C'], humans: 0 });
  setHand(GA, s.players[0], ['poisonmist']);          // 武器が無いので状態異常を使う番
  s.players[1].hp = 3;                                // ほぼ削れている＝毒の旨みが小さい
  s.players[2].hp = 40;
  const act = toPlain(AI.chooseAction(s, 'hard'));
  assert.equal(act.type, 'use');
  assert.equal(act.targetId, 2, 'HPの残っている相手に毒を入れる');
});

test('AIは封じられた武器で攻撃しようとしない（100局面）', () => {
  for (let seed = 0; seed < 100; seed++) {
    const GA = fresh(seed);
    const { Engine, AI } = GA;
    const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
    const me = s.players[0];
    me.status = [{ id: 'seal', turns: 2, element: Engine.strongestElement(me) }];
    const act = toPlain(AI.chooseAction(s, 'hard'));
    assert.doesNotThrow(() => {
      if (act.type === 'attack') Engine.attack(s, act.targetId, act.uids);
      else if (act.type === 'use') Engine.useItem(s, act.uid, act.targetId);
      else Engine.pray(s);
    }, `seed=${seed} act=${JSON.stringify(act)}`);
  }
});
