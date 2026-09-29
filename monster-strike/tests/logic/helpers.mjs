/**
 * index.html から <script id="ms-physics"> だけを取り出して Node の vm で読み込む。
 * 物理モジュールは DOM に触れないので、ブラウザ抜きで検証できる。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadPhysics() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<script id="ms-physics">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('ms-physics が見つからない');
  const sandbox = { Math, JSON, Object, Array, Number, Infinity, NaN };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: 'index.html#ms-physics' });
  return sandbox.MSPhysics;
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
