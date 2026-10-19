// チャレンジモード: 出題の範囲・決まった出題順・記録
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const C = RGA.challenge;

test('出題は3つのモードの問題から。文章を書く問題は出さず、言語で絞れる', () => {
  const all = C.pool('all');
  assert.ok(all.length > 200);
  assert.ok(all.every((x) => x.problem.type !== 'comment'));
  for (const f of C.LANG_FILTERS.filter((x) => x.id !== 'all')) {
    const list = C.pool(f.id);
    assert.ok(list.length >= C.DAILY_COUNT, f.id);
    assert.ok(list.every((x) => x.problem.lang === f.id), f.id);
  }
  assert.ok(all.some((x) => x.src.startsWith('ハッカソン')) && all.some((x) => x.src.includes('テキスト')) && all.some((x) => x.src.startsWith('配属先')));
});

test('今日の5問は日付と言語で決まり、日が変わると変わる', () => {
  const ids = (l) => l.map((x) => x.problem.id).join();
  assert.equal(ids(C.dailySet('2026-10-19', 'all')), ids(C.dailySet('2026-10-19', 'all')));
  assert.notEqual(ids(C.dailySet('2026-10-19', 'all')), ids(C.dailySet('2026-10-20', 'all')));
  assert.equal(C.dailySet('2026-10-19', 'java').length, C.DAILY_COUNT);
  assert.equal(ids(C.huntOrder('all', 'a')), ids(C.huntOrder('all', 'a')));
});

test('記録: 自己ベストは更新したときだけ、続けた日数は空けると途切れる', () => {
  let rec = C.emptyRecords();
  let out = C.recordHunt(rec, 'all', 5);
  assert.equal(out.isNew, true);
  out = C.recordHunt(out.records, 'all', 3);
  assert.equal(out.isNew, false);
  assert.equal(out.records.best.all, 5);
  rec = C.recordDaily(rec, '2026-10-17', 'all', 3);
  rec = C.recordDaily(rec, '2026-10-18', 'all', 4);
  rec = C.recordDaily(rec, '2026-10-19', 'java', 5);
  assert.equal(C.dailyStreak(rec, '2026-10-19'), 3);
  assert.equal(C.dailyStreak(rec, '2026-10-20'), 3, '今日まだでも昨日まで続いていれば数える');
  assert.equal(C.dailyStreak(rec, '2026-10-22'), 0);
});
