import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ, fakeStorage, toPlain } from './helpers.mjs';

const FILES = ['fish.js', 'progress.js', 'world.js', 'gear.js', 'achievements.js', 'storage.js'];
const load = (extra) => loadFQ(FILES, extra);

test('保存 → 読み込みで進捗がそのまま戻る', () => {
  const localStorage = fakeStorage();
  const { Store } = load({ localStorage });
  const st = Store.defaults();
  st.xp = 1234; st.coins = 99; st.rod = 3; st.line = 2; st.lure = 'jig';
  st.lures.jig = 7;
  st.dex.aji = { count: 3, maxSize: 28.4, bestPoints: 41, firstAt: 1000 };
  st.records.push({ id: 'aji', size: 28.4, points: 41, at: 1000 });
  st.achievements.push('first');
  st.settings.sound = false;
  assert.equal(Store.save(st), true);

  const back = Store.load();
  assert.equal(back.xp, 1234);
  assert.equal(back.coins, 99);
  assert.equal(back.rod, 3);
  assert.equal(back.lure, 'jig');
  assert.equal(back.lures.jig, 7);
  assert.equal(back.dex.aji.maxSize, 28.4);
  assert.equal(back.records.length, 1);
  assert.deepEqual(toPlain(back.achievements), ['first']);
  assert.equal(back.settings.sound, false);
  assert.equal(back.level, Store.load().level);
  assert.equal(back.level, load({ localStorage }).Progress.levelFromXp(1234),
    'xp からレベルが復元されていない');
});

test('DEFAULTS に無いキーは捨て、欠けたキーは既定値で埋める', () => {
  const { Store } = load({ localStorage: fakeStorage() });
  const merged = Store.merge({ xp: 50, bogusKey: 'x', settings: { sound: false, bogus: 1 } });
  assert.equal(merged.xp, 50);
  assert.equal(merged.bogusKey, undefined, '未定義のキーが残っている');
  assert.equal(merged.settings.sound, false);
  assert.equal(merged.settings.bogus, undefined);
  assert.equal(merged.coins, 0, '欠けたキーが既定値で埋まっていない');
  assert.deepEqual(toPlain(merged.lures), { shrimp: 0, jig: 0, glow: 0, chum: 0 });
});

test('型が違う保存値は無視して既定値を使う（壊れたデータで起動不能にしない）', () => {
  const { Store } = load({ localStorage: fakeStorage() });
  const merged = Store.merge({ xp: 'たくさん', rod: null, dex: 'こわれてる', records: {} });
  assert.equal(merged.xp, 0);
  assert.equal(merged.rod, 1);
  assert.deepEqual(toPlain(merged.dex), {});
  assert.deepEqual(toPlain(merged.records), []);
});

test('localStorage が例外を投げても既定値で動き続ける', () => {
  const blocked = load({ localStorage: fakeStorage(['get', 'set', 'remove']) });
  const st = blocked.Store.load();
  assert.equal(st.xp, 0, '読み込み失敗で既定値にならない');
  assert.equal(blocked.Store.save(st), false, '保存の失敗を握りつぶしていない');
  assert.equal(blocked.Store.clear(), false);

  // localStorage 自体が無い環境
  const none = load({});
  assert.equal(none.Store.load().xp, 0);
  assert.equal(none.Store.save(none.Store.defaults()), false);
});

test('壊れたJSONが入っていても既定値で復帰する', () => {
  const localStorage = fakeStorage();
  const { Store } = load({ localStorage });
  localStorage.setItem(Store.KEY, '{これはJSONではない');
  assert.equal(Store.load().xp, 0);
});

test('釣果はポイント・図鑑・記録・コンボへ同時に反映される', () => {
  const FQ = load({ localStorage: fakeStorage() });
  const { Store, Fish, Progress } = FQ;
  const st = Store.defaults();
  const aji = Fish.byId('aji');

  const r1 = Store.applyCatch(st, { fish: aji, size: 28 }, 1000);
  assert.equal(r1.points, Progress.pointsFor({ fish: aji, size: 28, combo: 0 }));
  assert.equal(st.xp, r1.points);
  assert.equal(st.coins, r1.points, 'xp と coins は同額増える');
  assert.equal(st.catches, 1);
  assert.equal(st.combo, 1);
  assert.equal(r1.isNew, true);
  assert.equal(st.dex.aji.count, 1);
  assert.equal(st.dex.aji.firstAt, 1000);
  assert.equal(st.records.length, 1);

  const r2 = Store.applyCatch(st, { fish: aji, size: 30 }, 2000);
  assert.equal(r2.isNew, false);
  assert.equal(r2.isBiggest, true);
  assert.equal(st.dex.aji.maxSize, 30);
  assert.ok(r2.points > r1.points, 'コンボと大きさで増えていない');
  assert.equal(st.combo, 2);
});

test('バラすとコンボだけが切れ、ポイントと図鑑は減らない', () => {
  const { Store, Fish } = load({ localStorage: fakeStorage() });
  const st = Store.defaults();
  Store.applyCatch(st, { fish: Fish.byId('aji'), size: 25 }, 1);
  const xp = st.xp;
  const r = Store.applyMiss(st);
  assert.equal(r.lostCombo, 1);
  assert.equal(st.combo, 0);
  assert.equal(st.misses, 1);
  assert.equal(st.xp, xp, 'バラシでポイントが減っている');
  assert.equal(st.dex.aji.count, 1);
});

test('ベスト記録は上位10件だけをポイント順で保持する', () => {
  const { Store, Fish } = load({ localStorage: fakeStorage() });
  const st = Store.defaults();
  const aji = Fish.byId('aji');
  for (let i = 0; i < 25; i++) {
    st.combo = 0; // コンボの影響を除いて素の点で比べる
    Store.applyCatch(st, { fish: aji, size: aji.min + (i % 15) }, i);
  }
  assert.equal(st.records.length, Store.RECORD_MAX);
  for (let i = 1; i < st.records.length; i++) {
    assert.ok(st.records[i - 1].points >= st.records[i].points, '記録がポイント順でない');
  }
});

test('レベルアップは applyCatch の戻り値で分かる', () => {
  const { Store, Fish, Progress } = load({ localStorage: fakeStorage() });
  const st = Store.defaults();
  st.xp = Progress.totalFor(2) - 1;
  st.level = Progress.levelFromXp(st.xp);
  const r = Store.applyCatch(st, { fish: Fish.byId('aji'), size: 25 }, 1);
  assert.equal(r.leveledTo, 2);
  assert.equal(st.level, 2);
});
