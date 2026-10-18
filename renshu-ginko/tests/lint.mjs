/**
 * 静的検査（依存パッケージなしで動く。CI では npm ci より前に走る）
 *  1. js/*.js の構文
 *  2. index.html が読み込むスクリプトがそろっていて、順番が正しいか
 *  3. 外部ファイルを読み込んでいないか（実行時の依存ゼロ）。CSP の connect-src は Claude API だけか
 *  4. 純粋なモジュールが DOM・乱数・時計・保存先・ネットワークに触れていないか（テストの決定性を守る）
 *  5. app.js の $('id') が、HTML か app.js の中で作られる id か
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const problems = [];

const ORDER = ['core', 'content', 'units-more', 'runner', 'rules', 'gitsim', 'tutor', 'store', 'app'];
const PURE = ['core', 'content', 'units-more', 'rules', 'gitsim', 'tutor', 'store'];

// 1. 構文
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
  if (!f.endsWith('.js')) continue;
  try { new vm.Script(read('js/' + f), { filename: f }); } catch (e) { problems.push(`構文エラー js/${f}: ${e.message}`); }
}

// 2. 読み込み順
const html = read('index.html');
const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((m) => m[1]);
const want = ORDER.map((n) => `js/${n}.js`);
if (scripts.join() !== want.join()) problems.push(`<script> の並びが違う: ${scripts.join(', ')}（期待: ${want.join(', ')}）`);
for (const s of scripts) if (!fs.existsSync(path.join(ROOT, s))) problems.push(`${s} がない`);

// 3. 外部参照と CSP
for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
  if (!m[1].startsWith('data:') && /^[a-z]+:|^\/\//i.test(m[1])) problems.push(`外部ファイルを参照している: ${m[1]}`);
}
const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
if (!/connect-src https:\/\/api\.anthropic\.com;/.test(csp)) problems.push('CSP の connect-src が Claude API だけになっていない');
if (!/worker-src blob:/.test(csp)) problems.push('CSP に worker-src blob: が無い（サンドボックスが動かない）');

// 4. 純粋さ
for (const n of PURE) {
  const src = read(`js/${n}.js`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const bad of ['document.', 'window.', 'Math.random', 'Date.now', 'performance.now', 'localStorage', 'sessionStorage', 'setTimeout', 'new Worker']) {
    if (src.includes(bad)) problems.push(`js/${n}.js が ${bad} を使っている（純粋なモジュールに入れない）`);
  }
  if (/(^|[^\w.])fetch\(/.test(src)) problems.push(`js/${n}.js が fetch を直接呼んでいる（fetchImpl を引数でもらう）`);
}

// 5. id の実在
const app = read('js/app.js');
const declared = new Set([
  ...[...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
  ...[...app.matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]),
]);
for (const m of app.matchAll(/\$\('([^']+)'\)/g)) {
  if (!declared.has(m[1])) problems.push(`#${m[1]} がどこにも無い`);
}

if (problems.length) {
  console.error('lint 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`lint OK — スクリプト ${scripts.length}件 / 純粋なモジュール ${PURE.length}件`);
