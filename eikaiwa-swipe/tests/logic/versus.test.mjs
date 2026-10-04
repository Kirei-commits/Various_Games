import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIME_MS,
  MAX_PLAYERS,
  makeQuestions,
  newRoom,
  joinRoom,
  leaveRoom,
  startRoom,
  submitAnswer,
  questionResult,
  canReveal,
  finishRoom,
  standings,
  isStale,
  roomCode,
} from "../../src/versus.js";

const items = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, english: `word${i}`, japanese: `意味${i}` }));
const seq = (vals) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

/** 2人の部屋を始めた状態 */
function playing(count = 3) {
  let room = newRoom({ code: "1234", uid: "a", name: "Aki", now: 0, count });
  room = joinRoom(room, "b", "Ben", 1).room;
  return startRoom(room, makeQuestions(items, items, count, seq([0.3, 0.7, 0.1, 0.9, 0.5]))).room;
}
const correctOf = (room, q) => room.questions[q].choices.indexOf(room.questions[q].id);

test("問題: 4択は正解を1つ含み、全員が同じ順で見る。数は指定どおり", () => {
  const qs = makeQuestions(items, items, 5, seq([0.2, 0.6, 0.4]));
  assert.equal(qs.length, 5);
  for (const q of qs) {
    assert.equal(q.choices.length, 4);
    assert.ok(q.choices.includes(q.id));
    assert.equal(new Set(q.choices).size, 4);
  }
  assert.equal(makeQuestions(items.slice(0, 4), items, 10).length, 4, "範囲より多くは出さない");
  assert.match(roomCode(() => 0.5), /^\d{4}$/);
});

test("部屋: 待合室で入れる（最大4人・同じ人は1回）。始まったら入れない。待合室なら出られる", () => {
  let room = newRoom({ code: "1234", uid: "a", name: "Aki" });
  assert.equal(startRoom(room, makeQuestions(items, items, 3)).error, "alone", "1人では始められない");
  room = joinRoom(room, "b", "Ben").room;
  assert.equal(joinRoom(room, "b", "Ben").room, room);
  room = joinRoom(room, "c", "C").room;
  room = joinRoom(room, "d", "D").room;
  assert.equal(Object.keys(room.players).length, MAX_PLAYERS);
  assert.equal(joinRoom(room, "e", "E").error, "full");
  assert.equal(joinRoom(null, "e", "E").error, "not-found");
  assert.equal(joinRoom({ ...room, protocol: 0 }, "e", "E").error, "version");
  room = leaveRoom(room, "d").room;
  assert.equal(Object.keys(room.players).length, 3);
  const started = startRoom(room, makeQuestions(items, items, 3)).room;
  assert.equal(started.status, "playing");
  assert.equal(joinRoom(started, "e", "E").error, "started");
});

test("早押し: クラウドに最初に届いた正解が1ポイント。そのあとの答えは「先を越された」。間違えたらその問題はもう押せない", () => {
  let room = playing();
  const c = correctOf(room, 0);
  room = submitAnswer(room, "a", 0, (c + 1) % 4, 900).room; // a は間違い（b はまだ答えられる）
  assert.equal(submitAnswer(room, "a", 0, c, 1000).error, "answered");
  const out = submitAnswer(room, "b", 0, c, 1500);
  assert.equal(out.won, true);
  room = out.room;
  assert.equal(questionResult(room, 0).winner, "b");
  assert.equal(questionResult(room, 0).results.a.ok, false);
  // 届いた順で決まる（押すまでの時間が短くても、あとから届いた正解は負け）
  let room2 = playing();
  const c2 = correctOf(room2, 0);
  room2 = submitAnswer(room2, "a", 0, c2, 2100).room;
  assert.equal(submitAnswer(room2, "b", 0, c2, 1800).error, "taken");
  assert.equal(questionResult(room2, 0).winner, "a");
});

test("締め切り: 誰かが正解した・全員が答えた・5秒たったとき（各端末が判定）。終わりは1回だけ、もう一度は1回だけ", () => {
  let room = playing(2);
  assert.equal(canReveal(room, 0, 1000), false);
  assert.equal(canReveal(room, 0, TIME_MS), true, "5秒で答えに移る");
  const c = correctOf(room, 0);
  room = submitAnswer(room, "a", 0, (c + 1) % 4, 800).room;
  assert.equal(canReveal(room, 0, 1000), false, "間違いだけなら、ほかの人がまだ答えられる");
  const won = submitAnswer(room, "b", 0, c, 1200).room;
  assert.equal(canReveal(won, 0, 1300), true, "誰かが正解したらすぐ");
  const both = submitAnswer(room, "b", 0, (c + 2) % 4, 1200).room;
  assert.equal(canReveal(both, 0, 1300), true, "全員答えたらすぐ");
  assert.equal(submitAnswer(room, "b", 1, c, TIME_MS + 1000).error, "closed", "時間切れのあとは答えられない");
  const done = finishRoom(won, won.round).room;
  assert.equal(done.status, "done");
  assert.equal(finishRoom(done, won.round - 1).room, done);
  const again = startRoom(done, makeQuestions(items, items, 2), done.round).room;
  assert.equal(again.round, done.round + 1);
  assert.deepEqual([again.answers, again.wins], [{}, {}]);
  assert.equal(startRoom(again, makeQuestions(items, items, 2), done.round).room, again, "2人が同時に押しても1回だけ");
  assert.equal(finishRoom(again, done.round).room, again, "前のゲームの終わりで、新しいゲームを終わらせない");
  const [first] = standings(won, 1);
  assert.deepEqual([first.uid, first.points, first.correct], ["b", 1, 1]);
});

test("時間切れより遅い答えは数えない", () => {
  let room = playing(1);
  const c = correctOf(room, 0);
  room = { ...room, answers: { 0: { a: { c, ms: TIME_MS + 2000 } } } };
  assert.equal(questionResult(room, 0).results.a, undefined);
});

test("1人モード: 答えるとすぐ解説へ（待たない）。得点は正解数", () => {
  let room = startRoom(newRoom({ code: "solo", uid: "me", name: "Me", solo: true }), makeQuestions(items, items, 2)).room;
  assert.equal(room.status, "playing");
  room = submitAnswer(room, "me", 0, correctOf(room, 0), 700).room;
  assert.equal(canReveal(room, 0, 800), true);
  assert.equal(canReveal(room, 1, 4000), false);
  assert.equal(standings(room)[0].correct, 1);
});

test("もう一度遊ぶと round が増え、答えはリセット。古い部屋・終わった部屋は作り直せる", () => {
  let room = playing(1);
  room = submitAnswer(room, "a", 0, 0, 500).room;
  room = finishRoom(room, room.round).room;
  const again = startRoom(room, makeQuestions(items, items, 1), room.round).room;
  assert.equal(again.round, room.round + 1);
  assert.deepEqual(again.answers, {});
  assert.equal(isStale(room, 10), true);
  assert.equal(isStale(again, 10), false);
  assert.equal(isStale(again, 3 * 60 * 60 * 1000), true);
  assert.equal(isStale(null, 0), true);
});

test("報酬: 正解1問30pt、対戦では早押し1回+30pt・勝ち+200pt。1人の練習は正解だけ。終わる前は0", async () => {
  const { versusReward, VERSUS_POINTS } = await import("../../src/versus.js");
  let room = playing(2);
  for (let q = 0; q < 2; q++) {
    const c = correctOf(room, q);
    room = submitAnswer(room, "b", q, (c + 1) % 4, 400).room;
    room = submitAnswer(room, "a", q, c, 500).room;
  }
  room = finishRoom(room, room.round).room;
  assert.deepEqual(versusReward(room, "a"), { points: 2 * VERSUS_POINTS.correct + 2 * VERSUS_POINTS.fastest + VERSUS_POINTS.win, won: true });
  assert.deepEqual(versusReward(room, "b"), { points: 0, won: false });
  let solo = startRoom(newRoom({ code: "solo", uid: "me", name: "Me", solo: true }), makeQuestions(items, items, 1)).room;
  solo = submitAnswer(solo, "me", 0, correctOf(solo, 0), 300).room;
  assert.deepEqual(versusReward(solo, "me"), { points: VERSUS_POINTS.correct, won: false });
});
