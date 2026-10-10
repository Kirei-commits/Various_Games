/**
 * バランスの測定。ボットに各ステージを遊ばせて、クリア率・かかった時間・拠点HPの残りを並べる。
 *   npm run measure                    → 主な組み合わせ
 *   node tools/measure.mjs 1,5,10 hard  → ステージと難易度を指定
 * 強化のレベルは「強化なし / 中くらい / ほぼ最大」の3通り。
 */
import { load, playOut } from '../tests/logic/helpers.mjs';

const ctx = load();
const stages = (process.argv[2] || '1,3,5,8,10,15,20,30,45,60,80,99').split(',').map(Number);
const diff = process.argv[3] || 'normal';
const RUNS = +(process.argv[4] || 4);
const METAS = {
  なし: {},
  中: { atk: 10, rate: 6, base: 6, ammo: 2, start: 1 },
  最大近く: { atk: 30, rate: 20, base: 20, ammo: 4, start: 3 }
};
console.log(`難易度: ${diff} / 各 ${RUNS} 回`);
console.log('ステージ | 強化 | クリア | 平均の時間 | 拠点HPの残り');
for (const n of stages) {
  for (const [name, meta] of Object.entries(METAS)) {
    let win = 0, t = 0, hp = 0;
    for (let s = 1; s <= RUNS; s++) {
      const r = playOut(ctx, { n, diff, seed: s, meta });
      if (r.win) win++;
      t += r.S.t; hp += r.S.baseHp / r.S.baseMax;
    }
    console.log(`${String(n).padStart(3)} | ${name.padEnd(4, '　')} | ${win}/${RUNS} | ${(t / RUNS).toFixed(0)}秒 | ${Math.round(hp / RUNS * 100)}%`);
  }
}
