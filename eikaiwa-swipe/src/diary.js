/*
 * 日記: 集めた単語を使って英語の日記を書き、その場で採点する（純粋関数。Node でテストできる）。
 *
 * 採点は AI ではなく、決まったルールで行う（通信なし・その場で結果が出る）。
 *   1. 長さ（25点）      : 30語で満点
 *   2. 集めた単語（30点） : ガチャで集めた単語を使うほど高い（SR 以上は2語分）
 *   3. 書き方（25点）     : 文頭の大文字・文末の記号・「I」の大文字・a / an・同じ語の連続 など
 *   4. つづり（20点）     : 知っている英単語（教材の英文に出てくる語）の割合。知らない語は「つづりを確認」として出す
 * 文法の正しさそのもの（時制・語順など）は見ない。
 */

export const DIARY_POINTS_PER_SCORE = 30; // 1点あたりのガチャポイント（100点で 3000pt）

/** 教材の英文から、知っている英単語の一覧を作る（小文字） */
export function buildVocab(library) {
  const vocab = new Set(COMMON_WORDS);
  for (const ch of library.chapters) {
    for (const item of ch.items) {
      for (const t of [item.english, item.exampleContext]) for (const w of words(t)) vocab.add(w.toLowerCase());
    }
  }
  return vocab;
}

const words = (text) => String(text || "").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];

/** 文に分ける（. ! ? で区切る。最後に記号がない文も1文と数える） */
function sentences(text) {
  const out = [];
  const re = /[^.!?]+[.!?]*/g;
  let m;
  while ((m = re.exec(text))) {
    const s = m[0].trim();
    if (words(s).length) out.push(s);
  }
  return out;
}

const VOWEL_SOUND = /^(?:[aeio]|u(?!ni|se|su|ro|ti)|hour|honest|honor)/i;

/**
 * 日記を採点する。
 * @param text 日記の英文
 * @param opts { vocab: Set<string>, cards: { [english小文字]: { id, rarity } }（集めた単語） }
 * @returns {{ score, parts: { length, collected, mechanics, spelling }, issues: string[], used: {id, english, rarity}[], unknown: string[], wordCount }}
 */
export function scoreDiary(text, { vocab = new Set(), cards = {} } = {}) {
  const ws = words(text);
  const lower = ws.map((w) => w.toLowerCase());
  const wordCount = ws.length;
  const issues = [];
  if (!wordCount) {
    return { score: 0, parts: { length: 0, collected: 0, mechanics: 0, spelling: 0 }, issues: ["英語で書いてみましょう"], used: [], unknown: [], wordCount: 0 };
  }

  // 1. 長さ
  const length = Math.round(Math.min(25, (wordCount / 30) * 25));

  // 2. 集めた単語
  const used = [];
  const seen = new Set();
  for (const w of lower) {
    const c = cards[w];
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      used.push({ id: c.id, english: w, rarity: c.rarity });
    }
  }
  const usedValue = used.reduce((n, c) => n + (c.rarity === "SR" || c.rarity === "SSR" ? 2 : 1), 0);
  const collected = Math.min(30, usedValue * 6);

  // 3. 書き方
  let mistakes = 0;
  const flag = (msg) => {
    mistakes += 1;
    if (issues.length < 8) issues.push(msg);
  };
  for (const s of sentences(text)) {
    const first = s.match(/[A-Za-z]/)?.[0];
    if (first && first !== first.toUpperCase()) flag(`文の最初は大文字に: 「${s.slice(0, 20)}…」`);
    if (!/[.!?]$/.test(s)) flag(`文の終わりに . か ! か ? を: 「…${s.slice(-20)}」`);
  }
  if (/(^|[^A-Za-z'])i([^A-Za-z']|$)/.test(text)) flag("「私」の i は、いつも大文字の I");
  for (let i = 0; i < lower.length - 1; i++) {
    const next = lower[i + 1];
    if (lower[i] === "a" && VOWEL_SOUND.test(next)) flag(`「a ${next}」→「an ${next}」`);
    if (lower[i] === "an" && !VOWEL_SOUND.test(next)) flag(`「an ${next}」→「a ${next}」`);
    if (lower[i] === next && lower[i].length > 1 && lower[i] !== "that" && lower[i] !== "had") flag(`「${next} ${next}」同じ語が続いています`);
  }
  const mechanics = Math.max(0, 25 - mistakes * 5);

  // 4. つづり
  const unknown = [...new Set(lower.filter((w) => !vocab.has(w) && !vocab.has(w.replace(/'s$/, "")) && !knownForm(w, vocab)))];
  const knownRatio = 1 - unknown.length / new Set(lower).size;
  const spelling = Math.round(Math.max(0, knownRatio) * 20);
  if (unknown.length) issues.push(`つづりを確認: ${unknown.slice(0, 6).join(", ")}`);

  const score = Math.max(0, Math.min(100, length + collected + mechanics + spelling));
  return { score, parts: { length, collected, mechanics, spelling }, issues, used, unknown, wordCount };
}

/** 語尾が変わった形（-s / -ed / -ing / -er / -est / -ly）なら、元の語を知っていれば知っている語とみなす */
function knownForm(w, vocab) {
  const stems = [];
  for (const [suf, add] of [
    ["ies", "y"], ["ied", "y"], ["es", ""], ["s", ""], ["ed", ""], ["ed", "e"], ["d", ""], ["ing", ""], ["ing", "e"],
    ["er", ""], ["est", ""], ["ly", ""], ["ier", "y"], ["iest", "y"],
  ]) {
    if (w.endsWith(suf) && w.length > suf.length + 1) stems.push(w.slice(0, -suf.length) + add);
  }
  // 子音の重ね（stopped → stop, running → run）
  const doubled = w.match(/^(.*?)([bcdfgklmnprstvz])\2(ed|ing|er|est)$/);
  if (doubled) stems.push(doubled[1] + doubled[2]);
  return stems.some((s) => vocab.has(s));
}

/** 点数に応じたひとこと */
export function diaryComment(score) {
  if (score >= 90) return "すばらしい！ネイティブも読みやすい日記です";
  if (score >= 75) return "とても良い日記です！";
  if (score >= 55) return "いい調子！集めた単語をもっと使ってみよう";
  if (score >= 30) return "書けました！もう少し長く書いてみよう";
  return "まずは短い文をいくつか書いてみよう";
}

/** 日記を保存する（同じ日は上書き）。ポイントは、その日の最高点が上がった分だけもらえる */
export function saveDiary(state, date, text, result, now) {
  const diary = { ...(state.diary || {}) };
  const prev = diary[date];
  const earnedBefore = prev?.points || 0;
  const earned = Math.max(earnedBefore, result.score * DIARY_POINTS_PER_SCORE);
  diary[date] = { text, score: result.score, points: earned, at: now, words: result.used.map((c) => c.id) };
  return { state: { ...state, diary }, points: earned - earnedBefore };
}

/** 日記の保存データを整える */
export function restoreDiary(saved) {
  const out = {};
  if (!saved || typeof saved !== "object") return out;
  for (const [date, e] of Object.entries(saved)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !e || typeof e.text !== "string") continue;
    out[date] = {
      text: e.text,
      score: Number.isFinite(e.score) ? e.score : 0,
      points: Number.isFinite(e.points) ? e.points : 0,
      at: Number.isFinite(e.at) ? e.at : 0,
      words: Array.isArray(e.words) ? e.words : [],
    };
  }
  return out;
}

/** 2台の端末の日記を統合する（日ごとに、あとで書いた方。もらったポイントは多い方） */
export function mergeDiary(a, b) {
  const x = restoreDiary(a);
  const y = restoreDiary(b);
  const out = { ...x };
  for (const [date, e] of Object.entries(y)) {
    const o = out[date];
    out[date] = !o ? e : { ...(e.at >= o.at ? e : o), points: Math.max(e.points, o.points) };
  }
  return out;
}

/** よく使う基本語（教材に出てこなくても「知っている語」とする） */
const COMMON_WORDS = `a an the i me my mine you your yours he him his she her hers it its we us our ours they them their theirs
this that these those is am are was were be been being do does did done have has had having will would can could shall should
may might must and or but so because if when while then than as at by for from in into of on onto out over to up with without
about after before again all also any some no not yes very too much many more most few little one two three four five six seven
eight nine ten first last next today yesterday tomorrow morning afternoon evening night week weekend month year time day go went
gone going get got getting make made take took see saw seen come came say said tell told think thought know knew want like love
eat ate drink drank play played read write wrote study studied work worked feel felt happy sad tired good bad great nice fun
home school friend friends family mother father mom dad brother sister dog cat book movie music game lunch dinner breakfast
there here where what who why how which`.split(/\s+/);
