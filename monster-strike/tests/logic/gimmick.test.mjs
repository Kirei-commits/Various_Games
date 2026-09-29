import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, newGame, shoot } from './helpers.mjs';

const mods = loadAll();
const { P, B, D } = mods;
const C = P.DEFAULTS;

// ------------------------------------------------------------ 重力バリア（物理）
function gravityWorld(abilities = {}) {
  const w = new P.World();
  w.add({ id: 'u', kind: 'unit', shot: 'reflect', x: 270, y: 700, r: 30, abilities });
  w.setFields([{ id: 'g', x: 270, y: 450, r: 60 }]);
  return w;
}

test('重力バリアに入った瞬間に大きく減速し、中では摩擦が強い', () => {
  const w = gravityWorld();
  const u = w.get('u');
  w.setVelocity('u', 0, -1500);
  w.drainEvents();
  let entered = null, before = 0;
  while (u.moving && !entered) {
    before = u.speed();
    w.step();
    entered = w.drainEvents().find((e) => e.type === 'gravity');
  }
  assert.ok(entered);
  assert.equal(entered.blocked, false);
  assert.ok(Math.abs(u.speed() / before - C.gravity.enterFactor) < 0.01, `残った速さ ${u.speed() / before}`);
  // 中の1ステップの減速は外より大きい
  const s0 = u.speed(); w.step(); const inside = s0 - u.speed();
  const free = (C.friction.linear + C.friction.drag * s0) * C.step;
  assert.ok(inside > free * 2, `${inside} > ${free} × 2`);
});

test('重力バリアがあると、同じ強さでも進める距離がずっと短い', () => {
  const traveled = (fields) => {
    const w = gravityWorld();
    if (!fields) w.setFields([]);
    w.setVelocity('u', 0, -700);
    while (!w.isSettled()) w.step();
    return w.get('u').traveled;
  };
  const withG = traveled(true), free = traveled(false);
  assert.ok(withG < free * 0.6, `${withG.toFixed(0)} < ${free.toFixed(0)} × 0.6`);
});

test('アンチ重力バリアなら減速しない。通過の知らせは1回だけ（毎ステップ出さない）', () => {
  const w = gravityWorld({ antiGravity: true });
  const u = w.get('u');
  w.setVelocity('u', 0, -1500);
  w.drainEvents();
  const ev = [];
  let before = 0;
  while (u.y > 300) {
    before = u.speed();
    w.step();
    const e = w.drainEvents();
    ev.push(...e);
    if (e.some((x) => x.type === 'gravity')) {
      const free = (C.friction.linear + C.friction.drag * before) * C.step;
      assert.ok(Math.abs(before - u.speed() - free) < 1e-6, '普通の摩擦だけ');
    }
  }
  const g = ev.filter((e) => e.type === 'gravity');
  assert.equal(g.length, 1);
  assert.equal(g[0].blocked, true);
});

test('予測軌道も重力バリアの減速を反映する', () => {
  const w = gravityWorld();
  const pred = w.predict('u', 0, -900, { maxLen: 5000, maxBounces: 99 });
  w.setVelocity('u', 0, -900);
  while (!w.isSettled()) w.step();
  const end = pred.points.at(-1);
  assert.ok(Math.hypot(end.x - w.get('u').x, end.y - w.get('u').y) < 1);
});

// ------------------------------------------------------------ ダメージウォール（戦闘）
function dwField(abilities, walls = [{ side: 'left', from: 100, to: 500, damage: 700 }], hp = 5000) {
  const units = [{ id: 'u', shot: 'reflect', atk: 1000, abilities }];
  const data = { units, stage: { teamHp: hp, waves: [{ enemies: [{ id: 'e', shape: 'circle', x: 400, y: 100, r: 30, hp: 1e6, atk: 1, turns: 9, attack: 'single' }], gimmicks: { damageWalls: walls } }] } };
  const world = new P.World();
  world.add({ id: 'u', kind: 'unit', shot: 'reflect', x: 200, y: 300, r: 30, abilities: B.Battle.abilityMap(abilities) });
  const battle = new B.Battle(data);
  battle.spawnWave(world);
  return { world, battle };
}

test('ダメージウォールに触れるとチームのHPが減る', () => {
  const { world, battle } = dwField([]);
  shoot(world, battle, 'u', -600, 0);   // 左の壁へ
  assert.equal(battle.teamHp, 5000 - 700);
  assert.equal(battle.stats.dwHits, 1);
  const h = battle.drainHazards().filter((x) => x.kind === 'dw');
  assert.equal(h.map((x) => [x.damage, x.blocked, x.hpAfter].join(':')).join(), '700:false:4300');
  assert.ok(h[0].x < 5, '接触点は壁の上');
});

test('アンチダメージウォールなら無効', () => {
  const { world, battle } = dwField(['antiDamageWall']);
  shoot(world, battle, 'u', -600, 0);
  assert.equal(battle.teamHp, 5000);
  assert.equal(battle.stats.dwBlocked, 1);
  assert.equal(battle.drainHazards()[0].blocked, true);
});

test('範囲の外・別の辺の壁ではダメージを受けない', () => {
  const a = dwField([], [{ side: 'left', from: 400, to: 600, damage: 700 }]);
  shoot(a.world, a.battle, 'u', -600, 0);     // y=300 は範囲外
  assert.equal(a.battle.teamHp, 5000);
  const b = dwField([], [{ side: 'right', from: 100, to: 500, damage: 700 }]);
  shoot(b.world, b.battle, 'u', -400, 0);     // 左の壁にしか触れない強さ
  assert.equal(b.battle.stats.dwHits + b.battle.stats.dwBlocked, 0);
  assert.equal(b.battle.teamHp, 5000);
});

test('何度も触れればそのたびに減る', () => {
  const { world, battle } = dwField([], [{ side: 'left', from: 0, to: 800, damage: 100 }, { side: 'right', from: 0, to: 800, damage: 100 }]);
  shoot(world, battle, 'u', -2200, 0);
  assert.ok(battle.stats.dwHits >= 2);
  assert.equal(battle.teamHp, 5000 - 100 * battle.stats.dwHits);
});

test('動いている途中でHPが0になったら、その場で負けが決まる', () => {
  const { world, battle } = dwField([], [{ side: 'left', from: 0, to: 800, damage: 700 }], 500);
  const recs = shoot(world, battle, 'u', -600, 0);
  assert.equal(battle.teamHp, 0);
  assert.equal(battle.state, 'lost');
  assert.equal(recs.length, 0);
  assert.equal(battle.endTurn(world).type, 'lost');
});

// ------------------------------------------------------------ ステージのギミック
test('ウェーブごとにギミックが入れ替わる（重力バリアはボス戦だけ）', () => {
  const { world, battle } = newGame(mods);
  assert.equal(world.fields.length, 0);
  assert.equal(battle.damageWalls.length, 2);
  for (const e of battle.alive()) battle.kill(e.id, world);
  battle.endTurn(world);
  assert.equal(world.fields.length, 1);
  assert.deepEqual(battle.damageWalls.map((d) => d.side).join(), 'top');
});

test('ステージのギミックの定義: 範囲は壁の長さの中、重力バリアは味方の初期位置にかからない', () => {
  for (const wave of D.stage.waves) {
    const g = wave.gimmicks || {};
    for (const dw of g.damageWalls || []) {
      const len = dw.side === 'left' || dw.side === 'right' ? C.field.h : C.field.w;
      assert.ok(dw.from >= 0 && dw.to <= len && dw.from < dw.to && dw.damage > 0);
    }
    for (const f of g.gravity || []) {
      for (const u of D.units) assert.ok(Math.hypot(u.x - f.x, u.y - f.y) > f.r + u.r, `${f.id} が ${u.id} にかかる`);
    }
  }
});

test('キャラのアビリティ: A はアンチダメージウォール、B はアンチ重力バリア、C は無し', () => {
  const ab = D.units.map((u) => `${u.id}:${(u.abilities || []).join('+')}`).join();
  assert.equal(ab, 'A:antiDamageWall,B:antiGravity,C:');
});

test('複製の先読みでダメージウォールを踏んでも、元の戦闘のHPは減らない', () => {
  const { world, battle } = dwField([]);
  const b = battle.clone(), w = world.clone();
  shoot(w, b, 'u', -600, 0);
  assert.equal(b.teamHp, 4300);
  assert.equal(battle.teamHp, 5000);
  assert.equal(battle.hazards.length, 0);
});
