#!/usr/bin/env node
/**
 * 英文のカタカナ読み（ルビ）のもとになる発音データを作る。
 *
 *   node tools/readings.mjs <cmudict.dict のパス>
 *
 * 教材（見出し・会話例）とガチャのシークレット単語の例文に出てくる単語だけを、
 * CMU Pronouncing Dictionary（BSD ライセンス。pip の cmudict パッケージの cmudict/data/cmudict.dict）から抜き出して
 * src/data/pron.js に書く。カタカナへの変換とリンキングの読み方は src/reading.js が画面で行う。
 * 教材を足したら、もう一度実行する（辞書にない単語はルビなし）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import raw from "../src/data/index.js";
import { buildLibrary, parseDialogue } from "../src/logic.js";
import { SECRETS } from "../src/data/gacha-data.js";
import { wordsOf } from "../src/reading.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dictPath = process.argv[2];
if (!dictPath) {
  console.error("使い方: node tools/readings.mjs <cmudict.dict>");
  process.exit(1);
}

const lib = buildLibrary(raw);
const texts = [];
for (const p of Object.values(lib.byId)) {
  texts.push(p.english);
  for (const l of parseDialogue(p.exampleContext)) texts.push(l.text);
}
for (const s of SECRETS) texts.push(s.english, s.example || "");

const wanted = new Set();
for (const t of texts) for (const w of wordsOf(t)) wanted.add(w);

const dict = new Map();
for (const line of fs.readFileSync(dictPath, "utf8").split("\n")) {
  const m = line.match(/^(\S+?)(\(\d+\))? (.+?)(\s#.*)?$/);
  if (!m || m[2]) continue; // 読み方が複数ある単語は最初の1つだけ
  if (wanted.has(m[1])) dict.set(m[1], m[3].trim());
}

const found = [...wanted].filter((w) => dict.has(w)).sort();
const missing = [...wanted].filter((w) => !dict.has(w)).sort();
const body = found.map((w) => `${w} ${dict.get(w)}`).join("\n");
const out = `/*
 * 英単語の発音（CMU Pronouncing Dictionary から、教材に出てくる単語だけを抜き出したもの）。
 * tools/readings.mjs が作る。手で編集しない。形式: 1行1語「単語 発音記号（ARPAbet）」
 * CMUdict: Copyright (C) 1993-2015 Carnegie Mellon University. BSD ライセンス（元の条文は tools/cmudict-LICENSE.txt）。
 */
export default \`${body}\`;
`;
fs.writeFileSync(path.join(root, "src/data/pron.js"), out);
console.log(`src/data/pron.js: ${found.length} 語（辞書にない ${missing.length} 語: ${missing.slice(0, 40).join(" ")}${missing.length > 40 ? " …" : ""}）`);
