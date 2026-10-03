import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIME_MS,
  GRACE_MS,
  MAX_PLAYERS,
  makeQuestions,
  newRoom,
  joinRoom,
  leaveRoom,
  startRoom,
  submitAnswer,
  questionResult,
  canReveal,
  reveal,
  nextQuestion,
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

test("早押し: いちばん早く正解した人が1ポイント。間違えたらその問題はもう押せない", () => {
  let room = playing();
  const c = correctOf(room, 0);
  room = submitAnswer(room, "a", 0, (c + 1) % 4, 900).room; // a は間違い
  assert.equal(submitAnswer(room, "a", 0, c, 1000).error, "answered");
  room = submitAnswer(room, "b", 0, c, 1500).room;
  const r = questionResult(room, 0);
  assert.equal(r.winner, "b");
  assert.equal(r.results.a.ok, false);
  // 2人とも正解なら、押すまでの時間が短いほうが勝ち（届いた順ではない）
  let room2 = playing();
  const c2 = correctOf(room2, 0);
  room2 = submitAnswer(room2, "a", 0, c2, 2100).room;
  room2 = submitAnswer(room2, "b", 0, c2, 1800).room;
  assert.equal(questionResult(room2, 0).winner, "b");
});

test("締め切り: 5秒・全員が答えた・誰かの正解から少したったとき。解説のあと次の問題、最後は終わり", () => {
  let room = playing(2);
  assert.equal(canReveal(room, 0, 1000), false);
  assert.equal(canReveal(room, 0, TIME_MS), true, "5秒で答えに移る");
  const c = correctOf(room, 0);
  room = submitAnswer(room, "a", 0, c, 800).room;
  assert.equal(canReveal(room, 0, 1000, 100), false, "正解のすぐあとは少し待つ");
  assert.equal(canReveal(room, 0, 1600, GRACE_MS), true);
  room = submitAnswer(room, "b", 0, (c + 1) % 4, 1200).room;
  assert.equal(canReveal(room, 0, 1300), true, "全員答えたらすぐ");
  room = reveal(room, 0).room;
  assert.equal(room.phase, "reveal");
  assert.equal(submitAnswer(room, "b", 0, c, 100).error, "closed", "解説中は答えられない");
  assert.equal(reveal(room, 0).room, room, "二重に進まない");
  room = nextQuestion(room, 0).room;
  assert.deepEqual([room.q, room.phase], [1, "question"]);
  assert.equal(nextQuestion(room, 0).room, room, "古い問題からは進めない");
  room = nextQuestion(reveal(room, 1).room, 1).room;
  assert.equal(room.status, "done");
  const [first, second] = standings(room);
  assert.deepEqual([first.uid, first.points, first.correct], ["a", 1, 1]);
  assert.equal(second.points, 0);
});

test("1人モード: 答えるとすぐ解説へ（待たない）。得点は正解数", () => {
  let room = startRoom(newRoom({ code: "solo", uid: "me", name: "Me", solo: true }), makeQuestions(items, items, 2)).room;
  assert.equal(room.status, "playing");
  room = submitAnswer(room, "me", 0, correctOf(room, 0), 700).room;
  assert.equal(canReveal(room, 0, 800), true);
  room = nextQuestion(reveal(room, 0).room, 0).room;
  assert.equal(canReveal(room, 1, 4000), false);
  assert.equal(standings(room)[0].correct, 1);
});

test("もう一度遊ぶと round が増え、答えはリセット。古い部屋・終わった部屋は作り直せる", () => {
  let room = playing(1);
  room = submitAnswer(room, "a", 0, 0, 500).room;
  room = nextQuestion(reveal(room, 0).room, 0).room;
  const again = startRoom({ ...room, status: "lobby" }, makeQuestions(items, items, 1)).room;
  assert.equal(again.round, room.round + 1);
  assert.deepEqual(again.answers, {});
  assert.equal(isStale(room, 10), true);
  assert.equal(isStale(again, 10), false);
  assert.equal(isStale(again, 3 * 60 * 60 * 1000), true);
  assert.equal(isStale(null, 0), true);
});
