import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ, fakeStorage } from './helpers.mjs';

const FQ = loadFQ(
  ['fish.js', 'progress.js', 'angler.js', 'world.js', 'gear.js', 'parts.js', 'boost.js',
   'bonus.js', 'achievements.js', 'storage.js'],
  { localStorage: fakeStorage() }
);
const { Achievements, Store, Fish } = FQ;

test('実績のIDは重複せず、rank も重複しない', () => {
  const ids = new Set(), ranks = new Set();
  for (const a of Achievements.LIST) {
    assert.equal(ids.has(a.id), false, `IDが重複: ${a.id}`);
    assert.equal(ranks.has(a.rank), false, `rankが重複: ${a.rank}`);
    ids.add(a.id); ranks.add(a.rank);
    assert.ok(a.name && a.title && a.desc, `${a.id}: 表示用の文言が欠けている`);
    assert.equal(typeof a.check, 'function');
  }
});

test('何もしていない状態ではひとつも達成していない', () => {
  assert.equal(Achievements.evaluate(Store.defaults(), null).length, 0);
  assert.equal(Achievements.titleOf(Store.defaults()), '無名の釣り人');
});

test('達成済みの実績は二度と返らない', () => {
  const st = Store.defaults();
  st.catches = 1;
  const first = Achievements.evaluate(st, null);
  assert.ok(first.includes('first'));
  st.achievements = first.slice();
  assert.equal(Achievements.evaluate(st, null).includes('first'), false);
});

/** 図鑑に n 種ぶんの記録を入れる。 */
function fill(st, n) {
  Fish.all().slice(0, n).forEach((f) => {
    st.dex[f.id] = { count: 1, maxSize: 10, bestPoints: 1 };
  });
}

test('各実績が条件どおりに解除される', () => {
  const cases = [
    ['first',     (s) => { s.catches = 1; }],
    ['ten',       (s) => { s.catches = 10; }],
    ['kind10',    (s) => { fill(s, 10); }],
    ['kind20',    (s) => { fill(s, 20); }],
    ['combo10',   (s) => { s.bestCombo = 10; }],
    ['big100',    (s) => { s.dex.buri = { count: 1, maxSize: 101, bestPoints: 1 }; }],
    ['rich',      (s) => { s.dex.tai = { count: 1, maxSize: 50, bestPoints: 500 }; }],
    ['kue',       (s) => { s.dex.kue = { count: 1, maxSize: 90, bestPoints: 1 }; }],
    ['gear_max',  (s) => { s.rod = 5; s.line = 5; }],
    ['ryugu',     (s) => { s.dex.ryugu = { count: 1, maxSize: 300, bestPoints: 1 }; }],
    ['rabuka',    (s) => { s.dex.rabuka = { count: 1, maxSize: 150, bestPoints: 1 }; }],
    ['daiouika',  (s) => { s.dex.daiouika = { count: 1, maxSize: 500, bestPoints: 1 }; }],
    ['login7',    (s) => { s.bonusStreak = 7; }],
    ['dressed',   (s) => { s.ownedParts = ['a', 'b', 'c', 'd', 'e', 'f']; }],
    ['angler_max', (s) => { s.anglerLevel = 20; }],
    ['complete',  (s) => { fill(s, 30); }],
    ['master',    (s) => { s.level = 30; }]
  ];
  for (const [id, setup] of cases) {
    const st = Store.defaults();
    setup(st);
    assert.ok(Achievements.evaluate(st, null).includes(id), `${id} が解除されない`);
  }
});

test('その場の釣果でも判定される（図鑑に入る前でも解除できる）', () => {
  const st = Store.defaults();
  assert.ok(Achievements.evaluate(st, { size: 120, points: 10 }).includes('big100'));
  assert.ok(Achievements.evaluate(st, { size: 20, points: 800 }).includes('rich'));
});

test('称号は達成済みのうち最上位のものになる', () => {
  const st = Store.defaults();
  st.achievements = ['first', 'ten'];
  assert.equal(Achievements.titleOf(st), Achievements.byId('ten').title);
  st.achievements.push('master');
  assert.equal(Achievements.titleOf(st), Achievements.byId('master').title);
  st.achievements.push('first');
  assert.equal(Achievements.titleOf(st), Achievements.byId('master').title, '順序に依存している');
});

test('未知のIDが混ざっていても落ちない', () => {
  const st = Store.defaults();
  st.achievements = ['nonexistent', 'first'];
  assert.equal(Achievements.titleOf(st), Achievements.byId('first').title);
});

test('すべてやり切ると全実績が解除され、称号が最終形になる', () => {
  const st = Store.defaults();
  for (const f of Fish.all()) st.dex[f.id] = { count: 1, maxSize: f.max, bestPoints: 600 };
  st.catches = 50; st.bestCombo = 10; st.rod = 5; st.line = 5; st.level = 30;
  st.anglerLevel = 20; st.bonusStreak = 7;
  st.ownedParts = ['a', 'b', 'c', 'd', 'e', 'f'];
  st.achievements = Achievements.evaluate(st, null);
  assert.equal(st.achievements.length, Achievements.LIST.length, 'すべて解除されていない');
  assert.equal(Achievements.titleOf(st), Achievements.byId('master').title);
});

test('図鑑の実績は魚の種類数と食い違わない', () => {
  const complete = Achievements.LIST.find((a) => a.id === 'complete');
  const st = Store.defaults();
  Fish.all().slice(0, Fish.count - 1).forEach((f) => {
    st.dex[f.id] = { count: 1, maxSize: 1, bestPoints: 1 };
  });
  assert.equal(complete.check(st, null), false, '1種足りなくても完成扱いになっている');
  const last = Fish.all()[Fish.count - 1];
  st.dex[last.id] = { count: 1, maxSize: 1, bestPoints: 1 };
  assert.equal(complete.check(st, null), true, '全種そろえても完成にならない');
});
