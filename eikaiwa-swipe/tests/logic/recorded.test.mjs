import { test } from "node:test";
import assert from "node:assert/strict";
import { clipHash, clipKey, clipRole, clipUrl } from "../../src/recorded.js";

test("録音の役: 見出しは P、会話の B 役は B、それ以外の話者は A", () => {
  assert.equal(clipRole(null), "P");
  assert.equal(clipRole("A"), "A");
  assert.equal(clipRole("B"), "B");
  assert.equal(clipRole("C"), "A");
  assert.equal(clipKey(null, "  Nice to meet you. "), "P|Nice to meet you.");
});

test("ハッシュは固定の値になる（audio/ の録音のファイル名なので変えてはいけない）", () => {
  // 値が変わると、作った録音がすべて見つからなくなる
  assert.equal(clipHash("P|Nice to meet you."), "0380c768e40804");
  assert.equal(clipHash("A|Hey, how's it going?"), "00a10b41c526ea");
  assert.equal(clipHash("B|Café — naïve “quote”"), "0cedaae451bffe");
  assert.match(clipHash(""), /^[0-9a-f]{14}$/);
});

test("一覧にある録音だけ URL を返し、版をクエリに付ける", () => {
  const index = { [clipHash("A|Hey, how's it going?")]: 3 };
  assert.equal(clipUrl(index, "A", "Hey, how's it going?"), `audio/clips/${clipHash("A|Hey, how's it going?")}.opus?v=3`);
  assert.equal(clipUrl(index, "B", "Hey, how's it going?"), null); // 役が違えば別の録音
  assert.equal(clipUrl(null, "A", "Hey, how's it going?"), null);
});
