import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRR, fakeStorage, runRally } from './helpers.mjs';

const withStorage = (opts) => loadRR(undefined, { localStorage: fakeStorage(opts) });

test('保存できない環境でも既定値で動く（読み書きの例外を飲み込む）', () => {
  const RR = withStorage({ throwOnGet: true, throwOnSet: true });
  const data = RR.Store.load();
  assert.equal(data.settings.bank, 'java');
  assert.equal(RR.Store.save(data), false, '失敗を握りつぶして true を返している');
  assert.deepEqual(Object.keys(data.history).length, 0);
});

test('壊れた保存データを読んでも落ちない', () => {
  const RR = withStorage();
  const store = RR.Store;
  assert.equal(store.merge(null).settings.bank, 'java');
  assert.equal(store.merge('こわれている').settings.bank, 'java');
  assert.equal(store.merge({ rallies: 'なんだこれ' }).rallies.length, 0);
});

test('既定に無いキーは捨てる（保存しても復元されないキーを作らない）', () => {
  const RR = withStorage();
  const merged = RR.Store.merge({ settings: { bank: 'kuwata', しらないキー: 1 } });
  assert.equal(merged.settings.bank, 'kuwata');
  assert.equal('しらないキー' in merged.settings, false);
});

test('ラリーの結果が単元ごとの成績に畳み込まれ、次の単元選びに効く', () => {
  const RR = withStorage();
  let data = RR.Store.load();
  const s = runRally(RR, 'java', 2, 100);

  data = RR.Store.record(data, s);
  const units = Object.keys(data.history.java);
  assert.ok(units.length >= 1);
  for (const u of units) {
    assert.equal(data.history.java[u].plays, 1);
    assert.ok(data.history.java[u].lastScore >= 0);
    assert.ok(data.history.java[u].lastAt > 0);
  }
  assert.equal(data.rallies.length, 1);
  assert.equal(data.rallies[0].grade, s.summary.grade.grade);

  // やった単元は「未受験」でなくなるので、次のラリーは別の単元が主になる
  const nextPlan = RR.Rally.create('java', data.history, 100).plan;
  assert.ok(!units.includes(nextPlan.main.id), `やったばかりの単元がまた主単元になった: ${nextPlan.main.id}`);
});

test('最高点は下がらない。通算回数は増える', () => {
  const RR = withStorage();
  let data = RR.Store.load();
  data = RR.Store.record(data, runRally(RR, 'java', 0, 11));   // 満点に近い回
  const best = RR.Store.progress(data, 'java').best;
  data = RR.Store.record(data, runRally(RR, 'java', 3, 11));   // 悪い回
  const after = RR.Store.progress(data, 'java');
  assert.equal(after.best, best, '最高点が悪い回で上書きされた');
  assert.equal(after.runs, 2);
  assert.ok(after.last < best);
});

test('履歴は50件で打ち切る', () => {
  const RR = withStorage();
  let data = RR.Store.load();
  for (let i = 0; i < 55; i++) data = RR.Store.record(data, runRally(RR, 'kuwata', 0, i));
  assert.equal(data.rallies.length, 50);
});

test('成績を消すと初期状態に戻る', () => {
  const RR = withStorage();
  let data = RR.Store.load();
  data = RR.Store.record(data, runRally(RR, 'java', 0, 3));
  RR.Store.save(data);
  const fresh = RR.Store.reset();
  assert.equal(fresh.rallies.length, 0);
  assert.deepEqual(Object.keys(fresh.history).length, 0);
});
