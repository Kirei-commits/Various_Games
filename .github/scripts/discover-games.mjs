/**
 * リポジトリにあるゲームを見つけて、ワークフローの matrix に渡せる形で出す。
 *
 * ゲームを1つ足すたびに ci.yml と pages.yml を書き換えるのをやめるための仕組み。
 * 「package.json と index.html があるディレクトリ＝ゲーム」とみなす。
 *
 *   node .github/scripts/discover-games.mjs            # 人が読む形
 *   node .github/scripts/discover-games.mjs --github   # GITHUB_OUTPUT に書く形
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function discover() {
  const games = [];
  for (const name of fs.readdirSync(ROOT).sort()) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const dir = path.join(ROOT, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath) || !fs.existsSync(path.join(dir, 'index.html'))) continue;

    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch (e) {
      throw new Error(`${name}/package.json が読めない: ${e.message}`);
    }
    const scripts = pkg.scripts || {};
    games.push({
      name,
      description: pkg.description || '',
      scripts: Object.keys(scripts),
      // どのジョブを回すかは、ゲーム側が持っているスクリプトで決める
      hasE2E: !!scripts['test:e2e'],
      // CIが回すのは playtest:ci。局数や分数といった「CI用の加減」はゲーム側に置き、
      // ワークフローには書かない（ゲームが増えても workflow を触らないため）
      hasPlaytest: !!scripts['playtest:ci'],
      hasSimulate: !!scripts['simulate:ci']
    });
  }
  if (!games.length) throw new Error('ゲームが1つも見つからない（探し方が壊れている）');
  return games;
}

// 読み込まれただけのときは何も出さない（build-site.mjs が import して使う）
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) report();

function report() {
const games = discover();
const names = games.map((g) => g.name);
const withPlaytest = games.filter((g) => g.hasPlaytest).map((g) => g.name);
const withSimulate = games.filter((g) => g.hasSimulate).map((g) => g.name);

if (process.argv.includes('--github')) {
  const out = [
    `games=${JSON.stringify(names)}`,
    `playtests=${JSON.stringify(withPlaytest)}`,
    `simulates=${JSON.stringify(withSimulate)}`,
    `count=${names.length}`
  ].join('\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, out + '\n');
  console.log(out);
} else {
  for (const g of games) {
    const jobs = [g.hasE2E && 'e2e', g.hasPlaytest && 'playtest', g.hasSimulate && 'simulate'].filter(Boolean);
    console.log(`${g.name.padEnd(16)} ${jobs.join(' / ') || '(テストなし)'}`);
  }
}
}
