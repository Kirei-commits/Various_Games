/**
 * 依存パッケージなし（Node 標準のみ）で動く静的検査。CI では npm ci より前に走る。
 *  1. 教材データ: 40章 × 50問 = 2000問、形式・重複・会話例の対応、部の範囲
 *  2. 公開済みの問題IDが黙って消えていないか（学習記録の引き継ぎ。src/data/id-changes.js）
 *  3. index.html が src/ から再ビルドされた最新のものか
 */
import fs from "node:fs";
import path from "node:path";
import rawChapters, { PARTS, RENAMED, RETIRED } from "../src/data/index.js";
import { buildLibrary, parseDialogue, answerCandidates } from "../src/logic.js";
import { ROOT, sourceHash, HASH_MARKER } from "../tools/source-hash.mjs";
import { readLock, checkLock } from "../tools/id-lock.mjs";

const EXPECTED_CHAPTERS = 40;
const PER_CHAPTER = 50;
const problems = [];

const lib = buildLibrary(rawChapters, { renamed: RENAMED });
problems.push(...lib.errors);

if (lib.chapters.length !== EXPECTED_CHAPTERS) {
  problems.push(`章の数が ${lib.chapters.length} です（期待値 ${EXPECTED_CHAPTERS}）`);
}
const ids = new Set();
lib.chapters.forEach((ch, i) => {
  const expectedId = `ch${String(i + 1).padStart(2, "0")}`;
  if (ch.id !== expectedId) problems.push(`${i + 1}番目の章のIDが ${ch.id} です（期待値 ${expectedId}）`);
  if (ids.has(ch.id)) problems.push(`章IDが重複しています: ${ch.id}`);
  ids.add(ch.id);
  if (!ch.title) problems.push(`${ch.id}: タイトルがありません`);
  if (ch.items.length !== PER_CHAPTER) problems.push(`${ch.id}: ${ch.items.length}問です（期待値 ${PER_CHAPTER}）`);
  for (const item of ch.items) {
    const where = `${ch.id} "${item.english}"`;
    if (/[ぁ-んァ-ン一-龥]/.test(item.english)) problems.push(`${where}: 英語欄に日本語が入っています`);
    if (!/[ぁ-んァ-ン一-龥]/.test(item.japanese)) problems.push(`${where}: 日本語訳に日本語がありません`);
    if (answerCandidates(item.japanese).length === 0) problems.push(`${where}: 採点に使える正解候補がありません`);
    const lines = parseDialogue(item.exampleContext);
    if (lines.some((l) => !l.speaker)) problems.push(`${where}: 会話例の行に話者（A: / B:）がありません`);
    if (/[ぁ-んァ-ン一-龥]/.test(item.exampleContext)) problems.push(`${where}: 英語の会話例に日本語が入っています`);
    const ja = parseDialogue(item.exampleJapanese);
    lines.forEach((l, i) => {
      if (ja[i] && ja[i].speaker !== l.speaker) problems.push(`${where}: 会話例と訳で話者が食い違っています`);
    });
  }
});
// 部の範囲が全章を過不足なく覆っていること
const covered = PARTS.flatMap((p) => Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i));
if (covered.length !== lib.chapters.length || covered.some((n, i) => n !== i + 1)) {
  problems.push("PARTS の範囲が章の一覧と一致しません");
}
const total = lib.chapters.reduce((n, c) => n + c.items.length, 0);
if (total !== EXPECTED_CHAPTERS * PER_CHAPTER) problems.push(`総問題数が ${total} です（期待値 ${EXPECTED_CHAPTERS * PER_CHAPTER}）`);

// 公開済みの問題IDが消えていたら、変更履歴への記入を求める
problems.push(...checkLock(lib, readLock(), { renamed: RENAMED, retired: RETIRED }));

const htmlPath = path.join(ROOT, "index.html");
if (!fs.existsSync(htmlPath)) {
  problems.push("index.html がありません。npm run build を実行してください");
} else {
  const m = fs.readFileSync(htmlPath, "utf8").match(HASH_MARKER);
  const want = sourceHash();
  if (!m) problems.push("index.html に source-hash がありません。npm run build を実行してください");
  else if (m[1] !== want) {
    problems.push(`index.html が src/ より古いです（${m[1]} ≠ ${want}）。npm run build を実行してコミットしてください`);
  }
}

if (problems.length) {
  console.error(`lint: ${problems.length} 件の問題\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`lint: OK（${lib.chapters.length}章 / ${total}問、index.html は最新）`);
