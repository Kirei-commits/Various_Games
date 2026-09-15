/**
 * ビルドを持たないプロジェクトのための静的検査。
 *
 *  1. 全JSの構文チェック
 *  2. index.html の参照が実在するか
 *  3. import の先が実在し、js/ の中に迷子（どこからも import されないファイル）が無いか
 *  4. 同梱の問題集が、アプリと同じ検査（js/author/validate.js）を通るか
 *
 * 読み込み順の検査はもう要らない。ESモジュールにしたので、依存は import 文そのもの。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBank } from '../js/author/validate.js';
import javaBank from '../js/data/bank-java.js';
import kuwataBank from '../js/data/bank-kuwata.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/* 1. 構文チェック */
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

const jsFiles = walk(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    problems.push(`構文エラー ${path.relative(ROOT, f)}: ${e.stderr?.toString().split('\n')[0]}`);
  }
}

/* 1-b. 生の制御文字が紛れていないか
   NUL を含むソースは、配信先やツールに丸ごと弾かれることがある（artifact への公開で実際に落ちた）。
   正規表現に制御文字を書くときは \u0000 のようにエスケープする。 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/;
for (const f of [...jsFiles, path.join(ROOT, 'index.html'), path.join(ROOT, 'css', 'style.css')]) {
  const src = fs.readFileSync(f, 'utf8');
  const at = src.search(CONTROL);
  if (at >= 0) {
    const line = src.slice(0, at).split('\n').length;
    problems.push(`生の制御文字が入っている: ${path.relative(ROOT, f)}:${line}（\\uXXXX で書く）`);
  }
}

/* 2. index.html の参照 */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(?!https?:|data:)([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (!fs.existsSync(path.join(ROOT, ref))) problems.push(`参照先が存在しない: ${ref}`);
}
if (!refs.includes('css/style.css')) problems.push('index.html が css/style.css を読み込んでいない');
if (!/<script type="module" src="js\/main\.js">/.test(html)) {
  problems.push('index.html が js/main.js を type="module" で読み込んでいない');
}

/* 3. import の先が実在するか / 迷子のファイルが無いか */
const reached = new Set();
function follow(file) {
  const rel = path.relative(ROOT, file);
  if (reached.has(rel)) return;
  reached.add(rel);
  const src = fs.readFileSync(file, 'utf8');
  for (const [, spec] of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s+['"]([^'"]+)['"]/g)) {
    if (!spec.startsWith('.')) continue;                    // npm のパッケージは対象外
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) {
      problems.push(`import の先が無い: ${rel} → ${spec}`);
      continue;
    }
    follow(target);
  }
}
follow(path.join(ROOT, 'js', 'main.js'));
follow(path.join(ROOT, 'tools', 'studio.mjs'));

for (const f of jsFiles) {
  const rel = path.relative(ROOT, f);
  if (!reached.has(rel)) problems.push(`どこからも import されていない: ${rel}`);
}

/* 4. 同梱の問題集 */
let questionCount = 0;
for (const bank of [javaBank, kuwataBank]) {
  // 同梱ぶんは単元ごとに L1〜L5 が揃っていることまで必須にする（階段が必ず組めるように）。
  // 講師が資料から作ったものは、揃わないのが普通なので警告どまり（validateBank の既定）。
  const verdict = validateBank(bank, { requireFullLevels: true });
  problems.push(...verdict.problems);
  questionCount += bank.questions.length;
}
if (questionCount < 20) problems.push(`同梱の問題が少なすぎる（${questionCount}件）`);

if (problems.length) {
  console.error('lint 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`lint OK — JS ${jsFiles.length}件 / 参照 ${refs.length}件 / 到達 ${reached.size}件 / 同梱問題 ${questionCount}件`);
