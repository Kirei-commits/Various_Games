/*
 * SwipeTalk の純粋なロジック。DOM・音声API・LocalStorage には触らない。
 * そのため Node のテストランナーだけで検証できる（tests/logic/*.test.mjs）。
 * 「今日」や乱数は必ず引数で受け取る。
 */
import { initialGacha, restoreGacha, mergeGacha, grant, loginGachaReward, GOAL_POINTS } from "./gacha.js";
import { initialBattle, restoreBattle, mergeBattle } from "./battle.js";

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

/**
 * 全章を読み込み、検証エラー（重複IDなど）も返す。
 * renamed は問題IDの変更履歴（古いID → 新しいID）。保存データを読むときに新しいIDへ付け替える。
 */
export function buildLibrary(rawChapters, { renamed = {} } = {}) {
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
  return { chapters, byId: Object.fromEntries(seen), renamed, errors };
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

// 意味の比較に関係ない部分: 文末の丁寧語・終助詞と、文中の助詞
const JA_ENDING = /(でございます|ございます|ございました|でしょうか|でしょう|ですか|ですね|ですよ|でした|です|ましょう|ました|ます|だよね|だよ|だね|だった|だ|よね|かな|かも|よ|ね|な|わ|さ|か|の)+$/;
const JA_PARTICLES = /[はがをにへでとも]/g;

/**
 * 言葉遣いの違いを落とした「意味の芯」。
 * 「調子はどう」「調子どう」→ どちらも「調子どう」、「楽しみにしてます」「楽しみにしている」→「楽しみしてる」
 */
export function coreJa(text) {
  return normalizeJa(text)
    .replace(/ている/g, "てる")
    .replace(/でいる/g, "でる")
    .replace(JA_ENDING, "")
    .replace(JA_PARTICLES, "");
}

/** 最長共通部分列の長さ（順番は保ったまま、飛び飛びでも一致する文字数） */
export function lcsLength(a, b) {
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * 答えを採点する。
 * @returns {{ verdict: "correct" | "close" | "wrong" | "empty", score: number }}
 *  close は「ほぼ正解」（言い回しは違うが意味の芯が合っている）。正解として数える。
 */
export function gradeAnswer(input, japanese) {
  const a = normalizeJa(input);
  if (!a) return { verdict: "empty", score: 0 };
  const ca = coreJa(input) || a;
  let best = 0;
  for (const part of japanese.split(/[／/]/)) {
    const variants = [part, part.replace(/[（(][^）)]*[）)]/g, "")];
    for (const v of variants) {
      const c = normalizeJa(v);
      if (!c) continue;
      if (a === c) return { verdict: "correct", score: 1 };
      // 候補の主要部分を答えている（「意味が通じる」に対して「通じる」など）
      if (c.includes(a) && a.length >= Math.max(2, Math.ceil(c.length * 0.6))) return { verdict: "correct", score: 1 };
      // 候補を含んだうえで言い足している（「コツをつかむこと」など）
      if (c.length >= 2 && a.includes(c)) return { verdict: "correct", score: 1 };
      // 助詞・語尾の違いだけ（「調子はどう」と「調子どう」など）
      const cc = coreJa(v) || c;
      if (ca === cc) return { verdict: "correct", score: 1 };

      // ここからは「ほぼ正解」の判定: 意味の芯の文字がどれだけ同じ順で入っているか
      const common = lcsLength(ca, cc);
      const coverage = common / cc.length; // 正解のうち答えに含まれる割合
      const precision = common / ca.length; // 答えのうち正解と重なる割合（長すぎる答えを弾く）
      if (cc.length >= 2 && coverage >= 0.7 && precision >= 0.5) best = Math.max(best, coverage);
      else best = Math.max(best, Math.min(similarity(a, c), 0.59), similarity(ca, cc) >= CLOSE_THRESHOLD ? similarity(ca, cc) : 0);
    }
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

export const STATE_VERSION = 4;

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
    bonus: initialBonus(),
    gacha: initialGacha(),
    battle: initialBattle(),
    chapter: firstChapterId,
  };
}

// ---------------------------------------------------------------------------
// ログインボーナス・今日の目標・着せかえ
// ---------------------------------------------------------------------------

/** 1日に学習（スワイプ・テスト解答・シャドーイング）してほしい数 */
export const DAILY_GOAL = 20;

export const initialBonus = () => ({
  lastClaim: null, // 最後にログインボーナスを受け取った日
  loginStreak: 0, // 連続ログイン日数
  totalDays: 0, // 受け取った日数の合計
  coins: 0, // 廃止したコイン（古いデータの値を消さないために残している）
  goalClaimed: null, // 今日の目標ボーナスを受け取った日
  unlocked: ["default"],
  theme: "default",
});

/** 着せかえ（カードと画面の色）。設定からいつでも無料で選べる */
export const THEMES = [
  { id: "default", name: "スタンダード", colors: ["#6366f1", "#8b5cf6", "#ec4899"] },
  { id: "sakura", name: "桜", colors: ["#f9a8d4", "#f472b6", "#fb7185"] },
  { id: "ocean", name: "海", colors: ["#38bdf8", "#0ea5e9", "#6366f1"] },
  { id: "forest", name: "森", colors: ["#4ade80", "#10b981", "#0d9488"] },
  { id: "sunset", name: "夕焼け", colors: ["#fbbf24", "#f97316", "#e11d48"] },
  { id: "night", name: "夜空", colors: ["#1e3a8a", "#4c1d95", "#0f172a"] },
];

/** 今日のログインボーナスを受け取る（受け取り済みなら reward は null） */
export function claimDailyBonus(state, today, yesterday) {
  const b = { ...initialBonus(), ...state.bonus };
  if (b.lastClaim === today) return { state, reward: null };
  const day = b.lastClaim === yesterday ? b.loginStreak + 1 : 1;
  const gacha = loginGachaReward(day, b.totalDays + 1);
  const reward = { day, weekly: day % 7 === 0, gacha };
  return {
    state: grant({ ...state, bonus: { ...b, lastClaim: today, loginStreak: day, totalDays: b.totalDays + 1 } }, gacha),
    reward,
  };
}

/** 今日の学習数（目標に向けた進み具合） */
export const todayProgress = (state, today) => (state.stats.todayDate === today ? state.stats.todayCount : 0);

export const canClaimGoal = (state, today) =>
  todayProgress(state, today) >= DAILY_GOAL && (state.bonus || {}).goalClaimed !== today;

/** 今日の目標達成ボーナスを受け取る */
export function claimGoalBonus(state, today) {
  if (!canClaimGoal(state, today)) return state;
  const b = { ...initialBonus(), ...state.bonus };
  return grant({ ...state, bonus: { ...b, goalClaimed: today } }, { points: GOAL_POINTS });
}

/** 着せかえ。id が無い・知らないものならスタンダード */
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

/**
 * 保存データの形の移行。キーは「移行元のバージョン」で、1つ新しい形に変換する。
 * 保存データの形を変えるときは STATE_VERSION を上げ、ここに移行を1つ足す（古い移行は消さない）。
 * これにより、何世代前のデータでも順番に最新の形へたどり着ける。
 */
const MIGRATIONS = {
  // v1（22フレーズ版）: { statuses: { p01: "learned" }, queue, stats }
  1: (s) => {
    const learned = {};
    for (const [pid, status] of Object.entries(s.statuses || {})) {
      const english = LEGACY_V1_IDS[pid];
      if (status === "learned" && english) learned[slugify(english)] = true;
    }
    return { version: 2, learned, queues: {}, misses: {}, tests: {}, stats: s.stats || {} };
  },
  // v2 → v3: 単語ガチャ（state.gacha）とバトルの記録（state.battle）を追加
  2: (s) => ({ ...s, version: 3, gacha: initialGacha(), battle: initialBattle() }),
  // v3 → v4: ガチャに5倍ブースト・コード入力・無限モードを追加（足りない値は restoreGacha が初期値で埋める）。
  // ログインボーナスのコインは廃止（値は消さずに残す）。着せかえは設定に移った
  3: (s) => ({ ...s, version: 4 }),
};

export const stateVersionOf = (saved) => (saved && Number.isInteger(saved.version) ? saved.version : 1);

/** このアプリより新しい版で保存されたデータか（その場合は上書きしてはいけない） */
export const isNewerVersion = (saved) => stateVersionOf(saved) > STATE_VERSION;

/** 保存データを最新の形まで順番に移行する（新しい版のデータはそのまま返す） */
export function migrateState(saved) {
  let s = saved;
  let v = stateVersionOf(s);
  while (v < STATE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`保存データ v${v} からの移行がありません`);
    s = step(s);
    v = stateVersionOf(s);
  }
  return s;
}

/** 変更履歴をたどって、今の問題IDを返す（循環していても止まる） */
export function currentId(id, renamed = {}) {
  let cur = id;
  for (let i = 0; i < 50 && Object.prototype.hasOwnProperty.call(renamed, cur); i++) cur = renamed[cur];
  return cur;
}

/**
 * 保存データ（どの版でも）を、現在の教材と突き合わせて整える。
 * - 英語を書き換えた問題の記録は、変更履歴（library.renamed）で新しいIDへ付け替える
 * - 今の教材にない問題の「覚えた」「苦手」は捨てずに残す（数には入らない。問題が戻れば復活する）
 */
export function restoreState(saved, library) {
  const base = freshState(library.chapters[0]?.id);
  if (!saved || typeof saved !== "object") return base;
  const s = migrateState(saved);
  const renamed = library.renamed || {};
  const valid = (id) => Object.prototype.hasOwnProperty.call(library.byId, id);

  const learned = {};
  for (const [id, on] of Object.entries(s.learned || {})) if (on) learned[currentId(id, renamed)] = true;

  const misses = {};
  for (const [id, n] of Object.entries(s.misses || {})) {
    const cur = currentId(id, renamed);
    if (n > 0) misses[cur] = Math.max(misses[cur] || 0, n);
  }

  const queues = {};
  for (const [ch, ids] of Object.entries(s.queues || {})) {
    if (Array.isArray(ids)) queues[ch] = ids.map((id) => currentId(id, renamed)).filter(valid);
  }

  const chapter = library.chapters.some((c) => c.id === s.chapter) ? s.chapter : base.chapter;
  return {
    ...base,
    learned,
    queues,
    misses,
    tests: s.tests && typeof s.tests === "object" ? s.tests : {},
    stats: { ...initialStats(), ...(s.stats || {}) },
    bonus: { ...initialBonus(), ...(s.bonus || {}) },
    gacha: restoreGacha(s.gacha, (id) => currentId(id, renamed)),
    battle: restoreBattle(s.battle),
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

// ---------------------------------------------------------------------------
// クラウド同期（ログイン時の進捗の統合）
// ---------------------------------------------------------------------------

const later = (a, b) => ((a || "") >= (b || "") ? a : b);

/**
 * 2つの進捗を統合する（ログイン前に端末で進めた分をアカウントに取り込むとき用）。
 * 「覚えた」は和集合、回数や最高点は大きい方、日付は新しい方を採用する。
 * b（アカウント側）の章の並び順や選択中の章を優先する。
 */
export function mergeStates(a, b, library) {
  const learned = { ...a.learned, ...b.learned };
  const misses = { ...a.misses };
  for (const [id, n] of Object.entries(b.misses || {})) misses[id] = Math.max(misses[id] || 0, n);
  const tests = { ...a.tests };
  for (const [key, t] of Object.entries(b.tests || {})) {
    const o = tests[key];
    tests[key] = o
      ? { best: Math.max(o.best, t.best), last: t.count >= o.count ? t.last : o.last, count: Math.max(o.count, t.count) }
      : t;
  }
  const sa = { ...initialStats(), ...a.stats };
  const sb = { ...initialStats(), ...b.stats };
  const newest = later(sa.lastStudyDate, sb.lastStudyDate) === sb.lastStudyDate ? sb : sa;
  const today = later(sa.todayDate, sb.todayDate);
  const stats = {
    totalSwipes: Math.max(sa.totalSwipes, sb.totalSwipes),
    totalAnswers: Math.max(sa.totalAnswers, sb.totalAnswers),
    totalShadows: Math.max(sa.totalShadows, sb.totalShadows),
    streak: Math.max(sa.lastStudyDate === sb.lastStudyDate ? Math.max(sa.streak, sb.streak) : newest.streak, 0),
    lastStudyDate: newest.lastStudyDate,
    todayDate: today,
    todayCount: Math.max(sa.todayDate === today ? sa.todayCount : 0, sb.todayDate === today ? sb.todayCount : 0),
  };
  const ba = { ...initialBonus(), ...a.bonus };
  const bb = { ...initialBonus(), ...b.bonus };
  const newerBonus = later(ba.lastClaim, bb.lastClaim) === bb.lastClaim ? bb : ba;
  const bonus = {
    ...newerBonus,
    coins: Math.max(ba.coins, bb.coins),
    totalDays: Math.max(ba.totalDays, bb.totalDays),
    goalClaimed: later(ba.goalClaimed, bb.goalClaimed),
    unlocked: [...new Set([...ba.unlocked, ...bb.unlocked])],
    theme: bb.theme,
  };
  return restoreState(
    {
      version: STATE_VERSION,
      learned,
      queues: { ...a.queues, ...b.queues },
      misses,
      tests,
      stats,
      bonus,
      gacha: mergeGacha(a.gacha, b.gacha),
      battle: mergeBattle(a.battle, b.battle),
      chapter: b.chapter,
    },
    library
  );
}

/**
 * ログインしたときに、どの進捗を使い、クラウドへ書き戻すかを決める。
 * - 端末の進捗が同じアカウントのもの → 更新が新しい方を採用（同期のずれを解消）
 * - 端末の進捗がログイン前のもの（owner なし）→ アカウントの進捗と統合
 * - 端末の進捗が別のアカウントのもの → アカウントの進捗だけを使う（混ぜない）
 * @param local  { state, owner, updatedAt }
 * @param remote { state, updatedAt } | null
 * @returns { state, upload, newerRemote } upload はクラウドへ保存し直すべきか。
 *   newerRemote はクラウドのデータがこのアプリより新しい版のもの（アプリの更新が必要）
 */
export function resolveLogin(local, remote, uid, library) {
  // 新しい版のアプリで保存されたデータは読み書きしない（古い版で上書きすると記録が欠ける）
  if (remote && isNewerVersion(remote.state)) return { state: local.state, upload: false, newerRemote: true };
  const hasLocalProgress = Object.keys(local.state.learned).length > 0 || local.state.stats.totalSwipes > 0 ||
    (local.state.stats.totalAnswers || 0) > 0 || (local.state.stats.totalShadows || 0) > 0;
  if (!remote) {
    const own = local.owner === uid || !local.owner;
    return { state: own ? local.state : freshState(library.chapters[0]?.id), upload: true };
  }
  const remoteState = restoreState(remote.state, library);
  if (local.owner === uid) {
    return (local.updatedAt || 0) > (remote.updatedAt || 0)
      ? { state: local.state, upload: true }
      : { state: remoteState, upload: false };
  }
  if (!local.owner && hasLocalProgress) return { state: mergeStates(local.state, remoteState, library), upload: true };
  return { state: remoteState, upload: false };
}

// ---------------------------------------------------------------------------
// あいまい検索（一覧の「もしかして」）
// ---------------------------------------------------------------------------

/** 入れ替わり（maek → make）も1回の間違いと数える編集距離 */
export function typoDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const HAS_JA = /[぀-ヿ㐀-鿿]/;
export const FUZZY_THRESHOLD = 0.6;

/** 検索語と1問の近さ（0〜1）。英語は単語ごとの綴りの近さ、日本語は文字の並びの一致で測る */
export function fuzzyScore(item, query) {
  let score = 0;
  const qEn = normalizeEn(query);
  if (qEn && /[a-z]/.test(qEn)) {
    const words = normalizeEn(`${item.english}`).split(" ").filter(Boolean);
    const qWords = qEn.split(" ").filter(Boolean);
    let sum = 0;
    for (const qw of qWords) {
      let best = 0;
      for (const w of words) best = Math.max(best, 1 - typoDistance(qw, w) / Math.max(qw.length, w.length));
      sum += best;
    }
    score = Math.max(score, sum / qWords.length);
  }
  if (HAS_JA.test(query)) {
    const q = normalizeJa(query);
    for (const cand of answerCandidates(item.japanese)) {
      if (!cand) continue;
      score = Math.max(score, (2 * lcsLength(q, cand)) / (q.length + cand.length));
    }
  }
  return score;
}

/**
 * 「もしかして」: 完全一致では見つからなかったが近い問題を、近い順に返す。
 * @param exclude すでに検索結果に出ている問題のID
 */
export function fuzzySearch(items, query, { exclude = new Set(), limit = 10 } = {}) {
  if ((query || "").trim().length < 2) return [];
  return items
    .filter((p) => !exclude.has(p.id))
    .map((p) => ({ item: p, score: fuzzyScore(p, query) }))
    .filter((r) => r.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}
