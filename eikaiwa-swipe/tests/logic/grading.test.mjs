import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeAnswer, normalizeJa, answerCandidates, isCorrect, makeChoices, mulberry32, buildQuiz } from "../../src/logic.js";

const verdict = (input, ja) => gradeAnswer(input, ja).verdict;

test("表記ゆれを吸収する（全角半角・カタカナ・記号・空白）", () => {
  assert.equal(normalizeJa("コツ を つかむ！"), "こつをつかむ");
  assert.equal(normalizeJa("ＯＫ　です。"), "okです");
});

test("別解（／区切り）と括弧の有無をすべて正解候補にする", () => {
  assert.deepEqual(answerCandidates("（考えて）理解する／解決する"), ["考えて理解する", "理解する", "解決する"]);
});

test("完全一致・別解・括弧を省いた答えは正解", () => {
  assert.equal(verdict("意味が通じる", "意味が通じる／筋が通る"), "correct");
  assert.equal(verdict("筋が通る", "意味が通じる／筋が通る"), "correct");
  assert.equal(verdict("理解する", "（考えて）理解する／解決する"), "correct");
  assert.equal(verdict("コツをつかむ", "コツをつかむ"), "correct");
  assert.equal(verdict("こつをつかむ", "コツをつかむ"), "correct");
});

test("正解の主要部分だけ、または言い足した答えも正解", () => {
  assert.equal(verdict("久しぶり", "久しぶり！"), "correct");
  assert.equal(verdict("コツをつかむこと", "コツをつかむ"), "correct");
});

test("少しの言い回しの違いは「ほぼ正解」で、正解として数える", () => {
  const v = verdict("意味が通る", "意味が通じる／筋が通る");
  assert.equal(v, "close");
  assert.ok(isCorrect(v));
});

test("短すぎる部分一致や無関係な答えは不正解", () => {
  assert.equal(verdict("る", "意味が通じる"), "wrong");
  assert.equal(verdict("おなかがすいた", "意味が通じる／筋が通る"), "wrong");
  assert.equal(verdict("  ", "意味が通じる"), "empty");
  assert.equal(isCorrect("wrong"), false);
  assert.equal(isCorrect("empty"), false);
});

test("4択は正解1つ＋同じ範囲の誤答3つで、重複しない", () => {
  const pool = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, japanese: `訳${id}` }));
  const choices = makeChoices(pool[0], pool, mulberry32(1));
  assert.equal(choices.length, 4);
  assert.equal(new Set(choices.map((c) => c.id)).size, 4);
  assert.ok(choices.some((c) => c.id === "a"));
});

test("出題は指定数まで・重複なし・範囲より多くは出さない", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}` }));
  const quiz = buildQuiz(items, 10, mulberry32(7));
  assert.equal(quiz.length, 10);
  assert.equal(new Set(quiz.map((q) => q.id)).size, 10);
  assert.equal(buildQuiz(items.slice(0, 3), 10, mulberry32(7)).length, 3);
});
