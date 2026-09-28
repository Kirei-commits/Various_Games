/**
 * 録音する文の一覧を JSON で出す（tools/media/tts.py から呼ぶ。API は呼ばない）。
 * アプリと同じ関数（buildLibrary / parseDialogue / clipKey / clipHash）を使うので、アプリが読み上げる文と必ず一致する。
 *
 *   node tools/media/tts-lines.mjs ch01 ch02   → 指定した章
 *   node tools/media/tts-lines.mjs all         → 全章
 *
 * 出力: [{ hash, key, role, text, chapter, id, context }]（同じ「役|英文」は最初の1回だけ）
 * context は会話の直前の行（抑揚を自然にするため、生成時にヒントとして渡す。読み上げはしない）
 */
import rawChapters from "../../src/data/index.js";
import { buildLibrary, parseDialogue } from "../../src/logic.js";
import { clipHash, clipKey, clipRole } from "../../src/recorded.js";

const want = process.argv.slice(2);
if (!want.length) {
  console.error("章を指定してください（例: ch01、all）");
  process.exit(1);
}
const lib = buildLibrary(rawChapters);
const chapters = want.includes("all") ? lib.chapters : lib.chapters.filter((c) => want.includes(c.id));
const missing = want.filter((w) => w !== "all" && !lib.chapters.some((c) => c.id === w));
if (missing.length) {
  console.error(`知らない章です: ${missing.join(", ")}`);
  process.exit(1);
}

const out = [];
const seen = new Set();
const add = (role, text, chapter, id, context) => {
  const key = clipKey(role, text);
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ hash: clipHash(key), key, role: clipRole(role), text: text.trim(), chapter, id, context });
};
for (const ch of chapters) {
  for (const item of ch.items) {
    add(null, item.english, ch.id, item.id, "");
    const lines = parseDialogue(item.exampleContext);
    lines.forEach((l, i) => add(l.speaker, l.text, ch.id, item.id, i > 0 ? lines[i - 1].text : ""));
  }
}
process.stdout.write(JSON.stringify(out));
