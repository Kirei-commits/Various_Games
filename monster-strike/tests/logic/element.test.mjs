import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, newGame, shoot } from './helpers.mjs';

const mods = loadAll();
const { P, B, D } = mods;
const BT = B.Battle;

const FOE = (extra = {}) => ({ id: 'e', shape: 'circle', x: 270, y: 300, r: 40, hp: 1e6, atk: 1000, turns: 9, attack: 'single', ...extra });

/** 味方（units の定義そのまま）と敵だけの戦場。味方は下に横並び */
function field(units, enemies, teamHp = 10000) {
  const world = new P.World();
  units.forEach((u, i) => world.add({ id: u.id, kind: 'unit', shot: u.shot || 'reflect', x: u.x ?? 90 + i * 120, y: u.y ?? 700, r: 30 }));
  const battle = new BT({ units, stage: { teamHp, waves: [{ enemies }] } });
  battle.spawnWave(world);
  return { world, battle };
}

/** 反射の直殴り1回ぶんのイベントを直接渡す */
const hitOnce = (battle, world, id, weak = false) => battle.apply([{ type: 'hit', id, other: 'e', weak, x: 270, y: 340 }], world)[0];

// ------------------------------------------------------------ 属性の表
test('属性の有利・不利: 火→木→水→火、光と闇はお互いに有利。同じ属性や無属性は等倍', () => {
  const EL = ['fire', 'water', 'wood', 'light', 'dark'];
  const adv = { fire: 'wood', wood: 'water', water: 'fire', light: 'dark', dark: 'light' };
  for (const a of EL) {
    for (const d of EL) {
      let want = 1;
      if (adv[a] === d) want = BT.ELEMENT_ADV;
      else if (adv[d] === a) want = BT.ELEMENT_DIS;
      assert.equal(BT.elementRate(a, d), want, `${a} → ${d}`);
    }
    assert.equal(BT.elementRate(a, undefined), 1);
    assert.equal(BT.elementRate(undefined, a), 1);
  }
  assert.equal(BT.elementRate('light', 'dark'), BT.ELEMENT_ADV);
  assert.equal(BT.elementRate('dark', 'light'), BT.ELEMENT_ADV);
  assert.deepEqual([BT.ELEMENT_ADV, BT.ELEMENT_DIS], [1.33, 0.66]);
});

test('キラーの倍率は S 1.25 / 無印 1.5 / M 2 / L 2.5 / EL 3', () => {
  assert.equal(JSON.stringify(BT.KILLER), JSON.stringify({ S: 1.25, N: 1.5, M: 2, L: 2.5, EL: 3 }));
});

// ------------------------------------------------------------ 直殴り
test('有利属性で殴ると1.33倍、不利属性だと0.66倍', () => {
  const units = [{ id: 'A', atk: 1000, element: 'water' }];
  let { world, battle } = field(units, [FOE({ element: 'fire' })]);
  let r = hitOnce(battle, world, 'A');
  assert.equal(r.damage, 1330);
  assert.equal(r.rates.map((x) => x.kind).join(), 'adv');
  ({ world, battle } = field(units, [FOE({ element: 'wood' })]));
  r = hitOnce(battle, world, 'A');
  assert.equal(r.damage, 660);
  assert.equal(r.rates.map((x) => x.kind).join(), 'dis');
});

test('弱点 × 属性 × キラーは掛け算で、丸めは最後に1回だけ', () => {
  const units = [{ id: 'A', atk: 1001, element: 'water', killers: [{ race: 'dragon', rank: 'M' }] }];
  const { world, battle } = field(units, [FOE({ element: 'fire', race: 'dragon' })]);
  const r = hitOnce(battle, world, 'A', true);
  assert.equal(r.damage, Math.round(1001 * 3 * 1.33 * 2));
  assert.equal(r.rates.map((x) => x.kind).join(), 'weak,adv,killer');
});

test('キラーは種族でも属性でも合えば発動し、合わなければ等倍', () => {
  const units = [{ id: 'A', atk: 1000, killers: [{ element: 'dark' }] }];
  let { world, battle } = field(units, [FOE({ element: 'dark' })]);
  assert.equal(hitOnce(battle, world, 'A').damage, 1500);
  ({ world, battle } = field(units, [FOE({ element: 'fire', race: 'dark' })]));
  assert.equal(hitOnce(battle, world, 'A').damage, 1000, '種族の名前が属性と同じでも取り違えない');
});

test('底力はチームのHPが半分未満のときだけ直殴りを1.5倍にする', () => {
  const units = [{ id: 'A', atk: 1000, abilities: ['lastStand'] }];
  const { world, battle } = field(units, [FOE()], 10000);
  assert.equal(hitOnce(battle, world, 'A').damage, 1000);
  battle.teamHp = 5000;
  assert.equal(hitOnce(battle, world, 'A').damage, 1000, 'ちょうど半分では出ない');
  battle.teamHp = 4999;
  const r = hitOnce(battle, world, 'A');
  assert.equal(r.damage, 1500);
  assert.equal(r.rates.map((x) => x.kind).join(), 'lastStand');
});

test('実際に撃っても属性の倍率が入る（物理 → 戦闘の通し）', () => {
  const units = [{ id: 'A', atk: 1000, element: 'fire', x: 270, y: 600 }];
  const { world, battle } = field(units, [FOE({ element: 'wood' })]);
  const recs = shoot(world, battle, 'A', 0, -700);
  assert.ok(recs.length >= 1);
  assert.ok(recs.every((r) => r.damage === 1330));
});

// ------------------------------------------------------------ 友情コンボ
function comboHit(combo, ally = {}, foe = {}) {
  const units = [
    { id: 'M', atk: 1000, element: 'water', killers: [] },
    { id: 'F', atk: 1000, element: 'wood', combo, ...ally }
  ];
  const { world, battle } = field(units, [FOE({ x: 270, y: 300, ...foe })]);
  world.get('F').x = 270; world.get('F').y = 480;
  return battle.apply([{ type: 'hit', id: 'M', other: 'F' }], world);
}

test('無属性の友情コンボには属性の倍率がかからない。属性のある友情にはかかる', () => {
  const blast = { kind: 'blast', name: 'b', power: 2000, radius: 200 };
  assert.equal(comboHit(blast, {}, { element: 'water' })[0].damage, 2000, '持ち主が木でも無属性の友情は等倍');
  assert.equal(comboHit({ ...blast, element: 'fire' }, {}, { element: 'wood' })[0].damage, 2660);
  assert.equal(comboHit({ ...blast, element: 'fire' }, {}, { element: 'water' })[0].damage, 1320);
});

test('キラーは持ち主の友情コンボにも乗る。動いた側のキラーは乗らない', () => {
  const blast = { kind: 'blast', name: 'b', power: 2000, radius: 200 };
  assert.equal(comboHit(blast, { killers: [{ race: 'dragon', rank: 'L' }] }, { race: 'dragon' })[0].damage, 5000);
  const units = [
    { id: 'M', atk: 1000, killers: [{ race: 'dragon', rank: 'L' }] },
    { id: 'F', atk: 1000, combo: blast }
  ];
  const { world, battle } = field(units, [FOE({ race: 'dragon' })]);
  world.get('F').x = 270; world.get('F').y = 480;
  assert.equal(battle.apply([{ type: 'hit', id: 'M', other: 'F' }], world)[0].damage, 2000);
});

// ------------------------------------------------------------ 拡散弾
test('拡散弾は8方向に飛び、それぞれ射程内で最初に当たった敵だけに当たる', () => {
  const spread = { kind: 'spread', name: 's', count: 8, power: 700, range: 300 };
  const units = [{ id: 'M', atk: 1000 }, { id: 'F', atk: 1000, combo: spread }];
  const enemies = [
    FOE({ id: 'up1', x: 270, y: 300, r: 30 }),        // 真上 180 先
    FOE({ id: 'up2', x: 270, y: 150, r: 30 }),        // その奥（手前に隠れる）
    FOE({ id: 'right', shape: 'rect', x: 480, y: 480, w: 40, h: 120 }),  // 右 190 先（矩形）
    FOE({ id: 'far', x: 30, y: 480, r: 10 })           // 左 230 先（射程 300 の内側）
  ];
  const { world, battle } = field(units, enemies);
  world.get('F').x = 270; world.get('F').y = 480;
  world.get('M').x = 270; world.get('M').y = 700;
  const recs = battle.apply([{ type: 'hit', id: 'M', other: 'F' }], world);
  const byEnemy = Object.fromEntries(['up1', 'up2', 'right', 'far'].map((id) => [id, recs.filter((r) => r.enemy === id).length]));
  assert.deepEqual(byEnemy, { up1: 1, up2: 0, right: 1, far: 1 });
  const combo = battle.drainCombos()[0];
  assert.equal(combo.shots.length, 8);
  const up = combo.shots[0];
  assert.ok(Math.abs(up.x - 270) < 1e-9 && Math.abs(up.y - 330) < 1e-9, `真上の弾は up1 の下の縁で止まる (${up.x}, ${up.y})`);
  const right = combo.shots[2];
  assert.ok(Math.abs(right.x - 460) < 1e-9 && Math.abs(right.y - 480) < 1e-9, '右の弾は矩形の左の辺で止まる');
  const miss = combo.shots.filter((s) => !s.rec);
  assert.equal(miss.length, 5);
  for (const s of miss) assert.ok(Math.abs(Math.hypot(s.x - 270, s.y - 480) - 300) < 1e-9, '外れた弾は射程の端まで');
});

test('拡散弾の射程の外にいる敵には当たらない', () => {
  const spread = { kind: 'spread', name: 's', count: 8, power: 700, range: 100 };
  const units = [{ id: 'M', atk: 1000 }, { id: 'F', atk: 1000, combo: spread }];
  const { world, battle } = field(units, [FOE({ x: 270, y: 300, r: 30 })]);
  world.get('F').x = 270; world.get('F').y = 480;
  assert.equal(battle.apply([{ type: 'hit', id: 'M', other: 'F' }], world).length, 0);
});

// ------------------------------------------------------------ 敵の攻撃
test('敵の単体攻撃は、属性の相性と耐性で受けるダメージが変わる', () => {
  const run = (unit) => {
    const { world, battle } = field([{ id: 'A', atk: 1, ...unit }], [FOE({ element: 'dark', atk: 1000, turns: 1 })]);
    return battle.endTurn(world).attacks[0];
  };
  assert.equal(run({}).damage, 1000);
  assert.equal(run({ element: 'light' }).damage, 1330, '光は闇から大きく受ける（お互いに有利）');
  assert.equal(run({ element: 'light', resist: [{ element: 'dark' }] }).damage, Math.round(1000 * 1.33 * 0.75));
  assert.equal(run({ resist: [{ element: 'dark', rank: 'M' }] }).damage, 500);
  assert.equal(run({ resist: [{ element: 'fire', rank: 'M' }] }).damage, 1000, '別の属性の耐性は効かない');
  const a = run({ element: 'light' });
  assert.equal(a.hits.length, 1);
  assert.equal(a.hits[0].unit, 'A');
  assert.equal(a.target, 'A');
});

test('敵の全体攻撃は攻撃力を味方の数で割って1体ずつ。全員等倍なら合計はちょうど攻撃力', () => {
  const units = ['A', 'B', 'C', 'D'].map((id) => ({ id, atk: 1 }));
  let { world, battle } = field(units, [FOE({ attack: 'all', atk: 6000, turns: 1, element: 'fire' })], 20000);
  let a = battle.endTurn(world).attacks[0];
  assert.equal(a.damage, 6000);
  assert.equal(a.hits.map((h) => h.damage).join(), '1500,1500,1500,1500');
  assert.equal(battle.teamHp, 14000);
  const mixed = [{ id: 'A', atk: 1, element: 'water' }, { id: 'B', atk: 1, element: 'fire' }, { id: 'C', atk: 1, element: 'wood' }, { id: 'D', atk: 1 }];
  ({ world, battle } = field(mixed, [FOE({ attack: 'all', atk: 6000, turns: 1, element: 'fire' })], 20000));
  a = battle.endTurn(world).attacks[0];
  assert.equal(a.hits.map((h) => h.damage).join(), '990,1500,1995,1500');
  assert.equal(a.damage, 990 + 1500 + 1995 + 1500);
  assert.equal(battle.teamHp, 20000 - a.damage);
});

// ------------------------------------------------------------ ステージの定義
test('チームのHPは4体のHPの合計', () => {
  const { battle } = newGame(mods);
  const sum = D.units.reduce((a, u) => a + u.hp, 0);
  assert.equal(battle.teamHpMax, sum);
  assert.equal(battle.teamHp, sum);
  assert.equal(D.units.length, 4);
});

test('ステージの定義: キャラと敵は全員5属性のどれか、敵は種族を持つ', () => {
  const EL = new Set(['fire', 'water', 'wood', 'light', 'dark']);
  for (const u of D.units) {
    assert.ok(EL.has(u.element), `${u.id} の属性`);
    assert.ok(u.hp > 0);
    for (const k of u.killers || []) assert.ok((k.race || k.element) && (!k.rank || BT.KILLER[k.rank]));
    for (const r of u.resist || []) assert.ok(EL.has(r.element) && (!r.rank || BT.RESIST[r.rank]));
    if (u.combo && u.combo.element) assert.ok(EL.has(u.combo.element));
  }
  assert.equal(new Set(D.units.map((u) => u.element)).size, 4, '4体の属性はばらばら');
  for (const e of D.stage.waves.flatMap((w) => w.enemies)) {
    assert.ok(EL.has(e.element), `${e.id} の属性`);
    assert.ok(['dragon', 'slime', 'golem', 'beast'].includes(e.race), `${e.id} の種族`);
  }
});

test('どの敵にも、有利属性で殴れるキャラが1体はいる', () => {
  for (const e of D.stage.waves.flatMap((w) => w.enemies)) {
    assert.ok(D.units.some((u) => BT.elementRate(u.element, e.element) > 1), `${e.id} に有利なキャラがいない`);
  }
});
