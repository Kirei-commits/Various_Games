/**
 * バランスの測定：放っておいたときに何秒で太陽に届くか（ゲームオーバーにならないか）を seed ごとに並べる。
 *   node tools/measure.mjs [seedの数=10] [設定の上書き JSON]
 *   例: node tools/measure.mjs 20 '{"spawnInterval":0.2}'
 */
import { loadEngine } from '../tests/engine.mjs';

const E = loadEngine();
const n = Number(process.argv[2] || 10);
const over = JSON.parse(process.argv[3] || '{}');
const rows = [];
for (let seed = 1; seed <= n; seed++) {
  const t0 = performance.now();
  const g = E.createGame({ seed, ...over });
  let maxBalls = 0;
  while (g.state.status === 'running' && g.state.time < 600) {
    g.advance(1);
    maxBalls = Math.max(maxBalls, g.state.balls.length);
  }
  const ms = performance.now() - t0;
  rows.push({ seed, status: g.state.status, time: Math.round(g.state.time), maxTier: g.state.maxTier, merges: g.state.merges, maxBalls, msPerSec: +(ms / g.state.time).toFixed(2) });
}
console.table(rows);
const clears = rows.filter((r) => r.status === 'clear');
const times = clears.map((r) => r.time).sort((a, b) => a - b);
console.log(`クリア ${clears.length}/${rows.length}  時間 最短${times[0] ?? '-'}s 中央${times[Math.floor(times.length / 2)] ?? '-'}s 最長${times.at(-1) ?? '-'}s`);
