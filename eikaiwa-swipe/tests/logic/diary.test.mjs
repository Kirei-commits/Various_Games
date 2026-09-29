import { test } from "node:test";
import assert from "node:assert/strict";
import raw from "../../src/data/index.js";
import { buildLibrary, freshState, restoreState, mergeStates, toggleFavorite, STATE_VERSION } from "../../src/logic.js";
import { saveDiary, usedWords } from "../../src/diary.js";

const lib = buildLibrary(raw);
const cards = { adventure: { id: "adventure" }, breakfast: { id: "breakfast" }, park: { id: "park" } };

test("日記: 使った集めた単語を拾う（大文字小文字・重複は気にしない）", () => {
  assert.deepEqual(usedWords("Breakfast in the PARK. Another breakfast.", cards), ["breakfast", "park"]);
  assert.deepEqual(usedWords("", cards), []);
});

test("日記の保存: 同じ日は上書きされる。採点はしない", () => {
  let s = saveDiary(freshState(), "2026-10-01", "Hello.", [], 1);
  s = saveDiary(s, "2026-10-01", "Hello world.", ["park"], 2);
  assert.deepEqual(s.diary["2026-10-01"], { text: "Hello world.", at: 2, words: ["park"] });
  assert.equal(s.gacha.points, 0);
});

test("保存データ v5: お気に入りと日記は復元され、端末をまたいでも失わない", () => {
  assert.equal(STATE_VERSION, 8);
  let a = toggleFavorite(freshState(), "hows-it-going");
  a = saveDiary(a, "2026-10-01", "A day.", [], 5);
  assert.deepEqual(toggleFavorite(a, "hows-it-going").favorites, {});
  const b = saveDiary(toggleFavorite(freshState(), "park"), "2026-10-01", "Newer day.", [], 9);
  const m = mergeStates(a, b, lib);
  assert.deepEqual(Object.keys(m.favorites).sort(), ["hows-it-going", "park"]);
  assert.equal(m.diary["2026-10-01"].text, "Newer day.");
  const old = restoreState({ version: 4, learned: {} }, lib);
  assert.deepEqual([old.favorites, old.diary], [{}, {}]);
  assert.equal(restoreState(JSON.parse(JSON.stringify(a)), lib).diary["2026-10-01"].text, "A day.");
  // 以前の採点の値が入ったデータも読める
  const legacy = { version: 5, learned: {}, diary: { "2026-09-01": { text: "Old.", score: 80, points: 2400, at: 1, words: [] } } };
  assert.equal(restoreState(legacy, lib).diary["2026-09-01"].score, 80);
});
