/**
 * 選択式のための小さな決まりごと。
 *
 * **データの規約：`choices` の先頭が正解。** 残りは誤答。
 * 問題を書く側はこれだけ守ればよく、表示の順番はここで毎回混ぜる
 * （データに「正解は3番目」のような並びを持たせると、書くのも直すのも間違えやすい）。
 */

export const MIN_CHOICES = 3;
export const MAX_CHOICES = 5;

export const hasChoices = (q) =>
  Array.isArray(q && q.choices) && q.choices.length >= MIN_CHOICES;

/** 正解の選択肢（＝先頭） */
export const correctText = (q) => (q.choices || [])[0];

/** その選択肢が正解か。表示は混ぜてあるので、必ず文言で照合する。 */
export const isCorrect = (q, text) => correctText(q) === text;

/**
 * 表示順を決める。シードつきの乱数を渡すので、同じラリーなら並びも再現できる。
 * Fisher-Yates。並びが毎回同じだと「いつも2番目」が学習されてしまう。
 */
export function order(q, rng = Math.random) {
  const out = (q.choices || []).slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * ヒントで消す選択肢を1つ選ぶ。正解と、すでに消したものは選ばない。
 * @returns {string|null} 消す選択肢の文言。消せるものが無ければ null
 */
export function pickEliminated(q, eliminated = [], rng = Math.random) {
  const wrong = (q.choices || []).slice(1).filter((c) => !eliminated.includes(c));
  if (!wrong.length) return null;
  return wrong[Math.floor(rng() * wrong.length)];
}
