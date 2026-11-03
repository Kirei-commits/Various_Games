/**
 * 単一HTMLのための最小の静的検査。
 *  1. index.html の中の <script> を全部、構文チェックする
 *  2. 外部のファイルや CDN を読み込んでいないか（通信なしで動くことを守る）
 *  3. 物理エンジンが DOM に触っていないか（Node のテストから読み込むため）
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const problems = [];

const scripts = [...html.matchAll(/<script(?: id="([^"]+)")?>([\s\S]*?)<\/script>/g)];
if (scripts.length < 2) problems.push('<script> が足りない（エンジンと画面の2つが要る）');
scripts.forEach((m, i) => {
  try { new vm.Script(m[2], { filename: `index.html#script${i}` }); }
  catch (e) { problems.push(`構文エラー script${i}${m[1] ? `(${m[1]})` : ''}: ${e.message}`); }
});

const ext = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(?!data:)([^"]+)"/g)].map((m) => m[1]);
for (const ref of ext) problems.push(`外部ファイルを読み込んでいる: ${ref}`);

const engine = scripts.find((m) => m[1] === 'engine');
if (!engine) problems.push('<script id="engine"> が無い');
else if (/\b(document|localStorage|requestAnimationFrame|AudioContext)\b/.test(engine[2])) {
  problems.push('エンジンが画面や音の API に触っている（Node のテストで動かなくなる）');
}

if (problems.length) {
  console.error('lint 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`lint OK — script ${scripts.length}件`);
