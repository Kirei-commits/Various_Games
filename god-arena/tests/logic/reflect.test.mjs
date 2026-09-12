import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGA, seededRandom, setHand, toPlain } from './helpers.mjs';

function fresh(seed = 11) {
  const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
  GA.Engine.setRandom(seededRandom(seed));
  GA.AI.setRandom(seededRandom(seed + 1));
  return GA;
}

test('反射具は同属性を防ぎ、防いだ分だけ撃ち返す', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const res = Engine.resolveDamage(
    [Items.instantiate('inferno')],        // 火14
    [Items.instantiate('backfire')]        // 火の反射7
  );
  assert.equal(res.damage, 7, '7を止めて7通る');
  assert.equal(res.reflected, 7, '止めた分だけ返る');
});

test('撃ち返す量は防いだ量を超えない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const res = Engine.resolveDamage(
    [Items.instantiate('ember')],          // 火6
    [Items.instantiate('backfire')]        // 火の反射7
  );
  assert.equal(res.damage, 0);
  assert.equal(res.reflected, 6, '余った1は返らない');
});

test('属性の違う反射具では防げず、撃ち返しも起きない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const res = Engine.resolveDamage(
    [Items.instantiate('inferno')],        // 火14
    [Items.instantiate('frostmirror')]     // 水の反射7
  );
  assert.equal(res.damage, 14);
  assert.equal(res.reflected, 0);
});

test('同属性に反射具と防具を重ねたら、反射具から先に充てる', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const res = Engine.resolveDamage(
    [Items.instantiate('inferno')],                                  // 火14
    [Items.instantiate('backfire'), Items.instantiate('flameshield')] // 反射7 + 防具9
  );
  assert.equal(res.damage, 0, '7+9で完全に防げる');
  assert.equal(res.reflected, 7, '撃ち返せる量が最大になる配分');
});

test('反射のダメージは攻撃側のHPを削る（防げない）', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['inferno', 'flameshield']);   // 防具を持っていても反射は防げない
  setHand(GA, s.players[1], ['backfire']);
  const weapon = s.players[0].hand.find((i) => i.kind === 'weapon');
  Engine.attack(s, 1, [weapon.uid]);
  const res = Engine.defend(s, [s.players[1].hand[0].uid]);
  assert.equal(res.reflected, 7);
  assert.equal(s.players[0].hp, s.players[0].maxHp - 7, '攻撃側が7くらう');
  assert.equal(s.players[1].hp, s.players[1].maxHp - 7, '通った7も入る');
  assert.equal(s.players[0].hand.length, 1, '防具は消費されない');
});

test('反射で攻撃側が倒れることがある', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B', 'C'], humans: 0, hp: 40 });
  s.players[0].hp = 5;
  setHand(GA, s.players[0], ['inferno']);
  setHand(GA, s.players[1], ['backfire']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const res = Engine.defend(s, [s.players[1].hand[0].uid]);
  assert.equal(res.attackerDefeated, true);
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[1].stats.kills, 1);
  assert.equal(s.players[1].stats.reflected, 7);
});

test('相打ちになると引き分けで終わる', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  s.players[0].hp = 5;
  s.players[1].hp = 5;
  setHand(GA, s.players[0], ['inferno']);      // 火14
  setHand(GA, s.players[1], ['backfire']);     // 7止めて7返す → 7通って双方0
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const res = Engine.defend(s, [s.players[1].hand[0].uid]);
  assert.equal(res.defeated, true);
  assert.equal(res.attackerDefeated, true);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, null, '勝者なし＝引き分け');
});

test('反射具は防御に使える手札として数えられる', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[1], ['backfire', 'apple']);
  assert.deepEqual(toPlain(Engine.defensesOf(s.players[1])).map((i) => i.id), ['backfire']);
});

test('食料や武器を防御に出そうとしても弾かれる', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['sword']);
  setHand(GA, s.players[1], ['apple']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  assert.throws(() => Engine.defend(s, [s.players[1].hand[0].uid]), /防具以外/);
  assert.equal(s.players[1].hand.length, 1, '差し戻されている');
});

test('反射具は同じ数値の防具より価値が高いと見なされる', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const mirror = Object.assign(Items.instantiate('backfire'), { power: 9 });
  const shield = Object.assign(Items.instantiate('flameshield'), { power: 9 });
  assert.ok(Engine.itemValue(mirror) > Engine.itemValue(shield));
});

test('AIは撃ち返しで相手を倒せるなら反射具を出す', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  s.players[0].hp = 6;                                  // 反射7で倒れる
  setHand(GA, s.players[0], ['inferno']);
  setHand(GA, s.players[1], ['backfire', 'flameshield']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const uids = toPlain(AI.chooseDefense(s, 'hard'));
  const picked = s.players[1].hand.filter((i) => uids.includes(i.uid)).map((i) => i.id);
  assert.ok(picked.includes('backfire'), `反射具を選んでいない: ${picked}`);
});

test('反射されそうな見積もりは、相手の手札が厚いほど大きい', () => {
  const GA = fresh();
  const { AI } = GA;
  const few = AI.expectedReflect('fire', 14, 2);
  const many = AI.expectedReflect('fire', 14, 10);
  assert.ok(many > few);
  assert.ok(many <= 14, '撃った量以上に返ることはない');
  assert.equal(AI.expectedReflect('fire', 0, 10), 0);
});
