/**
 * 調整値を変えたときの測定（テストではない）。理論値と、実際の抽選・物理をまわした実測値を並べる。
 *   npm run measure            … 既定の回数
 *   npm run measure -- --big   … 回数を10倍（時間がかかる）
 * 先に npm run build しておくこと（index.html の中身を測る）。
 */
import { load, drawMany, simulateRush, shoot } from '../tests/logic/helpers.mjs';

const big = process.argv.includes('--big') ? 10 : 1;
const mods = load(), { cfg, Spec } = mods, T = cfg.targets;
const th = Spec.theory(cfg);
const pct = v => (v * 100).toFixed(2) + '%', den = v => '1/' + (1 / v).toFixed(1);
const rows = [];
const row = (name, theory, actual, ok) => rows.push([name, theory, actual, ok == null ? '' : ok ? 'OK' : '目標外']);

const n = 400000 * big, hits = drawMany(mods, n, { seed: 21 }).filter(h => h.hit).length;
row('大当り確率', `${den(th.hitProb)}（${th.hitThreshold}/${cfg.spec.randRange}）`, `${den(hits / n)}（${n}回）`);
const cont = simulateRush(mods, 20000 * big);
row('RUSH継続率', `${pct(th.continuation)}（${den(th.rushProb)}×${cfg.spec.rush.stSpins}）`, pct(cont), cont >= T.continuation[0] - 0.01 && cont <= T.continuation[1] + 0.01);
row('平均連チャン', th.expectedChains.toFixed(2) + '連', (1 / (1 - cont)).toFixed(2) + '連');
const hs = drawMany(mods, 30000 * big, { seed: 22, force: 'hit' });
const fever = hs.filter(h => h.kind === 'fever').length / hs.length;
row('FEVER振り分け', pct(th.feverRate), pct(fever), fever >= T.feverRate[0] && fever <= T.feverRate[1]);
row('初当り1回の期待出玉', Math.round(th.payoutPerFirstHit) + '個', '-');
const ms = drawMany(mods, 200000 * big, { seed: 23, raw: cfg.spec.randRange - 1 });
row('ハズレSPリーチ率', pct(th.reach.miss.sp), pct(ms.filter(h => h.sc.reach === 'sp').length / ms.length));
for (const [k, v] of Object.entries(th.cues)) {
  const hot = v.reliability >= 0.5;
  row(`信頼度 ${k}`, pct(v.reliability), `当り${pct(v.hit)} / ハズレ${v.miss.toExponential(1)}`, hot ? v.reliability >= T.hotReliability : null);
}
let heso = 0, la = 0, stuck = 0;
for (const seed of [1, 2, 3, 4]) { const s = shoot(mods, { balls: 500 * big, seed }); heso += s.heso; la += s.launched; stuck += s.stuck; }
row('ヘソ入賞率（左打ち）', `${den(T.hesoRate[1])}〜${den(T.hesoRate[0])}（目標）`, `${den(heso / la)}（${la}球）`, heso / la >= T.hesoRate[0] && heso / la <= T.hesoRate[1]);
const at = shoot(mods, { balls: 400 * big, strong: true, attacker: true, seed: 5 });
row('アタッカー捕捉率', `${pct(T.attackerCatch)}以上（目標）`, pct(at.attacker / at.launched), at.attacker / at.launched >= T.attackerCatch);
const dc = shoot(mods, { balls: 400 * big, strong: true, denchu: true, seed: 6 });
row('電チュー捕捉率', `${pct(T.denchuCatch)}以上（目標）`, pct(dc.denchu / dc.launched), dc.denchu / dc.launched >= T.denchuCatch);
row('止まり球', '0', String(stuck + at.stuck + dc.stuck), stuck + at.stuck + dc.stuck === 0);

const w = [0, 0, 0].map((_, i) => Math.max(...rows.map(r => [...r[i]].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 2 : 1), 0))));
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 2 : 1), 0)));
console.log(pad('項目', w[0]) + '  ' + pad('理論値', w[1]) + '  ' + pad('実測値', w[2]) + '  判定');
for (const r of rows) console.log(pad(r[0], w[0]) + '  ' + pad(r[1], w[1]) + '  ' + pad(r[2], w[2]) + '  ' + r[3]);
if (rows.some(r => r[3] === '目標外')) { console.log('\n目標外の項目があります（src/pure/config.js の targets）'); process.exitCode = 1; }
