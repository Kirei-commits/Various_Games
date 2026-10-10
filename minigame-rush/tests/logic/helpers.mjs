/**
 * index.html から純粋なモジュール（mgr-legion-*）を取り出して Node の vm で読み込む。
 * ブラウザに配るのと同じ中身をテストする（src/ を直接読むのではない）。
 * 測定（tools/measure.mjs）とテストの両方から使う。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IDS = ['mgr-legion-config', 'mgr-legion-stage', 'mgr-legion-sim', 'mgr-legion-bot'];

export function load() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sandbox = { Math, JSON, Object, Array, Number, Set, Map, Infinity, NaN };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const id of IDS) {
    const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
    if (!m) throw new Error(`${id} が見つからない`);
    vm.runInContext(m[1], sandbox, { filename: `index.html#${id}` });
  }
  const L = sandbox.MGR.Legion;
  return { L, cfg: L.CONFIG };
}

/** シード付き乱数 */
export const seeded = (L, seed) => L.Stage.rng32(L.Stage.mixSeed(seed));

/** 新しいプレイを作る。events に emit された出来事がたまる */
export function newSim({ L, cfg }, { n = 1, diff = 'normal', seed = 1, meta = {}, endless = false } = {}) {
  const stage = endless ? L.Stage.endless(cfg, diff, seed) : L.Stage.build(cfg, n, diff);
  const events = [];
  const sim = L.createSim(cfg, { stage, rng: seeded(L, seed * 31 + n), meta, emit: (t, d) => events.push([t, d]) });
  return { sim, stage, events, S: sim.S };
}

/** ボットに最後まで遊ばせる。maxSec を過ぎたら打ち切る */
export function playOut(ctx, opts = {}) {
  const { L, cfg } = ctx;
  const { sim, stage } = newSim(ctx, opts);
  const bot = L.createBot(cfg, sim, seeded(L, (opts.seed || 1) + 999), { skill: opts.skill ?? 0.8 });
  const dt = 1 / 30, maxF = (opts.maxSec || 400) / dt;
  let f = 0;
  while ((sim.S.phase === 'play' || sim.S.phase === 'choice') && f < maxF) { bot.step(dt); sim.update(dt); f++; }
  return { sim, S: sim.S, stage, win: sim.S.phase === 'win', stars: sim.stars() };
}

/** 盤面の (col,row) に武器を置く */
export function put(S, col, row, w) { S.board[row][col] = { w, off: 0 }; }
