import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, seededRandom } from './helpers.mjs';

/** localStorage の代わり。例外を投げる版も作れるようにしておく */
function fakeStorage(opts = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => { if (opts.throwOnRead) throw new Error('denied'); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (opts.throwOnWrite) throw new Error('quota'); map.set(k, String(v)); },
    removeItem: (k) => map.delete(k)
  };
}

const withStorage = (ls) => loadGF(['data.js', 'engine.js', 'storage.js'], { localStorage: ls });

test('保存していなければ既定値が返る', () => {
  const GF = withStorage(fakeStorage());
  const d = GF.Store.load();
  assert.equal(d.settings.sound, true);
  assert.equal(d.record.bestScore, 0);
});

test('読み書きが例外を投げても既定値でゲームが成り立つ', () => {
  const GF = withStorage(fakeStorage({ throwOnRead: true, throwOnWrite: true }));
  assert.equal(GF.Store.load().settings.mode, 'free');
  assert.equal(GF.Store.save({ settings: { sound: false } }).settings.sound, false, 'メモリ上では反映される');
  assert.equal(GF.Store.saveFarm(GF.Engine.create()), false, '書けなくても落ちない');
  assert.equal(GF.Store.loadFarm(), null);
});

test('既定値に無いキーは捨てる（書き忘れると復元されない、の逆方向の確認）', () => {
  const ls = fakeStorage();
  const GF = withStorage(ls);
  GF.Store.save({ settings: { sound: false, nope: 1 } });
  const raw = JSON.parse(ls.map.get(GF.Store.KEY));
  assert.equal(raw.settings.sound, false);
  assert.equal(raw.settings.nope, undefined);
});

test('のんびりモードの農園は保存して復元できる', () => {
  const ls = fakeStorage();
  const GF = withStorage(ls);
  GF.Engine.setRandom(seededRandom(5));
  const s = GF.Engine.create();
  GF.Engine.plant(s, 0, 'wheat');
  GF.Engine.tick(s, 4000);
  GF.Engine.harvest(s, 0);

  assert.equal(GF.Store.saveFarm(s), true);
  const back = GF.Store.loadFarm();
  assert.equal(back.barn.wheat, 1);
  assert.equal(back.now, s.now);
  assert.equal(back.orders.length, s.orders.length);
});

test('3分チャレンジは保存しない（途中から再開できたら記録の意味が無い）', () => {
  const ls = fakeStorage();
  const GF = withStorage(ls);
  GF.Engine.setRandom(seededRandom(6));
  assert.equal(GF.Store.saveFarm(GF.Engine.create({ mode: 'rush' })), false);
  assert.equal(GF.Store.loadFarm(), null);
});

test('形の合わない保存や、古い版の保存は捨てる', () => {
  const ls = fakeStorage();
  const GF = withStorage(ls);
  ls.map.set(GF.Store.FARM_KEY, 'こわれている');
  assert.equal(GF.Store.loadFarm(), null);

  ls.map.set(GF.Store.FARM_KEY, JSON.stringify({ v: GF.Store.FARM_VERSION, state: { coins: 1 } }));
  assert.equal(GF.Store.loadFarm(), null, '畑や機械が無い保存は使わない');

  ls.map.set(GF.Store.FARM_KEY, JSON.stringify({ v: GF.Store.FARM_VERSION + 1, state: GF.Engine.create() }));
  assert.equal(GF.Store.loadFarm(), null, '版が違えば捨てる');
});

test('農園を捨てられる（はじめから、のために）', () => {
  const ls = fakeStorage();
  const GF = withStorage(ls);
  GF.Engine.setRandom(seededRandom(7));
  GF.Store.saveFarm(GF.Engine.create());
  assert.ok(GF.Store.loadFarm());
  GF.Store.clearFarm();
  assert.equal(GF.Store.loadFarm(), null);
});

test('あとから足した項目が無い古い保存でも、新しい仕掛けが動く', () => {
  const ls = fakeStorage();
  const GF = withStorage(ls);
  GF.Engine.setRandom(seededRandom(3));

  // ふなびんが無かった頃の保存を作る
  const old = GF.Engine.create();
  delete old.boat;
  delete old.nextBoatAt;
  delete old.stats.shipped;
  delete old.stats.boatMissed;
  GF.Store.saveFarm(old);

  const back = GF.Store.loadFarm();
  assert.equal(back.nextBoatAt, 0, '無かった項目が埋まっている');
  assert.equal(back.stats.shipped, 0, '数え始めが 0（undefined だと ++ で NaN になる）');

  // 埋まっていないと `now >= undefined` が常に false で、船が永久に来ない
  back.level = GF.Engine.BOAT_LEVEL;
  for (let t = 1000; t <= 60_000; t += 1000) GF.Engine.tick(back, t);
  assert.ok(back.boat, '古い保存でもふなびんが来る');
});

test('壊れた stats でも落ちない', () => {
  const GF = withStorage(fakeStorage());
  GF.Engine.setRandom(seededRandom(4));
  const s = GF.Engine.create();
  s.stats = 'こわれている';
  s.events = null;
  GF.Engine.normalize(s);
  assert.equal(typeof s.stats, 'object');
  assert.equal(s.stats.harvested, 0);
  assert.ok(Array.isArray(s.events));
});

test('形を借りるだけのとき（bare）は乱数を消費しない', () => {
  const GF = withStorage(fakeStorage());
  let calls = 0;
  GF.Engine.setRandom(() => { calls++; return 0.5; });
  GF.Engine.create({ bare: true });
  assert.equal(calls, 0, 'normalize が ?seed= の再現性を壊さないための約束');
  GF.Engine.create();
  assert.ok(calls > 0, 'ふつうに作るときは注文を引く');
});
