/**
 * 追加の特性（クリティカル・ドレイン・壁ドン・友情ブースト・弱点キラー・ボスキラー・ガード・スピードアップ・ちび癒し・カウンター）
 * と、追加の友情コンボ（メテオ・ヒーリング・エナジーサークル・ソード・短距離拡散・超強ホーミング）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './helpers.mjs';

const { P, B } = loadAll();
const BT = B.Battle;
const E = (id, x, y, extra = {}) => ({ id, shape: 'circle', x, y, r: 30, hp: 1e6, atk: 1000, turns: 9, attack: 'all', ...extra });

function field(units, enemies, teamHp) {
  const world = new P.World();
  units.forEach((u, i) => world.add({ id: u.id, kind: 'unit', shot: 'reflect', x: u.x ?? 100 + i * 120, y: u.y ?? 700, r: 30 }));
  const battle = new BT({ units: units.map((u) => ({ hp: teamHp ? teamHp / units.length : 5000, ...u })), stage: { waves: [{ enemies }] } });
  battle.spawnWave(world);
  return { world, battle };
}
const hit = (battle, world, id, other = 'e', weak = null) => [...battle.apply([{ type: 'hit', id, other, x: 270, y: 200, weak }], world)];

test('クリティカル: 直殴り6回に1回だけ5倍', () => {
  const { world, battle } = field([{ id: 'A', atk: 100, abilities: ['critical'] }], [E('e', 270, 200)]);
  battle.beginShot('A', false);
  const dmg = [];
  for (let i = 0; i < 12; i++) dmg.push(hit(battle, world, 'A')[0].damage);
  assert.deepEqual(dmg, [100, 100, 100, 100, 100, 500, 100, 100, 100, 100, 100, 500]);
});

test('ドレイン: 直殴りのダメージの1割回復（最大HPは超えない）', () => {
  const { world, battle } = field([{ id: 'A', atk: 1000, abilities: ['drain'] }], [E('e', 270, 200)], 10000);
  battle.teamHp = 5000;
  battle.beginShot('A', false);
  hit(battle, world, 'A');
  assert.equal(battle.teamHp, 5100);
  battle.teamHp = 9990;
  hit(battle, world, 'A');
  assert.equal(battle.teamHp, 10000);
});

test('壁ドン: そのショットで壁に当たるたび +10%（最大2倍）', () => {
  const { world, battle } = field([{ id: 'A', atk: 1000, abilities: ['wallBoost'] }], [E('e', 270, 200)]);
  battle.beginShot('A', false);
  const wall = { type: 'wall', id: 'A', nx: 1, ny: 0, x: 30, y: 400 };
  battle.apply([wall, wall, wall], world);
  assert.equal(hit(battle, world, 'A')[0].damage, 1300);
  for (let i = 0; i < 20; i++) battle.apply([wall], world);
  assert.equal(hit(battle, world, 'A')[0].damage, 2000, '最大2倍');
});

test('友情ブースト・弱点キラー・ボスキラー', () => {
  const { world, battle } = field([{ id: 'M', atk: 1 }, { id: 'F', atk: 1, abilities: ['comboBoost'], combos: [{ kind: 'lockon', power: 1000, count: 1 }] }],
    [E('e', 270, 200)]);
  assert.equal(hit(battle, world, 'M', 'F')[0].damage, 1500, '友情ブーストは持ち主の友情が1.5倍');
  const w2 = field([{ id: 'A', atk: 1000, abilities: ['weakKiller', 'bossKiller'] }], [E('e', 270, 200, { boss: true })]);
  w2.battle.beginShot('A', false);
  assert.equal(hit(w2.battle, w2.world, 'A')[0].damage, 1500, 'ボス 1.5倍');
  assert.equal(hit(w2.battle, w2.world, 'A', 'e', 'w')[0].damage, 1000 * 3 * 2 * 1.5, '弱点3倍×弱点キラー2倍×ボス1.5倍');
});

test('ガードは受けるダメージが0.7倍、カウンターは攻撃を受けた次の自分のショットが1.5倍', () => {
  const { world, battle } = field([{ id: 'A', atk: 1000, abilities: ['guard'] }, { id: 'B', atk: 1000, abilities: ['counter'] }],
    [E('e', 270, 200, { atk: 2000, turns: 1 })]);
  const r = battle.endTurn(world);
  const byUnit = Object.fromEntries(r.attacks[0].hits.map((h) => [h.unit, h.damage]));
  assert.equal(byUnit.A, 700);
  assert.equal(byUnit.B, 1000);
  battle.beginShot('B', false);
  assert.equal(hit(battle, world, 'B')[0].damage, 1500);
  battle.endTurn(world);
  battle.beginShot('A', false);
  battle.endTurn(world);
  battle.us.B.counter = 0;
  battle.beginShot('B', false);
  assert.equal(hit(battle, world, 'B')[0].damage, 1000, '攻撃を受けていなければ普通');
});

test('スピードアップは初速1.2倍、ちび癒しは味方に触れるたびに最大HPの3%回復', () => {
  const { world, battle } = field([{ id: 'A', atk: 1, abilities: ['speedUp', 'healTouch'] }, { id: 'B', atk: 1 }], [E('e', 270, 200)], 10000);
  const mods = battle.beginShot('A', false);
  assert.equal(mods.speed, 1.2);
  battle.teamHp = 5000;
  battle.apply([{ type: 'touch', id: 'A', other: 'B', x: 0, y: 0 }], world);
  assert.equal(battle.teamHp, 5300);
});

test('メテオはHPの多い敵から、ヒーリングは回復、サークルは輪の中、ソードは近くの敵', () => {
  const foes = [E('big', 270, 200, { hp: 9e6 }), E('near', 270, 520), E('far', 60, 100)];
  const run = (c, teamHp) => {
    const f = field([{ id: 'M', atk: 1, x: 270, y: 720 }, { id: 'F', atk: 1, x: 270, y: 600, combos: [c] }], JSON.parse(JSON.stringify(foes)), teamHp);
    if (teamHp) f.battle.teamHp = 1000;
    return { recs: hit(f.battle, f.world, 'M', 'F').map((r) => r.enemy), battle: f.battle };
  };
  assert.deepEqual(run({ kind: 'meteor', power: 100, count: 3 }).recs, ['big', 'big', 'big']);
  const h = run({ kind: 'heal', power: 2500 }, 10000);
  assert.deepEqual(h.recs, []);
  assert.equal(h.battle.teamHp, 3500);
  assert.deepEqual(run({ kind: 'circle', power: 100, radius: 520, inner: 200 }).recs.sort(), ['big', 'far'].sort());
  assert.deepEqual(run({ kind: 'sword', power: 100, range: 60, count: 2 }).recs, ['near', 'near']);
  assert.equal(run({ kind: 'bigHoming', power: 100, count: 3 }).recs.length, 3);
  assert.ok(run({ kind: 'shotgun', power: 100, count: 8, range: 200 }).recs.every((id) => id === 'near'), '短距離拡散は近い敵だけ');
});
