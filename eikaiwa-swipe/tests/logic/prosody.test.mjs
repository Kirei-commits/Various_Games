import { test } from "node:test";
import assert from "node:assert/strict";
import { prosodyPlan, splitSentences } from "../../src/logic.js";

test("文ごとに区切る", () => {
  assert.deepEqual(splitSentences("Really? Never. Wow!"), ["Really?", "Never.", "Wow!"]);
  assert.deepEqual(splitSentences("make sense"), ["make sense"]);
  assert.deepEqual(splitSentences('I called my teacher "Mom." Oops!'), ['I called my teacher "Mom."', "Oops!"]);
});

test("Yes/No疑問文は語尾を上げ、WH疑問文は控えめ、感嘆文は明るく", () => {
  const [yn] = prosodyPlan("Are you free tomorrow?");
  const [wh] = prosodyPlan("Where are you from?");
  const [ex] = prosodyPlan("No way!", { rate: 1 });
  const [flat] = prosodyPlan("I see.");
  assert.ok(yn.pitch > wh.pitch && wh.pitch > flat.pitch);
  assert.ok(ex.pitch > flat.pitch);
  assert.ok(ex.rate > 1);
});

test("B役は少し高く、値は Web Speech API の範囲内", () => {
  const [a] = prosodyPlan("Hello.", { role: "A" });
  const [b] = prosodyPlan("Hello.", { role: "B" });
  assert.ok(b.pitch > a.pitch);
  for (const c of prosodyPlan("What?! Really?! Amazing!!!", { rate: 1.9, role: "B" })) {
    assert.ok(c.pitch >= 0.5 && c.pitch <= 2);
    assert.ok(c.rate >= 0.5 && c.rate <= 2);
  }
});

test("抑揚オフのときは1回で読み上げる", () => {
  const plan = prosodyPlan("Really? That's great!", { expressive: false, rate: 0.9 });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].pitch, 1);
  assert.equal(plan[0].rate, 0.9);
});
