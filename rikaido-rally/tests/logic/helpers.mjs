/**
 * ロジックテストの補助。
 * ES モジュールになったので、テストは js/ をそのまま import する
 * （以前は vm でクラシックスクリプトを読み込んでいた。realm をまたぐぶん、比較で嵌まりやすかった）。
 */
import * as Rally from '../../js/core/rally.js';
import javaBank from '../../js/data/bank-java.js';
import kuwataBank from '../../js/data/bank-kuwata.js';

export const BANKS = [javaBank, kuwataBank];
export const bankById = (id) => BANKS.find((b) => b.id === id);

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
export function answerWith(session, wrongTimes, text) {
  for (let i = 0; i < wrongTimes; i++) Rally.submit(session, 'ぜんぜん違うことを書きます');
  const q = Rally.current(session);
  return Rally.submit(session, text === undefined ? q.model : text);
}

/** ラリー1本を、毎問 wrongTimes 回だけ間違えながら最後まで通す。 */
export function runRally(bank, wrongTimes = 0, seed = 12345, history = {}) {
  const s = Rally.create(typeof bank === 'string' ? bankById(bank) : bank, history, seed);
  for (let i = 0; i < s.size; i++) {
    answerWith(s, wrongTimes);
    Rally.advance(s);
  }
  return s;
}
