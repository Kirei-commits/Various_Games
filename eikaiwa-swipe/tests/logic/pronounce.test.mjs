import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePronunciation, classify, commonIssues, verdictText } from "../../src/pronounce.js";

test("聞き取れた語・違った語と、何と聞こえたかを返す", () => {
  const r = analyzePronunciation("I sink so", "I think so.");
  assert.deepEqual(r.words.map((w) => [w.text, w.ok]), [["I", true], ["think", false], ["so.", true]]);
  assert.equal(r.words[1].heardAs, "sink");
  assert.equal(r.issues[0].kind, "th");
  assert.match(r.issues[0].tip, /舌先/);
});

test("つまずきの種類を推定する", () => {
  assert.equal(classify("think", "sink"), "th");
  assert.equal(classify("three", "tree"), "th");
  assert.equal(classify("right", "light"), "rl");
  assert.equal(classify("very", "berry"), "vb");
  assert.equal(classify("fold", "hold"), "fh");
  assert.equal(classify("want", "wan"), "final");
  assert.equal(classify("cap", "cup"), "vowel");
  assert.equal(classify("the", null), "weak");
  assert.equal(classify("umbrella", null), "missing");
  assert.equal(classify("coffee", "tea"), "other");
});

test("語が抜けたとき・余分な語があるときも対応づける", () => {
  const r = analyzePronunciation("give me ride", "Give me a ride.");
  assert.deepEqual(r.words.map((w) => w.ok), [true, true, false, true]);
  assert.equal(r.issues[0].kind, "weak");
  const extra = analyzePronunciation("oh I think so", "I think so.");
  assert.equal(extra.ratio, 1);
});

test("短縮形は展開して比べる", () => {
  assert.equal(analyzePronunciation("I am down", "I'm down.").ratio, 1);
});

test("講評と、よくあるつまずきの集計", () => {
  assert.match(verdictText(1), /完璧/);
  assert.match(verdictText(0.5), /お手本/);
  const log = [
    { issues: [{ kind: "th" }, { kind: "rl" }] },
    { issues: [{ kind: "th" }] },
  ];
  assert.deepEqual(commonIssues(log).map((x) => [x.kind, x.count]), [["th", 2], ["rl", 1]]);
});
