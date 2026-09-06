import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ, fakeStorage } from './helpers.mjs';

const FILES = ['fish.js', 'progress.js', 'angler.js', 'world.js', 'gear.js', 'parts.js',
  'boost.js', 'bonus.js', 'achievements.js', 'storage.js'];
const load = () => loadFQ(FILES, { localStorage: fakeStorage() });

test('日付キーはローカル時刻で YYYY-MM-DD になる', () => {
  const { Bonus } = load();
  assert.equal(Bonus.dateKey(new Date(2026, 8, 6)), '2026-09-06');
  assert.equal(Bonus.dateKey(new Date(2026, 0, 1)), '2026-01-01');
  assert.equal(Bonus.dateKey(new Date(2026, 11, 31)), '2026-12-31');
});

test('日付の差が正しく求まり、月またぎ・年またぎでも壊れない', () => {
  const { Bonus } = load();
  assert.equal(Bonus.daysBetween('2026-09-06', '2026-09-07'), 1);
  assert.equal(Bonus.daysBetween('2026-09-30', '2026-10-01'), 1);
  assert.equal(Bonus.daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(Bonus.daysBetween('2026-09-06', '2026-09-06'), 0);
  assert.equal(Bonus.daysBetween('2026-09-06', '2026-09-10'), 4);
  assert.equal(Bonus.daysBetween('', '2026-09-06'), null, '初回は差が求まらない');
});

test('報酬は7日で一巡し、7日目がいちばん大きい', () => {
  const { Bonus } = load();
  assert.equal(Bonus.REWARDS.length, Bonus.CYCLE);
  assert.equal(Bonus.rewardFor(1).day, 1);
  assert.equal(Bonus.rewardFor(7).day, 7);
  assert.equal(Bonus.rewardFor(8).day, 1, '8日目は1日目の報酬に戻る');
  assert.equal(Bonus.rewardFor(14).day, 7);

  const coinsOf = (day) => (Bonus.rewardFor(day).items.find((i) => i.type === 'coins') || {}).amount || 0;
  assert.ok(coinsOf(7) > coinsOf(1), '7日目のほうが少ない');
});

test('初回は必ず受け取れて、同じ日には二度受け取れない', () => {
  const { Bonus, Store } = load();
  const st = Store.defaults();
  assert.equal(Bonus.pending(st, '2026-09-06'), true);

  const first = Bonus.claim(st, '2026-09-06');
  assert.equal(first.claimed, true);
  assert.equal(first.streak, 1);
  assert.ok(st.coins > 0, 'ポイントが増えていない');

  const coins = st.coins;
  const again = Bonus.claim(st, '2026-09-06');
  assert.equal(again.claimed, false);
  assert.equal(st.coins, coins, '二重に受け取れてしまった');
  assert.equal(Bonus.pending(st, '2026-09-06'), false);
});

test('連続でログインすると日数が伸び、1日でも空くと1に戻る', () => {
  const { Bonus, Store } = load();
  const st = Store.defaults();
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
  days.forEach((d, i) => {
    assert.equal(Bonus.claim(st, d).streak, i + 1, `${d} の連続日数`);
  });
  assert.equal(st.bonusStreak, 4);

  const skipped = Bonus.claim(st, '2026-09-06'); // 09-05 を飛ばした
  assert.equal(skipped.streak, 1, '空けたのに連続が続いている');
});

test('8日目からは報酬が一巡して続く', () => {
  const { Bonus, Store } = load();
  const st = Store.defaults();
  for (let d = 1; d <= 8; d++) {
    const key = '2026-09-' + (d < 10 ? '0' : '') + d;
    var got = Bonus.claim(st, key);
  }
  assert.equal(got.streak, 8);
  assert.equal(got.day, 1, '8日目に1日目の報酬へ戻っていない');
});

test('エサとブーストの報酬が所持数として入る', () => {
  const { Bonus, Store } = load();
  const st = Store.defaults();
  // 3日目=エサ、5日目=ブースト
  Bonus.claim(st, '2026-09-01');
  Bonus.claim(st, '2026-09-02');
  Bonus.claim(st, '2026-09-03');
  assert.ok(st.lures.shrimp > 0, 'エサが入っていない');
  Bonus.claim(st, '2026-09-04');
  Bonus.claim(st, '2026-09-05');
  assert.ok(st.boostStock.boost_quick > 0, 'ブーストが入っていない');
});

test('7日続けると実績「皆勤賞」の条件を満たす', () => {
  const { Bonus, Store, Achievements } = load();
  const st = Store.defaults();
  for (let d = 1; d <= 7; d++) {
    Bonus.claim(st, '2026-09-0' + d);
  }
  assert.equal(st.bonusStreak, 7);
  assert.ok(Achievements.evaluate(st, null).includes('login7'));
});
