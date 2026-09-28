import { test } from "node:test";
import assert from "node:assert/strict";
import raw from "../../src/data/index.js";
import { buildLibrary, freshState, restoreState, mergeStates, toggleFavorite, STATE_VERSION } from "../../src/logic.js";
import { buildVocab, scoreDiary, saveDiary, diaryComment, DIARY_POINTS_PER_SCORE } from "../../src/diary.js";

const lib = buildLibrary(raw);
const vocab = buildVocab(lib);
const cards = { adventure: { id: "adventure", rarity: "R" }, breakfast: { id: "breakfast", rarity: "SSR" }, park: { id: "park", rarity: "N" } };

test("日記の採点: よく書けた日記は高く、集めた単語を使うほど点が上がる", () => {
  const good =
    "Today I had breakfast with my family. Then we went to the park and it was a real adventure. " +
    "I played soccer with my friends for two hours. I was tired but very happy. Tomorrow I want to read a new book.";
  const r = scoreDiary(good, { vocab, cards });
  assert.ok(r.score >= 85, `${r.score} ${JSON.stringify(r)}`);
  assert.deepEqual(r.used.map((c) => c.id).sort(), ["adventure", "breakfast", "park"]);
  assert.equal(r.parts.collected, 24); // N・R で1語ずつ、SSR は2語分 → 4語 × 6
  assert.deepEqual(r.unknown, []);
  const without = scoreDiary(good, { vocab, cards: {} });
  assert.ok(without.score < r.score);
});

test("日記の採点: 大文字・文末・i・a/an・同じ語の連続・つづりを指摘する", () => {
  const r = scoreDiary("i ate a apple at the the park. it was delisious", { vocab, cards });
  const all = r.issues.join("\n");
  assert.match(all, /大文字/);
  assert.match(all, /文の終わり/);
  assert.match(all, /大文字の I/);
  assert.match(all, /an apple/);
  assert.match(all, /the the/);
  assert.deepEqual(r.unknown, ["delisious"]);
  assert.ok(r.parts.mechanics < 25);
  assert.equal(scoreDiary("", { vocab }).score, 0);
  assert.equal(scoreDiary("An hour ago I saw a university.", { vocab }).parts.mechanics, 25); // an hour / a university は正しい
});

test("変化した形（played, running, cities）は知っている語として扱う", () => {
  assert.deepEqual(scoreDiary("We stopped running in the cities.", { vocab }).unknown, []);
});

test("日記の保存: 同じ日は上書き。ポイントはその日の最高点が上がった分だけ", () => {
  let s = freshState();
  const r1 = saveDiary(s, "2026-10-01", "Hello.", { score: 40, used: [] }, 1);
  assert.equal(r1.points, 40 * DIARY_POINTS_PER_SCORE);
  const r2 = saveDiary(r1.state, "2026-10-01", "Hello!", { score: 30, used: [] }, 2);
  assert.equal(r2.points, 0);
  const r3 = saveDiary(r2.state, "2026-10-01", "Hello world.", { score: 70, used: [] }, 3);
  assert.equal(r3.points, 30 * DIARY_POINTS_PER_SCORE);
  assert.equal(r3.state.diary["2026-10-01"].text, "Hello world.");
  assert.ok(diaryComment(95).length > 0);
});

test("保存データ v5: お気に入りと日記は復元され、端末をまたいでも失わない", () => {
  assert.equal(STATE_VERSION, 5);
  let a = toggleFavorite(freshState(), "hows-it-going");
  a = saveDiary(a, "2026-10-01", "A day.", { score: 10, used: [] }, 5).state;
  assert.deepEqual(toggleFavorite(a, "hows-it-going").favorites, {});
  const b = saveDiary(toggleFavorite(freshState(), "park"), "2026-10-01", "Newer day.", { score: 50, used: [] }, 9).state;
  const m = mergeStates(a, b, lib);
  assert.deepEqual(Object.keys(m.favorites).sort(), ["hows-it-going", "park"]);
  assert.equal(m.diary["2026-10-01"].text, "Newer day.");
  const old = restoreState({ version: 4, learned: {} }, lib);
  assert.deepEqual([old.favorites, old.diary], [{}, {}]);
  assert.equal(restoreState(JSON.parse(JSON.stringify(a)), lib).diary["2026-10-01"].text, "A day.");
});
