/**
 * フェーズ6〜8: SS・新しいギミック（地雷・ワープ・ブロック・魔法陣・減速壁・超アンチ）・翼の当たり判定・アイテム・2つ目のステージ
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, newGame, shoot, runUntilStop } from './helpers.mjs';

const mods = loadAll();
const { P, B, D } = mods;
const BT = B.Battle;
const C = P.DEFAULTS;

const FOE = (extra = {}) => ({ id: 'e', shape: 'circle', x: 270, y: 150, r: 40, hp: 1e6, atk: 1, turns: 99, attack: 'single', ...extra });

/**
 * 小さな戦場。units は定義（x, y は置き場所）、wave はウェーブ1つぶん（enemies / gimmicks / items）。
 * 物理にもアビリティを渡す（本番と同じ）。
 */
function field(units, wave, teamHp = 20000) {
  const world = new P.World();
  units.forEach((u, i) => world.add({ id: u.id, kind: 'unit', shot: u.shot || 'reflect', x: u.x ?? 90 + i * 120, y: u.y ?? 700, r: 30,
    abilities: BT.abilityMap(u.abilities) }));
  const battle = new BT({ units, stage: { teamHp, waves: [{ enemies: [FOE()], ...wave }] } });
  battle.spawnWave(world);
  return { world, battle };
}

/** 真上に撃って止まるまで（戦闘も回す） */
function fire(world, battle, id, vx, vy, useSS = false) {
  return shoot(world, battle, id, vx, vy, useSS);
}

// ------------------------------------------------------------ SS
test('SS の残りは誰が撃っても1ショットごとに全員1ずつ減り、0で使える', () => {
  const units = [{ id: 'A', atk: 1, ss: { name: 's', turns: 3, atk: 2 } }, { id: 'B', atk: 1, ss: { name: 't', turns: 2, atk: 2 } }];
  const { world, battle } = field(units, {});
  assert.deepEqual([battle.us.A.ssLeft, battle.us.B.ssLeft], [3, 2]);
  assert.equal(battle.ssReady('A'), false);
  battle.endTurn(world); battle.endTurn(world);
  assert.deepEqual([battle.us.A.ssLeft, battle.us.B.ssLeft], [1, 0]);
  assert.equal(battle.ssReady('B'), true);
  battle.endTurn(world);
  assert.equal(battle.us.B.ssLeft, 0, '0 より下にはならない');
  assert.equal(battle.ssReady('A'), true);
});

test('溜まっていない SS は使えず、使うと残りが元に戻る', () => {
  const units = [{ id: 'A', atk: 1, ss: { name: 's', turns: 2, launch: { speed: 1.5 } } }];
  const { world, battle } = field(units, {});
  assert.equal(battle.beginShot('A', true), null, '溜まっていない');
  assert.equal(battle.stats.ss, 0);
  battle.endTurn(world); battle.endTurn(world);
  const m = battle.beginShot('A', true);
  assert.equal(m.speed, 1.5);
  assert.equal(battle.us.A.ssLeft, 2);
  assert.equal(battle.stats.ss, 1);
});

test('SS の攻撃力倍率はそのショットの直殴りにだけ乗る', () => {
  const units = [{ id: 'A', atk: 1000, ss: { name: 's', turns: 0, atk: 1.9 } }];
  const { world, battle } = field(units, {});
  battle.beginShot('A', true);
  const r = battle.apply([{ type: 'hit', id: 'A', other: 'e', x: 270, y: 190 }], world)[0];
  assert.equal(r.damage, 1900);
  assert.equal(r.rates.map((x) => x.kind).join(), 'ss');
  battle.endTurn(world);
  battle.beginShot('A', false);
  assert.equal(battle.apply([{ type: 'hit', id: 'A', other: 'e', x: 270, y: 190 }], world)[0].damage, 1000);
});

test('SS の初速と摩擦の倍率: 同じ引きでも遠くまで動く。予測軌道は本番と同じ所で止まる', () => {
  const run = (m) => {
    const w = new P.World();
    w.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 270, y: 700, r: 30 });
    const v = w.launch('A', 0, 40, m);
    const pred = w.predict('A', w.get('A').vx, w.get('A').vy, { maxLen: 1e9, maxBounces: 1e9, mods: m });
    const { events } = runUntilStop(w);
    const stop = events.find((e) => e.type === 'stop');
    return { v, stop, pred };
  };
  const plain = run(null), ss = run({ speed: 1.35, friction: 0.55 });
  assert.ok(Math.abs(ss.v.speed - plain.v.speed * 1.35) < 1e-9);
  assert.ok(ss.stop.traveled > plain.stop.traveled * 1.5, `${ss.stop.traveled} / ${plain.stop.traveled}`);
  const last = ss.pred.points[ss.pred.points.length - 1];
  assert.ok(Math.hypot(last.x - ss.stop.x, last.y - ss.stop.y) < 1e-6, '予測と本番がずれない');
});

test('SS「止まったところで攻撃」: 止まった位置で爆発し、範囲の敵にダメージ（記録は ss: true）', () => {
  const units = [{ id: 'C', atk: 1, element: 'wood', ss: { name: 'メテオ', turns: 0, onStop: { kind: 'blast', power: 3000, radius: 400 } } }];
  const { world, battle } = field(units, { enemies: [FOE({ element: 'water' })] });
  const recs = fire(world, battle, 'C', 0, -500, true);
  const blast = recs.filter((r) => r.combo === 'blast');
  assert.equal(blast.length, 1);
  assert.equal(blast[0].damage, Math.round(3000 * 1.33), '持ち主の属性が乗る（木 → 水）');
  const c = battle.drainCombos();
  assert.equal(c.length, 1);
  assert.equal(c[0].ss, true);
  assert.equal(c[0].name, 'メテオ');
});

test('SS「仲間呼び」: そのショットで触れた味方の友情が2回出る', () => {
  const units = [
    { id: 'M', shot: 'pierce', atk: 1, ss: { name: '仲間呼び', turns: 0, comboTwice: true } },
    { id: 'F', atk: 1, combo: { kind: 'blast', name: 'b', power: 1000, radius: 600 } }
  ];
  const { world, battle } = field(units, {});
  world.get('M').x = 270; world.get('M').y = 700;
  world.get('F').x = 270; world.get('F').y = 500;
  battle.beginShot('M', true);
  const recs = battle.apply([{ type: 'pierce', id: 'M', other: 'F' }], world);
  assert.equal(recs.length, 2);
  assert.equal(battle.stats.combos, 1, '発動の回数は1回と数える');
  assert.equal(battle.drainCombos().length, 2);
});

test('SSターン短縮: 触れた味方1体につき自分の SS が1ターン縮む（同じ味方は1回）', () => {
  const units = [{ id: 'C', atk: 1, abilities: ['ssAccel'], ss: { name: 's', turns: 10 } }, { id: 'X', atk: 1 }, { id: 'Y', atk: 1 }];
  const { world, battle } = field(units, {});
  battle.beginShot('C', false);
  battle.apply([{ type: 'hit', id: 'C', other: 'X' }, { type: 'hit', id: 'C', other: 'X' }, { type: 'hit', id: 'C', other: 'Y' }], world);
  assert.equal(battle.us.C.ssLeft, 8);
});

test('ステージのキャラは4体とも SS を持ち、溜まる順番がずれている', () => {
  const t = D.units.map((u) => u.ss.turns);
  assert.equal(new Set(t.map((x, i) => (x - i + 400) % 4)).size, 1, `4で割った余りが手番とそろう (${t.join()})`);
  for (const u of D.units) assert.ok(u.ss.name && u.ss.turns > 0);
});

// ------------------------------------------------------------ 地雷
const MINE = { id: 'm', x: 270, y: 500, r: 16, damage: 900 };

test('地雷に触れるとチームのHPが減って地雷は消える', () => {
  const { world, battle } = field([{ id: 'A', atk: 1, x: 270, y: 700 }], { gimmicks: { mines: [MINE] } });
  fire(world, battle, 'A', 0, -500);
  assert.equal(battle.teamHp, 20000 - 900);
  assert.equal(battle.stats.mines, 1);
  assert.equal(world.fields.length, 0);
  assert.equal(battle.drainHazards().filter((h) => h.kind === 'mine').length, 1);
});

test('飛行は地雷の上を通っても平気で、地雷も残る', () => {
  const { world, battle } = field([{ id: 'A', atk: 1, x: 270, y: 700, abilities: ['flying'] }], { gimmicks: { mines: [MINE] } });
  fire(world, battle, 'A', 0, -500);
  assert.equal(battle.teamHp, 20000);
  assert.equal(battle.stats.minesBlocked, 1);
  assert.equal(world.fields.length, 1);
});

test('マインスイーパーは地雷を回収してまとい（最大4個）、次に当てた1回が1.5倍', () => {
  const mines = [0, 1, 2, 3, 4].map((i) => ({ id: 'm' + i, x: 270, y: 620 - i * 40, r: 12, damage: 900 }));
  const { world, battle } = field([{ id: 'D', shot: 'pierce', atk: 1000, x: 270, y: 700, abilities: ['mineSweeper'] }], { gimmicks: { mines } });
  world.setVelocity('D', 0, -900);
  world.drainEvents();
  let recs = [];
  while (!world.isSettled()) { world.step(); recs = recs.concat(battle.apply(world.drainEvents(), world)); }
  assert.equal(battle.stats.minesCollected, 5);
  assert.equal(battle.teamHp, 20000, '回収した地雷ではHPが減らない');
  const hits = recs.filter((r) => r.enemy === 'e');
  assert.ok(hits.length >= 1, '敵に届いた');
  assert.equal(hits[0].damage, 1500);
  assert.equal(hits[0].rates.map((x) => x.kind).join(), 'mine');
  assert.ok(hits.slice(1).every((r) => r.damage === 1000), '2回目からは等倍');
  assert.equal(battle.us.D.mines, 0);
  // 最大4個
  const b2 = new BT({ units: [{ id: 'D', atk: 1 }], stage: { teamHp: 1, waves: [{ enemies: [FOE()] }] } });
  for (let i = 0; i < 6; i++) b2._mine(b2.units.D, { collect: true });
  assert.equal(b2.us.D.mines, BT.MINE_MAX);
});

// ------------------------------------------------------------ ワープ
const WARPS = [{ id: 'w1', pair: 'w2', x: 270, y: 560, r: 26 }, { id: 'w2', pair: 'w1', x: 120, y: 200, r: 26 }];

test('ワープに入ると相方の中心へ飛び、向きと速さはそのまま。すぐには戻らない', () => {
  const w = new P.World();
  w.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 270, y: 700, r: 30 });
  w.setFields(BT.fieldsOf({ warps: WARPS }));
  w.setVelocity('A', 0, -800);
  let warp = null, before = null;
  for (let n = 0; n < 400 && !warp; n++) {
    const a = w.get('A');
    before = { vx: a.vx, vy: a.vy };
    w.step();
    warp = w.drainEvents().find((e) => e.type === 'warp');
  }
  assert.ok(warp, 'ワープした');
  assert.equal(warp.to, 'w2');
  const a = w.get('A');
  assert.deepEqual([a.x, a.y], [120, 200]);
  assert.ok(a.vx === 0 && a.vy < 0 && Math.abs(Math.hypot(a.vx, a.vy) - Math.hypot(before.vx, before.vy)) < 50, '向きはそのまま');
  // 出口のワープの中にいる間は吸い込まれない（壁で跳ね返って戻ってきたら、また入るのが正しい）
  for (let n = 0; n < 30; n++) { w.step(); assert.ok(!w.drainEvents().some((e) => e.type === 'warp'), '出口ですぐ吸い込まれない'); }
});

test('アンチワープはワープを素通りする。予測軌道はワープで飛んだ点に jump が付く', () => {
  const w = new P.World();
  w.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 270, y: 700, r: 30, abilities: { antiWarp: true } });
  w.setFields(BT.fieldsOf({ warps: WARPS }));
  w.setVelocity('A', 0, -800);
  const { events } = runUntilStop(w);
  const wp = events.filter((e) => e.type === 'warp');
  assert.ok(wp.length >= 1 && wp.every((e) => e.blocked));
  const w2 = new P.World();
  w2.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 270, y: 700, r: 30 });
  w2.setFields(BT.fieldsOf({ warps: WARPS }));
  const pred = w2.predict('A', 0, -800, { maxLen: 2000, maxBounces: 4 });
  assert.ok(pred.points.some((p) => p.jump && p.x === 120 && p.y === 200));
  assert.ok(pred.contacts.some((c) => c.type === 'warp'));
});

// ------------------------------------------------------------ ブロック
const BLOCK = { id: 'blk', x: 270, y: 450, w: 160, h: 26 };

test('ブロックは貫通タイプも跳ね返す（敵と違う）。アンチブロックは素通り', () => {
  for (const shot of ['reflect', 'pierce']) {
    const { world, battle } = field([{ id: 'A', shot, atk: 1, x: 270, y: 700 }], { gimmicks: { blocks: [BLOCK] } });
    world.setVelocity('A', 0, -900);
    const { events } = runUntilStop(world);
    assert.ok(events.some((e) => e.type === 'hit' && e.other === 'blk'), `${shot} は跳ね返る`);
    assert.ok(!events.some((e) => e.type === 'pierce' && e.other === 'blk'));
    assert.ok(world.get('A').y > 450, `${shot} はブロックの下で止まる`);
    void battle;
  }
  const { world } = field([{ id: 'A', shot: 'reflect', atk: 1, x: 270, y: 700, abilities: ['antiBlock'] }], { gimmicks: { blocks: [BLOCK] } });
  world.setVelocity('A', 0, -900);
  const { events } = runUntilStop(world);
  assert.ok(!events.some((e) => e.other === 'blk'));
  assert.ok(events.some((e) => e.type === 'hit' && e.other === 'e'), 'ブロックの向こうの敵に届く');
  assert.equal(world._overlapping(world.get('A')), null);
});

test('ブロックはウェーブが変わると消える', () => {
  const stage = { teamHp: 1000, waves: [{ enemies: [FOE()], gimmicks: { blocks: [BLOCK] } }, { enemies: [FOE({ id: 'e2' })] }] };
  const world = new P.World();
  world.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 90, y: 700, r: 30 });
  const battle = new BT({ units: [{ id: 'A', atk: 1 }], stage });
  battle.spawnWave(world);
  assert.ok(world.get('blk'));
  battle.kill('e', world);
  assert.equal(battle.endTurn(world).type, 'wave');
  assert.equal(world.get('blk'), null);
});

// ------------------------------------------------------------ 魔法陣
test('魔法陣を踏むとひよこ: 攻撃力と友情が半分、SS が使えない。次の自分のショットが終わるまで続く', () => {
  const units = [
    { id: 'A', atk: 1000, x: 270, y: 700, ss: { name: 's', turns: 0 }, combo: { kind: 'blast', name: 'b', power: 1000, radius: 900 } },
    { id: 'B', atk: 1000 }
  ];
  const { world, battle } = field(units, { gimmicks: { magic: [{ id: 'mg', x: 270, y: 560, r: 40 }] } });
  fire(world, battle, 'A', 0, -300);
  assert.equal(battle.us.A.chick, 2);
  assert.equal(battle.ssReady('A'), false);
  const r = battle.apply([{ type: 'hit', id: 'A', other: 'e', x: 270, y: 190 }], world)[0];
  assert.equal(r.damage, 500);
  battle.endTurn(world);
  assert.equal(battle.us.A.chick, 1, '踏んだショットが終わっても、次の自分のショットまで続く');
  battle.beginShot('B', false);
  const cr = battle.apply([{ type: 'hit', id: 'B', other: 'A' }], world);
  assert.equal(cr[0].damage, 500, '友情も半分');
  battle.endTurn(world);
  assert.equal(battle.us.A.chick, 1, 'ほかのキャラのショットでは減らない');
  battle.beginShot('A', false);
  battle.endTurn(world);
  assert.equal(battle.us.A.chick, 0);
  assert.equal(battle.ssReady('A'), true);
});

test('アンチ魔法陣はひよこにならない', () => {
  const { world, battle } = field([{ id: 'A', atk: 1, x: 270, y: 700, abilities: ['antiMagic'] }], { gimmicks: { magic: [{ id: 'mg', x: 270, y: 560, r: 40 }] } });
  fire(world, battle, 'A', 0, -300);
  assert.equal(battle.us.A.chick, 0);
  assert.ok(battle.drainHazards().some((h) => h.kind === 'magic' && h.blocked));
});

// ------------------------------------------------------------ 減速壁・超アンチ
test('減速壁に触れると速さが factor 倍（アンチ減速壁は無効）', () => {
  const run = (abilities) => {
    const w = new P.World();
    w.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 270, y: 400, r: 30, abilities });
    w.setSlowWalls([{ side: 'left', from: 0, to: 800, factor: 0.5 }]);
    w.setVelocity('A', -1500, 0);
    for (let n = 0; n < 400; n++) {
      w.step();
      const ev = w.drainEvents();
      const wall = ev.find((e) => e.type === 'wall');
      if (wall) return { wall, slow: ev.find((e) => e.type === 'slow') };
    }
    return null;
  };
  const a = run({}), b = run({ antiSlow: true });
  assert.ok(a.slow && !a.slow.blocked);
  assert.ok(Math.abs(a.slow.speed - a.wall.speed * 0.5) < 1e-6);
  assert.ok(b.slow.blocked);
  assert.ok(Math.abs(b.slow.speed - b.wall.speed) < 1e-9);
});

test('超アンチ重力バリアは減速せず、最初のバリアで1度だけ加速する', () => {
  const w = new P.World();
  w.add({ id: 'B', kind: 'unit', shot: 'pierce', x: 270, y: 760, r: 30, abilities: { superAntiGravity: true } });
  w.setFields([{ id: 'g1', x: 270, y: 600, r: 40 }, { id: 'g2', x: 270, y: 380, r: 40 }]);
  w.setVelocity('B', 0, -1600);
  const grav = [];
  for (let n = 0; n < 2000 && w.isSettled() === false; n++) {
    const before = w.get('B').speed();
    w.step();
    for (const e of w.drainEvents()) if (e.type === 'gravity') grav.push({ e, before });
  }
  assert.ok(grav.length >= 2);
  assert.ok(grav[0].e.boost && grav[0].e.blocked);
  assert.ok(grav[0].e.speed > grav[0].before * 1.4, '1.5倍に加速');
  assert.ok(!grav[1].e.boost, '2つ目では加速しない');
});

test('超アンチダメージウォールは無効化したうえで、そのショットの直殴りが1.3倍', () => {
  const units = [{ id: 'A', atk: 1000, x: 100, y: 400, abilities: ['superAntiDamageWall'] }];
  const { world, battle } = field(units, { gimmicks: { damageWalls: [{ side: 'left', from: 0, to: 800, damage: 999 }] } });
  battle.beginShot('A', false);
  battle.apply([{ type: 'wall', id: 'A', nx: 1, ny: 0, x: 30, y: 400 }], world);
  assert.equal(battle.teamHp, 20000);
  const h = battle.drainHazards()[0];
  assert.ok(h.blocked && h.boost);
  const r = battle.apply([{ type: 'hit', id: 'A', other: 'e', x: 270, y: 190 }], world)[0];
  assert.equal(r.damage, 1300);
  battle.endTurn(world);
  battle.beginShot('A', false);
  assert.equal(battle.apply([{ type: 'hit', id: 'A', other: 'e', x: 270, y: 190 }], world)[0].damage, 1000, '次のショットには持ち越さない');
});

// ------------------------------------------------------------ 円の組み合わせ（ドラゴンの翼）
test('翼（部品の円）にも当たる。本体の外の翼に当たった反射タイプは跳ね返る', () => {
  const dragon = D.stage.waves[1].enemies.find((e) => e.id === 'w2-dragon');
  assert.equal(dragon.shape, 'compound');
  const wing = dragon.parts[1];
  const w = new P.World();
  w.add({ id: 'A', kind: 'unit', shot: 'reflect', x: dragon.x + wing.dx, y: 700, r: 30 });
  w.add(BT.enemyBody(dragon));
  w.setVelocity('A', 0, -1200);
  const { events } = runUntilStop(w);
  const hit = events.find((e) => e.type === 'hit');
  assert.ok(hit && hit.other === 'w2-dragon', '翼に当たった');
  assert.ok(Math.hypot(hit.x - dragon.x, hit.y - dragon.y) > dragon.r, '本体の円の外で当たっている');
});

// ------------------------------------------------------------ アイテム
test('ハートは2ターンごとに 小 → 大 → 金 と育ち、育つほど多く回復する', () => {
  const units = [{ id: 'A', atk: 1, hp: 8000, x: 270, y: 700 }, { id: 'B', atk: 1, hp: 8000 }];
  const make = () => field(units, { items: [{ id: 'h', item: 'heart', x: 270, y: 500 }] });
  const grades = [];
  for (const wait of [0, 2, 4, 9]) {
    const { world, battle } = make();
    for (let i = 0; i < wait; i++) battle.endTurn(world);
    battle.teamHp = 1000;
    grades.push(battle.heartGrade(battle.items[0]));
    fire(world, battle, 'A', 0, -400);
    const h = battle.drainHazards().find((x) => x.kind === 'item');
    grades.push(h.heal);
  }
  assert.deepEqual(grades, [0, 4000, 1, 8000, 2, 12000, 2, 12000]);
  const { world, battle } = make();
  battle.teamHp = 15000;
  fire(world, battle, 'A', 0, -400);
  assert.equal(battle.teamHp, 16000, '最大HPを超えない');
  assert.equal(world.fields.length, 0, '取ったハートは消える');
});

test('アイテムはデータで決めたターンに出る', () => {
  const { world, battle } = field([{ id: 'A', atk: 1 }], { items: [{ id: 's', item: 'sword', x: 270, y: 500, turn: 2 }] });
  assert.equal(battle.items.length, 0);
  battle.endTurn(world);
  assert.equal(battle.items.length, 0);
  battle.endTurn(world);
  assert.equal(battle.items.length, 1);
  assert.ok(world.fields.some((f) => f.id === 's' && f.kind === 'item'));
});

test('剣を取ると直殴りと友情が1.5倍。次の自分のショットが終わるまで続く', () => {
  const units = [
    { id: 'A', atk: 1000, x: 270, y: 700, combo: { kind: 'blast', name: 'b', power: 1000, radius: 900 } },
    { id: 'B', atk: 1000 }
  ];
  const { world, battle } = field(units, { items: [{ id: 's', item: 'sword', x: 270, y: 560 }] });
  fire(world, battle, 'A', 0, -300);
  assert.equal(battle.us.A.sword, 2);
  assert.equal(battle.apply([{ type: 'hit', id: 'A', other: 'e', x: 270, y: 190 }], world)[0].damage, 1500);
  battle.endTurn(world);
  battle.beginShot('B', false);
  assert.equal(battle.apply([{ type: 'hit', id: 'B', other: 'A' }], world)[0].damage, 1500, '友情にも乗る');
  battle.endTurn(world);
  battle.beginShot('A', false);
  battle.endTurn(world);
  assert.equal(battle.us.A.sword, 0);
});

// ------------------------------------------------------------ 先読み用の複製
test('複製で地雷・アイテム・SS・状態が変わっても、元の戦闘と物理は変わらない', () => {
  const units = [{ id: 'A', atk: 1, x: 270, y: 700, ss: { name: 's', turns: 0, atk: 2 } }];
  const { world, battle } = field(units, { gimmicks: { mines: [MINE], magic: [{ id: 'mg', x: 270, y: 380, r: 30 }] },
    items: [{ id: 'h', item: 'heart', x: 270, y: 620 }] });
  const w = world.clone(), b = battle.clone();
  shoot(w, b, 'A', 0, -700, true);
  assert.ok(b.stats.mines === 1 && b.items.length === 0 && b.us.A.ssLeft === 0 + 0 && b.stats.ss === 1);
  assert.equal(world.fields.length, 3, '元の地雷・魔法陣・ハートは残る');
  assert.equal(battle.items.length, 1);
  assert.equal(battle.stats.ss, 0);
  assert.equal(battle.us.A.chick, 0);
  assert.equal(battle.teamHp, 20000);
});

// ------------------------------------------------------------ 2つ目のステージ
test('ステージは2つ。からくりの塔は3ウェーブで、地雷・ワープ・ブロック・魔法陣・減速壁・アイテムを全部使う', () => {
  assert.equal(D.stages.length, 2);
  assert.equal(D.stages[0], D.stage);
  const tw = D.stages[1];
  assert.equal(tw.waves.length, 3);
  const kinds = new Set();
  for (const w of tw.waves) {
    for (const k of Object.keys(w.gimmicks || {})) kinds.add(k);
    if (w.items && w.items.length) kinds.add('items');
  }
  for (const k of ['mines', 'warps', 'blocks', 'magic', 'slowWalls', 'items']) assert.ok(kinds.has(k), k);
  assert.equal(tw.waves.filter((w) => w.enemies.some((e) => e.boss)).length, 1);
});

test('全ステージの定義: ギミックとアイテムはフィールドの中で、味方の初期位置・敵・ブロックに重ならない。ワープは相方がいる', () => {
  const W = C.field.w, H = C.field.h;
  for (const stage of D.stages) {
    const ids = new Set();
    for (const [wi, wave] of stage.waves.entries()) {
      const g = wave.gimmicks || {};
      const circles = [...BT.fieldsOf(g), ...(wave.items || []).map((i) => ({ ...i, r: i.r || 18 }))];
      const world = new P.World();
      for (const e of wave.enemies) world.add(BT.enemyBody(e));
      for (const b of g.blocks || []) world.add({ id: b.id, kind: 'block', shape: 'rect', x: b.x, y: b.y, w: b.w, h: b.h });
      for (const f of circles) {
        const where = `${stage.name} wave${wi + 1} ${f.id}`;
        assert.ok(!ids.has(f.id), `${where} の id が重複`); ids.add(f.id);
        assert.ok(f.x - f.r >= 0 && f.x + f.r <= W && f.y - f.r >= 0 && f.y + f.r <= H, `${where} が場外`);
        for (const u of D.units) assert.ok(Math.hypot(u.x - f.x, u.y - f.y) > f.r + u.r, `${where} が ${u.id} の初期位置にかかる`);
        const probe = new P.Body({ id: 'probe', x: f.x, y: f.y, r: f.r });
        for (const o of world.bodies) assert.equal(P.contact(probe, o), null, `${where} が ${o.id} に重なる`);
        if (f.kind === 'warp') assert.ok(circles.some((x) => x.id === f.pair && x.pair === f.id), `${where} の相方`);
      }
      for (const b of g.blocks || []) {
        for (const u of D.units) {
          const probe = new P.Body({ id: 'probe', x: u.x, y: u.y, r: u.r + 20 });
          assert.equal(P.contact(probe, world.get(b.id)), null, `${b.id} が ${u.id} に近すぎる`);
        }
      }
      for (const sw of g.slowWalls || []) assert.ok(sw.from < sw.to && sw.factor > 0 && sw.factor < 1);
    }
  }
});

test('からくりの塔: どの敵にも有利属性のキャラがいて、敵の id はステージ全体で一意', () => {
  const all = D.stages[1].waves.flatMap((w) => w.enemies);
  assert.equal(new Set(all.map((e) => e.id)).size, all.length);
  for (const e of all) assert.ok(D.units.some((u) => BT.elementRate(u.element, e.element) > 1), e.id);
});

test('からくりの塔を本番と同じ始まり方で起こせる', () => {
  const { world, battle } = newGame(mods, 1);
  assert.equal(battle.stage.name, 'からくりの塔');
  assert.ok(world.fields.some((f) => f.kind === 'mine'));
  assert.ok(world.bodies.some((b) => b.kind === 'block'));
});
