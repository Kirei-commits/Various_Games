// 手元での測定用（テストではない）: node tests/logic/measure.mjs
import { loadAll, seededRandom } from './helpers.mjs';
import { play } from './bot.mjs';
const mods = loadAll();
const N = Number(process.env.N || 150);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? '-';
const STAGE = Number(process.env.STAGE || 0);
const variant = (f) => ({ ...mods, D: { ...mods.D, units: mods.D.units.map(f) } });
function rate(m, policy = 'casual', opts = {}) {
  const res = [];
  for (let i = 0; i < N; i++) res.push(play(m, { policy, random: seededRandom(1000 + i * 7919), stage: STAGE, ...opts }));
  const won = res.filter((r) => r.state === 'won');
  return { rate: won.length / N, turns: median(won.map((r) => r.turns)), boss: res.filter((r) => r.wave >= 1).length / N };
}
const g = play(mods, { policy: 'greedy', stage: STAGE });
console.log('stage', STAGE, 'greedy', g.state, g.turns, 'hp', g.hp, 'wave', g.wave, JSON.stringify(g.stats));
console.log('casual', rate(mods));
console.log('casual noSS', rate(mods, 'casual', { ss: false }));
console.log('casual noCombo', rate(variant((u) => ({ ...u, combo: null }))));
console.log('casual noAbility', rate(variant((u) => ({ ...u, abilities: [] }))));
console.log('casual noElement', rate(variant((u) => ({ ...u, element: undefined, killers: [], combo: u.combo && { ...u.combo, element: undefined } }))));
console.log('random', rate(mods, 'random'));
