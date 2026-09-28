/**
 * ビルドを持たないプロジェクトのための最小の静的検査。
 *  1. 全JSファイルの構文チェック
 *  2. index.html が参照する css/js が実在するか
 *  3. <script> の読み込み順（クラシックスクリプトなので順序＝依存関係）
 *  4. 保存する状態のキーが Store.DEFAULTS に定義されているか
 *     （定義漏れは merge() に捨てられ、保存しても復元されない。実際に出した不具合）
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
const refs = [...html.matchAll(/(?:src|href)="(?!https?:|data:|\.\.\/)([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (!fs.existsSync(path.join(ROOT, ref))) problems.push(`参照先が存在しない: ${ref}`);
}
if (!refs.includes('css/style.css')) problems.push('index.html が css/style.css を読み込んでいない');

// 読み込まれていない js が残っていないか（消し忘れ・書き忘れの検出）
const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const f of jsFiles) {
  if (!order.includes(f)) problems.push(`js/${f} が index.html から読み込まれていない`);
}

// 3. 読み込み順
const ALL_JS = [
  'fish.js', 'progress.js', 'angler.js', 'world.js', 'gear.js', 'parts.js', 'boost.js',
  'bonus.js', 'achievements.js', 'storage.js', 'account.js', 'tackle.js', 'game.js',
  'audio.js', 'render.js'
];
const need = [
  ['fish.js', 'game.js'], ['fish.js', 'render.js'],
  // storage は状態の正規化で Progress / Angler を、実績判定で Achievements を使う
  ['progress.js', 'storage.js'], ['angler.js', 'storage.js'], ['achievements.js', 'storage.js'],
  // tackle はすべての補正元をまとめる
  ['gear.js', 'tackle.js'], ['parts.js', 'tackle.js'],
  ['angler.js', 'tackle.js'], ['boost.js', 'tackle.js'],
  ...ALL_JS.map((f) => [f, 'main.js'])
];
for (const [before, after] of need) {
  const i = order.indexOf(before), j = order.indexOf(after);
  if (i === -1 || j === -1 || i > j) problems.push(`読み込み順が不正: ${before} は ${after} より前に必要`);
}

// 4. 状態キーの定義漏れ
//    main.js / storage.js が state.<key> として触るキーは DEFAULTS に無いといけない。
const storeSrc = fs.readFileSync(path.join(jsDir, 'storage.js'), 'utf8');
const defaultsBlock = storeSrc.slice(
  storeSrc.indexOf('var DEFAULTS = {'),
  storeSrc.indexOf('function isPlainObject')
);
const defined = new Set([...defaultsBlock.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]));
const touched = new Set();
for (const f of ['main.js', 'storage.js']) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  // game.state.xxx（実行時の状態）は保存対象ではないので、直前がドットのものは除く
  for (const m of src.matchAll(/(?<![.\w])state\.(\w+)/g)) touched.add(m[1]);
}
for (const key of touched) {
  if (!defined.has(key)) problems.push(`state.${key} が Store.DEFAULTS に定義されていない`);
}

if (problems.length) {
  console.error('lint 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(
  `lint OK — JS ${jsFiles.length}件 / 参照 ${refs.length}件 / 読み込み順 ${order.length}件 / 状態キー ${touched.size}件`
);
