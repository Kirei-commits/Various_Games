/**
 * バランスの測定：放っておいたときに何秒で太陽に届くか（ゲームオーバーにならないか）を seed ごとに並べる。
 *   node tools/measure.mjs [seedの数=10] [設定の上書き JSON]
 *   例: node tools/measure.mjs 20 '{"spawnInterval":0.2}'
 *   --help をつけると、ラインが危なくなったらシャッフルする「手助けボット」で遊ぶ
 */
import { loadEngine } from '../tests/engine.mjs';

const E = loadEngine();
const args = process.argv.slice(2).filter((a) => a !== '--help');
const helper = process.argv.includes('--help');
const n = Number(args[0] || 10);
const over = JSON.parse(args[1] || '{}');
const rows = [];
for (let seed = 1; seed <= n; seed++) {
  const t0 = performance.now();
  const g = E.createGame({ seed, ...over });
  let maxBalls = 0;
  let lastHelp = -9;
  while (g.state.status === 'running' && g.state.time < 600) {
    g.advance(helper ? 0.25 : 1);
    if (helper && g.state.overTimer > 0.3 && g.state.time - lastHelp > 0.8) { g.shuffle(); lastHelp = g.state.time; }
    maxBalls = Math.max(maxBalls, g.state.balls.length);
  }
  const ms = performance.now() - t0;
  rows.push({ seed, status: g.state.status, time: Math.round(g.state.time), maxTier: g.state.maxTier, merges: g.state.merges, maxBalls, msPerSec: +(ms / g.state.time).toFixed(2) });
}
console.table(rows);
const clears = rows.filter((r) => r.status === 'clear');
const times = clears.map((r) => r.time).sort((a, b) => a - b);
console.log(`クリア ${clears.length}/${rows.length}  時間 最短${times[0] ?? '-'}s 中央${times[Math.floor(times.length / 2)] ?? '-'}s 最長${times.at(-1) ?? '-'}s`);
