import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeLinking, linkedString, innerChanges } from "../../src/linking.js";

const kinds = (text) => analyzeLinking(text).notes.map((n) => n.kind);

test("子音で終わる語と母音で始まる語をつなぐ", () => {
  assert.equal(linkedString("Come on in!"), "Come‿on‿in!");
  assert.ok(kinds("Come on in!").includes("link"));
});

test("句読点のあとはつなげない", () => {
  assert.equal(linkedString("Yes, I am."), "Yes, I‿am.");
});

test("決まった言い方は短くなる音（wanna など）を示す", () => {
  const { notes } = analyzeLinking("I want to go home.");
  assert.equal(notes[0].kind, "reduction");
  assert.match(notes[0].sound, /wanna/);
  assert.equal(linkedString("I want to go home."), "I want‿to go home.");
  // アポストロフィがなくても同じ
  assert.match(analyzeLinking("I dont know.").notes[0].sound, /dunno/);
});

test("going to は「〜するつもり」のときだけ gonna にする", () => {
  assert.ok(analyzeLinking("I'm going to eat.").notes.some((n) => /gonna/.test(n.sound)));
  assert.ok(!analyzeLinking("I'm going to the store.").notes.some((n) => /gonna/.test(n.sound)));
});

test("t / d ＋ you は混ざる", () => {
  assert.deepEqual(kinds("Nice to meet you."), ["blend"]);
});

test("母音にはさまれた t はやわらかくなる（語の中・語と語の間）", () => {
  assert.deepEqual(innerChanges("water"), ["flap"]);
  assert.deepEqual(innerChanges("city"), ["flap"]);
  assert.deepEqual(innerChanges("sister"), []);
  assert.deepEqual(innerChanges("twenty"), ["nt"]);
  assert.ok(kinds("Get it?").includes("flap"));
});

test("同じ子音が続くとき、文中の h が消えるとき、語末の t が止まるとき", () => {
  assert.ok(kinds("It was a bad day.").includes("same"));
  assert.ok(kinds("Tell him I said hi.").includes("hdrop"));
  assert.ok(kinds("Right now.").includes("stop"));
});

test("1語だけ・空文字でも壊れない", () => {
  assert.deepEqual(analyzeLinking("").tokens, []);
  assert.equal(linkedString("hello"), "hello");
});

test("全問の英語と例文を分析できる（例外を投げない）", async () => {
  const { default: raw } = await import("../../src/data/index.js");
  const { buildLibrary, parseDialogue } = await import("../../src/logic.js");
  let linked = 0;
  for (const p of Object.values(buildLibrary(raw).byId)) {
    for (const t of [p.english, ...parseDialogue(p.exampleContext).map((l) => l.text)]) {
      const r = analyzeLinking(t);
      if (r.tokens.some((x) => x.link)) linked++;
    }
  }
  assert.ok(linked > 1000);
});

test("th で始まる語は、t で終わる語と「同じ子音」にしない", () => {
  assert.ok(!kinds("You got this.").includes("same"));
  assert.ok(kinds("You got this.").includes("stop"));
});
