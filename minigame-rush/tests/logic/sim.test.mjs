// ゲームの中身（操作・当たり・ゲート・檻・合体・決着）
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, newSim, put } from './helpers.mjs';

const ctx = load();
const { L, cfg } = ctx;
const run = (sim, sec) => { for (let i = 0; i < sec * 60; i++) sim.update(1 / 60); };

test('最初は死神が1体。盤面は5×6が武器で埋まっている', () => {
  const { S } = newSim(ctx);
  assert.equal(S.heroes.length, 1);
  assert.equal(S.heroes[0].type, 'reaper');
  assert.equal(S.board.length, 6);
  for (const row of S.board) { assert.equal(row.length, 5); for (const it of row) assert.ok(it && cfg.weapons[it.w]); }
});

test('ドラッグで通ったマスの「得意武器」だけを拾い、拾ったマスは埋まる', () => {
  const { sim, S } = newSim(ctx);
  const h = S.heroes[0];
  for (let c = 0; c < 5; c++) put(S, c, 1, 'sword');
  put(S, 3, 1, 'sickle'); put(S, 4, 1, 'sickle');
  h.col = 0; h.row = 1; h.x = 0.5; h.y = 1.5;
  sim.grab(h.id);
  sim.dragTo(h.id, 4.5, 1.5);   // 一気に動かしても、途中のマスを取りこぼさない
  assert.equal(h.ammo.length, 2);
  assert.ok(h.ammo.every(w => w === 'sickle'));
  assert.equal(S.board[1][0].w, 'sword', '剣は拾わない');
  sim.release(h.id);
  assert.deepEqual([h.col, h.row], [4, 1]);
  sim.update(1 / 60);
  for (const row of S.board) for (const it of row) assert.ok(it, '空いたマスはすぐ埋まる');
});

test('持てる弾には上限がある', () => {
  const { sim, S } = newSim(ctx);
  const h = S.heroes[0];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) put(S, c, r, 'sickle');
  sim.grab(h.id);
  for (let r = 0; r < 6; r++) sim.dragTo(h.id, (r % 2 ? 0.5 : 4.5), r + 0.5);
  assert.equal(h.ammo.length, sim.ammoMax());
});

test('弾は英雄のいる列の真上へ飛ぶ: 左の列なら檻に当たり、右の列なら当たらない', () => {
  for (const [col, hits] of [[0, true], [4, false]]) {
    const { sim, S } = newSim(ctx);
    run(sim, 2);   // 檻が置かれるのを待つ
    assert.equal(S.cages.length, 1);
    const cage = S.cages[0], hp0 = cage.hp;
    const h = S.heroes[0];
    h.col = col; h.row = 5; h.x = col + 0.5; h.y = 5.5; h.ammo = ['sickle'];   // 射程があるので檻に届く奥の段から
    S.enemies.length = 0; S.evIndex = S.stage.events.length;  // 敵とゲートを出さない
    S.gates.length = 0;
    run(sim, 2.5);
    assert.equal(cage.hp < hp0, hits, `列 ${col}`);
  }
});

test('檻のHPを0にすると2択になり、時間が止まる。仲間にする / 進化させる', () => {
  for (const kind of ['join', 'evolve']) {
    const { sim, S, events } = newSim(ctx);
    run(sim, 2);
    const cage = S.cages[0];
    cage.hp = 1;
    const h = S.heroes[0];
    h.col = 0; h.row = 5; h.x = 0.5; h.y = 5.5; h.ammo = ['sickle'];
    run(sim, 2);
    assert.equal(S.phase, 'choice');
    assert.equal(S.choice.hero, cage.hero);
    assert.ok(events.some(([t]) => t === 'choice'));
    const t = S.t; run(sim, 1); assert.equal(S.t, t, '選ぶまで止まっている');
    const n = S.heroes.length;
    if (kind === 'join') { assert.ok(sim.choose('join')); assert.equal(S.heroes.length, n + 1); assert.ok(S.heroes.some(x => x.type === cage.hero)); }
    else { assert.ok(sim.choose('evolve', h.id)); assert.equal(h.tier, 2); assert.equal(S.heroes.length, n); }
    assert.equal(S.phase, 'play');
    run(sim, 3);
    assert.equal(S.cages.length, 1, '次の檻が出る');
  }
});

test('同じ種類・同じ段階の英雄に重ねると合体して★+1。違えば入れ替わる', () => {
  const { sim, S } = newSim(ctx);
  const a = S.heroes[0];
  const b = sim.addHero('reaper', 1, { col: 4, row: 4 });
  const k = sim.addHero('knight', 1, { col: 0, row: 4 });
  sim.grab(b.id); sim.dragTo(b.id, a.x, a.y);
  assert.equal(sim.release(b.id), 'merge');
  assert.equal(a.tier, 2); assert.equal(S.heroes.length, 2);
  const [ac, ar] = [a.col, a.row];
  sim.grab(k.id); sim.dragTo(k.id, a.x, a.y);
  assert.equal(sim.release(k.id), 'swap');
  assert.deepEqual([k.col, k.row], [ac, ar]);
  assert.deepEqual([a.col, a.row], [0, 4]);
  // ★の違う同じ英雄は合体しない
  const c = sim.addHero('reaper', 1, { col: 2, row: 2 });
  sim.grab(c.id); sim.dragTo(c.id, a.x, a.y);
  assert.equal(sim.release(c.id), 'swap');
});

test('どのゲートも効果が出る。英雄を減らすわなは最後の1体を消さない', () => {
  for (const id of Object.keys(cfg.gates)) {
    const { sim, S } = newSim(ctx, { n: 10 });
    const g = { id, value: cfg.gates[id].v[cfg.gates[id].v.length - 1], kind: cfg.gates[id].kind, wpn: 'sickle', hp: 0 };
    const before = JSON.stringify(S.mods) + S.heroes.length + S.coins + S.barrier + S.enemies.length + S.heroes.map(h => h.tier).join();
    S.baseHp = 50;
    sim.applyGate(g);
    const after = JSON.stringify(S.mods) + S.heroes.length + S.coins + S.barrier + S.enemies.length + S.heroes.map(h => h.tier).join();
    if (!['heal', 'fever', 'thunder', 'loseHero'].includes(id)) assert.notEqual(after, before, `${id} の効果が出ていない`);
  }
  const { sim, S } = newSim(ctx);
  sim.applyGate({ id: 'loseHero', value: 1 });
  assert.equal(S.heroes.length, 1);
  sim.applyGate({ id: 'atk', value: 2 }); sim.applyGate({ id: 'atk', value: 2 });
  assert.equal(S.mods.atk, 4);
  sim.applyGate({ id: 'heroes', value: 3 });
  assert.equal(S.heroes.length, 4);
});

test('敵が拠点まで来るとHPが減り、バリアがあれば防ぐ。0で負け', () => {
  const { sim, S } = newSim(ctx);
  S.evIndex = S.stage.events.length;   // ボスがまだなので、敵がいなくなっても勝ちにならない
  S.heroes[0].ammo = []; for (const row of S.board) for (const it of row) it.w = 'sword';
  S.barrier = 1;
  const e1 = { id: 9001, type: 'goblin', x: 2.5, bx: 2.5, y: 6.05, hp: 10, maxHp: 10, r: 0.27, speed: 1, armor: 0, leak: 2, coin: 1, lane: 0, wob: 0, flash: 0, healT: 9, phaseT: 0 };
  S.enemies.push({ ...e1 }, { ...e1, id: 9002, y: 6.5 });
  run(sim, 1);
  assert.equal(S.barrier, 0);
  assert.equal(S.baseHp, S.baseMax - 2 * cfg.base.leakMul);
  S.baseHp = 1;
  S.enemies.push({ ...e1, id: 9003 });
  run(sim, 0.5);
  assert.equal(S.phase, 'lose');
});

test('ボスに拠点まで来られたら、拠点HPが残っていても負け', () => {
  const { sim, S } = newSim(ctx);
  S.heroes[0].ammo = []; for (const row of S.board) for (const it of row) it.w = 'sword';
  S.evIndex = S.stage.events.length - 1;  // 次はボス
  S.t = S.stage.events[S.evIndex].t;
  run(sim, 0.1);
  assert.ok(S.boss);
  S.boss.y = 6.05; S.boss.hp = 1e9;
  run(sim, 0.5);
  assert.equal(S.phase, 'lose');
});

test('分裂・復活・回復・ボスの手下呼び', () => {
  const { sim, S } = newSim(ctx, { n: 20 });
  S.evIndex = S.stage.events.length;
  const mk = (type, extra = {}) => ({ id: Math.random(), type, x: 2.5, bx: 2.5, y: 15, hp: 30, maxHp: 30, r: 0.3, speed: 0, armor: 0, leak: 1, coin: 1, lane: 0, wob: 0, flash: 0, healT: 0.01, phaseT: 0, summonT: 0.01, hpMul: 1, ...extra });
  S.enemies.push(mk('slime'));
  sim.applyGate({ id: 'thunder' });  // 4割のダメージ
  S.enemies[0].hp = 0.1; sim.applyGate({ id: 'thunder' });
  assert.equal(S.enemies.filter(e => e.type === 'minislime' && !e.dead).length, 2, 'スライムは2匹に分裂');
  S.enemies.length = 0;
  const sk = mk('skeleton', { hp: 1 }); S.enemies.push(sk);
  sim.applyGate({ id: 'thunder' });
  assert.ok(!sk.dead && sk.revived, 'ガイコツは一度だけ復活');
  S.enemies.length = 0;
  const hurt = mk('goblin', { hp: 5, maxHp: 100, x: 2.6, bx: 2.6 });
  S.enemies.push(mk('shaman'), hurt);
  sim.update(1 / 60);
  assert.ok(hurt.hp > 5, '呪術師がまわりを回復する');
  S.enemies.length = 0;
  S.enemies.push(mk('king', { boss: true, hp: 1e6, maxHp: 1e6, r: 0.85 }));
  sim.update(1 / 60);
  assert.equal(S.enemies.filter(e => e.type === 'goblin').length, cfg.bosses.king.summon[0], 'キングが手下を呼ぶ');
});

test('弾には射程があり、遠くの敵には届かない（手前の段ほど届く範囲が短い）', () => {
  const { sim, S } = newSim(ctx);
  S.evIndex = S.stage.events.length; S.gates.length = 0; S.slots = S.slots.map(() => ({}));  // 檻を出さない
  const h = S.heroes[0]; h.col = 4; h.row = 0; h.x = 4.5; h.y = 0.5; h.ammo = ['sickle'];
  const far = { id: 9100, type: 'goblin', x: 4.5, bx: 4.5, y: 20, hp: 1e6, maxHp: 1e6, r: 0.27, speed: 0, armor: 0, leak: 2, coin: 1, lane: 0, wob: 0, flash: 0, healT: 9, phaseT: 0 };
  S.enemies.push(far);
  run(sim, 2);
  assert.equal(far.hp, 1e6, '射程の外');
  far.y = 0.5 + cfg.hero.range - 1.5; h.ammo = ['sickle'];
  run(sim, 2);
  assert.ok(far.hp < 1e6, '射程の中');
});

test('同じ乱数なら同じ結果になる', () => {
  const a = newSim(ctx, { n: 4, seed: 5 }), b = newSim(ctx, { n: 4, seed: 5 });
  run(a.sim, 40); run(b.sim, 40);
  assert.equal(a.S.kills, b.S.kills); assert.equal(a.S.baseHp, b.S.baseHp); assert.equal(JSON.stringify(a.S.board), JSON.stringify(b.S.board));
});

test('コイン: ★が多いほど・難しいほど多い。強化の値段は上がり、最大で買えなくなる', () => {
  const st1 = L.Stage.build(cfg, 5, 'normal'), st2 = L.Stage.build(cfg, 5, 'hard');
  const S = { coins: 100, wave: 0 };
  const r1 = L.reward(cfg, st1, S, 1), r3 = L.reward(cfg, st1, S, 3), rh = L.reward(cfg, st2, S, 3), r0 = L.reward(cfg, st1, S, 0);
  assert.ok(r3.total > r1.total && rh.total > r3.total);
  assert.equal(r0.clear, 0); assert.equal(r0.kills, Math.round(100 * cfg.stage.killCoin));
  assert.ok(L.reward(cfg, st1, S, 3, { greed: 5 }).total > r3.total);
  for (const k of cfg.upgradeOrder) {
    assert.ok(L.upgradeCost(cfg, k, 1) > L.upgradeCost(cfg, k, 0));
    assert.equal(L.upgradeCost(cfg, k, cfg.upgrades[k].max), Infinity);
  }
});
