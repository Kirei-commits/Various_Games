/**
 * リポジトリ全体の整合を見る。ゲーム1つ1つの中身は各ゲームの lint が見るので、
 * ここでは「ゲームが増えたときに忘れがちなこと」だけを機械的に押さえる。
 *
 *   node .github/scripts/check-repo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover } from './discover-games.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const problems = [];
const games = discover();

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// 1. ゲームごとに揃っていてほしいもの
const NEED_FILES = ['index.html', 'package.json', 'README.md', 'CLAUDE.md', '.gitignore'];
const NEED_SCRIPTS = ['lint', 'test:logic', 'test:e2e', 'start'];
for (const g of games) {
  for (const f of NEED_FILES) {
    if (!exists(path.join(g.name, f))) problems.push(`${g.name}/${f} が無い`);
  }
  for (const s of NEED_SCRIPTS) {
    if (!g.scripts.includes(s)) problems.push(`${g.name} に npm script "${s}" が無い（CIが回せない）`);
  }
  if (!g.description) problems.push(`${g.name}/package.json に description が無い`);
  // 通しプレイやシミュレーションを持つなら、CI用の入口も要る。
  // 局数や分数をワークフローに書かずに済ませるための約束
  if (g.scripts.includes('playtest') && !g.scripts.includes('playtest:ci')) {
    problems.push(`${g.name} に "playtest:ci"（CI用の加減を決めた入口）が無い`);
  }
  if (g.scripts.includes('simulate') && !g.scripts.includes('simulate:ci')) {
    problems.push(`${g.name} に "simulate:ci" が無い`);
  }

  if (exists(path.join(g.name, '.gitignore'))) {
    const ig = read(path.join(g.name, '.gitignore'));
    if (!/node_modules/.test(ig)) problems.push(`${g.name}/.gitignore が node_modules を無視していない`);
  }
}

// 1.5 ゲームのディレクトリ直下に、書き捨てのファイルが残っていないこと。
//     デバッグ用のスクリプトを置いたまま commit しかけたことが二度ある
//     （配信物にも混ざりかける）。置いてよいものを決めておく。
const ALLOWED_TOP = new Set([
  'index.html', 'package.json', 'package-lock.json', 'playwright.config.mjs',
  'README.md', 'CLAUDE.md', 'ROADMAP.md', '.gitignore',
  'css', 'js', 'tests', 'node_modules', 'playwright-report', 'test-results', 'playtest-shots'
]);
for (const g of games) {
  for (const name of fs.readdirSync(path.join(ROOT, g.name))) {
    if (name.startsWith('.') && name !== '.gitignore') continue;
    if (!ALLOWED_TOP.has(name)) {
      problems.push(`${g.name}/${name} は置き場所が決まっていない（書き捨てなら消す／要るなら ALLOWED_TOP に足す）`);
    }
  }
}

// 2. 入口のページと README からたどり着けること。
//    リンクを足し忘れると、CIは緑なのに誰も遊べないゲームができる
const indexHtml = read('index.html');
const readme = read('README.md');
for (const g of games) {
  if (!indexHtml.includes(`./${g.name}/`)) problems.push(`index.html から ${g.name} へのリンクが無い`);
  if (!readme.includes(g.name)) problems.push(`README.md に ${g.name} の記載が無い`);
}

// 3. サブディレクトリ配下のワークフローは GitHub では実行されない。
//    置いてしまうと「動いているつもり」になるので、置けないようにしておく
const strays = [];
for (const g of games) {
  const dir = path.join(ROOT, g.name, '.github');
  if (fs.existsSync(dir)) strays.push(`${g.name}/.github`);
}
for (const s of strays) problems.push(`${s} がある。ワークフローはリポジトリ直下にしか置けない`);

// 4. 依存の更新（dependabot）が新しいゲームを見ていること
if (exists('.github/dependabot.yml')) {
  const dep = read('.github/dependabot.yml');
  for (const g of games) {
    if (!dep.includes(`/${g.name}`)) problems.push(`dependabot.yml に /${g.name} の設定が無い（更新が止まる）`);
  }
} else {
  problems.push('.github/dependabot.yml が無い');
}

// 5. ワークフローがゲーム名を直書きしていないこと（増やすたびに直す運用に戻さない）
for (const wf of ['ci.yml', 'pages.yml']) {
  if (!exists(`.github/workflows/${wf}`)) { problems.push(`.github/workflows/${wf} が無い`); continue; }
  const body = read(`.github/workflows/${wf}`);
  for (const g of games) {
    // matrix に直書きしていないか。コメントで名前に触れるのは構わない
    const hardcoded = new RegExp(`(game|games|matrix)[^\\n]*['"\\[ ]${g.name}['",\\] ]`);
    if (hardcoded.test(body)) problems.push(`${wf} が ${g.name} を直書きしている（discover-games.mjs から採る）`);
  }
}

if (problems.length) {
  console.error('リポジトリの整合チェック 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`整合チェック OK — ゲーム ${games.length}件（${games.map((g) => g.name).join(', ')}）`);
