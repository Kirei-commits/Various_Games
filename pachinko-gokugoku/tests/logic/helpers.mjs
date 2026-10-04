/**
 * index.html から純粋なモジュール（pg-config / pg-spec / pg-physics）を取り出して Node の vm で読み込む。
 * ブラウザに配るのと同じ中身をテストする（src/ を直接読むのではない）。
 * 測定（tools/measure.mjs）とテストの両方から使う。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function load(overrides) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sandbox = { Math, JSON, Object, Array, Number, Float32Array, Infinity, NaN };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const id of ['pg-config', 'pg-spec', 'pg-physics']) {
    const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
    if (!m) throw new Error(`${id} が見つからない`);
    vm.runInContext(m[1], sandbox, { filename: `index.html#${id}` });
  }
  const PG = sandbox.PG;
  const cfg = overrides ? merge(structuredClone(PG.CONFIG), overrides) : PG.CONFIG;
  return { PG, cfg, Spec: PG.Spec };
}
function merge(a, b) { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) merge(a[k], b[k]); else a[k] = b[k]; } return a; }

/** シード付き乱数（mulberry32）。[0,1) */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const SETTINGS = { prob: 319.6, preread: false, sakibare: 0 };

/** 抽選を n 回。raw は乱数の範囲で一様（実機と同じ）。結果の保留を cb に渡す */
export function drawMany({ cfg, Spec }, n, { seed = 1, isRush = false, force = null, settings = SETTINGS, raw = null } = {}) {
  const rng = seeded(seed), lot = Spec.createLottery(cfg, rng), R = cfg.spec.randRange, out = [];
  for (let i = 0; i < n; i++) out.push(lot.draw(raw == null ? (rng() * R) | 0 : raw, isRush, force, settings));
  return out;
}

/** RUSH を sets 回まわして、継続した割合を数える（ST の回転数ぶん抽選し、1回でも当れば継続） */
export function simulateRush({ cfg, Spec }, sets, seed = 7) {
  const rng = seeded(seed), lot = Spec.createLottery(cfg, rng), R = cfg.spec.randRange, N = cfg.spec.rush.stSpins;
  let cont = 0;
  for (let s = 0; s < sets; s++) {
    for (let i = 0; i < N; i++) if (lot.draw((rng() * R) | 0, true, null, SETTINGS).hit) { cont++; break; }
  }
  return cont / sets;
}

/**
 * 物理で球を打つ。strong=右打ち。gates はアタッカー・電チューを開けっぱなしにするか。
 * 返り値は物理の統計（launched / heso / attacker / denchu / out / stuck …）と、盤面の外へ出た球の数。
 */
export function shoot({ PG, cfg }, { balls = 500, strong = false, attacker = false, denchu = false, seed = 3, interval = 36 } = {}) {
  const rng = seeded(seed);
  const phys = PG.createPhysics(cfg, { rng, emit() { }, gates: { denchuOpen: () => denchu, attackerOpen: () => attacker } });
  let escaped = 0;
  const { W, H } = cfg.layout;
  for (let f = 0; phys.stats.launched < balls || phys.active() > 0; f++) {
    if (f % interval === 0 && phys.stats.launched < balls) phys.launch(strong);
    phys.update(1 / 60);
    for (const b of phys.balls) if (b.on && (b.x < 0 || b.x > W || b.y < 0 || b.y > H)) { escaped++; b.on = false; }
    if (f > 60 * 60 * 10) throw new Error('球が盤面から消えない');
  }
  return { ...phys.stats, escaped };
}
