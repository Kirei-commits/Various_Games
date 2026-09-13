/**
 * ブラウザ用のクラシックスクリプト(js/*.js)を Node 上で読み込むための補助。
 * window 名前空間だけ用意して vm で評価する（god-arena と同じ作り）。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadGF(files = ['data.js', 'engine.js', 'bot.js'], extra = {}) {
  const sandbox = {
    window: Object.assign({ performance }, extra),
    performance, Date, Math, console, JSON, String, Number, Array, Object,
    Map, Set, Error, setTimeout, clearTimeout
  };
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.window.GF;
}

/**
 * 添字からよく散らばったシードを作る。
 * 等差のシードは mulberry32 の内部加算と噛み合って乱数列どうしが相関する
 * （god-arena で勝率が系列ごとに割れた）。比較のときは必ずこれを通す。
 */
export function mixSeed(i) {
  let x = ((i + 1) * 0x9E3779B1) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85EBCA6B) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
}

export function seededRandom(seed = 20260913) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const toPlain = (v) => JSON.parse(JSON.stringify(v));
