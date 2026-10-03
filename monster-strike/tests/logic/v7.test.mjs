// v7（改修のまとめ）: 全滅後のギミック無効・難易度・SS・ウルトラ進化・ガチャ・まとめて強化
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './helpers.mjs';

const mods = loadAll();
const { P, B, D, M } = mods;
const BT = B.Battle;

/** 小さな戦場: 敵1体・左の壁全体がダメージウォール・地雷1つ */
function smallField() {
  const stage = { name: 't', teamHp: 1000, waves: [{
    enemies: [{ id: 'e1', shape: 'circle', x: 270, y: 150, r: 30, hp: 1, atk: 0, turns: 9, attack: 'single' }],
    gimmicks: { damageWalls: [{ side: 'left', from: 0, to: 800, damage: 999 }], mines: [{ id: 'm1', x: 120, y: 400, r: 16, damage: 999 }] } }] };
  const world = new P.World();
  world.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 270, y: 700, r: 30 });
  const battle = new BT({ units: [{ id: 'A', atk: 10, shot: 'reflect' }], stage });
  battle.spawnWave(world);
  return { world, battle };
}

test('ウェーブの敵を全部倒したら、残りの動きではダメージウォールも地雷も効かない', () => {
  const { world, battle } = smallField();
  assert.equal(battle.damageWalls.length, 1);
  assert.ok(world.fields.some((f) => f.kind === 'mine'));
  battle.kill('e1', world);
  assert.equal(battle.damageWalls.length, 0);
  assert.equal(world.fields.filter((f) => f.kind !== 'item').length, 0);
  // 左の壁と地雷のほうへ撃っても HP は減らず、負けない
  world.setVelocity('A', -1500, -700);
  for (let n = 0; n < 240 * 12 && !world.isSettled(); n++) { world.step(); battle.apply(world.drainEvents(), world); }
  assert.equal(battle.teamHp, 1000);
  assert.equal(battle.state, 'playing');
  assert.equal(battle.endTurn(world).type, 'won');
});

test('倒す前はダメージウォールで HP が減る（比べるため）', () => {
  const { world, battle } = smallField();
  world.setVelocity('A', -1500, 0);
  for (let n = 0; n < 240 * 12 && !world.isSettled(); n++) { world.step(); battle.apply(world.drainEvents(), world); }
  assert.ok(battle.teamHp < 1000);
});

const clone = (x) => JSON.parse(JSON.stringify(x));
const fresh = () => clone(M.newSave(D));
function lcg(seed = 7) { let a = seed; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; }

// ------------------------------------------------------------ ガチャ 50連・100連
test('ガチャは 1・10・50・100 回。50連・100連は10回分の値段×5・×10 で、10回ごとに ★4 以上が1体は出る', () => {
  assert.deepEqual([...M.PULLS], [1, 10, 50, 100]);
  assert.equal(M.pullCost(D, 50), D.gacha.cost10 * 5);
  assert.equal(M.pullCost(D, 100), D.gacha.cost10 * 10);
  const s = fresh();
  s.gems = M.pullCost(D, 100);
  // ★3 しか出ない乱数でも、10回ごとのまとまりの最後は ★4 以上
  const r = M.pull(s, D, 100, () => 0.99);
  assert.equal(r.results.length, 100);
  assert.equal(s.gems, 0);
  for (let b = 0; b < 10; b++) assert.ok(r.results.slice(b * 10, b * 10 + 10).some((x) => x.rarity >= D.gacha.guarantee), `${b + 1}つ目のまとまり`);
  assert.equal(M.pull(s, D, 50, lcg()).error, 'gems', 'ジェムが足りなければ何も変えない');
  assert.equal(M.pull(s, D, 7, lcg()).error, 'count', '決まった回数だけ');
});

// ------------------------------------------------------------ まとめて強化・ウルトラ進化
test('まとめて強化: 全キャラをストックの限り +5 まで合成する', () => {
  const s = fresh();
  s.owned.A = { luck: 0, plus: 0, stock: 3 };
  s.owned.B = { luck: 0, plus: 4, stock: 9 };
  s.owned.C = { luck: 0, plus: 5, stock: 2 };
  const r = M.fuseAll(s, D);
  assert.equal(r.count, 4);
  assert.deepEqual([s.owned.A.plus, s.owned.A.stock], [3, 0]);
  assert.deepEqual([s.owned.B.plus, s.owned.B.stock], [5, 8]);
  assert.deepEqual([s.owned.C.plus, s.owned.C.stock], [5, 2]);
  assert.equal(M.fuseAll(s, D).count, 0);
});

test('ウルトラ進化: +5 で同じキャラ5体を使う。攻撃力・HP 2倍、友情 +3つ・威力2倍、特性すべて', () => {
  const s = fresh();
  s.owned.A = { luck: 0, plus: 4, stock: 9 };
  assert.equal(M.canUltra(s, D, 'A'), false, '+5 になっていない');
  M.fuse(s, D, 'A');
  s.owned.A.stock = 4;
  assert.equal(M.ultraEvolve(s, D, 'A'), false, '素材が足りない');
  s.owned.A.stock = 6;
  const before = M.partyUnits(s, D)[0];
  assert.equal(M.ultraEvolve(s, D, 'A'), true);
  assert.equal(s.owned.A.stock, 1);
  assert.equal(M.ultraEvolve(s, D, 'A'), false, '2回はできない');
  const after = M.partyUnits(s, D)[0];
  assert.equal(after.atk, before.atk * 2);
  assert.equal(after.hp, before.hp * 2);
  const base = D.units[0];
  assert.equal(after.combos.length, base.combos.length + 3);
  base.combos.forEach((c, i) => assert.equal(after.combos[i].power, c.power * 2, c.name));
  for (const c of after.combos.slice(-3)) { assert.equal(c.element, base.element); assert.ok(c.power > 0 && c.ultra); }
  assert.deepEqual(after.abilities, D.abilities);
  assert.equal(base.combos.length, 3, '元の定義はそのまま');
  // セーブを読み直しても進化は残る
  assert.equal(M.load(JSON.stringify(s), D).owned.A.ultra, true);
});

test('飛行とマインスイーパーを両方持っていると、地雷はマインスイーパーが優先（回収する）', () => {
  const run = (abilities) => {
    const w = new P.World();
    w.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 270, y: 700, r: 30, abilities });
    w.setFields([{ id: 'm', kind: 'mine', x: 270, y: 400, r: 16, damage: 100 }]);
    w.setVelocity('A', 0, -1500);
    for (let n = 0; n < 400; n++) { w.step(); const m = w.drainEvents().find((e) => e.type === 'mine'); if (m) return m; }
    return null;
  };
  assert.equal(run({ flying: true }).blocked, true);
  const both = run({ flying: true, mineSweeper: true });
  assert.equal(both.blocked, false);
  assert.equal(both.collect, true);
});

// ------------------------------------------------------------ SS
const LR = Object.fromEntries(D.roster.filter((u) => u.rarity === 6).map((u) => [u.id, u]));

test('LR の5体の SS はみんな違う', () => {
  const keys = Object.values(LR).map((u) => JSON.stringify(Object.keys(u.ss).filter((k) => !['name', 'turns', 'launch', 'atk'].includes(k)).sort()));
  assert.equal(new Set(keys).size, 5, keys.join(' / '));
  assert.ok(LR.BE.ss.rally && LR.BF.ss.beam && LR.BF.ss.onStop.percent && LR.BG.ss.delay === 2 && LR.BG.ss.shot === 'pierce' && LR.BG.ss.atk === 3 && LR.BH.ss.chase);
});

/** LR 1体＋味方1体と、敵2体の戦場（ssFree で毎回 SS） */
function lrField(id, enemies) {
  const u = { ...LR[id], x: 270, y: 700 };
  const ally = { ...D.units[1], x: 100, y: 720 };
  const stage = { name: 't', waves: [{ enemies: enemies || [
    { id: 'e1', shape: 'circle', x: 270, y: 200, r: 40, hp: 5e6, atk: 10, turns: 3, attack: 'single' },
    { id: 'e2', shape: 'circle', x: 120, y: 300, r: 40, hp: 5e6, atk: 10, turns: 3, attack: 'single' }] }] };
  const world = new P.World();
  for (const x of [u, ally]) world.add({ id: x.id, kind: 'unit', shot: x.shot, x: x.x, y: x.y, r: 30, abilities: BT.abilityMap(x.abilities) });
  const battle = new BT({ units: [u, ally], stage, ssFree: true });
  battle.spawnWave(world);
  return { world, battle };
}
function fire(world, battle, id, vx, vy) {
  const mods = battle.beginShot(id, true, false);
  const k = mods && mods.speed ? mods.speed : 1;
  world.setVelocity(id, vx * k, vy * k, mods);
  world.drainEvents();
  const recs = battle.ssLaunch(world);
  for (let n = 0; n < 240 * 15 && !world.isSettled(); n++) { world.step(); recs.push(...battle.apply(world.drainEvents(), world)); }
  return recs;
}

test('SS 何回でも: SS を使っても溜め直さず、毎ターン撃てる', () => {
  const { world, battle } = lrField('BD');
  assert.equal(battle.ssReady('BD'), true);
  fire(world, battle, 'BD', 0, -1200);
  battle.endTurn(world);
  assert.equal(battle.ssReady('BD'), true);
  const normal = new BT({ units: [LR.BD], stage: { name: 't', waves: [{ enemies: [] }] } });
  assert.equal(normal.ssReady('BD'), false, 'ふつうは溜まるまで撃てない');
});

test('大号令: 撃った瞬間にほかの味方も動き出す', () => {
  const { world, battle } = lrField('BE');
  battle.beginShot('BE', true, false);
  world.setVelocity('BE', 0, -1200);
  battle.ssLaunch(world);
  assert.ok(world.get(D.units[1].id).moving, '味方が動いている');
  assert.ok(battle.drainHazards().some((h) => h.kind === 'rally'));
});

test('ビーム→割合の大爆発: 進む向きの敵にビーム、止まった所で最大 HP の割合のダメージ', () => {
  const { world, battle } = lrField('BF');
  const recs = fire(world, battle, 'BF', 0, -1200);
  const combos = battle.drainCombos();
  assert.ok(combos.some((c) => c.kind === 'beam' && c.hits.some((h) => h.enemy === 'e1')), '真上の e1 にビームが当たる');
  const pct = recs.filter((r) => r.rates.some((x) => x.kind === 'percent'));
  assert.ok(pct.length > 0, '割合ダメージ');
  for (const r of pct) assert.equal(r.damage, Math.round(5e6 * LR.BF.ss.onStop.percent));
});

test('遅延＋3倍＋貫通: 反射のキャラが貫通になり、当てた敵の攻撃が2ターン遅れる', () => {
  const { world, battle } = lrField('BG');
  assert.equal(world.get('BG').shot, 'reflect');
  const mods = battle.beginShot('BG', true, false);
  world.setVelocity('BG', 0, -1200 * mods.speed, mods);
  assert.equal(world.get('BG').shot, 'pierce');
  const recs = [];
  for (let n = 0; n < 240 * 15 && !world.isSettled(); n++) { world.step(); recs.push(...battle.apply(world.drainEvents(), world)); }
  assert.equal(world.get('BG').shot, 'reflect', '止まったら元に戻る');
  assert.equal(battle.enemy('e1').counter, 3 + 2);
  const direct = recs.find((r) => !r.combo && r.enemy === 'e1');
  assert.ok(direct.rates.some((x) => x.kind === 'ss' && x.rate === 3));
});

test('追撃: 敵に当たるたびに全敵へ追撃が出る（上限あり）', () => {
  const { world, battle } = lrField('BH');
  fire(world, battle, 'BH', 300, -1200);
  const chases = battle.drainCombos().filter((c) => c.ss && c.kind === 'lockon');
  assert.ok(chases.length > 0 && chases.length <= LR.BH.ss.chase.max, `${chases.length}`);
});

// ------------------------------------------------------------ ドロップ・報酬
test('ボスのドロップ: 宝箱は ★4 以上のキャラ。拾ったジェムは勝ったときの報酬に足される', () => {
  const s = fresh();
  for (let i = 0; i < 30; i++) assert.ok(M.dropUnit(s, D, lcg(i + 1)).rarity >= 4);
  const a = M.reward(fresh(), D, 0, true, 'normal');
  const b = M.reward(fresh(), D, 0, true, 'normal', 25);
  assert.equal(b.gems, a.gems + 25);
  assert.equal(b.bonus, 25);
  assert.equal(M.reward(fresh(), D, 0, false, 'normal', 25).gems, D.meta.rewards[0].lose, '負けたらボーナスなし');
});

test('友情は途中で敵が全滅しても全部出る（LR は7つ、ウルトラ進化した LR は10個）', () => {
  const s = fresh();
  for (const id of ['A', 'BD', 'BE']) s.owned[id] = { luck: 0, plus: 5, stock: 0, ultra: id === 'BE' };
  const units = M.partyUnits({ ...s, party: ['A', 'BD', 'BE', 'B', 'C'] }, D);
  const stage = { name: 't', waves: [{ enemies: [{ id: 'e1', shape: 'circle', x: 270, y: 150, r: 30, hp: 1, atk: 0, turns: 9, attack: 'single' }] }] };
  for (const [ally, want] of [['BD', 7], ['BE', 10]]) {
    const world = new P.World();
    for (const u of units) world.add({ id: u.id, kind: 'unit', shot: u.shot, x: u.x, y: u.y, r: 30 });
    const battle = new BT({ units, stage });
    battle.spawnWave(world);
    battle._combo(ally, 'A', world, []);   // A が触れた: 最初の友情で HP 1 の敵は倒れる
    assert.equal(battle.waveCleared(), true);
    assert.equal(battle.drainCombos().filter((c) => c.ally === ally).length, want, ally);
  }
});
