/**
 * ヒントの段階。
 *
 * 「不正解であれば正解になるまでヒントを出す」を、行き止まりが無い形で実装する。
 * 段階は必ず下へ進み、最後は模範解答を開示する。そこまで行けば必ず正解にできる
 * （tests/lint.mjs が「模範解答は自分の採点基準で必ず正解になる」を検査している）。
 *
 *   1回目 … 観点ヒント（足りない観点の名前だけ。誤解を検出していればそれを先に指摘）
 *   2回目 … 著者が書いた具体ヒント その1
 *   3回目 … 著者が書いた具体ヒント その2（無ければ頭出しへ繰り上げ）
 *   4回目 … 頭出し（不足している語を 1文字目＋伏字＋文字数で見せる）
 *   5回目 … 模範解答を開示（以後は「自分の言葉で書き直す」ことだけが残る）
 */
(function (global) {
  'use strict';
  const RR = (global.RR = global.RR || {});

  const STAGES = [
    { stage: 1, kind: 'focus',  label: '観点',     desc: '足りない観点の名前だけを伝える' },
    { stage: 2, kind: 'author', label: 'ヒント1',  desc: '問題ごとに用意した誘導' },
    { stage: 3, kind: 'author', label: 'ヒント2',  desc: 'さらに絞り込む誘導' },
    { stage: 4, kind: 'mask',   label: '頭出し',   desc: '不足語の1文字目と文字数' },
    { stage: 5, kind: 'reveal', label: '模範解答', desc: '開示。自分の言葉で書き直して通過する' }
  ];

  /** 「equals」→「e○○○○○（6文字）」 */
  function mask(word) {
    const s = String(word);
    if (s.length <= 1) return `${s}（1文字）`;
    return `${s[0]}${'○'.repeat(s.length - 1)}（${s.length}文字）`;
  }

  const listKeys = (groups) => groups.map((g) => `「${g.key}」`).join('、');

  /**
   * 次に出すヒントを決める。
   * @param {object} question 問題
   * @param {object} result   Judge.evaluate の戻り値
   * @param {number} attempt  今回を含めた誤答回数（1始まり）
   */
  function next(question, result, attempt) {
    const n = Math.min(attempt, STAGES.length);
    const meta = STAGES[n - 1];
    const authored = question.hints || [];
    const missing = result.missing;

    if (meta.kind === 'focus') {
      const trap = result.traps[0];
      const head = trap && trap.hint ? `${trap.hint}\n` : '';
      const body = missing.length
        ? `まだ触れられていない観点が ${missing.length} 個あります：${listKeys(missing)}`
        : '書き方は惜しいです。もう少し具体的な言葉で言い換えてみてください。';
      return { stage: n, kind: 'focus', label: meta.label, text: head + body, reveal: false };
    }

    if (meta.kind === 'author') {
      const idx = n - 2;                       // stage2 → hints[0], stage3 → hints[1]
      if (authored[idx]) {
        return { stage: n, kind: 'author', label: meta.label, text: authored[idx], reveal: false };
      }
      // 用意が無ければ頭出しへ繰り上げる（段階が空振りして足踏みするのを避ける）
      return maskHint(n, missing, meta.label);
    }

    if (meta.kind === 'mask') return maskHint(n, missing, meta.label);

    return {
      stage: n, kind: 'reveal', label: meta.label, reveal: true,
      text: `模範解答：${question.model}\n\n読んだうえで、もう一度あなたの言葉で書いてください。`
        + '（この問題は最低点での通過になります）'
    };
  }

  function maskHint(stage, missing, label) {
    if (!missing.length) {
      return { stage, kind: 'mask', label, reveal: false, text: '必要な語はすべて揃っています。文として繋げて書いてみてください。' };
    }
    const lines = missing.map((g) => `・「${g.key}」… ${mask(g.any[0])}`);
    return { stage, kind: 'mask', label, reveal: false, text: '不足している言葉の頭出しです。\n' + lines.join('\n') };
  }

  RR.Hint = { STAGES, mask, next, REVEAL_STAGE: STAGES.length };
})(typeof window !== 'undefined' ? window : globalThis);
