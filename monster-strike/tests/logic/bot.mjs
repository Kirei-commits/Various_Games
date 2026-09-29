/**
 * バランス測定用の自動プレイ。
 *  greedy : 候補の撃ち方をすべて先読みして、いちばん良い一発を選ぶ（上手なプレイヤー）
 *  casual : でたらめな撃ち方を4つ思い浮かべて、その中でいちばん良いもの（ふつうのプレイヤー）
 *  random : 向きも強さもでたらめ（下手なプレイヤー）
 */
import { newGame, shoot } from './helpers.mjs';

const ANGLES = 36;
const POWERS = [0.45, 1];

function candidates(P, cfg) {
  const out = [];
  for (let a = 0; a < ANGLES; a++) {
    const ang = (a + 0.5) / ANGLES * Math.PI * 2;
    for (const p of POWERS) {
      const sp = cfg.speed.min + (cfg.speed.max - cfg.speed.min) * p;
      out.push([Math.cos(ang) * sp, Math.sin(ang) * sp]);
    }
  }
  return out;
}

function randomShot(cfg, random) {
  const ang = random() * Math.PI * 2;
  const sp = cfg.speed.min + (cfg.speed.max - cfg.speed.min) * random();
  return [Math.cos(ang) * sp, Math.sin(ang) * sp];
}

/** 先読みの評価: 与ダメージ + 撃破ボーナス。攻撃が近い敵を優先して倒す */
function score(battle, records) {
  let s = 0;
  for (const r of records) {
    s += r.damage;
    if (r.killed) {
      const e = battle.enemy(r.enemy);
      s += 4000 + 3000 / Math.max(1, e.counter);
    }
  }
  return s;
}

export function play(mods, { policy = 'greedy', random = Math.random, maxTurns = 80 } = {}) {
  const { P, D } = mods;
  const { world, battle } = newGame(mods);
  const order = D.units.map((u) => u.id);
  const cands = candidates(P, world.cfg);
  let active = 0;
  while (battle.state === 'playing' && battle.turn <= maxTurns) {
    const id = order[active];
    let v;
    if (policy === 'greedy' || policy === 'casual') {
      let best = -1;
      const pool = policy === 'greedy' ? cands : Array.from({ length: 4 }, () => randomShot(world.cfg, random));
      for (const c of pool) {
        const w = world.clone();
        const b = battle.clone();
        const s = score(b, shoot(w, b, id, c[0], c[1]));
        if (s > best) { best = s; v = c; }
      }
    } else {
      v = randomShot(world.cfg, random);
    }
    shoot(world, battle, id, v[0], v[1]);
    battle.endTurn(world);
    active = (active + 1) % order.length;
  }
  return { state: battle.state, turns: battle.turn - 1, hp: battle.teamHp, wave: battle.wave, stats: battle.stats };
}
