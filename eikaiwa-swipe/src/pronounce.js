/*
 * 発音チェックの分析（純粋関数。Node でテストできる）。
 *
 * ブラウザの音声認識が「何と聞き取ったか」と、お手本の文を単語ごとに突き合わせ、
 * 合わなかった単語について、日本語話者がつまずきやすい音（th・R/L・V/B・語尾の子音など）の
 * どれに当たりそうかを推定して、直し方のヒントを返す。
 * 音声認識の聞き取り結果に基づく目安であって、音声そのものを分析しているわけではない。
 */
import { normalizeEn } from "./logic.js";
import { tr } from "./i18n.js";

/** 文の中で弱く短く発音されやすい語（機能語） */
const FUNCTION_WORDS = new Set([
  "a", "an", "the", "to", "of", "and", "or", "but", "at", "in", "on", "for", "with", "from", "as",
  "is", "am", "are", "was", "were", "be", "been", "do", "does", "did", "have", "has", "had",
  "can", "could", "will", "would", "should", "it", "you", "your", "i", "me", "my", "we", "us", "he", "him",
  "she", "her", "they", "them", "that", "this", "there", "not", "so", "if", "just", "up",
]);

export const ISSUE_TIPS = {
  get th() { return tr("th は、舌先を上の歯に軽く当てて息を出す音です。s・z・d・t に聞こえやすいので、舌を少し前に出して言ってみましょう。", "For th, touch your tongue tip lightly to your upper teeth and push air out. It's easily heard as s, z, d or t, so try putting your tongue a little further forward."); },
  get rl() { return tr("R と L の区別です。R は舌をどこにも付けずに奥へ引き、L は舌先を上の歯ぐきに付けて出します。", "R vs L: for R, pull your tongue back without touching anything; for L, touch your tongue tip to the ridge behind your upper teeth."); },
  get vb() { return tr("V は上の歯を下唇に軽く当てて出す音です（B は両唇を閉じる音）。唇をかむように当てて言ってみましょう。", "V is made with your upper teeth lightly on your lower lip (B closes both lips). Try it as if gently biting your lip."); },
  get fh() { return tr("F は上の歯を下唇に当てて息を出す音です。日本語の「フ」より摩擦を強くしてみましょう。", "F is made by putting your upper teeth on your lower lip and blowing. Make more friction than the Japanese “fu.”"); },
  get sh() { return tr("S と SH の区別です。SH は唇を少し丸めて「シュ」、S は歯の裏で「ス」と出します。", "S vs SH: for SH round your lips a little (“sh”); for S, make the sound behind your teeth (“s”)."); },
  get final() { return tr("語尾の子音が弱く、聞き取られませんでした。最後の音まで息を止めずに言い切りましょう（母音を足して「〜ト」「〜ク」にしない）。", "The final consonant was too weak to be heard. Say it all the way to the last sound (without adding a vowel like “-to” or “-ku”)."); },
  get vowel() { return tr("母音が違って聞こえました。お手本の母音（口の開き方・長さ）をよく聞いてまねしましょう。", "The vowel sounded different. Listen closely to the model's vowel (mouth shape and length) and copy it."); },
  get weak() { return tr("文の中で弱く短く発音される語です。消えてしまわないよう、前後の語につなげて軽く・速く添えましょう。", "This word is said weakly and quickly in a sentence. Link it lightly to the words around it so it doesn't disappear."); },
  get missing() { return tr("聞き取られませんでした。この語をはっきり発音してみましょう。", "This wasn't heard. Try saying the word clearly."); },
  get other() { return tr("違う語に聞こえました。お手本をもう一度聞いて、どこが違うか比べてみましょう。", "It sounded like a different word. Listen to the model again and compare."); },
};

export const ISSUE_LABELS = {
  get th() { return tr("th の音", "th sound"); },
  get rl() { return tr("R と L", "R and L"); },
  get vb() { return tr("V と B", "V and B"); },
  get fh() { return tr("F と H", "F and H"); },
  get sh() { return tr("S と SH", "S and SH"); },
  get final() { return tr("語尾の子音", "Final consonant"); },
  get vowel() { return tr("母音", "Vowel"); },
  get weak() { return tr("弱く読む語", "Weak word"); },
  get missing() { return tr("抜けた語", "Missing word"); },
  get other() { return tr("違う語", "Different word"); },
};

const swapOneOf = (a, b, x, y) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if ((a[i] === x && b[i] === y) || (a[i] === y && b[i] === x)) diff++;
    else return false;
  }
  return diff > 0;
};
const consonants = (w) => w.replace(/[aeiouy]/g, "");
const collapse = (w) => w.replace(/(.)\1+/g, "$1");

/** 期待した語 expected が heard と聞き取られた理由を推定する */
export function classify(expected, heard) {
  if (!heard) return FUNCTION_WORDS.has(expected) ? "weak" : "missing";
  if (/th/.test(expected) && !/th/.test(heard)) {
    const probe = expected.replace(/th/g, "");
    if ([...["s", "z", "d", "t", "f"]].some((c) => heard.replace(c, "") === probe || heard === expected.replace(/th/g, c))) {
      return "th";
    }
  }
  // 綴りの重なり（berry の rr など）は音の違いに関係ないので、1文字にそろえて比べる
  const e1 = collapse(expected);
  const h1 = collapse(heard);
  if (swapOneOf(e1, h1, "r", "l")) return "rl";
  if (swapOneOf(e1, h1, "v", "b")) return "vb";
  if (swapOneOf(e1, h1, "f", "h")) return "fh";
  if (expected.replace(/sh/g, "s") === heard || heard.replace(/sh/g, "s") === expected) return "sh";
  if (expected.startsWith(heard) && expected.length - heard.length <= 2 && /[^aeiou]$/.test(expected)) return "final";
  if (consonants(expected) === consonants(heard)) return "vowel";
  return "other";
}

/** 単語列どうしを最小の編集で対応づける（一致・置換・欠落・余分） */
function align(target, said) {
  const n = target.length;
  const m = said.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (target[i - 1] === said[j - 1] ? 0 : 1));
    }
  }
  const pairs = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (target[i - 1] === said[j - 1] ? 0 : 1)) {
      pairs.push({ t: i - 1, s: j - 1 });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      pairs.push({ t: i - 1, s: null });
      i--;
    } else {
      pairs.push({ t: null, s: j - 1 });
      j--;
    }
  }
  return pairs.reverse();
}

/**
 * 発音チェックの結果を分析する。
 * @returns {{
 *   words: { text: string, ok: boolean, heardAs: string }[],
 *   ratio: number, heard: string,
 *   issues: { word: string, heardAs: string, kind: string, label: string, tip: string }[]
 * }}
 */
export function analyzePronunciation(said, target) {
  const display = target.split(/\s+/).filter(Boolean);
  // 表示用の語 → 比較用の語（"I'm" は "i am" の2語になる）
  const targetNorm = [];
  const owner = [];
  display.forEach((w, k) => {
    for (const part of normalizeEn(w).split(" ").filter(Boolean)) {
      targetNorm.push(part);
      owner.push(k);
    }
  });
  const saidNorm = normalizeEn(said).split(" ").filter(Boolean);
  const pairs = align(targetNorm, saidNorm);

  const matched = new Array(targetNorm.length).fill(false);
  const heardFor = new Array(targetNorm.length).fill(null);
  for (const p of pairs) {
    if (p.t === null) continue;
    if (p.s !== null) {
      heardFor[p.t] = saidNorm[p.s];
      matched[p.t] = saidNorm[p.s] === targetNorm[p.t];
    }
  }

  const words = display.map((text, k) => {
    const idx = owner.map((o, i) => (o === k ? i : -1)).filter((i) => i >= 0);
    const ok = idx.length === 0 || idx.every((i) => matched[i]);
    const heardAs = idx.map((i) => heardFor[i]).filter(Boolean).join(" ");
    return { text, ok, heardAs };
  });

  const issues = [];
  targetNorm.forEach((expected, i) => {
    if (matched[i]) return;
    const kind = classify(expected, heardFor[i]);
    issues.push({ word: expected, heardAs: heardFor[i] || "", kind, label: ISSUE_LABELS[kind], tip: ISSUE_TIPS[kind] });
  });

  const counted = words.filter((w) => normalizeEn(w.text));
  const ratio = counted.length ? counted.filter((w) => w.ok).length / counted.length : 1;
  return { words, ratio, heard: said, issues };
}

/** 一言の講評 */
export function verdictText(ratio) {
  if (ratio >= 0.95) return tr("完璧！ネイティブに通じる発音です", "Perfect! A native speaker would understand you");
  if (ratio >= 0.8) return tr("とても良い！あと少し", "Very good! Almost there");
  if (ratio >= 0.6) return tr("おしい！赤い語を意識してもう一度", "So close! Focus on the red words and try again");
  return tr("お手本をもう一度聞いて、ゆっくりまねしてみよう", "Listen to the model again and copy it slowly");
}

/** 振り返り用: これまでの結果から、よく出るつまずきを多い順に数える */
export function commonIssues(log) {
  const count = new Map();
  for (const entry of log) for (const issue of entry.issues || []) count.set(issue.kind, (count.get(issue.kind) || 0) + 1);
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => ({ kind, label: ISSUE_LABELS[kind], tip: ISSUE_TIPS[kind], count: n }));
}
