/**
 * ビルドを持たないプロジェクトのための最小の静的検査。
 *  1. 全JSファイルの構文チェック
 *  2. index.html が参照する css/js が実在するか
 *  3. 読み込み順の検証（依存より先に依存元が来ていないか）
 *  4. アイテム定義の整合（idの重複、必須項目、未知の属性）
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// 1. 構文チェック
const jsDir = path.join(ROOT, 'js');
const jsFiles = fs.readdirSync(jsDir).filter((n) => n.endsWith('.js'));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', path.join(jsDir, f)], { stdio: 'pipe' });
  } catch (e) {
    problems.push(`構文エラー js/${f}: ${e.stderr?.toString().split('\n')[0]}`);
  }
}

// 2. 参照の実在確認
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(?!https?:|data:)([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (!fs.existsSync(path.join(ROOT, ref))) problems.push(`参照先が存在しない: ${ref}`);
}
if (!refs.includes('css/style.css')) problems.push('index.html が css/style.css を読み込んでいない');

// 読み込まれていないJSがあれば気づけるようにする
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const f of jsFiles) if (!order.includes(f)) problems.push(`js/${f} が index.html から読み込まれていない`);

// 3. 読み込み順
const need = [
  ['items.js', 'engine.js'], ['items.js', 'ai.js'], ['items.js', 'render.js'],
  ['engine.js', 'ai.js'], ['engine.js', 'render.js'],
  ['items.js', 'main.js'], ['engine.js', 'main.js'], ['ai.js', 'main.js'],
  ['storage.js', 'main.js'], ['audio.js', 'main.js'], ['render.js', 'main.js'],
  ['ai.js', 'render.js']   // render は AI.LEVELS のラベルを出す
];
for (const [before, after] of need) {
  const i = order.indexOf(before), j = order.indexOf(after);
  if (i === -1 || j === -1 || i > j) problems.push(`読み込み順が不正: ${before} は ${after} より前に必要`);
}

// 4. アイテム定義の整合
const src = fs.readFileSync(path.join(jsDir, 'items.js'), 'utf8');
const entries = [...src.matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*kind:\s*'([^']+)',\s*element:\s*'([^']+)',\s*power:\s*(-?\d+)/g)];
const KINDS = new Set(['weapon', 'defense', 'food', 'magic']);
const ELS = new Set(['none', 'fire', 'water', 'thunder', 'light', 'dark', 'all']);
const seen = new Set();
for (const [, id, name, kind, element, power] of entries) {
  if (seen.has(id)) problems.push(`アイテムidの重複: ${id}`);
  seen.add(id);
  if (!KINDS.has(kind)) problems.push(`未知の kind: ${id} -> ${kind}`);
  if (!ELS.has(element)) problems.push(`未知の element: ${id} -> ${element}`);
  if (kind !== 'defense' && element === 'all') problems.push(`all属性は防具にしか使えない: ${id}`);
  if (Number(power) <= 0) problems.push(`power が0以下: ${id}`);
  if (!name) problems.push(`name が空: ${id}`);
}
if (entries.length < 20) problems.push(`アイテム定義が読み取れていない（${entries.length}件）`);

if (problems.length) {
  console.error('lint 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`lint OK — JS ${jsFiles.length}件 / 参照 ${refs.length}件 / 読み込み順 ${order.length}件 / アイテム ${entries.length}件`);
