/**
 * src/ を1枚の index.html にまとめる（依存パッケージなし）。出来上がりはサーバー不要・ブラウザで直接開いて動く。
 *
 *   node tools/build.mjs          → index.html を更新
 *   node tools/build.mjs --check  → index.html が src/ と一致するか確かめるだけ（一致しなければ終了コード1）
 *
 * まとめ方
 *   <script id="pg-config">   src/pure/config.js   調整値（データだけ）
 *   <script id="pg-spec">     src/pure/spec.js     抽選と理論値（純粋）
 *   <script id="pg-physics">  src/pure/physics.js  物理（純粋）
 *   <script id="pg-game">     src/game/*.js を番号順につなげ、1つの即時関数で包む（同じスコープを共有する）
 * 純粋な3つは Node の vm でそのまま読めるので、ロジックテストはブラウザなしで回る。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
export const PURE = ['config', 'spec', 'physics'];

export function gameParts() {
  return fs.readdirSync(path.join(SRC, 'game')).filter(f => /^\d\d-.*\.js$/.test(f)).sort();
}
/** src/ の中身から作るハッシュ（index.html に埋めて、古いビルドを lint で見つける） */
export function sourceHash() {
  const h = crypto.createHash('sha256');
  const files = ['shell.html', 'style.css', ...PURE.map(n => `pure/${n}.js`), ...gameParts().map(f => `game/${f}`)];
  for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n')); }
  return h.digest('hex').slice(0, 16);
}
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const guard = s => s.replace(/<\/script/gi, '<\\/script'); // インライン <script> を途中で閉じさせない

export function build() {
  const hash = sourceHash();
  const scripts = PURE.map(n => `<script id="pg-${n}">\n${guard(read(`pure/${n}.js`))}\n</script>`);
  const game = gameParts().map(f => `// ---- src/game/${f} ----\n${read(`game/${f}`)}`).join('\n\n');
  scripts.push(`<script id="pg-game">\n'use strict';\n(() => {\n${guard(game)}\n})();\n</script>`);
  let html = read('shell.html');
  const put = (marker, text) => { if (!html.includes(marker)) throw new Error(`shell.html に ${marker} が無い`); html = html.replace(marker, () => text); };
  put('<!-- @SOURCE_HASH -->', `<meta name="pg-source-hash" content="${hash}">\n<!-- このファイルは tools/build.mjs が src/ から生成する。直接編集しないこと -->`);
  put('/* @STYLE */', read('style.css'));
  put('<!-- @SCRIPTS -->', scripts.join('\n'));
  return { html: html + '\n', hash };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { html, hash } = build();
  const out = path.join(ROOT, 'index.html');
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (cur !== html) { console.error('index.html が src/ と一致しません。npm run build を実行してコミットしてください'); process.exit(1); }
    console.log(`index.html は最新です（${hash}）`);
  } else {
    fs.writeFileSync(out, html);
    console.log(`index.html を生成しました（${hash}, ${(html.length / 1024).toFixed(0)}KB）`);
  }
}
