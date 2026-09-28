import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGA, seededRandom, setHand, toPlain } from './helpers.mjs';

function fresh(seed = 31) {
  const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
  GA.Engine.setRandom(seededRandom(seed));
  GA.AI.setRandom(seededRandom(seed + 1));
  return GA;
}

/** 数値だけを差し替えた道具を作る（境界の条件を狙って組み立てるため） */
const tweak = (Items, id, patch) => Object.assign(Items.instantiate(id), patch);

// ── 連撃 ─────────────────────────────────────────────
test('連撃は回数分に分かれ、防具1枚では1回分しか防げない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const twin = Items.instantiate('twinblade');        // 無 4×2
  const res = Engine.resolveDamage([twin], [Items.instantiate('woodshield')]);  // 無5
  assert.equal(res.blocked, 4, '1回分だけ止まる');
  assert.equal(res.damage, 4, 'もう1回分は通る');
  assert.equal(res.wasted, 1, '5のうち1は余る');
});

test('連撃は回数分の防具をそろえれば止められる', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const res = Engine.resolveDamage(
    [Items.instantiate('twinblade')],
    [Items.instantiate('woodshield'), Items.instantiate('woodshield')]);
  assert.equal(res.damage, 0);
  assert.equal(res.blocked, 8);
});

test('大きな防具1枚では連撃を受けきれない（単発との差）', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const armor = () => Items.instantiate('armor');           // 無11
  // 合計9の単発は完全に防げる
  assert.equal(Engine.resolveDamage([Items.instantiate('sword')], [armor()]).damage, 0);
  // 合計9の連撃（3×3）は1回分しか止まらない
  const hail = Object.assign(Items.instantiate('hailstorm'), { element: 'none' });
  const res = Engine.resolveDamage([hail], [armor()]);
  assert.equal(res.blocked, 3);
  assert.equal(res.damage, 6);
});

test('連撃の1回分にも反射は効く', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const res = Engine.resolveDamage(
    [Items.instantiate('twinblade')],                 // 無 4×2
    [Items.instantiate('counterplate')]);             // 無の反射6
  assert.equal(res.reflected, 4);
  assert.equal(res.damage, 4);
});

test('同じだけ止まるときは連撃の1回分に防具を充てる（重ねる余地を残す）', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const twin = tweak(Items, 'twinblade', { power: 4 });        // 無 4×2
  const knife = tweak(Items, 'knife', { power: 4 });           // 無 4（単発）
  const shield = tweak(Items, 'woodshield', { power: 4 });     // 無 4
  const res = Engine.resolveDamage([twin, knife], [shield, shield]);
  // 連撃2回 + 単発4 = 12。防具4が2枚。連撃に充てれば単発に重ねる余地が残る
  assert.equal(res.blocked, 8);
  assert.equal(res.damage, 4);
});

// ── 貫通 ─────────────────────────────────────────────
test('貫通に対しては防具の効果が半分になる', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const pike = Items.instantiate('pike');                     // 無6 貫通
  assert.equal(Engine.resolveDamage([pike], [Items.instantiate('woodshield')]).damage, 4, '5→2');
  assert.equal(Engine.resolveDamage([pike], [Items.instantiate('armor')]).damage, 1, '11→5');
});

test('貫通でも属性が違えば当然防げない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const lance = Items.instantiate('lightlance');              // 光7 貫通
  assert.equal(Engine.resolveDamage([lance], [Items.instantiate('iceshield')]).damage, 7);
  assert.equal(Engine.resolveDamage([lance], [Items.instantiate('holyshield')]).damage, 2, '10→5');
});

test('のろいと貫通は重なって効く', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const res = Engine.resolveDamage(
    [Items.instantiate('pike')],                              // 無6 貫通
    [Items.instantiate('armor')],                             // 無11
    { defenseScale: 0.5 });                                   // のろいで11→5、貫通で5→2
  assert.equal(res.blocked, 2);
  assert.equal(res.damage, 4);
});

// ── 会心 ─────────────────────────────────────────────
test('会心は1点も防がれなければ1.5倍になる', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const burst = Items.instantiate('blazeburst');              // 火7 会心
  const res = Engine.resolveDamage([burst], []);
  assert.equal(res.damage, 10, '7 → 10');
  assert.equal(res.crits, 1);
  assert.equal(res.detail[0].crit, true);
});

test('少しでも防がれると会心は起きない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const burst = Items.instantiate('blazeburst');              // 火7 会心
  // のろいで火の盾が9→4になり、4だけ防がれる
  const res = Engine.resolveDamage([burst], [Items.instantiate('flameshield')], { defenseScale: 0.5 });
  assert.equal(res.blocked, 4);
  assert.equal(res.damage, 3, '1.5倍にならない');
  assert.equal(res.crits, 0);
});

test('属性の違う防具では会心を止められない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const res = Engine.resolveDamage(
    [Items.instantiate('blazeburst')], [Items.instantiate('iceshield')]);
  assert.equal(res.damage, 10);
  assert.equal(res.crits, 1);
});

test('会心と素の武器は別に判定される（防具は会心を止める方を選ぶ）', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const res = Engine.resolveDamage(
    [Items.instantiate('blazeburst'), Items.instantiate('ember')],   // 火7会心 + 火6
    [Items.instantiate('flameshield')]);                             // 火9
  // 会心の7を止めるほうが得（止めないと10になる）
  assert.equal(res.crits, 0, '会心を潰している');
  assert.equal(res.blocked, 7);
  assert.equal(res.damage, 6);
});

// ── 展開そのもの ─────────────────────────────────────
test('命中パケットへの展開が正しい', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const packets = toPlain(Engine.toPackets([
    Items.instantiate('hailstorm'),     // 水3×3 → 3つ
    Items.instantiate('sword'),         // 無9    → 1つ
    Items.instantiate('knife')          // 無6    → sword とまとまる
  ]));
  assert.equal(packets.length, 4);
  assert.equal(packets.filter((p) => p.solo).length, 3);
  const plain = packets.find((p) => !p.solo);
  assert.equal(plain.power, 15, '同じ性質の単発はまとまる');
});

test('特性が違う単発はまとまらない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const packets = toPlain(Engine.toPackets([
    Items.instantiate('sword'),   // 無9
    Items.instantiate('pike')     // 無6 貫通
  ]));
  assert.equal(packets.length, 2, '貫通の有無で別のパケットになる');
});

test('全属性の防具は、その属性しか止められない防具の出番を奪わない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  const weapons = [
    Object.assign(Items.instantiate('inferno'), { power: 10 }),   // 火10
    Object.assign(Items.instantiate('tsunami'), { power: 10 })    // 水10
  ];
  const aegis = Object.assign(Items.instantiate('aegis'), { power: 10 });        // 全10
  const flame = Object.assign(Items.instantiate('flameshield'), { power: 10 });  // 火10
  // 火の盾は火にしか使えない。全属性の盾に先を譲ると火が通ってしまう。
  // 並び順で結果が変わってはいけない。
  assert.equal(Engine.resolveDamage(weapons, [aegis, flame]).damage, 0);
  assert.equal(Engine.resolveDamage(weapons, [flame, aegis]).damage, 0);
});

test('特性の無い武器の挙動は変わっていない', () => {
  const GA = fresh();
  const { Engine, Items } = GA;
  // 属性ごとの合算と、全属性防具の配分（大きく通っている方に充てる）
  const res = Engine.resolveDamage(
    [Items.instantiate('inferno'), Items.instantiate('splash')],   // 火14 + 水5
    [Items.instantiate('aegis')]);                                 // 全9
  assert.equal(res.damage, 10);
});

// ── 表示とAI ─────────────────────────────────────────
test('特性は説明文とラベルに出る', () => {
  const GA = fresh();
  const { Items } = GA;
  assert.deepEqual(toPlain(Items.traits(Items.byId('hailstorm'))), ['連撃3']);
  assert.deepEqual(toPlain(Items.traits(Items.byId('pike'))), ['貫通']);
  assert.deepEqual(toPlain(Items.traits(Items.byId('assassin'))), ['会心']);
  assert.deepEqual(toPlain(Items.traits(Items.byId('sword'))), []);
  assert.match(Items.describe(Items.byId('hailstorm')), /3×3/);
  assert.match(Items.describe(Items.byId('pike')), /半分/);
  assert.match(Items.describe(Items.byId('assassin')), /1\.5倍/);
});

test('AIは連撃を「防具1枚では止まらない」ものとして見積もる', () => {
  const GA = fresh();
  const { AI, Items } = GA;
  // 同じ合計火力で、連撃のほうが通ると見積もる
  const plain = Object.assign(Items.instantiate('sword'), { power: 9, element: 'none' });
  const multi = Object.assign(Items.instantiate('hailstorm'), { power: 3, hits: 3, element: 'none' });
  const hand = 8;
  assert.ok(AI.estimateDamage([multi], hand) > AI.estimateDamage([plain], hand),
    '連撃のほうが通ると見ていない');
});

test('AIは貫通と会心を上積みとして見積もる', () => {
  const GA = fresh();
  const { AI, Items } = GA;
  const plain = Object.assign(Items.instantiate('spear'), { power: 7, element: 'none' });
  const pierce = Object.assign(Items.instantiate('pike'), { power: 7, element: 'none', pierce: true });
  assert.ok(AI.estimateDamage([pierce], 8) > AI.estimateDamage([plain], 8));

  const crit = Object.assign(Items.instantiate('blazeburst'), { power: 7, element: 'none', crit: true });
  assert.ok(AI.estimateDamage([crit], 1) > AI.estimateDamage([plain], 1),
    '手札の薄い相手には会心を高く見るべき');
});

test('特性つきの武器でもAIの行動は必ず実行できる（120局面）', () => {
  for (let seed = 0; seed < 120; seed++) {
    const GA = fresh(seed);
    const { Engine, AI } = GA;
    const s = Engine.create({ names: ['A', 'B', 'C'], humans: 0 });
    const act = toPlain(AI.chooseAction(s, ['easy', 'normal', 'hard'][seed % 3]));
    assert.doesNotThrow(() => {
      if (act.type === 'attack') Engine.attack(s, act.targetId, act.uids);
      else if (act.type === 'use') Engine.useItem(s, act.uid, act.targetId);
      else Engine.pray(s);
    }, `seed=${seed} act=${JSON.stringify(act)}`);
  }
});
