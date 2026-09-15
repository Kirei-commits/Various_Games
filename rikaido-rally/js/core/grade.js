/**
 * 評価（A〜E）の出し方。
 *
 * 受講者は「正解するまで進めない」ので、正誤そのものでは差がつかない。
 * 差がつくのは **何回のヒントで辿り着いたか** と **どのレベルの問題でそれをやったか**。
 * 理解度スコアはこの2つだけで決まる。
 *
 *   問題ごとの到達点 = 減点表[使ったヒント数] (+ 加点観点のぶん)   … 0〜1
 *   理解度スコア     = Σ(到達点 × レベル重み) / Σ(レベル重み) × 100
 *   評価             = 閾値表で A〜E に落とす
 */
// ヒント0回＝満点。ヒントを重ねるほど下がる。模範解答を見てからの正解は最低点。
export const BASE_BY_HINTS = [1.0, 0.8, 0.6, 0.45, 0.3];
export const REVEALED_BASE = 0.15;
// 加点観点を全部拾って +0.05。0.1 にすると「毎問ヒント1回＋加点満額」が
// ちょうど90点になり、伴走してもらった人が A に届いてしまう（実際に測って下げた）。
export const OPTIONAL_BONUS = 0.05;

// レベルが上の問題ほど重い。1..5 で 0.8 → 1.6（最大でも2倍に収める。
// 差を open にしすぎると、低レベルの取りこぼしが評価に出なくなる）
export const levelWeight = (level) => 0.6 + 0.2 * level;

// 閾値。E から A へ上げていく道筋が見えるように、幅を等間隔にはしていない
// （C→B より B→A を狭くして、A は「ほぼヒント無し」でしか届かないようにする）
export const SCALE = [
  { grade: 'A', min: 90, label: '説明できる', note: 'ほぼ自力。人に教えられる状態。' },
  { grade: 'B', min: 75, label: '概ね掴んでいる', note: '要所は出てくる。言葉の精度が課題。' },
  { grade: 'C', min: 60, label: '心当たりはある', note: 'ヒント1つで思い出せる。定着が浅い。' },
  { grade: 'D', min: 40, label: '断片的', note: '誘導が要る。用語と理由が結びついていない。' },
  { grade: 'E', min: 0, label: 'これから', note: '初見に近い。まずは1周して言葉に触れる。' }
];

/** 1問ぶんの到達点（0〜1） */
export function scoreOne(rec) {
  const base = rec.revealed
    ? REVEALED_BASE
    : BASE_BY_HINTS[Math.min(rec.hintsUsed, BASE_BY_HINTS.length - 1)];
  const bonus = rec.optionalTotal > 0 ? OPTIONAL_BONUS * (rec.optionalHit / rec.optionalTotal) : 0;
  return Math.min(1, Math.round((base + bonus) * 1000) / 1000);
}

/** ラリー全体のスコア（0〜100）。重み付き平均。 */
export function scoreRally(records) {
  const done = records.filter((r) => r.cleared);
  if (!done.length) return 0;
  let num = 0, den = 0;
  for (const r of done) {
    const w = levelWeight(r.level);
    num += scoreOne(r) * w;
    den += w;
  }
  return Math.round((num / den) * 1000) / 10;   // 小数第1位まで
}

/** スコアを A〜E に落とす */
export function gradeOf(score) {
  return SCALE.find((s) => score >= s.min) || SCALE[SCALE.length - 1];
}

/** 1つ上の評価まであと何点か。「Aに上げる」導線のため。 */
export function toNext(score) {
  const above = SCALE.filter((s) => s.min > score).sort((a, b) => a.min - b.min)[0];
  if (!above) return null;
  return { grade: above.grade, need: Math.round((above.min - score) * 10) / 10, min: above.min };
}

/**
 * 「次に何を直せば上がるか」を、記録から機械的に出す。
 * 感想ではなく、失点の大きい順（重み×取りこぼし）に並べただけのもの。
 */
export function weakPoints(records) {
  return records.filter((r) => r.cleared)
    .map((r) => ({
      qid: r.qid, level: r.level, unit: r.unit, unitLabel: r.unitLabel || r.unit, prompt: r.prompt,
      lost: Math.round((1 - scoreOne(r)) * levelWeight(r.level) * 1000) / 1000,
      hintsUsed: r.hintsUsed, revealed: r.revealed,
      missedKeys: r.missedKeys || []
    }))
    .filter((x) => x.lost > 0)
    .sort((a, b) => b.lost - a.lost);
}

