/**
 * ブラウザ用のクラシックスクリプト(js/*.js)を Node 上で読み込むための補助。
 * window 名前空間だけを用意して vm で評価する。render.js と main.js は DOM を触るので読まない。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const DEFAULT_FILES = [
  'judge.js', 'grade.js', 'hint.js', 'banks.js', 'bank-java.js', 'bank-kuwata.js', 'rally.js', 'storage.js'
];

export function loadRR(files = DEFAULT_FILES, extra = {}) {
  const sandbox = {
    window: Object.assign({}, extra),
    console, JSON, Math, Date, String, Number, Array, Object, Map, Set, Error
  };
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.window.RR;
}

/** localStorage の代わり。例外を投げる版も作れるようにしてある。 */
export function fakeStorage({ throwOnGet = false, throwOnSet = false } = {}) {
  const map = new Map();
  return {
    getItem(k) { if (throwOnGet) throw new Error('blocked'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (throwOnSet) throw new Error('quota'); map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _map: map
  };
}

/** 1問を、指定した回数だけ間違えてから模範解答で通す。 */
export function answerWith(RR, session, wrongTimes, text) {
  for (let i = 0; i < wrongTimes; i++) RR.Rally.submit(session, 'ぜんぜん違うことを書きます');
  const q = RR.Rally.current(session);
  return RR.Rally.submit(session, text === undefined ? q.model : text);
}

/** ラリー1本を、毎問 wrongTimes 回だけ間違えながら最後まで通す。 */
export function runRally(RR, bankId, wrongTimes = 0, seed = 12345, history = {}) {
  const s = RR.Rally.create(bankId, history, seed);
  for (let i = 0; i < s.size; i++) {
    answerWith(RR, s, wrongTimes);
    RR.Rally.advance(s);
  }
  return s;
}
