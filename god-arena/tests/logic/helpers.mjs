/**
 * ブラウザ用のクラシックスクリプト(js/*.js)を Node 上で読み込むための補助。
 * window 名前空間だけを用意して vm で評価する。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string[]} files 読み込む js ファイル名 @param {object} extra window に足すもの */
export function loadGA(files = ['items.js', 'engine.js', 'ai.js'], extra = {}) {
  const sandbox = {
    window: Object.assign({ performance }, extra),
    performance, Date, Math, console, JSON, String, Number, Array, Object,
    Map, Set, Error, setTimeout, clearTimeout
  };
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.window.GA;
}

/**
 * 添字からよく散らばったシードを作る。
 * `seed = i * 31 + 7` のような等差の並びは mulberry32 の内部加算と噛み合って
 * 乱数列どうしが相関し、同じ実装でも系列によって勝率が 61% と 73% に分かれた。
 * 比較テストは必ずこれを通したシードで測る。
 */
export function mixSeed(i) {
  let x = ((i + 1) * 0x9E3779B1) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85EBCA6B) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
}

/** 固定シードの擬似乱数（mulberry32）。対戦結果をテストごとに変えないために使う。 */
export function seededRandom(seed = 20260911) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** vm の外へ持ち出して比較するための正規化 */
export const toPlain = (v) => JSON.parse(JSON.stringify(v));

/** 手札を指定のアイテムだけに差し替える。局面を組み立てるために使う。 */
export function setHand(GA, player, ids) {
  player.hand = ids.map((id) => GA.Items.instantiate(id));
  return player.hand;
}

/**
 * 決着まで自動対戦させる。全員AIが操作する。
 * @returns {{winner:number, turns:number, log:Array}}
 */
export function autoPlay(GA, state, levels, maxTurns = 600) {
  const { Engine, AI } = GA;
  let turns = 0;
  while (state.phase !== 'over' && turns < maxTurns) {
    turns++;
    if (state.phase === 'defense') {
      const d = Engine.byId(state, state.pending.targetId);
      Engine.defend(state, AI.chooseDefense(state, levels[d.id] || d.level));
      continue;
    }
    const p = Engine.current(state);
    const act = AI.chooseAction(state, levels[p.id] || p.level);
    if (act.type === 'attack') Engine.attack(state, act.targetId, act.uids);
    else if (act.type === 'use') Engine.useItem(state, act.uid, act.targetId);
    else Engine.pray(state);
  }
  return { winner: state.winner, turns, log: state.log };
}
