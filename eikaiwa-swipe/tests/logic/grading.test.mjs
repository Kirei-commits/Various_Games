import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeAnswer, gradeEnglish, englishHint, testKey, normalizeJa, answerCandidates, isCorrect, makeChoices, mulberry32, buildQuiz } from "../../src/logic.js";

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

test("言葉遣いの違い（助詞・です／ます・終助詞・〜ている）は正解かほぼ正解", () => {
  const ok = (input, ja) => assert.ok(isCorrect(verdict(input, ja)), `${input} → ${ja}: ${verdict(input, ja)}`);
  assert.equal(verdict("調子はどう？", "調子どう？"), "correct");
  assert.equal(verdict("大丈夫", "気にしないで／大丈夫だよ"), "correct");
  ok("筋が通ってる", "意味が通じる／筋が通る");
  ok("ありがとうございます", "本当にありがとう");
  ok("楽しみにしてます", "楽しみにしている");
  ok("心配しないで", "気にしないで");
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

test("英語の答え: 大文字小文字・記号・短縮形の違いは正解", () => {
  const v = (input, en) => gradeEnglish(input, en).verdict;
  assert.equal(v("make sense", "make sense"), "correct");
  assert.equal(v("I am down", "I'm down."), "correct");
  assert.equal(v("its up to you", "It's up to you."), "correct");
  assert.equal(v("I do not think so", "I don't think so."), "correct");
  assert.equal(v("What are you going to do", "What are you gonna do?"), "correct");
  assert.equal(v("YOU KNOW WHAT", "You know what?"), "correct");
});

test("英語の答え: someone や my は実際の語に置き換えても正解", () => {
  const v = (input, en) => gradeEnglish(input, en).verdict;
  assert.equal(v("give me a ride", "give someone a ride"), "correct");
  assert.equal(v("give my mom a ride", "give someone a ride"), "correct");
  assert.equal(v("brush your teeth", "brush my teeth"), "correct");
  assert.equal(v("pull my leg", "pull someone's leg"), "correct");
});

test("英語の答え: 小さなスペルミスは「ほぼ正解」、違う表現は不正解", () => {
  const v = (input, en) => gradeEnglish(input, en).verdict;
  assert.equal(v("figure otu", "figure out"), "close");
  assert.equal(v("awkard", "awkward"), "close");
  assert.equal(v("give up", "figure out"), "wrong");
  assert.equal(v("", "figure out"), "empty");
  assert.equal(v("in", "on"), "wrong");
});

test("ヒントは各単語の頭文字だけを見せる", () => {
  assert.equal(englishHint("Make sense."), "M___ s____.");
  assert.equal(englishHint("I'm down."), "I'_ d___.");
});

test("記録のキーは向きで分ける（英→日は従来のまま）", () => {
  assert.equal(testKey("ch01", "en-ja"), "ch01");
  assert.equal(testKey("ch01", "ja-en"), "ch01@ja-en");
});

test("出題は指定数まで・重複なし・範囲より多くは出さない", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}` }));
  const quiz = buildQuiz(items, 10, mulberry32(7));
  assert.equal(quiz.length, 10);
  assert.equal(new Set(quiz.map((q) => q.id)).size, 10);
  assert.equal(buildQuiz(items.slice(0, 3), 10, mulberry32(7)).length, 3);
});

test("全問、正解そのものを答えれば両方向とも正解になる", async () => {
  const { default: raw } = await import("../../src/data/index.js");
  const { buildLibrary } = await import("../../src/logic.js");
  const bad = [];
  for (const p of Object.values(buildLibrary(raw).byId)) {
    if (gradeEnglish(p.english, p.english).verdict !== "correct") bad.push(`英: ${p.english}`);
    if (gradeAnswer(p.japanese.split("／")[0], p.japanese).verdict !== "correct") bad.push(`日: ${p.japanese}`);
  }
  assert.deepEqual(bad, []);
});
