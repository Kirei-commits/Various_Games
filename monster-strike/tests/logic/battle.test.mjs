import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, newGame, shoot } from './helpers.mjs';

const mods = loadAll();
const { P, B, D } = mods;
const C = P.DEFAULTS;
const atk = (id) => D.units.find((u) => u.id === id).atk;
const def = (id) => D.stage.waves.flatMap((w) => w.enemies).find((e) => e.id === id);

/** 味方1体と敵1体だけの小さな戦場 */
function duel(unit, enemy, stage) {
  const units = [{ id: unit.id, shot: unit.shot, atk: unit.atk ?? 1000 }];
  const data = { units, stage: stage ?? { teamHp: 10000, waves: [{ enemies: [enemy] }] } };
  const world = new P.World();
  world.add({ id: unit.id, kind: 'unit', shot: unit.shot, x: unit.x, y: unit.y, r: 30 });
  const battle = new B.Battle(data);
  battle.spawnWave(world);
  return { world, battle };
}

const SLIME = { id: 'e', shape: 'circle', x: 270, y: 300, r: 40, hp: 100000, atk: 1000, turns: 3, attack: 'single' };
const WALLRECT = { id: 'e', shape: 'rect', x: 270, y: 300, w: 200, h: 60, hp: 100000, atk: 1000, turns: 3, attack: 'all' };
const BOSS = { id: 'e', shape: 'circle', x: 270, y: 300, r: 80, hp: 100000, atk: 1000, turns: 3, attack: 'all',
  weak: [{ id: 'w', dx: 0, dy: 80, r: 22 }] };

// ------------------------------------------------------------ 矩形の当たり判定
test('反射タイプは矩形の辺で鏡映しに跳ね返る', () => {
  const { world } = duel({ id: 'A', shot: 'reflect', x: 200, y: 600 }, WALLRECT);
  world.setVelocity('A', 300, -1200);
  world.drainEvents();
  for (let i = 0; i < 400; i++) {
    const a = world.get('A');
    const [bvx, bvy] = [a.vx, a.vy];
    world.step();
    const hit = world.drainEvents().find((e) => e.type === 'hit');
    if (hit) {
      assert.equal(hit.other, 'e');
      assert.deepEqual([hit.nx, hit.ny], [0, 1], '下の辺の法線');
      assert.ok(a.vy > 0 && a.vx > 0, '横向きはそのまま、縦だけ返る');
      assert.ok(Math.abs(a.vx / a.vy + bvx / bvy) < 1e-9, '角度が保たれる');
      assert.equal(hit.y, 330, '接触点は下の辺の上');
      return;
    }
  }
  assert.fail('当たらなかった');
});

test('反射タイプは矩形の角に当たると、角から外向きに跳ね返る', () => {
  const { world } = duel({ id: 'A', shot: 'reflect', x: 140, y: 600 }, WALLRECT);
  // 左下の角 (170, 330) をねらう
  const dx = 170 - 140 - 10, dy = 330 - 600;
  const s = 1500 / Math.hypot(dx, dy);
  world.setVelocity('A', dx * s, dy * s);
  const ev = [];
  while (!world.isSettled() && ev.every((e) => e.type !== 'hit')) { world.step(); ev.push(...world.drainEvents()); }
  const hit = ev.find((e) => e.type === 'hit');
  assert.ok(hit);
  assert.ok(hit.nx < 0 && hit.ny > 0, `角の法線は左下向き (${hit.nx}, ${hit.ny})`);
  assert.deepEqual([hit.x, hit.y], [170, 330]);
});

test('貫通タイプは矩形もすり抜ける', () => {
  const { world } = duel({ id: 'B', shot: 'pierce', x: 270, y: 600 }, WALLRECT);
  world.setVelocity('B', 0, -1800);
  const ev = [];
  let passed = false;
  while (!world.isSettled()) {
    world.step();
    ev.push(...world.drainEvents());
    if (world.get('B').y < 270 - 30) passed = true;
  }
  assert.ok(ev.some((e) => e.type === 'pierce' && e.other === 'e'));
  assert.ok(!ev.some((e) => e.type === 'hit'));
  assert.ok(passed, '矩形の向こう側まで抜けた');
});

test('矩形の中で止まった貫通タイプは外へ押し出される', () => {
  for (let s = 300; s <= 900; s += 25) {
    const { world } = duel({ id: 'B', shot: 'pierce', x: 270, y: 420 }, WALLRECT);
    world.setVelocity('B', 0, -s);
    while (!world.isSettled()) world.step();
    const b = world.get('B');
    const c = P.contact(b, world.get('e'));
    assert.ok(!c || c.depth <= 0.01, `速さ ${s} で重なったまま止まった`);
  }
});

// ------------------------------------------------------------ ダメージと弱点
test('反射タイプが敵に当たると攻撃力ぶんのダメージ', () => {
  const { world, battle } = duel({ id: 'A', shot: 'reflect', atk: 1234, x: 270, y: 600 }, SLIME);
  const recs = shoot(world, battle, 'A', 0, -700);
  assert.ok(recs.length >= 1);
  assert.equal(recs[0].damage, 1234);
  assert.equal(recs[0].weak, false);
  assert.equal(battle.enemy('e').hp, 100000 - recs.reduce((a, r) => a + r.damage, 0));
});

test('反射タイプが弱点に当たると3倍', () => {
  const { world, battle } = duel({ id: 'A', shot: 'reflect', atk: 1000, x: 270, y: 600 }, BOSS);
  const recs = shoot(world, battle, 'A', 0, -700);
  assert.equal(recs[0].weak, true);
  assert.equal(recs[0].damage, 1000 * B.Battle.WEAK_RATE);
});

test('弱点から外れた場所に当たると等倍', () => {
  const { world, battle } = duel({ id: 'A', shot: 'reflect', atk: 1000, x: 150, y: 600 }, BOSS);
  // 左斜め下から、弱点（真下）ではない所に当てる
  const recs = shoot(world, battle, 'A', 100, -700);
  assert.ok(recs.length >= 1);
  assert.equal(recs[0].weak, false);
  assert.equal(recs[0].damage, 1000);
});

test('貫通タイプが弱点を通ると、突入の等倍に加えて弱点の3倍が入る', () => {
  const { world, battle } = duel({ id: 'B', shot: 'pierce', atk: 1000, x: 270, y: 600 }, BOSS);
  world.setVelocity('B', 0, -1600);
  world.drainEvents();
  const recs = [];
  // 最初の通過だけを見る（壁で跳ね返って戻ってくる前）
  while (world.get('B').vy < 0 && !world.isSettled()) {
    world.step();
    recs.push(...battle.apply(world.drainEvents(), world));
  }
  // 弱点は縁から少しはみ出しているので、体より先に触れることがある（順序は問わない）
  const got = recs.map((r) => `${r.damage}:${r.weak}`).sort();
  assert.deepEqual(got, ['1000:false', '3000:true']);
});

test('HPが0になった敵は消え、その場所は素通りになる', () => {
  const weak = { ...SLIME, hp: 500 };
  const { world, battle } = duel({ id: 'A', shot: 'reflect', atk: 1000, x: 270, y: 600 }, weak);
  const recs = shoot(world, battle, 'A', 0, -1200);
  assert.equal(recs.length, 1, '倒した後は当たらない');
  assert.equal(recs[0].killed, true);
  assert.equal(recs[0].damage, 1000, '表示は攻撃力そのまま');
  assert.equal(battle.stats.damage, 500, '集計は実際に削ったぶん');
  assert.equal(world.get('e'), null);
  assert.equal(battle.enemy('e').alive, false);
});

test('貫通中に敵を倒しても、そのあとの摩擦が強いままにならない', () => {
  const weak = { ...SLIME, hp: 1 };
  const { world, battle } = duel({ id: 'B', shot: 'pierce', atk: 1000, x: 270, y: 600 }, weak);
  world.setVelocity('B', 0, -1500);
  world.drainEvents();
  while (!world.isSettled()) {
    world.step();
    battle.apply(world.drainEvents(), world);
    if (!battle.enemy('e').alive) break;
  }
  assert.deepEqual(Object.keys(world.get('B').overlaps), []);
});

test('止まっている味方に当たってもダメージにはならない', () => {
  const { world, battle } = newGame(mods);
  const a = world.get('A');
  a.x = 130; a.y = 560;
  const recs = shoot(world, battle, 'A', 0, 900); // 真下へ → 味方の近くの壁
  assert.ok(recs.every((r) => !['A', 'B', 'C', 'D'].includes(r.enemy)));
});

// ------------------------------------------------------------ 友情コンボ
/** 味方2体と敵だけの戦場。mover が ally に当たるように置く */
function comboField(allyCombo, enemies, { shot = 'reflect', ally = { x: 270, y: 600 } } = {}) {
  const units = [
    { id: 'M', shot, atk: 1000, combo: null },
    { id: 'F', shot: 'reflect', atk: 1000, combo: allyCombo }
  ];
  const data = { units, stage: { teamHp: 10000, waves: [{ enemies }] } };
  const world = new P.World();
  world.add({ id: 'M', kind: 'unit', shot, x: ally.x, y: ally.y + 120, r: 30 });
  world.add({ id: 'F', kind: 'unit', shot: 'reflect', x: ally.x, y: ally.y, r: 30 });
  const battle = new B.Battle(data);
  battle.spawnWave(world);
  return { world, battle };
}
const E = (id, x, y, extra = {}) => ({ id, shape: 'circle', x, y, r: 30, hp: 100000, atk: 1, turns: 9, attack: 'single', ...extra });

/** M が F に1回だけ触れたことにする（友情コンボの中身だけを調べる） */
const touch = (world, battle) => [...battle.apply([{ type: 'hit', id: 'M', other: 'F', x: 270, y: 600 }], world)];

test('反射で味方に当たると、その味方の友情コンボが出る（触れるたびに毎回）', () => {
  const { world, battle } = comboField({ kind: 'blast', power: 700, radius: 150 }, [E('near', 270, 470), E('far', 80, 100)]);
  const recs = shoot(world, battle, 'M', 0, -900);
  const combo = recs.filter((r) => r.combo === 'blast');
  assert.ok(combo.length >= 1 && combo.every((r) => r.enemy === 'near' && r.damage === 700 && r.unit === 'F'));
  assert.equal(battle.stats.combos, combo.length, '触れた回数だけ出る');
  const fired = battle.drainCombos();
  assert.equal(fired.length, combo.length);
  assert.deepEqual([fired[0].ally, fired[0].by, fired[0].kind], ['F', 'M', 'blast']);
  assert.equal(battle.drainCombos().length, 0);
});

test('貫通で味方を通り抜けても友情コンボが出る', () => {
  const { world, battle } = comboField({ kind: 'blast', power: 700, radius: 150 }, [E('near', 270, 470)], { shot: 'pierce' });
  shoot(world, battle, 'M', 0, -900);
  assert.ok(battle.stats.combos >= 1);
});

test('同じ味方でも、触れるたびに毎回友情コンボが出る', () => {
  const { world, battle } = comboField({ kind: 'blast', power: 700, radius: 150 }, [E('e', 80, 100)]);
  // 味方と下の壁の間を何度も往復させる
  world.get('F').y = 700; world.get('M').y = 770;
  const ev = [];
  world.setVelocity('M', 0, -1600);
  while (!world.isSettled()) { world.step(); const e = world.drainEvents(); ev.push(...e); battle.apply(e, world); }
  const touches = ev.filter((e) => e.type === 'hit' && e.other === 'F').length;
  assert.ok(touches >= 2, '2回以上ぶつかった');
  assert.equal(battle.stats.combos, touches);
});

test('友情コンボを3つ持つキャラは、触れると3つとも出る', () => {
  const units = [{ id: 'M', shot: 'reflect', atk: 1000 },
    { id: 'F', shot: 'reflect', atk: 1000, combos: [{ kind: 'blast', power: 100, radius: 999 }, { kind: 'lockon', power: 200, count: 1 }, { kind: 'homing', power: 300, count: 2 }] }];
  const world = new P.World();
  world.add({ id: 'M', kind: 'unit', shot: 'reflect', x: 270, y: 720, r: 30 });
  world.add({ id: 'F', kind: 'unit', shot: 'reflect', x: 270, y: 600, r: 30 });
  const battle = new B.Battle({ units, stage: { teamHp: 10000, waves: [{ enemies: [E('e', 270, 200)] }] } });
  battle.spawnWave(world);
  const recs = touch(world, battle);
  assert.equal(recs.map((r) => r.combo).join(), 'blast,lockon,homing,homing');
  assert.equal(recs.reduce((a, r) => a + r.damage, 0), 100 + 200 + 600);
  assert.equal(battle.stats.combos, 1, '友情の回数は触れた回数');
});

test('クロスレーザーは味方を通る縦横の線上の敵だけに当たる', () => {
  const laser = { kind: 'laser', power: 900, width: 34 };
  const { world, battle } = comboField(laser, [
    E('row', 60, 600),                                      // 横の線上
    E('col', 270, 200),                                     // 縦の線上
    E('edge', 480, 600 + 30 + 17 - 1),                      // 縁がぎりぎりかかる
    E('miss', 100, 300),                                    // どちらにも無い
    { id: 'wall', shape: 'rect', x: 420, y: 250, w: 200, h: 40, hp: 100000, atk: 1, turns: 9, attack: 'all' } // 矩形は幅で判定
  ]);
  const recs = touch(world, battle);
  assert.deepEqual(recs.map((r) => r.enemy).sort(), ['col', 'edge', 'row']);
  assert.ok(recs.every((r) => r.damage === 900));
});

test('斜めクロスレーザーは斜め、全方位レーザーは縦・横・斜めの線上の敵に当たる', () => {
  const foes = [E('diag', 470, 400), E('col', 270, 200), E('row', 60, 600), E('miss', 150, 300)];
  const x = comboField({ kind: 'xlaser', power: 500, width: 40 }, foes);
  assert.deepEqual(touch(x.world, x.battle).map((r) => r.enemy).sort(), ['diag']);
  const st = comboField({ kind: 'star', power: 500, width: 40 }, foes);
  assert.deepEqual(touch(st.world, st.battle).map((r) => r.enemy).sort(), ['col', 'diag', 'row']);
});

test('貫通ホーミングは通り道の敵にも当たり、誘導雷は近い順につながり、ロックオンは全部の敵に当たる', () => {
  // 味方 (270,600) → 奥の敵 (270,100)。途中の (270,350) にも当たる
  // 1発目は一番近い side をねらう（通り道に他の敵はいない）
  const ph = comboField({ kind: 'pierceHoming', power: 300, count: 1, width: 20 }, [E('mid', 270, 350), E('back', 270, 100), E('side', 60, 500)]);
  assert.deepEqual(touch(ph.world, ph.battle).map((r) => r.enemy), ['side']);
  const ph2 = comboField({ kind: 'pierceHoming', power: 300, count: 2, width: 20 }, [E('mid', 270, 350), E('back', 270, 100)]);
  const r2 = touch(ph2.world, ph2.battle).map((r) => r.enemy);
  assert.deepEqual(r2, ['mid', 'mid', 'back'], '2発目は back をねらい、通り道の mid にも当たる');
  const lt = comboField({ kind: 'lightning', power: 400, count: 5 }, [E('a', 270, 470), E('b', 270, 300), E('c', 100, 300)]);
  assert.deepEqual(touch(lt.world, lt.battle).map((r) => r.enemy), ['a', 'b', 'c'], '同じ敵には1回');
  const lo = comboField({ kind: 'lockon', power: 250, count: 2 }, [E('a', 270, 470), E('b', 60, 100)]);
  const rl = touch(lo.world, lo.battle);
  assert.equal(rl.length, 4);
  assert.ok(rl.every((r) => r.damage === 250));
});

test('爆発は半径の中の敵（矩形は一番近い辺までの距離）に当たる', () => {
  const blast = { kind: 'blast', power: 800, radius: 150 };
  const { world, battle } = comboField(blast, [
    E('in', 270 + 150 + 30 - 1, 600),
    E('out', 270 - 150 - 30 - 2, 600),
    { id: 'rect', shape: 'rect', x: 270, y: 600 - 150 - 20 + 1, w: 300, h: 40, hp: 100000, atk: 1, turns: 9, attack: 'all' }
  ]);
  assert.deepEqual(touch(world, battle).map((r) => r.enemy).sort(), ['in', 'rect']);
});

test('ホーミングは近い敵から順に1発ずつ配り、倒れた敵は飛ばす', () => {
  const homing = { kind: 'homing', power: 500, count: 5 };
  const { world, battle } = comboField(homing, [E('far', 480, 80), E('near', 270, 470, { hp: 400 }), E('mid', 60, 400)]);
  const recs = touch(world, battle);
  // near は1発目で倒れるので、2巡目からは mid → far の順
  assert.deepEqual(recs.map((r) => r.enemy).join(), 'near,mid,far,mid,far');
  assert.equal(recs[0].killed, true);
  assert.equal(world.get('near'), null);
});

test('友情コンボで敵を全滅させてもおかしくならない', () => {
  const { world, battle } = comboField({ kind: 'blast', power: 999999, radius: 999 }, [E('a', 80, 100), E('b', 480, 100)]);
  shoot(world, battle, 'M', 0, -700);
  assert.ok(battle.waveCleared());
  assert.equal(battle.endTurn(world).type, 'won');
});

test('友情コンボの無い味方・自分自身では何も起きない', () => {
  const { world, battle } = comboField(null, [E('e', 270, 470)]);
  shoot(world, battle, 'M', 0, -700);
  assert.equal(battle.stats.combos, 0);
  battle.apply([{ type: 'hit', id: 'M', other: 'M' }], world);
  assert.equal(battle.stats.combos, 0);
});

test('全キャラが3つの違う友情コンボを持つ', () => {
  const KINDS = ['homing', 'laser', 'blast', 'spread', 'pierceHoming', 'lightning', 'lockon', 'xlaser', 'star'];
  for (const u of D.roster) {
    const ks = u.combos.map((c) => c.kind);
    assert.equal(ks.length, 3, u.id);
    assert.equal(new Set(ks).size, 3, `${u.id} は同じ種類を重ねない`);
    for (const c of u.combos) assert.ok(KINDS.includes(c.kind) && c.power > 0 && c.name, `${u.id} ${c.kind}`);
  }
  assert.ok(D.roster.some((u) => u.combos.some((c) => c.name === 'レーザーEL')), '最強レーザーがいる');
});

// ------------------------------------------------------------ ターンと敵の攻撃
test('ターンの終わりにカウンターが減り、0になった敵が攻撃してカウンターが戻る', () => {
  const { world, battle } = duel({ id: 'A', shot: 'reflect', x: 270, y: 700 }, { ...SLIME, turns: 2, atk: 1500 });
  assert.equal(battle.enemy('e').counter, 2);
  let r = battle.endTurn(world);
  assert.equal(r.type, 'next');
  assert.equal(battle.enemy('e').counter, 1);
  r = battle.endTurn(world);
  assert.equal(r.type, 'attack');
  assert.equal(r.attacks.length, 1);
  assert.deepEqual([r.attacks[0].damage, r.attacks[0].hpAfter, r.attacks[0].target], [1500, 8500, 'A']);
  assert.equal(battle.teamHp, 8500);
  assert.equal(battle.enemy('e').counter, 2);
  assert.equal(battle.turn, 3);
});

test('チームのHPが0になったら負け。その後は何も起きない', () => {
  const { world, battle } = duel({ id: 'A', shot: 'reflect', x: 270, y: 700 }, { ...SLIME, turns: 1, atk: 6000 });
  assert.equal(battle.endTurn(world).type, 'attack');
  const r = battle.endTurn(world);
  assert.equal(r.type, 'lost');
  assert.equal(battle.teamHp, 0);
  assert.equal(battle.state, 'lost');
  assert.equal(battle.endTurn(world).type, 'lost');
  assert.deepEqual(battle.apply([{ type: 'hit', id: 'A', other: 'e' }], world).length, 0);
});

test('全滅させたターンは敵が攻撃せず、次のウェーブが出る。最後のウェーブを倒せば勝ち', () => {
  const { world, battle } = newGame(mods);
  assert.equal(battle.wave, 0);
  const firstIds = battle.enemies.map((e) => e.id);
  for (const id of firstIds) battle.kill(id, world);
  const hp = battle.teamHp;
  let r = battle.endTurn(world);
  assert.equal(r.type, 'wave');
  assert.equal(battle.teamHp, hp);
  assert.equal(battle.wave, 1);
  assert.ok(battle.enemies.some((e) => e.def.boss));
  for (const id of firstIds) assert.equal(world.get(id), null);
  for (const e of battle.enemies) assert.ok(world.get(e.id));

  for (const e of battle.enemies) battle.kill(e.id, world);
  r = battle.endTurn(world);
  assert.equal(r.type, 'won');
  assert.equal(battle.state, 'won');
});

test('出現した敵に重なる位置にいた味方は押し出される', () => {
  const { world, battle } = newGame(mods);
  for (const e of battle.enemies) battle.kill(e.id, world);
  const dragon = def('w2-dragon');
  world.get('A').x = dragon.x; world.get('A').y = dragon.y;
  battle.endTurn(world);
  const a = world.get('A');
  for (const e of battle.enemies) {
    const c = P.contact(a, world.get(e.id));
    assert.ok(!c || c.depth <= 0.01, `${e.id} に重なっている`);
  }
});

test('単体攻撃はいちばん近い味方をねらう', () => {
  const { world, battle } = newGame(mods);
  const slime = battle.enemy('w1-slime-l');
  slime.counter = 1;
  world.get('B').x = 130; world.get('B').y = 320;
  const r = battle.endTurn(world);
  assert.equal(r.attacks.find((a) => a.enemy === 'w1-slime-l').target, 'B');
});

test('複製は元の戦闘に影響しない', () => {
  const { world, battle } = newGame(mods);
  const c = battle.clone();
  const w = world.clone();
  c.kill('w1-golem', w);
  c.endTurn(w);
  assert.equal(battle.enemy('w1-golem').alive, true);
  assert.equal(battle.turn, 1);
  assert.ok(world.get('w1-golem'));
});

// ------------------------------------------------------------ ステージの定義
test('ステージの定義: 敵どうし・味方・壁が重ならず、弱点は敵の縁にある', () => {
  const W = C.field.w, H = C.field.h;
  for (const [wi, wave] of D.stage.waves.entries()) {
    const world = new P.World();
    for (const u of D.units) world.add({ id: u.id, kind: 'unit', shot: u.shot, x: u.x, y: u.y, r: u.r });
    for (const e of wave.enemies) {
      const b = world.add(B.Battle.enemyBody(e));
      const ext = B.Battle.extentOf(e), ex = ext.x, ey = ext.y;
      // 敵と壁の間を味方が通れる（壁カンができる）
      assert.ok(e.x - ex >= 64 && e.x + ex <= W - 64 && e.y - ey >= 64, `wave${wi + 1} ${e.id} が壁に近すぎる`);
      assert.ok(e.hp > 0 && e.atk > 0 && e.turns >= 1 && ['single', 'all'].includes(e.attack));
      for (const w of e.weak || []) {
        assert.ok(Math.abs(Math.hypot(w.dx, w.dy) - e.r) < 1, '弱点は縁に置く（反射で当てられるように）');
      }
      void b;
    }
    for (const u of D.units) assert.equal(world._overlapping(world.get(u.id)), null, `wave${wi + 1} ${u.id} が敵に重なる`);
    const ids = new Set();
    for (const e of wave.enemies) { assert.ok(!ids.has(e.id)); ids.add(e.id); }
  }
  // 敵の id はステージ全体で一意（World から取り除くときに取り違えない）
  const all = D.stage.waves.flatMap((w) => w.enemies.map((e) => e.id));
  assert.equal(new Set(all).size, all.length);
});

test('ステージで乱射しても、すり抜け・めり込み・場外・停止しないが起きない', () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 300; n++) {
    const { world, battle } = newGame(mods);
    if (n % 2) { for (const e of battle.enemies) battle.kill(e.id, world); battle.endTurn(world); }
    const id = rnd() < 0.5 ? 'A' : 'B';
    const me = world.get(id);
    const ang = rnd() * Math.PI * 2, sp = C.speed.min + rnd() * (C.speed.max - C.speed.min);
    world.setVelocity(id, Math.cos(ang) * sp, Math.sin(ang) * sp);
    let steps = 0;
    while (!world.isSettled()) {
      world.step();
      battle.apply(world.drainEvents(), world);
      steps++;
      assert.ok(me.x >= me.r - 1e-6 && me.x <= C.field.w - me.r + 1e-6 && me.y >= me.r - 1e-6 && me.y <= C.field.h - me.r + 1e-6, `#${n} 場外`);
      if (me.shot === 'reflect') {
        for (const o of world.bodies) {
          if (o === me) continue;
          const c = P.contact(me, o);
          assert.ok(!c || c.depth <= 1, `#${n} ${o.id} に ${c && c.depth} めり込んだ`);
        }
      }
      assert.ok(steps < 240 * 20, `#${n} 止まらない`);
    }
    assert.equal(world._overlapping(me), null, `#${n} 重なったまま止まった`);
  }
});
