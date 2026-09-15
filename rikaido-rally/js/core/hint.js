/**
 * ヒントの段階。
 *
 * 3段。どの段も「それ単体で手がかりになる」ことを条件にしている。
 * 以前は1段目に「足りない観点の名前」を出していたが、
 * 受講者にとっては答えに近づかないただの足踏みだった（くどい、と言われた）のでやめた。
 *
 *   1段目 … 手がかり。問題ごとに用意した誘導をそのまま出す
 *   2段目 … しぼる。選択式なら誤答を1つ消す。記述式なら不足語を頭出しする
 *   3段目 … 答え。正解を開示する（選択式は正解の選択肢、記述式は模範解答）
 *
 * 3段目まで行けば必ず通れる。行き止まりを作らないための決まり。
 */

export const STAGES = [
  { stage: 1, kind: 'author', label: '手がかり', desc: '問題ごとに用意した誘導' },
  { stage: 2, kind: 'narrow', label: 'しぼる', desc: '選択式は誤答を1つ消す／記述式は不足語の頭出し' },
  { stage: 3, kind: 'reveal', label: '答え', desc: '正解を開示する' }
];

export const REVEAL_STAGE = STAGES.length;

/** 「equals」→「e○○○○○（6文字）」 */
export function mask(word) {
  const s = String(word);
  if (s.length <= 1) return `${s}（1文字）`;
  return `${s[0]}${'○'.repeat(s.length - 1)}（${s.length}文字）`;
}

/**
 * 次に出すヒントを決める。
 *
 * @param {object} question 問題
 * @param {object} ctx
 * @param {number} ctx.attempt   今回を含めた誤答回数（1始まり）
 * @param {object} ctx.result    記述式のときの Judge.evaluate の戻り値
 * @param {boolean} ctx.choiceMode 選択式で出しているか
 * @param {string} ctx.eliminated 2段目で消した選択肢の文言（rally が決めて渡す）
 * @returns {{stage:number, kind:string, label:string, text:string, reveal:boolean}}
 */
export function next(question, { attempt = 1, result = null, choiceMode = false, eliminated = '' } = {}) {
  const n = Math.min(Math.max(1, attempt), REVEAL_STAGE);
  const meta = STAGES[n - 1];
  const authored = question.hints || [];

  if (meta.kind === 'author') {
    // 誤解を検出していたら、まずそれを指摘してから誘導を出す
    const trap = result && result.traps && result.traps[0];
    const head = trap && trap.hint ? `${trap.hint}\n` : '';
    const body = authored[0] || 'もう一度、問われていることだけに絞って考えてみてください。';
    return { stage: n, kind: 'author', label: meta.label, text: head + body, reveal: false };
  }

  if (meta.kind === 'narrow') {
    if (choiceMode) {
      const text = eliminated
        ? `ちがう選択肢を1つ消しました（「${eliminated}」）。残りから選んでください。`
        : '残りの選択肢から選んでください。';
      const extra = authored[1] ? `\n${authored[1]}` : '';
      return { stage: n, kind: 'narrow', label: meta.label, text: text + extra, reveal: false };
    }
    if (authored[1]) {
      return { stage: n, kind: 'narrow', label: meta.label, text: authored[1], reveal: false };
    }
    return maskHint(n, meta.label, result);
  }

  return {
    stage: n, kind: 'reveal', label: meta.label, reveal: true,
    text: choiceMode
      ? `答えは「${correctChoice(question)}」です。選んで次へ進んでください。`
      : `模範解答：${question.model}\n\n読んだうえで、もう一度あなたの言葉で書いてください。`
  };
}

/** 記述式の2段目。不足している語を1文字目と文字数だけ見せる。 */
function maskHint(stage, label, result) {
  const missing = (result && result.missing) || [];
  if (!missing.length) {
    return {
      stage, kind: 'narrow', label, reveal: false,
      text: '必要な言葉は揃っています。文として繋げて書いてみてください。'
    };
  }
  const lines = missing.map((g) => `・「${g.key}」… ${mask(g.any[0])}`);
  return { stage, kind: 'narrow', label, reveal: false, text: '足りない言葉の頭出しです。\n' + lines.join('\n') };
}

/** 選択式の正解。データの決まりとして choices の先頭が正解。 */
export const correctChoice = (question) => (question.choices || [])[0] || question.model;
