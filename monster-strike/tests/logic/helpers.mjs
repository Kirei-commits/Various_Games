/**
 * index.html から <script id="ms-physics"> だけを取り出して Node の vm で読み込む。
 * 物理モジュールは DOM に触れないので、ブラウザ抜きで検証できる。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function extract(html, id) {
  const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  if (!m) throw new Error(`${id} が見つからない`);
  return m[1];
}

/** 純粋なモジュール（物理・戦闘・データ）を読み込む。DOM は無い。 */
export function loadAll() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sandbox = { Math, JSON, Object, Array, Number, Infinity, NaN };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const id of ['ms-physics', 'ms-battle', 'ms-data', 'ms-meta']) {
    vm.runInContext(extract(html, id), sandbox, { filename: `index.html#${id}` });
  }
  return { P: sandbox.MSPhysics, B: sandbox.MSBattle, D: sandbox.MSData, M: sandbox.MSMeta };
}

export function loadPhysics() {
  return loadAll().P;
}

/** 本番と同じ始まり方: 味方を置いて、ウェーブ1を出す。stage はステージの番号（D.stages） */
export function newGame(mods, stage = 0) {
  const { P, B, D } = mods;
  const world = new P.World();
  for (const u of D.units) world.add({ id: u.id, kind: 'unit', shot: u.shot, x: u.x, y: u.y, r: u.r, abilities: B.Battle.abilityMap(u.abilities) });
  const battle = new B.Battle({ units: D.units, stage: D.stages ? D.stages[stage] : D.stage });
  battle.spawnWave(world);
  return { world, battle };
}

/**
 * 1発撃って止まるまで回す（倒した敵は途中で消える）。ダメージ記録を返す。
 * useSS なら SS を使う（本番と同じく beginShot → 初速に倍率 → setVelocity）。gauge はゲージショットの成否。
 */
export function shoot(world, battle, id, vx, vy, useSS = false, gauge = false) {
  const mods = battle.beginShot ? battle.beginShot(id, useSS, gauge) : null;
  const k = mods && mods.speed ? mods.speed : 1;
  world.setVelocity(id, vx * k, vy * k, mods);
  world.drainEvents();
  const records = [];
  for (let n = 0; n < 240 * 30 && !world.isSettled(); n++) {
    world.step();
    const ev = world.drainEvents();
    if (ev.length) records.push(...battle.apply(ev, world));
  }
  return records;
}

/** 本番と同じ配置（index.html の UNITS / TARGETS と揃える） */
export function standardWorld(P, cfg) {
  const w = new P.World(cfg);
  w.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 170, y: 660, r: 30 });
  w.add({ id: 'B', kind: 'unit', shot: 'pierce', x: 370, y: 660, r: 30 });
  w.add({ id: 't1', kind: 'target', x: 270, y: 300, r: 50 });
  w.add({ id: 't2', kind: 'target', x: 118, y: 470, r: 36 });
  w.add({ id: 't3', kind: 'target', x: 422, y: 470, r: 36 });
  return w;
}

/** 止まるまで回して、途中のイベントをすべて返す。 */
export function runUntilStop(w, maxSteps = 240 * 30) {
  const events = [];
  let n = 0;
  while (!w.isSettled() && n < maxSteps) {
    w.step();
    events.push(...w.drainEvents());
    n++;
  }
  return { events, steps: n, seconds: n * w.cfg.step };
}

/** 固定シードの擬似乱数（mulberry32）。 */
export function seededRandom(seed = 20260929) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
