import { test } from "node:test";
import assert from "node:assert/strict";
import { shadowSteps, pauseMs, wordMatch, recordActivity, initialStats } from "../../src/logic.js";

const item = {
  english: "make sense",
  japanese: "意味が通じる",
  exampleContext: "A: So we take a cab?\nB: Yeah, that makes sense.",
  exampleJapanese: "A: タクシーね？\nB: うん、それがいいね。",
};

test("手順は見出し → 会話の各行（話者と訳つき）", () => {
  assert.deepEqual(shadowSteps(item), [
    { text: "make sense", role: null, ja: "意味が通じる" },
    { text: "So we take a cab?", role: "A", ja: "タクシーね？" },
    { text: "Yeah, that makes sense.", role: "B", ja: "うん、それがいいね。" },
  ]);
});

test("「あなたの番」は長い文ほど長く、ゆっくり再生や倍率でも長くなる", () => {
  const short = pauseMs("Got it.", 1, 1);
  const long = pauseMs("Let's grab coffee and catch up sometime next week.", 1, 1);
  assert.ok(short >= 1200);
  assert.ok(long > short);
  assert.ok(pauseMs("Let's grab coffee.", 0.7, 1) > pauseMs("Let's grab coffee.", 1, 1));
  assert.ok(pauseMs("Let's grab coffee.", 1, 2) > pauseMs("Let's grab coffee.", 1, 1));
});

test("発音チェック: 聞き取れた単語に印をつけ、割合を出す", () => {
  const r = wordMatch("yeah that make sense", "Yeah, that makes sense.");
  assert.deepEqual(r.words.map((w) => w.ok), [true, true, false, true]);
  assert.equal(r.ratio, 0.75);
  // 短縮形は展開して比べる
  assert.equal(wordMatch("I am down", "I'm down.").ratio, 1);
  assert.equal(wordMatch("", "Got it.").ratio, 0);
});

test("シャドーイングも学習数と連続日数に数える", () => {
  const s = recordActivity(initialStats(), "2026-09-28", "2026-09-27", { shadows: 1 });
  assert.equal(s.totalShadows, 1);
  assert.equal(s.todayCount, 1);
  assert.equal(s.streak, 1);
});
