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

export const isCorrect = (verdict) => verdict === "correct" || verdict === "close";

/** 4択の選択肢を作る（正解1 + 同じ出題範囲からの誤答3） */
export function makeChoices(item, pool, rng, n = 4) {
  const others = shuffle(
    pool.filter((p) => p.id !== item.id && p.japanese !== item.japanese),
    rng
  ).slice(0, n - 1);
  return shuffle([item, ...others], rng).map((p) => ({ id: p.id, label: p.japanese }));
}

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

export function recordActivity(stats, today, yesterday, { swipes = 0, answers = 0 } = {}) {
  let streak = stats.streak;
  if (stats.lastStudyDate !== today) streak = stats.lastStudyDate === yesterday ? streak + 1 : 1;
  const n = swipes + answers;
  return {
    ...stats,
    totalSwipes: stats.totalSwipes + swipes,
    totalAnswers: (stats.totalAnswers || 0) + answers,
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
