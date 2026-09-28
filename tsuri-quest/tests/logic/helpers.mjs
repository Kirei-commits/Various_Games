/**
 * ブラウザ用のクラシックスクリプト(js/*.js)を Node 上で読み込むための補助。
 * 各ファイルは globalThis に FQ 名前空間を生やすので、vm の sandbox を渡せばよい。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ALL = [
  'fish.js', 'progress.js', 'angler.js', 'world.js', 'gear.js', 'parts.js', 'boost.js',
  'bonus.js', 'achievements.js', 'storage.js', 'account.js', 'tackle.js', 'game.js'
];

/**
 * @param {string[]} files 読み込む js ファイル名（index.html と同じ順序で渡すこと）
 * @param {object} extra sandbox に足すもの（localStorage のスタブなど）
 */
export function loadFQ(files = ALL, extra = {}) {
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Infinity, NaN,
    ...extra
  };
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.FQ;
}

/**
 * vm の中で作られた配列/オブジェクトは別realmのため deepStrictEqual が通らない。
 * 比較する前にこの関数でプレーンな値へ正規化する。
 */
export const toPlain = (v) => JSON.parse(JSON.stringify(v));

/** 固定シードの擬似乱数（mulberry32）。テストを決定的にするため。 */
export function seededRandom(seed = 20260906) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 決まった値を順に返す乱数。境界の検証に使う。 */
export function scriptedRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** localStorage の最小スタブ。throwOn に 'get'/'set' を入れると例外を投げる。 */
export function fakeStorage(throwOn = []) {
  const map = new Map();
  return {
    getItem(k) {
      if (throwOn.includes('get')) throw new Error('denied');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (throwOn.includes('set')) throw new Error('denied');
      map.set(k, String(v));
    },
    removeItem(k) {
      if (throwOn.includes('remove')) throw new Error('denied');
      map.delete(k);
    },
    _map: map
  };
}

/**
 * 状態機械を「巻く／緩める」を自動で切り替えながら回す簡易オートパイロット。
 * 既定では糸の限界から一定の余裕を残して離す＝腕のあるプレイヤー。
 * high を絶対値で渡すと「糸の強さを考えずに同じ力で巻く」荒いプレイヤーになり、
 * 装備の差がバラシ率に出る。
 * @returns {{type:string, reason?:string, elapsed:number}} 決着したイベント
 */
export function autoFight(game, { dt = 16, low = 0.25, high = null, marginFromBreak = 0.12, maxMs = 60000 } = {}) {
  let elapsed = 0;
  while (elapsed < maxMs) {
    const s = game.state;
    if (s.phase === 'fight') {
      const ceiling = high == null ? s.breakAt - marginFromBreak : high;
      if (s.tension >= ceiling) game.setReeling(false);
      else if (s.tension <= low) game.setReeling(true);
    }
    const ev = game.tick(dt);
    elapsed += dt;
    if (ev && (ev.type === 'landed' || ev.type === 'missed')) return { ...ev, elapsed };
  }
  return { type: 'timeout', elapsed };
}
