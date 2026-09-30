/**
 * ビルドを持たない1ファイル構成のための最小の静的検査。
 *  1. index.html のインラインスクリプトの構文チェック
 *  2. 外部ファイルを読み込んでいないか（1ファイルでプレビューできることが要件）
 *  3. getElementById で参照する id が HTML に実在するか
 *  4. 物理・戦闘・データが DOM・乱数・時計に触れていないか（テストの決定性を守る）
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const problems = [];

// 1. 構文チェック
const scripts = [...html.matchAll(/<script(?:\s+id="([^"]+)")?>([\s\S]*?)<\/script>/g)];
for (const [, id = '(無名)', src] of scripts) {
  try {
    new vm.Script(src, { filename: `index.html#${id}` });
  } catch (e) {
    problems.push(`構文エラー <script id="${id}">: ${e.message}`);
  }
}
const ids = scripts.map((m) => m[1]);
if (!ids.includes('ms-physics')) problems.push('<script id="ms-physics"> が無い（ロジックテストが読めない）');
if (!ids.includes('ms-game')) problems.push('<script id="ms-game"> が無い');
if (ids.indexOf('ms-physics') > ids.indexOf('ms-game')) problems.push('ms-physics は ms-game より前に必要');

// 2. 外部参照
for (const m of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
  if (!m[1].startsWith('data:')) problems.push(`外部ファイルを参照している: ${m[1]}`);
}

// 3. id の実在確認
const declared = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const used = new Set([...html.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]));
for (const id of used) if (!declared.has(id)) problems.push(`#${id} が HTML に無い`);

// 4. 純粋なモジュール（物理・戦闘・データ）
for (const id of ['ms-physics', 'ms-battle', 'ms-data', 'ms-meta', 'ms-puzzle']) {
  const src = scripts.find((m) => m[1] === id)?.[2];
  if (src == null) { problems.push(`<script id="${id}"> が無い`); continue; }
  if (ids.indexOf(id) > ids.indexOf('ms-game')) problems.push(`${id} は ms-game より前に必要`);
  for (const bad of ['document', 'window.', 'Math.random', 'performance.now', 'Date.now', 'requestAnimationFrame', 'localStorage']) {
    if (src.includes(bad)) problems.push(`${id} が ${bad} を使っている`);
  }
}

if (problems.length) {
  console.error('lint 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`lint OK — スクリプト ${scripts.length}件 / id参照 ${used.size}件`);
