import { test } from "node:test";
import assert from "node:assert/strict";
import rawChapters from "../../src/data/index.js";
import {
  buildLibrary,
  restoreState,
  migrateState,
  isNewerVersion,
  resolveLogin,
  chapterQueue,
  freshState,
  STATE_VERSION,
  currentId,
} from "../../src/logic.js";
import { checkLock } from "../../tools/id-lock.mjs";

// アプリを改修しても学習記録が引き継がれることの検査

const lib = buildLibrary(rawChapters);
const ch1 = lib.chapters[0];

test("英語を書き換えた問題の記録は、変更履歴で新しいIDに付け替わる", () => {
  // 「make sense」を書き換えて ID が "make-sense-v2" になった、という想定の教材
  const edited = rawChapters.map((c) =>
    c.id === "ch13" ? { ...c, items: c.items.replace(/^make sense \|/m, "make sense v2 |") } : c
  );
  const renamedLib = buildLibrary(edited, { renamed: { "make-sense": "make-sense-v2" } });
  assert.equal(renamedLib.errors.length, 0);
  assert.ok(renamedLib.byId["make-sense-v2"] && !renamedLib.byId["make-sense"]);
  const saved = { version: 2, learned: { "make-sense": true }, misses: { "make-sense": 2 }, queues: {}, tests: {} };
  const s = restoreState(saved, renamedLib);
  assert.equal(s.learned["make-sense-v2"], true);
  assert.equal(s.misses["make-sense-v2"], 2);
});

test("変更履歴は連鎖してもたどれ、循環していても止まる", () => {
  assert.equal(currentId("a", { a: "b", b: "c" }), "c");
  assert.equal(typeof currentId("a", { a: "b", b: "a" }), "string");
});

test("今の教材にない問題の記録も捨てずに残す（数には入らない）", () => {
  const s = restoreState({ version: 2, learned: { "removed-phrase": true, [ch1.items[0].id]: true } }, lib);
  assert.equal(s.learned["removed-phrase"], true);
  assert.equal(chapterQueue(s, ch1).length, 49);
});

test("保存形式の移行は古い版から順番に適用される（v1 → 最新）", () => {
  const v1 = { statuses: { p01: "learned" }, stats: { totalSwipes: 3 } };
  const s = migrateState(v1);
  assert.equal(s.version, STATE_VERSION);
  assert.equal(s.learned["make-sense"], true);
});

test("新しい版で保存されたクラウドのデータは上書きしない", () => {
  const future = { state: { version: STATE_VERSION + 1, learned: { a: true } }, updatedAt: 9 };
  assert.equal(isNewerVersion(future.state), true);
  const r = resolveLogin({ state: freshState(), owner: "u1", updatedAt: 1 }, future, "u1", lib);
  assert.equal(r.newerRemote, true);
  assert.equal(r.upload, false);
});

test("lint: 公開済みIDが黙って消えたら止める。変更履歴か削除リストに書けば通る", () => {
  const lock = [...Object.keys(lib.byId), "old-phrase"];
  assert.equal(checkLock(lib, lock).length, 1);
  assert.deepEqual(checkLock(lib, lock, { retired: ["old-phrase"] }), []);
  assert.deepEqual(checkLock(lib, lock, { renamed: { "old-phrase": "make-sense" } }), []);
  // 行き先が存在しない変更履歴や、使用中のIDを付け替える履歴は止める
  assert.equal(checkLock(lib, lock, { renamed: { "old-phrase": "no-such-phrase" } }).length, 1);
  assert.equal(checkLock(lib, Object.keys(lib.byId), { renamed: { "make-sense": "awkward" } }).length, 1);
});
