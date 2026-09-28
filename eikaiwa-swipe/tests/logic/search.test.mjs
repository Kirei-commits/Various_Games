import { test } from "node:test";
import assert from "node:assert/strict";
import rawChapters from "../../src/data/index.js";
import { buildLibrary, fuzzySearch, typoDistance } from "../../src/logic.js";

const items = Object.values(buildLibrary(rawChapters).byId);
const top = (q) => fuzzySearch(items, q, { limit: 5 }).map((p) => p.english);

test("入れ替わりも1文字の間違いとして数える", () => {
  assert.equal(typoDistance("maek", "make"), 1);
  assert.equal(typoDistance("raning", "raining"), 1);
});

test("英語の綴り間違いでも、近いフレーズが見つかる", () => {
  assert.ok(top("raning cats").includes("It's raining cats and dogs."), top("raning cats").join(" / "));
  assert.ok(top("figur out").includes("figure out"));
  assert.ok(top("maek sense").includes("make sense"));
});

test("日本語の言い回しが少し違っても見つかる", () => {
  assert.ok(top("気にしなくていい").some((e) => /Don't worry about it|No worries/.test(e)), top("気にしなくていい").join(" / "));
  assert.ok(top("ありがとうございます").some((e) => /Thanks a lot|Thank/.test(e)), top("ありがとうございます").join(" / "));
});

test("すでに結果に出ているものと、関係ないものは出さない", () => {
  const ex = new Set(["make-sense"]);
  assert.ok(!fuzzySearch(items, "maek sense", { exclude: ex }).some((p) => p.id === "make-sense"));
  assert.deepEqual(top("x"), []);
  assert.deepEqual(top("zzzzqqq"), []);
});
