/**
 * 公開する静的サイトを組み立てる。ビルド工程は無く、配るファイルを選んで写すだけ。
 * Pages のワークフローと、配信サイズを測るジョブの両方がこれを使う（作り方を1か所にする）。
 *
 *   node .github/scripts/build-site.mjs --out _site
 *   node .github/scripts/build-site.mjs --out _site --budget 600   # 合計600KBを超えたら失敗
 *
 * 配信物に開発用のもの（node_modules・テスト・レポート）を混ぜないことが目的。
 * 除外を「並べる」のではなく「持っていくものを選ぶ」でもなく、
 * **開発用と分かっているものだけ落とす**方式にしてある。新しく画像や音のフォルダを
 * 足したときに、ワークフローを直さなくても勝手に配られるようにするため。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover } from './discover-games.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i === -1 ? d : args[i + 1]; };
const OUT = path.resolve(ROOT, opt('out', '_site'));
const BUDGET_KB = Number(opt('budget', 0));

/** 配信物に入れないもの（開発用とわかっているものだけ） */
const SKIP = new Set([
  'node_modules', 'tests', 'package.json', 'package-lock.json', 'playwright.config.mjs',
  'playwright-report', 'test-results', 'playtest-shots', '.gitignore', '.git'
]);
// 配るスクリプトは js/*.js だけ。ゲーム直下の .mjs は道具（設定・テスト・書き捨て）なので
// まとめて落とす。書き捨てのスクリプトが配信物に混ざるのを一度やっている。
const skip = (name) => SKIP.has(name) || name.startsWith('.') || name.endsWith('.md') || name.endsWith('.mjs');

function copyInto(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  let bytes = 0, files = 0;
  for (const name of fs.readdirSync(srcDir)) {
    if (skip(name)) continue;
    const src = path.join(srcDir, name);
    const dst = path.join(dstDir, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      const sub = copyInto(src, dst);
      bytes += sub.bytes; files += sub.files;
    } else {
      fs.copyFileSync(src, dst);
      bytes += st.size; files++;
    }
  }
  return { bytes, files };
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const rows = [];

// 入口のページ
const indexSize = fs.statSync(path.join(ROOT, 'index.html')).size;
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));
rows.push({ name: '(入口) index.html', files: 1, bytes: indexSize });

for (const g of discover()) {
  const r = copyInto(path.join(ROOT, g.name), path.join(OUT, g.name));
  rows.push({ name: g.name, ...r });
}

const totalBytes = rows.reduce((a, r) => a + r.bytes, 0);
const kb = (b) => (b / 1024).toFixed(1);

const lines = ['## 配信するもの', '', '| 中身 | ファイル数 | 大きさ |', '| --- | ---: | ---: |'];
for (const r of rows) lines.push(`| ${r.name} | ${r.files} | ${kb(r.bytes)} KB |`);
lines.push(`| **合計** | **${rows.reduce((a, r) => a + r.files, 0)}** | **${kb(totalBytes)} KB** |`);
lines.push('');
lines.push('実行時の依存パッケージはゼロ。ビルド工程も無いので、ここにあるものがそのまま配られる。');

const report = lines.join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');

if (BUDGET_KB && totalBytes / 1024 > BUDGET_KB) {
  console.error(`\n✘ 配信サイズが予算を超えた: ${kb(totalBytes)} KB > ${BUDGET_KB} KB`);
  console.error('  重い画像や音を持ち込んでいないか、node_modules が混ざっていないかを確かめる。');
  process.exit(1);
}
