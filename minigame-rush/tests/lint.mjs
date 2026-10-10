/**
 * 静的検査（依存パッケージなしで動く。CI では npm ci より前に走る）
 *  1. index.html が src/ から生成した最新のものか（古ければ npm run build）
 *  2. インラインスクリプトの構文
 *  3. モジュール（<script id>）がそろっていて順番が正しいか
 *  4. 外部ファイルを読み込んでいないか（Google Fonts だけは許可。読めなくても代わりのフォントで動く）
 *  5. $('id') / getElementById で参照する id が HTML に実在するか
 *  6. 純粋なモジュール（調整値・ステージ生成・ゲームの中身・ボット）が DOM・Math.random・時計に触れていないか（テストの決定性を守る）
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, build, PURE } from '../tools/build.mjs';

const problems = [];
const htmlPath = path.join(ROOT, 'index.html');
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';

// 1. ビルドが最新か
if (!html) problems.push('index.html がありません。npm run build を実行してください');
else if (html !== build().html) problems.push('index.html が src/ と一致しません。npm run build を実行してコミットしてください');

// 2. 構文
const scripts = [...html.matchAll(/<script id="([^"]+)">([\s\S]*?)<\/script>/g)];
for (const [, id, src] of scripts) {
  try { new vm.Script(src, { filename: `index.html#${id}` }); } catch (e) { problems.push(`構文エラー <script id="${id}">: ${e.message}`); }
}
if ([...html.matchAll(/<script(?![^>]*\bid=)[^>]*>/g)].length) problems.push('id の無い <script> がある（テストが中身を取り出せない）');

// 3. モジュールの順番
const ids = scripts.map(m => m[1]);
const want = [...PURE.map(n => `mgr-${n}`), 'mgr-game'];
if (ids.join() !== want.join()) problems.push(`<script id> の並びが違う: ${ids.join(', ')}（期待: ${want.join(', ')}）`);

// 4. 外部参照
const allowed = /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/;
for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
  if (!m[1].startsWith('data:') && !allowed.test(m[1])) problems.push(`外部ファイルを参照している: ${m[1]}`);
}

// 5. id の実在
const declared = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const used = new Set([...html.matchAll(/(?:getElementById|\$)\('([^']+)'\)/g)].map(m => m[1]));
for (const id of used) if (!declared.has(id)) problems.push(`#${id} が HTML に無い`);

// 6. 純粋さ
for (const n of PURE) {
  const src = scripts.find(m => m[1] === `mgr-${n}`)?.[2] || '';
  for (const bad of ['document', 'window', 'Math.random', 'performance.now', 'Date.now', 'requestAnimationFrame', 'localStorage', 'crypto']) {
    if (src.includes(bad)) problems.push(`mgr-${n} が ${bad} を使っている（純粋なモジュールに入れない）`);
  }
}

if (problems.length) {
  console.error('lint 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`lint OK — スクリプト ${scripts.length}件 / id参照 ${used.size}件 / index.html は最新`);
