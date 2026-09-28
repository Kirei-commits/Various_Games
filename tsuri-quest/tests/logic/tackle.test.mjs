/**
 * 補正の合流点の検証。効くものが増えたときに、
 * 「どこかで二重に掛かる」「掛け忘れる」を防ぐのがこのテストの役目。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ, fakeStorage } from './helpers.mjs';

const FILES = ['fish.js', 'progress.js', 'angler.js', 'world.js', 'gear.js', 'parts.js',
  'boost.js', 'bonus.js', 'achievements.js', 'storage.js', 'tackle.js'];
const FQ = loadFQ(FILES, { localStorage: fakeStorage() });
const { Tackle, Store, World, Gear, Parts, Angler, Boost } = FQ;

const sunny = () => World.weatherOf('sunny');
const fresh = () => Store.defaults();

test('初期状態では素の値になる（どこにも余計な補正が掛かっていない）', () => {
  const t = Tackle.resolve(fresh(), sunny());
  assert.equal(t.waitMul, 1);
  assert.equal(t.biteBonusMs, 0);
  assert.equal(t.reelMul, 1);
  assert.equal(t.drainMul, 1);
  assert.equal(t.breakAt, Gear.line(1).breakAt);
  assert.equal(t.rareBoost, 1);
  assert.equal(t.bigBias, 0);
  assert.equal(t.pointMul, 1);
  assert.equal(t.comboGuard, 0);
});

test('竿・糸・エサがそれぞれ担当する項目にだけ効く', () => {
  const base = Tackle.resolve(fresh(), sunny());

  const rod = fresh(); rod.rod = 5;
  const r = Tackle.resolve(rod, sunny());
  assert.ok(r.reelMul > base.reelMul, '竿で取り込みが速くならない');
  assert.ok(r.biteBonusMs > base.biteBonusMs, '竿で猶予が伸びない');
  assert.equal(r.breakAt, base.breakAt, '竿が糸の担当まで良くしている');
  assert.equal(r.waitMul, base.waitMul, '竿がエサの担当まで良くしている');

  const line = fresh(); line.line = 5;
  const l = Tackle.resolve(line, sunny());
  assert.ok(l.breakAt > base.breakAt, '糸で限界が上がらない');
  assert.equal(l.reelMul, base.reelMul, '糸が竿の担当まで良くしている');

  const lure = fresh(); lure.lure = 'chum';
  const u = Tackle.resolve(lure, sunny());
  assert.ok(u.waitMul < base.waitMul, 'エサで待ち時間が短くならない');
  assert.ok(u.rareBoost > base.rareBoost, 'エサでレアが寄らない');
  assert.ok(u.bigBias > base.bigBias, 'エサで大物が寄らない');
  assert.equal(u.reelMul, base.reelMul, 'エサが竿の担当まで良くしている');
});

test('パーツは装備しているときだけ効き、未所持なら効かない', () => {
  const notOwned = fresh();
  notOwned.parts.reel = 'reel_legend';
  assert.equal(Tackle.resolve(notOwned, sunny()).reelMul, 1, '買っていないリールが効いている');

  const owned = fresh();
  owned.ownedParts = ['reel_legend', 'float_gold'];
  owned.parts.reel = 'reel_legend';
  owned.parts.float = 'float_gold';
  const t = Tackle.resolve(owned, sunny());
  assert.equal(t.reelMul, Parts.byId('reel_legend').reelMul);
  assert.equal(t.drainMul, Parts.byId('reel_legend').drainMul);
  assert.equal(t.biteBonusMs, Parts.byId('float_gold').biteBonusMs);
});

test('釣り人レベルの恩恵が反映される', () => {
  const st = fresh();
  st.anglerXp = Angler.totalFor(Angler.LEVEL_MAX);
  const t = Tackle.resolve(st, sunny());
  const p = Angler.perks(Angler.LEVEL_MAX);
  assert.ok(Math.abs(t.waitMul - p.waitMul) < 1e-9);
  assert.equal(t.biteBonusMs, p.biteBonusMs);
  assert.ok(Math.abs(t.reelMul - p.reelMul) < 1e-9);
  assert.equal(t.comboGuard, p.comboGuard);
});

test('ブーストは発動中だけ効き、キャストで消えたら元に戻る', () => {
  const st = fresh();
  st.boostActive = { boost_point: 1, boost_rare: 1 };
  const on = Tackle.resolve(st, sunny());
  assert.equal(on.pointMul, 2);
  assert.equal(on.rareBoost, 2);

  st.boostActive = Boost.consume(st.boostActive);
  const off = Tackle.resolve(st, sunny());
  assert.equal(off.pointMul, 1);
  assert.equal(off.rareBoost, 1);
});

test('エサとブーストのレア寄せは掛け算で重なる', () => {
  const st = fresh();
  st.lure = 'glow';
  st.boostActive = { boost_rare: 5 };
  const t = Tackle.resolve(st, sunny());
  assert.equal(t.rareBoost, Gear.lure('glow').rareBoost * 2);
});

test('天候は待ち時間・引きの荒さ・ポイントに効く', () => {
  const st = fresh();
  const calm = Tackle.resolve(st, World.weatherOf('sunny'));
  const storm = Tackle.resolve(st, World.weatherOf('storm'));
  assert.ok(storm.ampMul > calm.ampMul, '嵐で荒れない');
  assert.ok(storm.pointMul > calm.pointMul, '嵐でポイントが増えない');
});

test('糸の限界は 1.0 に届かない（絶対に切れない状態を作らない）', () => {
  const st = fresh();
  st.line = 5;
  st.anglerXp = Angler.totalFor(Angler.LEVEL_MAX);
  st.boostActive = { boost_guard: 10 };
  const t = Tackle.resolve(st, sunny());
  assert.ok(t.breakAt <= Tackle.BREAK_CAP);
  assert.ok(t.breakAt < 1);
});

test('すべて揃えても、待ち時間がゼロにはならない', () => {
  const st = fresh();
  st.lure = 'chum';
  st.anglerXp = Angler.totalFor(Angler.LEVEL_MAX);
  st.boostActive = { boost_quick: 10 };
  const t = Tackle.resolve(st, World.weatherOf('rain'));
  assert.ok(t.waitMul > 0, '待ち時間が消えている');
  assert.ok(t.waitMul < 0.3, 'フル装備の効果が薄すぎる');
});
