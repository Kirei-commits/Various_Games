/**
 * ゲージショット: 成功したショットの間だけ、攻撃力1.2倍とゲージアビリティ（物理・戦闘の両方）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, shoot, runUntilStop } from './helpers.mjs';

const { P, B, D } = loadAll();
const BT = B.Battle;
const FOE = (extra = {}) => ({ id: 'e', shape: 'circle', x: 270, y: 150, r: 40, hp: 1e6, atk: 1, turns: 99, attack: 'single', ...extra });

function field(unit, gimmicks = {}) {
  const world = new P.World();
  world.add({ id: unit.id, kind: 'unit', shot: unit.shot || 'reflect', x: unit.x ?? 270, y: unit.y ?? 700, r: 30, abilities: BT.abilityMap(unit.abilities) });
  const battle = new BT({ units: [unit], stage: { teamHp: 10000, waves: [{ enemies: [FOE()], gimmicks }] } });
  battle.spawnWave(world);
  return { world, battle };
}

test('ゲージ成功: beginShot がゲージアビリティを物理にも渡し、回数を数える', () => {
  const { battle } = field({ id: 'A', atk: 1, gauge: ['antiGravity', 'antiDamageWall'] });
  const m = battle.beginShot('A', false, true);
  assert.deepEqual(Object.keys(m.abilities).sort(), ['antiDamageWall', 'antiGravity']);
  assert.equal(battle.stats.gauge, 1);
  assert.equal(battle.beginShot('A', false, false), null, '失敗なら何も渡さない');
});

test('ゲージ成功のショットだけ、直殴りが1.2倍', () => {
  const { world, battle } = field({ id: 'A', atk: 1000, gauge: [] });
  battle.beginShot('A', false, true);
  const r = battle.apply([{ type: 'hit', id: 'A', other: 'e', x: 270, y: 190 }], world)[0];
  assert.equal(r.damage, 1200);
  assert.equal(r.rates.map((x) => x.kind).join(), 'gauge');
  battle.endTurn(world);
  battle.beginShot('A', false, false);
  assert.equal(battle.apply([{ type: 'hit', id: 'A', other: 'e', x: 270, y: 190 }], world)[0].damage, 1000);
});

test('ゲージの物理アビリティ（アンチ重力バリア）は成功したショットの間だけ効き、止まったら元に戻る', () => {
  const unit = { id: 'A', atk: 1, gauge: ['antiGravity'] };
  const { world, battle } = field(unit, { gravity: [{ id: 'g', x: 270, y: 520, r: 50 }] });
  const events = (gauge) => {
    world.get('A').x = 270; world.get('A').y = 700;
    shoot(world, battle, 'A', 0, -700, false, gauge);
    battle.endTurn(world);
  };
  events(true);
  assert.ok(battle.stats.gravityBlocked >= 1, '行きと帰りで通るので1回以上');
  assert.equal(battle.stats.gravity, 0);
  assert.equal(world.get('A').abilities.antiGravity, undefined, '止まったら元のアビリティに戻る');
  events(false);
  assert.ok(battle.stats.gravity >= 1, 'ゲージ失敗なら減速する');
});

test('ゲージの戦闘アビリティ（アンチダメージウォール）も成功したショットの間だけ', () => {
  const unit = { id: 'A', atk: 1, gauge: ['antiDamageWall'] };
  const { world, battle } = field(unit, { damageWalls: [{ side: 'left', from: 0, to: 800, damage: 500 }] });
  const wall = { type: 'wall', id: 'A', nx: 1, ny: 0, x: 30, y: 400 };
  battle.beginShot('A', false, true);
  battle.apply([wall], world);
  assert.equal(battle.teamHp, 10000);
  battle.endTurn(world);
  battle.beginShot('A', false, false);
  battle.apply([wall], world);
  assert.equal(battle.teamHp, 9500);
});

test('先読みの複製でもゲージの状態は写る', () => {
  const { world, battle } = field({ id: 'A', atk: 1000, gauge: [] });
  battle.beginShot('A', false, true);
  const c = battle.clone();
  assert.equal(c.apply([{ type: 'hit', id: 'A', other: 'e', x: 270, y: 190 }], world.clone())[0].damage, 1200);
});

test('全キャラがゲージアビリティを持ち、持っていないアビリティの中から選んである', () => {
  for (const u of D.roster) {
    assert.ok(Array.isArray(u.gauge) && u.gauge.length >= 1, `${u.id} のゲージ`);
    for (const a of u.gauge) assert.ok(!(u.abilities || []).includes(a), `${u.id} の ${a} は元から持っている`);
  }
});

test('ゲージの予測: 同じ補正を渡せば予測軌道と本番が同じ所で止まる', () => {
  const w = new P.World();
  w.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 270, y: 700, r: 30 });
  w.setFields([{ id: 'g', x: 270, y: 500, r: 60 }]);
  const mods = { abilities: { antiGravity: true } };
  const pred = w.predict('A', 0, -900, { maxLen: 1e9, maxBounces: 1e9, mods });
  w.setVelocity('A', 0, -900, mods);
  const { events } = runUntilStop(w);
  const stop = events.find((e) => e.type === 'stop');
  const last = pred.points[pred.points.length - 1];
  assert.ok(Math.hypot(last.x - stop.x, last.y - stop.y) < 1e-6);
});
