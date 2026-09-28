import { test } from "node:test";
import assert from "node:assert/strict";
import rawChapters from "../../src/data/index.js";
import {
  buildLibrary,
  freshState,
  restoreState,
  chapterQueue,
  applySwipe,
  toggleLearned,
  resetChapter,
  applyTestResult,
  currentStreak,
  slugify,
} from "../../src/logic.js";

const lib = buildLibrary(rawChapters);
const ch1 = lib.chapters[0];
const T = "2026-09-28";
const Y = "2026-09-27";

test("教材は40章×50問=2000問で、IDは英語から決まり重複しない", () => {
  assert.equal(lib.errors.length, 0, lib.errors.join("\n"));
  assert.equal(lib.chapters.length, 40);
  assert.ok(lib.chapters.every((c) => c.items.length === 50));
  assert.equal(Object.keys(lib.byId).length, 2000);
  assert.equal(slugify("It's up to you."), "its-up-to-you");
  assert.equal(slugify("résumé"), "resume");
});

test("右スワイプはキューから外し、左スワイプは最後尾に回す", () => {
  let s = freshState();
  const [first, second] = chapterQueue(s, ch1);
  s = applySwipe(s, ch1, first, "right", T, Y);
  assert.equal(s.learned[first], true);
  assert.ok(!chapterQueue(s, ch1).includes(first));
  assert.equal(chapterQueue(s, ch1)[0], second);

  s = applySwipe(s, ch1, second, "left", T, Y);
  const q = chapterQueue(s, ch1);
  assert.equal(q[q.length - 1], second);
  assert.equal(q.length, 49);
});

test("一覧から「覚えた」を切り替えるとキューも追従する", () => {
  let s = freshState();
  const id = ch1.items[3].id;
  s = toggleLearned(s, ch1, id);
  assert.ok(!chapterQueue(s, ch1).includes(id));
  s = toggleLearned(s, ch1, id);
  assert.equal(chapterQueue(s, ch1).at(-1), id);
});

test("章のリセットはその章だけを未習得に戻す", () => {
  let s = freshState();
  s = applySwipe(s, ch1, ch1.items[0].id, "right", T, Y);
  const ch2 = lib.chapters[1];
  s = applySwipe(s, ch2, ch2.items[0].id, "right", T, Y);
  s = resetChapter(s, ch1);
  assert.equal(chapterQueue(s, ch1).length, 50);
  assert.equal(s.learned[ch2.items[0].id], true);
});

test("テストで間違えた問題は苦手に数え、未習得に戻して最後尾へ", () => {
  let s = freshState();
  const a = ch1.items[0].id;
  const b = ch1.items[1].id;
  s = applySwipe(s, ch1, a, "right", T, Y);
  s = applyTestResult(s, lib, "ch01", [{ id: a, correct: false }, { id: b, correct: true }], T, Y);
  assert.equal(s.learned[a], undefined);
  assert.equal(chapterQueue(s, ch1).at(-1), a);
  assert.equal(s.misses[a], 1);
  assert.deepEqual(s.tests.ch01, { best: 50, last: 50, count: 1 });

  // 次に正解すると苦手カウントが減り、最高点は保たれる
  s = applyTestResult(s, lib, "ch01", [{ id: a, correct: true }, { id: b, correct: false }], T, Y);
  assert.equal(s.misses[a], undefined);
  assert.equal(s.misses[b], 1);
  assert.deepEqual(s.tests.ch01, { best: 50, last: 50, count: 2 });
  assert.equal(s.stats.totalAnswers, 4);
});

test("連続学習日数: 昨日の続きなら+1、間が空けば1から、表示は途切れを反映", () => {
  let s = freshState();
  s = applySwipe(s, ch1, ch1.items[0].id, "right", Y, "2026-09-26");
  assert.equal(s.stats.streak, 1);
  s = applySwipe(s, ch1, ch1.items[1].id, "right", T, Y);
  assert.equal(s.stats.streak, 2);
  assert.equal(s.stats.todayCount, 1);
  assert.equal(currentStreak(s.stats, T, Y), 2);
  assert.equal(currentStreak(s.stats, "2026-10-05", "2026-10-04"), 0);
});

test("v1（22フレーズ版）の保存データを引き継ぐ", () => {
  const v1 = {
    statuses: { p01: "learned", p02: "unlearned", p22: "learned" },
    queue: ["p02"],
    stats: { totalSwipes: 5, streak: 3, lastStudyDate: T, todayDate: T, todayCount: 5 },
  };
  const s = restoreState(v1, lib);
  assert.equal(s.learned["make-sense"], true);
  assert.equal(s.learned.awkward, true);
  assert.equal(s.learned["figure-out"], undefined);
  assert.equal(s.stats.totalSwipes, 5);
  assert.equal(s.stats.totalAnswers, 0);
});

test("壊れた・古い保存データでも起動できる", () => {
  assert.deepEqual(restoreState(null, lib), freshState());
  const s = restoreState({ version: 2, learned: { "no-such-id": true }, queues: { ch01: ["x"] }, chapter: "ch99" }, lib);
  assert.deepEqual(s.learned, {});
  assert.equal(s.chapter, "ch01");
  assert.equal(chapterQueue(s, ch1).length, 50);
});
