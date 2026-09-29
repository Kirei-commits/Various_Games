import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCheer } from "../../src/cheers.js";

const events = {
  correct: { chance: 0.5, clips: [{ text: "Nice!" }, { text: "Great!" }, { text: "Perfect!" }] },
  streak: { chance: 1, clips: [{ text: "You're on fire!" }] },
  complete: { chance: 1, clips: [{ text: "You did it!" }] },
};
const seq = (...xs) => () => xs.shift();

test("chance より大きい乱数なら流さない", () => {
  assert.equal(pickCheer(events, "correct", { rand: seq(0.6) }), null);
  assert.equal(pickCheer(events, "correct", { rand: seq(0.2, 0) })?.text, "Nice!");
});

test("前と同じ文は続けて選ばない", () => {
  for (let r = 0; r < 1; r += 0.1) {
    assert.notEqual(pickCheer(events, "correct", { last: "Nice!", rand: seq(0, r) })?.text, "Nice!");
  }
  // 1つしかないときは同じでも流す
  assert.equal(pickCheer(events, "complete", { last: "You did it!", rand: seq(0, 0) })?.text, "You did it!");
});

test("連続正解は5回ごとだけ", () => {
  assert.equal(pickCheer(events, "streak", { n: 3, rand: seq(0, 0) }), null);
  assert.equal(pickCheer(events, "streak", { n: 5, rand: seq(0, 0) })?.text, "You're on fire!");
  assert.equal(pickCheer(events, "streak", { n: 7, rand: seq(0, 0) }), null);
});

test("知らない場面・声が無い場面では何もしない", () => {
  assert.equal(pickCheer(events, "explode", { rand: seq(0, 0) }), null);
  assert.equal(pickCheer(null, "correct", { rand: seq(0, 0) }), null);
});
