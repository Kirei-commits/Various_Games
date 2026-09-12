import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGA, seededRandom, setHand, toPlain } from './helpers.mjs';

function fresh(seed = 1) {
  const GA = loadGA(['items.js', 'engine.js']);
  GA.Engine.setRandom(seededRandom(seed));
  return GA;
}

test('同じ属性の防具だけがその属性を止める', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const fire = Items.instantiate('flameblade');    // 火 10
  const iceShield = Items.instantiate('iceshield'); // 水 9
  const fireShield = Items.instantiate('flameshield'); // 火 9

  assert.equal(Engine.resolveDamage([fire], []).damage, 10);
  assert.equal(Engine.resolveDamage([fire], [iceShield]).damage, 10, '属性違いは防げない');
  assert.equal(Engine.resolveDamage([fire], [fireShield]).damage, 1, '9を防いで1通る');
});

test('全属性(all)の防具はどの属性でも受けられる', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const dark = Items.instantiate('demonsword');     // 闇 12
  const aegis = Items.instantiate('aegis');         // 全 9
  assert.equal(Engine.resolveDamage([dark], [aegis]).damage, 3);
});

test('全属性の防具は、いちばん通っている属性に充てられる', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  // 火14 + 水5 に対して 全9 を持つ。火に充てれば合計10、水に充てれば合計14。
  const weapons = [Items.instantiate('inferno'), Items.instantiate('splash')];
  const res = Engine.resolveDamage(weapons, [Items.instantiate('aegis')]);
  assert.equal(res.damage, 10);
});

test('属性を混ぜた攻撃は、単一属性より防がれにくい', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const shield = [Items.instantiate('flameshield')];            // 火9
  const single = [Items.instantiate('inferno')];                // 火14
  const mixed = [Items.instantiate('ember'), Items.instantiate('boltspear')]; // 火6 + 雷10
  assert.equal(Engine.resolveDamage(single, shield).damage, 5);
  assert.equal(Engine.resolveDamage(mixed, shield).damage, 10);
});

test('過剰な防御は他の属性に回らない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const weapons = [Items.instantiate('ember'), Items.instantiate('spark')]; // 火6 雷6
  const res = Engine.resolveDamage(weapons, [Items.instantiate('flameshield')]); // 火9
  assert.equal(res.damage, 6, '火は防げても雷はそのまま通る');
  assert.equal(res.blocked, 6, '防いだ量は実際に防いだ分だけ');
});

test('攻撃 → 防御 で HP が減り、手番が次へ移る', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['sword']);        // 無 9
  setHand(GA, s.players[1], ['woodshield']);   // 無 5
  const uid = s.players[0].hand[0].uid;
  Engine.attack(s, 1, [uid]);
  assert.equal(s.phase, 'defense');
  const res = Engine.defend(s, [s.players[1].hand[0].uid]);
  assert.equal(res.damage, 4);
  assert.equal(s.players[1].hp, s.players[1].maxHp - 4);
  assert.equal(s.phase, 'turn');
  assert.equal(s.turn, 1, '防御側に手番が渡る');
  assert.equal(s.players[0].hand.length, 0, '使った武器は消える');
  assert.equal(s.players[1].hand.length, 0, '使った防具も消える');
});

test('HPが0になると敗退し、手札を失う', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B', 'C'], humans: 0, hp: 10 });
  setHand(GA, s.players[0], ['inferno']);      // 14
  setHand(GA, s.players[1], ['apple', 'sword']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const res = Engine.defend(s, []);
  assert.equal(res.defeated, true);
  assert.equal(s.players[1].alive, false);
  assert.equal(s.players[1].hand.length, 0);
  assert.equal(s.players[0].stats.kills, 1);
});

test('最後の1人になったら決着する', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0, hp: 5 });
  setHand(GA, s.players[0], ['cannon']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  Engine.defend(s, []);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 0);
});

test('敗退者は手番を飛ばされる', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B', 'C'], humans: 0, hp: 6 });
  setHand(GA, s.players[0], ['cannon']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  Engine.defend(s, []);           // B 敗退
  assert.equal(s.turn, 2, 'Bを飛ばしてCの番');
});

test('祈るとアイテムが増え、手番が移る', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['woodshield', 'apple']);   // 武器が無いので祈れる
  const before = s.players[0].hand.length;
  const out = Engine.pray(s);
  assert.equal(out.items.length, Engine.PRAY_DRAW);
  assert.equal(s.players[0].hand.length, before + Engine.PRAY_DRAW);
  assert.equal(s.turn, 1);
});

test('手札が上限でも、祈れば価値の低いものから捨てて新しい神器が入る', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  // 防具と食料で埋まった状態。ここで引いた分を全部捨てると永久に攻め手が来ない。
  setHand(GA, s.players[0], new Array(Engine.HAND_LIMIT).fill('apple'));
  const out = Engine.pray(s);
  assert.equal(s.players[0].hand.length, Engine.HAND_LIMIT);
  assert.equal(out.dropped, Engine.PRAY_DRAW);
  for (const item of out.items) {
    assert.ok(s.players[0].hand.some((i) => i.uid === item.uid), '授かった神器が手札に入っていない');
  }
});

test('捨てるのは価値の低い手札から（武器は残る）', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0, hp: 40 });
  const hand = ['cannon', ...new Array(Engine.HAND_LIMIT - 1).fill('apple')];
  setHand(GA, s.players[1], hand);
  // 相手の手番にして祈らせるのではなく、give を通る経路（ごうだつ）で確認する
  setHand(GA, s.players[0], ['plunder']);
  Engine.useItem(s, s.players[0].hand[0].uid, 1);
  assert.ok(Engine.itemValue(GA.Items.instantiate('cannon')) >
            Engine.itemValue(GA.Items.instantiate('apple')));
});

test('武器を持っている間は祈れない（攻め手があるのに引き直せない）', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['sword', 'apple']);
  assert.equal(Engine.canPray(s), false);
  assert.throws(() => Engine.pray(s), /祈れない/);
  setHand(GA, s.players[0], ['apple']);
  assert.equal(Engine.canPray(s), true);
  assert.doesNotThrow(() => Engine.pray(s));
});

test('食料はHPを回復し、最大値を超えない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  const max = s.players[0].maxHp;
  s.players[0].hp = max - 5;
  setHand(GA, s.players[0], ['herb']);   // 16回復だが5しか入らない
  const out = Engine.useItem(s, s.players[0].hand[0].uid);
  assert.equal(out.healed, 5);
  assert.equal(s.players[0].hp, max);
});

test('てんけいはアイテムを授かる／ごうだつは相手から奪う', () => {
  const GA = fresh(42);
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['oracle']);
  const drew = Engine.useItem(s, s.players[0].hand[0].uid);
  assert.equal(drew.drawn.length, 4);
  assert.equal(s.players[0].hand.length, 4);

  s.turn = 0;
  setHand(GA, s.players[0], ['plunder']);
  setHand(GA, s.players[1], ['sword', 'axe', 'apple']);
  const stole = Engine.useItem(s, s.players[0].hand[0].uid, 1);
  assert.equal(stole.stolen.length, 2);
  assert.equal(s.players[1].hand.length, 1);
  assert.equal(s.players[0].hand.length, 2);
});

test('不正な操作は例外になり、手札は失われない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['woodshield']);
  assert.throws(() => Engine.attack(s, 1, [s.players[0].hand[0].uid]), /武器以外/);
  assert.equal(s.players[0].hand.length, 1, '差し戻されている');
  assert.throws(() => Engine.attack(s, 0, []), /武器が選ばれていない|対象が不正/);
  assert.throws(() => Engine.defend(s, []), /防御する場面ではない/);
});

test('availableActions は局面に応じた選択肢を返す', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], []);
  assert.deepEqual(toPlain(Engine.availableActions(s)), ['pray']);
  setHand(GA, s.players[0], ['sword', 'apple']);
  assert.deepEqual(toPlain(Engine.availableActions(s)).sort(), ['attack', 'use']);
  setHand(GA, s.players[0], ['apple']);
  assert.deepEqual(toPlain(Engine.availableActions(s)).sort(), ['pray', 'use']);
});

test('ログには攻撃・解決・決着が残る', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0, hp: 5 });
  setHand(GA, s.players[0], ['cannon']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  Engine.defend(s, []);
  const kinds = toPlain(s.log).map((e) => e.t);
  assert.deepEqual(kinds, ['attack', 'resolve', 'over']);
});
