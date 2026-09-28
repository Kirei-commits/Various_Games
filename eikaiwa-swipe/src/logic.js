/*
 * SwipeTalk の純粋なロジック。DOM・音声API・LocalStorage には触らない。
 * そのため Node のテストランナーだけで検証できる（tests/logic/*.test.mjs）。
 * 「今日」や乱数は必ず引数で受け取る。
 */

// ---------------------------------------------------------------------------
// データ
// ---------------------------------------------------------------------------

/** 英語から安定したIDを作る。並べ替えや章の移動をしても保存データが壊れない。 */
export function slugify(english) {
  return english
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 章ファイルの1行形式を Phrase に変換する。
 * 形式: 英語 | 日本語訳 | 会話例（// で行区切り） | 会話例の訳
 */
export function parseChapter(chapter) {
  const items = [];
  const errors = [];
  chapter.items
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const cols = line.split(" | ").map((c) => c.trim());
      if (cols.length !== 4 || cols.some((c) => !c)) {
        errors.push(`${chapter.id} ${i + 1}行目: 4列ではありません: ${line.slice(0, 40)}`);
        return;
      }
      const [english, japanese, exEn, exJa] = cols;
      const enLines = exEn.split(" // ").map((s) => s.trim());
      const jaLines = exJa.split(" // ").map((s) => s.trim());
      if (enLines.length !== jaLines.length) {
        errors.push(`${chapter.id} ${english}: 会話例と訳の行数が違います`);
      }
      items.push({
        id: slugify(english),
        chapterId: chapter.id,
        english,
        japanese,
        exampleContext: enLines.join("\n"),
        exampleJapanese: jaLines.join("\n"),
      });
    });
  return { id: chapter.id, title: chapter.title, items, errors };
}

/** 全章を読み込み、検証エラー（重複IDなど）も返す */
export function buildLibrary(rawChapters) {
  const chapters = [];
  const errors = [];
  const seen = new Map();
  for (const raw of rawChapters) {
    const ch = parseChapter(raw);
    errors.push(...ch.errors);
    for (const item of ch.items) {
      if (!item.id) errors.push(`${ch.id}: IDを作れない英語です: ${item.english}`);
      if (seen.has(item.id)) {
        errors.push(`重複: "${item.english}" (${ch.id}) と "${seen.get(item.id).english}" (${seen.get(item.id).chapterId})`);
      } else {
        seen.set(item.id, item);
      }
    }
    chapters.push({ id: ch.id, title: ch.title, items: ch.items });
  }
  return { chapters, byId: Object.fromEntries(seen), errors };
}

/** "A: Hello\nB: Hi" → [{ speaker: "A", text: "Hello" }, ...] */
export function parseDialogue(context) {
  return (context || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([A-Z][\w]*)\s*[:：]\s*(.*)$/);
      return m ? { speaker: m[1], text: m[2] } : { speaker: null, text: line };
    });
}

// ---------------------------------------------------------------------------
// 乱数
// ---------------------------------------------------------------------------

/** 再現可能な乱数（テスト用にシードを渡せる） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// 採点（日本語の意味を自由入力・音声で答える）
// ---------------------------------------------------------------------------

const JA_NOISE = /[\s、。，．,.!！?？・「」『』（）()［］[\]〜~…"'“”‘’：:；;]/g;

/** 表記ゆれを吸収する: 全角半角・カタカナ→ひらがな・記号と空白の除去 */
export function normalizeJa(text) {
  return (text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(JA_NOISE, "");
}

/** 「（考えて）理解する／解決する」→ 正解候補の一覧（括弧あり・なしの両方） */
export function answerCandidates(japanese) {
  const out = new Set();
  for (const part of japanese.split(/[／/]/)) {
    const withParen = normalizeJa(part);
    const withoutParen = normalizeJa(part.replace(/[（(][^）)]*[）)]/g, ""));
    if (withParen) out.add(withParen);
    if (withoutParen) out.add(withoutParen);
  }
  return [...out];
}

function bigrams(s) {
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** 文字バイグラムの Dice 係数（0〜1） */
export function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ba = bigrams(a);
  const bb = bigrams(b);
  const pool = new Map();
  for (const g of bb) pool.set(g, (pool.get(g) || 0) + 1);
  let hit = 0;
  for (const g of ba) {
    const n = pool.get(g);
    if (n) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (ba.length + bb.length);
}

export const CLOSE_THRESHOLD = 0.6;

/**
 * 答えを採点する。
 * @returns {{ verdict: "correct" | "close" | "wrong" | "empty", score: number }}
 *  close は「ほぼ正解」。正解として数える。
 */
export function gradeAnswer(input, japanese) {
  const a = normalizeJa(input);
  if (!a) return { verdict: "empty", score: 0 };
  let best = 0;
  for (const c of answerCandidates(japanese)) {
    if (a === c) return { verdict: "correct", score: 1 };
    // 候補の主要部分を答えている（「意味が通じる」に対して「通じる」など）
    if (c.includes(a) && a.length >= Math.max(2, Math.ceil(c.length * 0.6))) {
      return { verdict: "correct", score: 1 };
    }
    // 候補を含んだうえで言い足している（「コツをつかむこと」など）
    if (c.length >= 2 && a.includes(c)) return { verdict: "correct", score: 1 };
    best = Math.max(best, similarity(a, c));
  }
  return best >= CLOSE_THRESHOLD ? { verdict: "close", score: best } : { verdict: "wrong", score: best };
}

export const isCorrect = (verdict) => verdict === "correct" || verdict === "close" || verdict === "override";

// ---------------------------------------------------------------------------
// 採点（日本語を見て英語で答える）
// ---------------------------------------------------------------------------

const CONTRACTIONS = [
  [/\bcan't\b/g, "cannot"],
  [/\bcan not\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bain't\b/g, "is not"],
  [/n't\b/g, " not"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'ll\b/g, " will"],
  [/'d\b/g, " would"],
  [/'m\b/g, " am"],
  [/\blet's\b/g, "let us"],
  [/\b(it|that|what|there|here|he|she|who|where|how|everything|nothing)'s\b/g, "$1 is"],
  [/\bgonna\b/g, "going to"],
  [/\bwanna\b/g, "want to"],
  [/\bgotta\b/g, "got to"],
  [/\bok\b/g, "okay"],
];

/** 英語の表記ゆれを吸収する: 大文字小文字・記号・短縮形（I'm = I am）・gonna など */
export function normalizeEn(text) {
  let s = (text || "")
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'");
  for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  s = s
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  // アポストロフィを省いて入力・認識された短縮形（im / dont / its など）もそろえる
  return s.replace(BARE_CONTRACTIONS_RE, (w) => BARE_CONTRACTIONS[w]);
}

const BARE_CONTRACTIONS = {
  im: "i am", ive: "i have", dont: "do not", doesnt: "does not", didnt: "did not", isnt: "is not",
  arent: "are not", wasnt: "was not", werent: "were not", cant: "cannot", wont: "will not",
  couldnt: "could not", shouldnt: "should not", wouldnt: "would not", havent: "have not",
  hasnt: "has not", youre: "you are", theyre: "they are", thats: "that is", whats: "what is",
  its: "it is", theres: "there is", youll: "you will", youve: "you have",
};
const BARE_CONTRACTIONS_RE = new RegExp(`\\b(?:${Object.keys(BARE_CONTRACTIONS).join("|")})\\b`, "g");

export function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const POSSESSIVES = "(?:my|your|his|her|our|their|its)";

/**
 * 見出し語の「someone」「my」などを、実際の文で入る語に置き換えられるようにした正規表現。
 * "give someone a ride" → "give me a ride" / "give my mom a ride" も正解にする。
 */
function flexiblePattern(target) {
  const body = target
    .split(" ")
    .map((w) => {
      if (w === "someone") return "\\w+(?: \\w+)?";
      if (w === "someones") return "\\w+(?: \\w+)?";
      if (/^(my|your|his|her|our|their)$/.test(w)) return POSSESSIVES;
      return w;
    })
    .join(" ");
  return new RegExp(`^${body}$`);
}

/**
 * 英語の答えを採点する（戻り値は gradeAnswer と同じ形）。
 * 少しのスペルミスや、音声認識の聞き違い程度の差は「ほぼ正解」。
 */
export function gradeEnglish(input, english) {
  const a = normalizeEn(input);
  if (!a) return { verdict: "empty", score: 0 };
  const t = normalizeEn(english);
  if (a === t || flexiblePattern(t).test(a)) return { verdict: "correct", score: 1 };
  const dist = levenshtein(a, t);
  const allowed = Math.max(1, Math.round(t.length * 0.2));
  const score = 1 - dist / Math.max(a.length, t.length);
  if (t.length >= 4 && dist <= allowed) return { verdict: "close", score };
  return { verdict: "wrong", score };
}

/** "Make sense." → "M___ s____." （各単語の頭文字だけ見せるヒント） */
export function englishHint(english) {
  return english.replace(/[A-Za-z]+(?:'[A-Za-z]+)*/g, (w) => w[0] + w.slice(1).replace(/[A-Za-z]/g, "_"));
}

/** 4択の選択肢を作る（正解1 + 同じ出題範囲からの誤答3）。labelKey で表示する欄を選ぶ */
export function makeChoices(item, pool, rng, n = 4, labelKey = "japanese") {
  const others = shuffle(
    pool.filter((p) => p.id !== item.id && p[labelKey] !== item[labelKey]),
    rng
  ).slice(0, n - 1);
  return shuffle([item, ...others], rng).map((p) => ({ id: p.id, label: p[labelKey] }));
}

/** テスト記録のキー。英→日は従来どおり範囲名だけ、日→英は "@ja-en" を付ける */
export const testKey = (scope, direction) => (direction === "ja-en" ? `${scope}@ja-en` : scope);

export function buildQuiz(items, count, rng) {
  return shuffle(items, rng).slice(0, Math.min(count, items.length));
}

// ---------------------------------------------------------------------------
// 抑揚（Web Speech API は SSML を解釈しないので、文ごとに pitch/rate を変えて近づける）
// ---------------------------------------------------------------------------

const WH_WORDS = /^(what|where|when|why|who|whom|whose|which|how)\b/i;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 文を区切る。"Really? Never." → ["Really?", "Never."] */
export function splitSentences(text) {
  const parts = (text || "").match(/[^.!?…]+(?:[.!?…]+["”’']?|$)/g) || [];
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * 1つのテキストを「読み上げ単位」に分け、それぞれの pitch と rate を決める。
 * - Yes/No 疑問文は語尾が上がるので高め、WH疑問文は控えめ
 * - 感嘆文は高め・速め、… は低め・ゆっくり
 * - 会話の B 役は少し声を高くして A と聞き分けやすくする
 */
export function prosodyPlan(text, { expressive = true, rate = 0.95, role = null } = {}) {
  const roleShift = role === "B" ? 0.08 : 0;
  if (!expressive) return [{ text, pitch: clamp(1 + roleShift, 0.5, 2), rate: clamp(rate, 0.5, 2) }];
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  return sentences.map((s) => {
    let pitch = 1;
    let r = rate;
    if (/\?["”’']?$/.test(s)) {
      pitch = WH_WORDS.test(s) ? 1.06 : 1.2;
    } else if (/!["”’']?$/.test(s)) {
      pitch = 1.14;
      r = rate * 1.06;
    } else if (/…$|\.\.\.$/.test(s)) {
      pitch = 0.9;
      r = rate * 0.88;
    }
    return { text: s, pitch: clamp(pitch + roleShift, 0.5, 2), rate: clamp(r, 0.5, 2) };
  });
}

// ---------------------------------------------------------------------------
// シャドーイング
// ---------------------------------------------------------------------------

/** 1フレーズぶんの練習手順: 見出しの英語 → 会話例の各行 */
export function shadowSteps(item) {
  const ja = parseDialogue(item.exampleJapanese);
  return [
    { text: item.english, role: null, ja: item.japanese },
    ...parseDialogue(item.exampleContext).map((l, i) => ({ text: l.text, role: l.speaker, ja: ja[i]?.text || "" })),
  ];
}

/**
 * 「あなたの番」の長さ（ミリ秒）。お手本と同じくらいの長さで言えるように、
 * 単語数と話す速さから見積もり、倍率（1〜2倍）でゆとりを持たせる。
 */
export function pauseMs(text, rate = 1, multiplier = 1.5) {
  const words = (text.match(/[A-Za-z0-9']+/g) || []).length;
  const modelMs = 500 + (words * 380) / Math.max(rate, 0.3);
  return Math.max(1200, Math.round(modelMs * multiplier));
}

/**
 * 発音チェック: 音声認識で聞き取れた文と、お手本の単語を突き合わせる。
 * 並び順は問わず、聞き取れた単語を1回ずつ消費していく。
 */
export function wordMatch(said, target) {
  const bag = new Map();
  for (const w of normalizeEn(said).split(" ").filter(Boolean)) bag.set(w, (bag.get(w) || 0) + 1);
  let counted = 0;
  let hit = 0;
  const words = target.split(/\s+/).filter(Boolean).map((text) => {
    const parts = normalizeEn(text).split(" ").filter(Boolean);
    if (parts.length === 0) return { text, ok: true };
    counted++;
    const ok = parts.every((p) => (bag.get(p) || 0) > 0);
    if (ok) {
      hit++;
      for (const p of parts) bag.set(p, bag.get(p) - 1);
    }
    return { text, ok };
  });
  return { words, ratio: counted ? hit / counted : 1 };
}

// ---------------------------------------------------------------------------
// 学習状態
// ---------------------------------------------------------------------------

export const STATE_VERSION = 2;

/** v1（22フレーズ版）の保存データの ID → 英語 */
export const LEGACY_V1_IDS = {
  p01: "make sense", p02: "figure out", p03: "You know what?", p04: "I'm down.",
  p05: "No worries.", p06: "hang out", p07: "It's up to you.", p08: "catch up",
  p09: "I'm on it.", p10: "That's a bummer.", p11: "get the hang of", p12: "Fair enough.",
  p13: "run late", p14: "Long time no see.", p15: "I'll pass.", p16: "come up with",
  p17: "Go for it.", p18: "It slipped my mind.", p19: "kind of", p20: "What's the catch?",
  p21: "Count me in.", p22: "awkward",
};

export const initialStats = () => ({
  totalSwipes: 0,
  totalAnswers: 0,
  totalShadows: 0,
  streak: 0,
  lastStudyDate: null,
  todayDate: null,
  todayCount: 0,
});

export function freshState(firstChapterId = "ch01") {
  return {
    version: STATE_VERSION,
    learned: {},
    queues: {},
    stats: initialStats(),
    tests: {},
    misses: {},
    chapter: firstChapterId,
  };
}

/** 保存データ（v1 / v2）を、現在の教材と突き合わせて整える */
export function restoreState(saved, library) {
  const base = freshState(library.chapters[0]?.id);
  if (!saved || typeof saved !== "object") return base;
  const valid = (id) => Object.prototype.hasOwnProperty.call(library.byId, id);

  const learned = {};
  if (saved.version === STATE_VERSION) {
    for (const id of Object.keys(saved.learned || {})) if (valid(id) && saved.learned[id]) learned[id] = true;
  } else if (saved.statuses) {
    // v1: { statuses: { p01: "learned" } }
    for (const [pid, status] of Object.entries(saved.statuses)) {
      const english = LEGACY_V1_IDS[pid];
      const id = english && slugify(english);
      if (status === "learned" && id && valid(id)) learned[id] = true;
    }
  }

  const queues = {};
  for (const [ch, ids] of Object.entries(saved.version === STATE_VERSION ? saved.queues || {} : {})) {
    if (Array.isArray(ids)) queues[ch] = ids.filter(valid);
  }
  const misses = {};
  for (const [id, n] of Object.entries(saved.misses || {})) if (valid(id) && n > 0) misses[id] = n;

  const chapter = library.chapters.some((c) => c.id === saved.chapter) ? saved.chapter : base.chapter;
  return {
    ...base,
    learned,
    queues,
    misses,
    tests: saved.tests && typeof saved.tests === "object" ? saved.tests : {},
    stats: { ...initialStats(), ...(saved.stats || {}) },
    chapter,
  };
}

/** 章の出題キュー: 保存された順序を尊重しつつ、未習得だけを漏れなく含める */
export function chapterQueue(state, chapter) {
  const unlearned = chapter.items.filter((p) => !state.learned[p.id]).map((p) => p.id);
  const allowed = new Set(unlearned);
  const seen = new Set();
  const out = [];
  for (const id of state.queues[chapter.id] || []) {
    if (allowed.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of unlearned) if (!seen.has(id)) out.push(id);
  return out;
}

export function recordActivity(stats, today, yesterday, { swipes = 0, answers = 0, shadows = 0 } = {}) {
  let streak = stats.streak;
  if (stats.lastStudyDate !== today) streak = stats.lastStudyDate === yesterday ? streak + 1 : 1;
  const n = swipes + answers + shadows;
  return {
    ...stats,
    totalSwipes: stats.totalSwipes + swipes,
    totalAnswers: (stats.totalAnswers || 0) + answers,
    totalShadows: (stats.totalShadows || 0) + shadows,
    streak,
    lastStudyDate: today,
    todayDate: today,
    todayCount: stats.todayDate === today ? stats.todayCount + n : n,
  };
}

/** 表示用の連続日数（昨日も今日も学習していなければ途切れている） */
export function currentStreak(stats, today, yesterday) {
  return stats.lastStudyDate === today || stats.lastStudyDate === yesterday ? stats.streak : 0;
}

/** 右（覚えた）ならキューから外し、左（覚えてない）なら最後尾へ */
export function applySwipe(state, chapter, id, dir, today, yesterday) {
  const queue = chapterQueue(state, chapter).filter((q) => q !== id);
  const learned = { ...state.learned };
  if (dir === "right") learned[id] = true;
  else {
    delete learned[id];
    queue.push(id);
  }
  return {
    ...state,
    learned,
    queues: { ...state.queues, [chapter.id]: queue },
    stats: recordActivity(state.stats, today, yesterday, { swipes: 1 }),
  };
}

export function toggleLearned(state, chapter, id) {
  const learned = { ...state.learned };
  const queue = chapterQueue(state, chapter).filter((q) => q !== id);
  if (learned[id]) {
    delete learned[id];
    queue.push(id);
  } else {
    learned[id] = true;
  }
  return { ...state, learned, queues: { ...state.queues, [chapter.id]: queue } };
}

export function resetChapter(state, chapter) {
  const learned = { ...state.learned };
  for (const p of chapter.items) delete learned[p.id];
  const queues = { ...state.queues };
  delete queues[chapter.id];
  return { ...state, learned, queues };
}

/**
 * テスト結果を反映する。
 * - 章ごとの最高点・直近の点・受験回数
 * - 間違えた問題は「苦手」に数え、未習得に戻して章キューの最後尾へ
 * - 正解した問題は苦手カウントを1減らす
 */
export function applyTestResult(state, library, key, results, today, yesterday) {
  const total = results.length;
  if (total === 0) return state;
  const correct = results.filter((r) => r.correct).length;
  const pct = Math.round((correct / total) * 100);
  const prev = state.tests[key] || { best: 0, last: 0, count: 0 };

  const misses = { ...state.misses };
  const learned = { ...state.learned };
  const queues = { ...state.queues };
  for (const r of results) {
    if (r.correct) {
      if (misses[r.id]) {
        misses[r.id] -= 1;
        if (misses[r.id] <= 0) delete misses[r.id];
      }
      continue;
    }
    misses[r.id] = (misses[r.id] || 0) + 1;
    const item = library.byId[r.id];
    if (!item) continue;
    const chapter = library.chapters.find((c) => c.id === item.chapterId);
    const queue = chapterQueue({ ...state, learned, queues }, chapter).filter((q) => q !== r.id);
    delete learned[r.id];
    queue.push(r.id);
    queues[chapter.id] = queue;
  }

  return {
    ...state,
    learned,
    queues,
    misses,
    tests: { ...state.tests, [key]: { best: Math.max(prev.best, pct), last: pct, count: prev.count + 1 } },
    stats: recordActivity(state.stats, today, yesterday, { answers: total }),
  };
}

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayAndYesterday(now = new Date()) {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return { today: ymd(now), yesterday: ymd(y) };
}
