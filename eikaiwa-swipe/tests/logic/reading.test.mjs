import { test } from "node:test";
import assert from "node:assert/strict";
import raw from "../../src/data/index.js";
import { buildLibrary, parseDialogue } from "../../src/logic.js";
import { kanaOf, readingGroups, keyOf, phonesOf } from "../../src/reading.js";
import { buildLookup, lookupWord } from "../../src/lookup.js";

const lib = buildLibrary(raw);
const items = Object.values(lib.byId);

test("読み方: 1語ずつのカタカナ（アメリカ英語寄りの、おおよその読み）", () => {
  const cases = {
    table: "テイブル",
    water: "ウォーター",
    get: "ゲット",
    dog: "ドッグ",
    apple: "アップル",
    thank: "サンク",
    twenty: "トゥエンティー",
    here: "ヒア",
    cute: "キュート",
    going: "ゴーイング",
    car: "カー",
  };
  for (const [w, kana] of Object.entries(cases)) assert.equal(kanaOf(w), kana, w);
  assert.equal(kanaOf("Water,"), "ウォーター", "句読点・大文字はそのまま引ける");
  assert.equal(kanaOf("zzqq"), null, "辞書にない語は null");
  assert.equal(keyOf("“Don’t"), "don't");
});

test("リンキングの読み方: つながる語をまとめて、音の変化を入れて読む", () => {
  const read = (s) => readingGroups(s, true).filter((g) => g.linked).map((g) => g.kana);
  assert.deepEqual(read("Tell him."), ["テリム"]); // h が消える
  assert.deepEqual(read("Check it out!"), ["チェキラウッ"]); // つながる音・やわらかい t
  assert.deepEqual(read("I want to go."), ["ワナ"]); // 決まった言い方
  assert.deepEqual(read("I got a lot of water."), ["ガララーラ", "ウォーラー"]);
  assert.deepEqual(read("Could you pick it up?"), ["クッジャ", "ピキラップ"]);
  // リンキングの読みでないときは1語ずつ
  const plain = readingGroups("Tell him.", false);
  assert.deepEqual(plain.map((g) => [g.from, g.to, g.kana]), [[0, 0, "テル"], [1, 1, "ヒム"]]);
});

test("発音データ: 教材の見出しと例文の単語のほとんど（数字などを除く）に読み方がある", () => {
  let total = 0;
  let found = 0;
  for (const p of items) {
    for (const t of [p.english, ...parseDialogue(p.exampleContext).map((l) => l.text)].join(" ").split(/\s+/)) {
      const k = keyOf(t);
      if (!k || /\d/.test(k)) continue;
      total += 1;
      if (phonesOf(k)) found += 1;
    }
  }
  assert.ok(found / total > 0.97, `${found} / ${total}`);
});

test("単語の意味: 変化した形は元の形で引き、基本の語・短縮形も引ける。例文の単語のほとんどが引ける", () => {
  const index = buildLookup(items);
  assert.equal(lookupWord("went", index).base, "go");
  assert.equal(lookupWord("tables.", index).base, "table");
  assert.equal(lookupWord("getting", index).base, "get");
  assert.equal(lookupWord("studied", index).base, "study");
  assert.equal(lookupWord("happier", index).base, "happy");
  assert.equal(lookupWord("The", index).japanese.includes("その"), true);
  assert.equal(lookupWord("don't", index).base, "don't");
  assert.equal(lookupWord("go", index).id, "go");
  assert.equal(lookupWord("zzqq", index), null);
  let total = 0;
  let ok = 0;
  for (const p of items)
    for (const l of parseDialogue(p.exampleContext))
      for (const t of l.text.split(/\s+/)) {
        const k = keyOf(t);
        if (!k || /^\d/.test(k)) continue;
        total += 1;
        if (lookupWord(t, index)) ok += 1;
      }
  assert.ok(ok / total > 0.95, `${ok} / ${total}`);
});
