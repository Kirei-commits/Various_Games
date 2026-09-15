/**
 * ロジックテストの補助。
 * ES モジュールになったので、テストは js/ をそのまま import する
 * （以前は vm でクラシックスクリプトを読み込んでいた。realm をまたぐぶん、比較で嵌まりやすかった）。
 */
import * as Rally from '../../js/core/rally.js';
import * as Choice from '../../js/core/choice.js';
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

/** いまの問題に正しく答える。選択式なら正解の選択肢、記述式なら模範解答。 */
export function answerCorrectly(session) {
  const q = Rally.current(session);
  return Rally.currentRecord(session).choiceMode
    ? Rally.choose(session, Choice.correctText(q))
    : Rally.submit(session, q.model);
}

/**
 * いまの問題にわざと間違える。
 * 未選択の誤答が尽きたら、前に選んだ誤答をもう一度選ぶ。
 * ここで正解に落ちると「間違え続ける」テストが成立しなくなる（実際にそれで取り違えた）。
 */
export function answerWrong(session) {
  const q = Rally.current(session);
  const rec = Rally.currentRecord(session);
  if (!rec.choiceMode) return Rally.submit(session, 'ぜんぜん違うことを書きます');
  const wrongs = rec.choiceOrder.filter((c) => !Choice.isCorrect(q, c));
  const fresh = wrongs.find((c) => !rec.eliminated.includes(c) && !rec.inputs.some((i) => i.text === c));
  return Rally.choose(session, fresh ?? wrongs[0]);
}

/** 1問を、指定した回数だけ間違えてから正解で通す。 */
export function answerWith(session, wrongTimes) {
  for (let i = 0; i < wrongTimes; i++) answerWrong(session);
  return answerCorrectly(session);
}

/** ラリー1本を、毎問 wrongTimes 回だけ間違えながら最後まで通す。 */
export function runRally(bank, wrongTimes = 0, seed = 12345, options = {}) {
  const s = Rally.create(typeof bank === 'string' ? bankById(bank) : bank,
    options.history || {}, { seed, ...options });
  for (let i = 0; i < s.size; i++) {
    answerWith(s, wrongTimes);
    Rally.advance(s);
  }
  return s;
}
