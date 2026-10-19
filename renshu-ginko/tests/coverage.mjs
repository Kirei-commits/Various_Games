/**
 * ロジックテストを実行し、カバレッジ（テストで通った行・分岐の割合）が基準を下回ったら失敗にする（NFR-13）
 *   全体: 行 95% 以上・分岐 80% 以上 ／ 純粋なモジュールそれぞれ: 行 75% 以上
 *   ブラウザでしか動かない部分（ts.js の読み込み、runner.js のワーカー）があるので、ファイルごとの基準は低めにしてある
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(ROOT, 'tests/logic')).filter((f) => f.endsWith('.test.mjs')).map((f) => 'tests/logic/' + f);
const run = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', ...files], { cwd: ROOT, encoding: 'utf8' });
const out = run.stdout + run.stderr;
process.stdout.write(out.split('\n').filter((l) => /^# (tests|pass|fail) \d/.test(l) || /^not ok/.test(l)).join('\n') + '\n');
if (run.status !== 0) { console.error('ロジックテストが失敗しました'); process.exit(run.status || 1); }

const LIMITS = { totalLine: 95, totalBranch: 80, fileLine: 75 };
const rows = out.split('\n').filter((l) => /^#\s+\S+\.js\s+\|/.test(l) || /^#\s+all files\s+\|/.test(l)).map((l) => {
  const [name, line, branch] = l.replace(/^#\s+/, '').split('|').map((x) => x.trim());
  return { name, line: Number(line), branch: Number(branch) };
});
const problems = [];
const total = rows.find((r) => r.name === 'all files');
if (!total) problems.push('カバレッジの集計が見つかりません');
else {
  if (total.line < LIMITS.totalLine) problems.push(`全体の行カバレッジ ${total.line}% < ${LIMITS.totalLine}%`);
  if (total.branch < LIMITS.totalBranch) problems.push(`全体の分岐カバレッジ ${total.branch}% < ${LIMITS.totalBranch}%`);
}
for (const r of rows) if (r.name !== 'all files' && r.line < LIMITS.fileLine) problems.push(`${r.name} の行カバレッジ ${r.line}% < ${LIMITS.fileLine}%`);
if (problems.length) {
  console.error('カバレッジの基準を下回りました:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`カバレッジ OK — 行 ${total.line}% ・ 分岐 ${total.branch}%（${rows.length - 1} ファイル）`);
