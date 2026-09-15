/**
 * 記述式の採点。
 *
 * 設計の芯は「採点を人が読める形に保つ」こと。
 * 正誤は必ず **必須観点をすべて満たしたか** だけで決まり、
 * どの語がどこに一致したかを毎回そのまま返す。画面の「判定ログ」はこの戻り値の写し。
 *
 *   正解 = required のすべての観点で、any のどれか1語が入力に含まれる
 *   optional … 加点だけ（正誤には効かない）
 *   traps    … 典型的な誤解の検出だけ（正誤には効かない。ヒントの出し分けに使う）
 */
(function (global) {
  'use strict';
  const RR = (global.RR = global.RR || {});

  // NFKC のあとに落とす記号。= と + と - は落とさない（`==` が空文字になって
  // 「何にでも一致する needle」ができてしまう。Java の等価性の問題がこれで壊れる）。
  const STRIP = /[\s、。，．・「」『』〈〉《》()：；:;!?？！…‥"'`｢｣]/g;

  /** ひらがな → カタカナ。「えりー」と「エリー」を同じに扱うため。 */
  function toKatakana(s) {
    return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  }

  /** 比較のための基本形。全角半角・大文字小文字・区切り記号の差を消す。 */
  function normalize(input) {
    return String(input == null ? '' : input)
      .normalize('NFKC')
      .toLowerCase()
      .replace(STRIP, '');
  }

  /** さらに緩めた形。長音を落としてカタカナに寄せる（サーバ/サーバー、めんばー/メンバー）。 */
  function loosen(normalized) {
    return toKatakana(normalized).replace(/[ーー]/g, '');
  }

  /** 入力を一度だけ正規化して持ち回す */
  function prepare(input) {
    const norm = normalize(input);
    return { raw: String(input == null ? '' : input), norm, loose: loosen(norm) };
  }

  /** 語が入力に含まれるか。基本形で見て、外れたら緩めた形でもう一度見る。 */
  function contains(prepared, needle) {
    const n = normalize(needle);
    if (!n) return false;                    // 空の needle は誤って全一致するので必ず偽
    if (prepared.norm.includes(n)) return true;
    return prepared.loose.includes(loosen(n));
  }

  /** 観点1つを判定する。どの語で当たったかを残す（根拠の表示に使う） */
  function checkGroup(prepared, group) {
    let matched = null;
    for (const word of group.any) {
      if (contains(prepared, word)) { matched = word; break; }
    }
    return { key: group.key, any: group.any.slice(), why: group.why || '', hit: matched !== null, matched };
  }

  /**
   * 採点する。
   * @returns {{correct:boolean, prepared:object, required:object[], optional:object[],
   *            traps:object[], missing:object[], coverage:number}}
   */
  function evaluate(question, input) {
    const prepared = prepare(input);
    const c = question.criteria;
    const required = (c.required || []).map((g) => checkGroup(prepared, g));
    const optional = (c.optional || []).map((g) => checkGroup(prepared, g));
    const traps = (c.traps || []).map((g) => Object.assign(checkGroup(prepared, g), { hint: g.hint || '' }));
    const missing = required.filter((r) => !r.hit);

    return {
      correct: prepared.norm.length > 0 && missing.length === 0,
      prepared,
      required,
      optional,
      traps: traps.filter((t) => t.hit),
      allTraps: traps,
      missing,
      coverage: required.length ? (required.length - missing.length) / required.length : 0
    };
  }

  /** 画面と lint が同じ文言を使うための、合格条件の説明文 */
  const RULE_TEXT = '正解 = 必須観点のすべてで、候補語のいずれか1語が回答に含まれること。'
    + '加点観点と誤解検出は正誤に影響しない（評価点とヒントの出し分けにだけ使う）。';

  RR.Judge = { normalize, loosen, prepare, contains, checkGroup, evaluate, RULE_TEXT, STRIP };
})(typeof window !== 'undefined' ? window : globalThis);
