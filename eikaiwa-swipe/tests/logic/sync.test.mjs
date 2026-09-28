import { test } from "node:test";
import assert from "node:assert/strict";
import rawChapters from "../../src/data/index.js";
import { buildLibrary, freshState, applySwipe, applyTestResult, mergeStates, resolveLogin, toggleLearned } from "../../src/logic.js";

const lib = buildLibrary(rawChapters);
const ch1 = lib.chapters[0];
const [a, b, c] = ch1.items.map((p) => p.id);

function progress(ids, day = "2026-09-28") {
  let s = freshState();
  for (const id of ids) s = applySwipe(s, ch1, id, "right", day, "2026-09-27");
  return s;
}

test("統合: 覚えたは和集合、回数と最高点は大きい方", () => {
  let local = progress([a]);
  let remote = progress([b, c]);
  local = applyTestResult(local, lib, "ch01", [{ id: a, correct: true }], "2026-09-28", "2026-09-27");
  remote = applyTestResult(remote, lib, "ch01", [{ id: b, correct: false }, { id: c, correct: true }], "2026-09-28", "2026-09-27");
  const m = mergeStates(local, remote, lib);
  assert.deepEqual(Object.keys(m.learned).sort(), [a, c].sort()); // b はテストで間違えて未習得に戻っている
  assert.equal(m.tests.ch01.best, 100);
  assert.equal(m.tests.ch01.count, 1);
  assert.equal(m.stats.totalSwipes, 2);
  assert.equal(m.misses[b], 1);
});

test("ログイン: クラウドに記録がなければ端末の進捗をアップロード", () => {
  const local = { state: progress([a]), owner: null, updatedAt: 1 };
  const r = resolveLogin(local, null, "u1", lib);
  assert.equal(r.upload, true);
  assert.equal(r.state.learned[a], true);
});

test("ログイン: ログイン前の進捗はアカウントの進捗と統合", () => {
  const local = { state: progress([a]), owner: null, updatedAt: 5 };
  const remote = { state: progress([b]), updatedAt: 9 };
  const r = resolveLogin(local, remote, "u1", lib);
  assert.equal(r.upload, true);
  assert.ok(r.state.learned[a] && r.state.learned[b]);
});

test("ログイン: 端末に進捗がなければアカウントの進捗をそのまま使う", () => {
  const local = { state: freshState(), owner: null, updatedAt: 0 };
  const remote = { state: progress([b]), updatedAt: 9 };
  const r = resolveLogin(local, remote, "u1", lib);
  assert.equal(r.upload, false);
  assert.deepEqual(Object.keys(r.state.learned), [b]);
});

test("ログイン: 同じアカウントなら新しい方を採用（取り消した「覚えた」が復活しない）", () => {
  const remote = { state: progress([a, b]), updatedAt: 10 };
  const newerLocal = { state: toggleLearned(progress([a, b]), ch1, b), owner: "u1", updatedAt: 20 };
  const r1 = resolveLogin(newerLocal, remote, "u1", lib);
  assert.equal(r1.upload, true);
  assert.equal(r1.state.learned[b], undefined);

  const olderLocal = { ...newerLocal, updatedAt: 5 };
  const r2 = resolveLogin(olderLocal, remote, "u1", lib);
  assert.equal(r2.upload, false);
  assert.equal(r2.state.learned[b], true);
});

test("ログイン: 別アカウントの端末データは混ぜない", () => {
  const local = { state: progress([a]), owner: "someone-else", updatedAt: 99 };
  assert.deepEqual(resolveLogin(local, { state: progress([b]), updatedAt: 1 }, "u1", lib).state.learned, { [b]: true });
  const r = resolveLogin(local, null, "u1", lib);
  assert.deepEqual(r.state.learned, {});
  assert.equal(r.upload, true);
});
