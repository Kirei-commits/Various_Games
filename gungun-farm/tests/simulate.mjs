/**
 * 農園の経営シミュレーション。ブラウザを使わずに、実際の秒数ぶん遊んだ結果を測る。
 *
 *   node tests/simulate.mjs --minutes 10 --runs 12
 *   node tests/simulate.mjs --summary   # GitHub Actions のジョブ要約に書き出す
 *
 * 目的は2つ。
 *  1. 詰みが無いこと（何もできない時間が続かない／救済が乱発されていない）
 *  2. 育ちの速さが狙い通りか（10分でどのレベルまで行くか）
 */
import fs from 'node:fs';
import { loadGF, mixSeed, seededRandom } from './logic/helpers.mjs';
import { simulate } from './bot.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? def : args[i + 1];
};
const minutes = Number(opt('minutes', 10));
const runs = Number(opt('runs', 12));
const wantSummary = args.includes('--summary');

const GF = loadGF(['data.js', 'engine.js']);

const results = [];
for (let i = 0; i < runs; i++) {
  const seed = mixSeed(i);
  results.push(simulate(GF, { minutes, seed, random: seededRandom(seed) }));
}

const med = (nums) => {
  const s = nums.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const col = (key) => results.map((r) => r[key]);
const stat = (key) => ({ min: Math.min(...col(key)), med: med(col(key)), max: Math.max(...col(key)) });

const rows = [
  ['レベル', stat('level')],
  ['稼いだコイン', stat('earned')],
  ['配達', stat('delivered')],
  ['流れた注文', stat('expired')],
  ['収穫', stat('harvested')],
  ['加工', stat('crafted')],
  ['機械の数', stat('machines')],
  ['畑の数', stat('fields')],
  ['最大コンボ', stat('bestCombo')],
  ['救済の回数', stat('rescues')],
  ['何も起きない最長(ms)', stat('worstStuckMs')],
  ['手持ち無沙汰(%)', stat('idlePct')],
  ['1秒以上の待ち(%)', stat('feltIdlePct')],
  ['待たされた最長(ms)', stat('worstIdleMs')]
];

const lines = [];
lines.push(`## 農園シミュレーション — ${minutes}分 × ${runs}回`);
lines.push('');
lines.push('| 指標 | 最小 | 中央 | 最大 |');
lines.push('| --- | ---: | ---: | ---: |');
for (const [name, s] of rows) lines.push(`| ${name} | ${s.min} | ${s.med} | ${s.max} |`);
lines.push('');

const longest = Math.max(...col('worstStuckMs'));
const rescueTotal = col('rescues').reduce((a, b) => a + b, 0);
const worstIdle = Math.max(...col('worstIdleMs'));
const medIdlePct = med(col('idlePct'));
lines.push(`- 何もできない時間の最長: **${longest}ms**（3秒を超えたら詰みを疑う）`);
lines.push(`- 救済の発動: **${rescueTotal}回**`);
lines.push('');
lines.push(`### 待ち時間（このゲームの約束）`);
lines.push('');
const medFelt = med(col('feltIdlePct'));
lines.push(`- 手持ち無沙汰の割合: **${medIdlePct}%**（収穫・植える・取り出す・仕込む・届ける のどれも無い時間）`);
lines.push(`- そのうち **1秒以上つづいた待ち**: **${medFelt}%** ← 人が「待った」と感じるのはここ`);
lines.push(`- いちばん長く待たされた時間: **${worstIdle}ms**（**3秒を超えたら失敗**）`);

const report = lines.join('\n');
console.log(report);

if (wantSummary && process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
}

let bad = false;
if (longest > 3000) {
  console.error(`\n✘ 何もできない時間が ${longest}ms あった。詰みの疑い。`);
  bad = true;
}
// 待ち時間を限りなく0に近づけるのがこのゲームの存在理由なので、機械で見張る
if (worstIdle > 3000) {
  console.error(`\n✘ ${worstIdle}ms 待たされた。畑がまとめて実って、手が空く時間ができている。`);
  console.error('  時間差まき（Engine.sow）が効いているか確かめる。');
  bad = true;
}
if (bad) process.exit(1);
