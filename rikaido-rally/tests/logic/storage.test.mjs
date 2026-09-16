import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Store from '../../js/core/store.js';
import * as Rally from '../../js/core/rally.js';
import { fakeStorage, runRally, bankById } from './helpers.mjs';

/** 保存先を差し替えて、まっさらな状態から始める */
const withStorage = (opts) => { Store.useStorage(fakeStorage(opts)); return { Store, Rally }; };

test('保存できない環境でも既定値で動く（読み書きの例外を飲み込む）', () => {
  const { Store } = withStorage({ throwOnGet: true, throwOnSet: true });
  const data = Store.load();
  assert.equal(data.settings.bank, 'java');
  assert.equal(Store.save(data), false, '失敗を握りつぶして true を返している');
  assert.deepEqual(Object.keys(data.history).length, 0);
});

test('壊れた保存データを読んでも落ちない', () => {
  const { Store } = withStorage();
  const store = Store;
  assert.equal(store.merge(null).settings.bank, 'java');
  assert.equal(store.merge('こわれている').settings.bank, 'java');
  assert.equal(store.merge({ rallies: 'なんだこれ' }).rallies.length, 0);
});

test('既定に無いキーは捨てる（保存しても復元されないキーを作らない）', () => {
  const { Store } = withStorage();
  const merged = Store.merge({ settings: { bank: 'kuwata', しらないキー: 1 } });
  assert.equal(merged.settings.bank, 'kuwata');
  assert.equal('しらないキー' in merged.settings, false);
});

test('1問ずつの結果も残り、復習の材料になる', () => {
  const { Store } = withStorage();
  let data = Store.load();
  const s = runRally('java', 0, 100);
  // 1問だけ飛ばした状態を作る
  s.records[2].cleared = false;
  s.records[2].skipped = true;

  data = Store.record(data, s);
  const seen = Store.attemptsOf(data, 'java');
  assert.equal(Object.keys(seen).length, s.records.length);
  assert.equal(Store.reviewCount(data, 'java'), s.records.length);
  assert.equal(seen[s.records[2].qid].lastSkipped, true);
  assert.equal(seen[s.records[0].qid].lastSkipped, false);
  assert.equal(seen[s.records[0].qid].times, 1);

  // もう一度やると回数が増える
  data = Store.record(data, runRally('java', 0, 100));
  assert.equal(Store.attemptsOf(data, 'java')[s.records[0].qid].times, 2);
});

test('ラリーの結果が単元ごとの成績に畳み込まれ、次の単元選びに効く', () => {
  const { Store } = withStorage();
  let data = Store.load();
  const s = runRally('java', 2, 100);

  data = Store.record(data, s);
  const units = Object.keys(data.history.java);
  assert.ok(units.length >= 1);
  for (const u of units) {
    assert.equal(data.history.java[u].plays, 1);
    assert.ok(data.history.java[u].lastScore >= 0);
    assert.ok(data.history.java[u].lastAt > 0);
  }
  assert.equal(data.rallies.length, 1);
  assert.equal(data.rallies[0].grade, s.summary.grade.grade);

  // 次のラリーの主単元は「まだ出していない単元」か「直近の点がいちばん低い層」から選ばれる。
  // 点は10点きざみに丸めて同点扱いにし、その中はランダムに混ぜているので、
  // 「最下位の1単元」に固定されるとは限らない（毎回おなじ問題が出るのを避けるため）。
  const bank = bankById('java');
  const played = new Set(units);
  const bucket = (u) => Math.round(data.history.java[u].lastScore / 10);
  const lowestBucket = Math.min(...units.map(bucket));

  for (const seed of [100, 7, 31, 2024]) {
    const plan = Rally.create(bank, data.history, { seed }).plan;
    const id = plan.main.id;
    if (played.has(id)) {
      assert.equal(bucket(id), lowestBucket, `弱い層の単元が主単元になっていない: ${id}`);
      assert.ok(plan.reason.includes('いちばん低い'));
    } else {
      assert.ok(plan.reason.includes('まだ出題していない'), `未出題の理由が出ていない: ${plan.reason}`);
    }
  }
});

test('最高点は下がらない。通算回数は増える', () => {
  const { Store } = withStorage();
  let data = Store.load();
  data = Store.record(data, runRally('java', 0, 11));   // 満点に近い回
  const best = Store.progress(data, 'java').best;
  data = Store.record(data, runRally('java', 3, 11));   // 悪い回
  const after = Store.progress(data, 'java');
  assert.equal(after.best, best, '最高点が悪い回で上書きされた');
  assert.equal(after.runs, 2);
  assert.ok(after.last < best);
});

test('履歴は50件で打ち切る', () => {
  const { Store } = withStorage();
  let data = Store.load();
  for (let i = 0; i < 55; i++) data = Store.record(data, runRally('kuwata', 0, i));
  assert.equal(data.rallies.length, 50);
});

test('成績を消すと初期状態に戻る', () => {
  const { Store } = withStorage();
  let data = Store.load();
  data = Store.record(data, runRally('java', 0, 3));
  Store.save(data);
  const fresh = Store.reset();
  assert.equal(fresh.rallies.length, 0);
  assert.deepEqual(Object.keys(fresh.history).length, 0);
});
