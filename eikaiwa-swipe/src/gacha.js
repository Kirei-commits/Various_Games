/*
 * 単語ガチャ（純粋関数。乱数は引数で受け取るので Node でテストできる）。
 *
 * - 対象は単語の章（3000語）とシークレット単語。レア度は N / R / SR / SSR。
 * - 抽選は2段階: レア度を確率で決め、そのレア度の「まだ MAX でない単語」から等確率で1語。
 *   MAX（Lv.4）の単語は出なくなり、その分の確率は同じレア度の残りに均等に回る。
 *   同じレア度がすべて MAX なら、その確率は1つ下のレア度へ（レアチケットは N を出さないので上へ）。
 * - ダブると Lv が上がる（見た目だけ。意味・例文・語源は1枚目から全部見られる）。
 * - 救済: 天井（通常100回・チケット20回で SSR 確定、10連は SR 以上1枚確定）、
 *   交換ポイント（引くたびに貯まり、好きな単語と交換）、選択チケット（ログイン日数でもらえる）。
 * - 課金はない。ポイントはログインボーナス・今日の目標・学習でもらう。
 */
import { CHAPTER_POS, POS_OVERRIDES, TRIVIA, SECRETS, TITLES } from "./data/gacha-data.js";

export const RARITIES = ["N", "R", "SR", "SSR"];
const RANK = { N: 0, R: 1, SR: 2, SSR: 3 };
/** 排出の重み（1万分率）。points=通常ガチャ、ticket=レアチケット */
export const RATES = {
  points: { N: 7450, R: 2000, SR: 450, SSR: 100 },
  ticket: { N: 0, R: 7000, SR: 2500, SSR: 500 },
};
export const PULL_COST = 100; // 通常ガチャ1回のポイント
export const PITY_SSR = { points: 100, ticket: 20 }; // この回数目で SSR 確定
export const MAX_LEVEL = 4;
export const EXCHANGE_COST = { N: 20, R: 60, SR: 150, SSR: 300 };
export const DUP_BONUS = { N: 1, R: 2, SR: 5, SSR: 10 }; // ダブったときに追加でもらえる交換ポイント
export const POS_KEYS = ["all", "noun", "verb", "adj", "other"];

// ポイントのもらい方
export const LOGIN_POINTS = 100; // 毎日のログインボーナス（1回分）
export const GOAL_POINTS = 300; // 今日の目標達成
export const STUDY_POINTS = 10; // 「覚えた」1枚・テスト1問正解ごと
export const STUDY_DAILY_CAP = 500; // 学習でもらえるのは1日この分まで
export const STARTER = { points: 1000, tickets: 1 }; // はじめてボーナス

export const levelOf = (copies) => Math.min(copies || 0, MAX_LEVEL);

export const initialGacha = () => ({
  points: 0,
  tickets: 0,
  exPoints: 0, // 交換ポイント
  selSR: 0, // SR 選択チケット
  selSSR: 0, // SSR 選択チケット
  cards: {}, // 単語ID → 引いた枚数（Lv は min(枚数, 4)）
  pity: { points: 0, ticket: 0 }, // 最後の SSR から何回引いたか
  titles: [],
  secrets: [],
  pulls: 0,
  rev: 0, // 変更のたびに増える（端末をまたいだ統合で新しい方を選ぶため）
  studyDay: null,
  studyEarned: 0,
  starter: false,
});

// ---------------------------------------------------------------------------
// カタログ（教材からガチャの対象を作る）
// ---------------------------------------------------------------------------

/**
 * 日本語訳の形から品詞を推定する（「〜る」「〜う」なら動詞、「〜い」「〜な」なら形容詞 など）。
 * 章ごとの品詞（CHAPTER_POS）が決まっていない章だけに使う。
 */
export function guessPos(japanese) {
  const first = (japanese || "")
    .split("／")[0]
    .replace(/（[^）]*）/g, "")
    .replace(/[〜~…]/g, "")
    .trim();
  if (/(ている|てる|した|った|んだ|れた|えた|きた|いた|びた|めた)$/.test(first)) return "adj";
  if (/[うくぐすつぬぶむる]$/.test(first)) return "verb";
  if (/[いなの]$/.test(first)) return "adj";
  if (/[にでとへ]$/.test(first)) return "other";
  return "noun";
}

const firstLine = (text) =>
  (text || "")
    .split("\n")[0]
    .replace(/^[A-Z]\w*\s*[:：]\s*/, "")
    .trim();

/**
 * 教材（buildLibrary の結果）と部の一覧から、ガチャのカタログを作る。
 * @returns {{ cards: Record<string, object>, pools: Record<string, Record<string, string[]>>, order: string[] }}
 */
export function buildCatalog(library, parts) {
  const cards = {};
  const order = [];
  const wordParts = parts.filter((p) => p.kind === "word");
  wordParts.forEach((part, i) => {
    const base = ["N", "R", "SR"][Math.min(i, 2)];
    for (let n = part.from; n <= part.to; n++) {
      const ch = library.chapters[n - 1];
      if (!ch) continue;
      for (const p of ch.items) {
        const chapterPos = CHAPTER_POS[ch.id];
        const trivia = TRIVIA[p.id] || null;
        cards[p.id] = {
          id: p.id,
          english: p.english,
          japanese: p.japanese,
          example: firstLine(p.exampleContext),
          exampleJa: firstLine(p.exampleJapanese),
          chapterId: ch.id,
          rarity: trivia ? "SSR" : base,
          pos: POS_OVERRIDES[p.id] || chapterPos || guessPos(p.japanese),
          trivia,
          secret: false,
        };
        order.push(p.id);
      }
    }
  });
  for (const s of SECRETS) {
    cards[s.id] = {
      id: s.id,
      english: s.english,
      japanese: s.japanese,
      example: s.example,
      exampleJa: s.exampleJa,
      chapterId: null,
      rarity: "SSR",
      pos: s.pos,
      trivia: { etymology: s.etymology, teaser: s.teaser, reveal: s.reveal },
      secret: true,
      hint: s.hint,
    };
    order.push(s.id);
  }
  const pools = {};
  for (const key of POS_KEYS) pools[key] = { N: [], R: [], SR: [], SSR: [] };
  for (const id of order) {
    const c = cards[id];
    if (c.secret) continue;
    pools.all[c.rarity].push(id);
    pools[c.pos][c.rarity].push(id);
  }
  // 図鑑の並び: レア度の高い順 → 章の順
  order.sort((a, b) => RANK[cards[b].rarity] - RANK[cards[a].rarity]);
  return { cards, pools, order };
}

// ---------------------------------------------------------------------------
// 抽選
// ---------------------------------------------------------------------------

const normalize = (g) => ({
  ...initialGacha(),
  ...g,
  cards: { ...(g?.cards || {}) },
  pity: { ...initialGacha().pity, ...(g?.pity || {}) },
  titles: [...(g?.titles || [])],
  secrets: [...(g?.secrets || [])],
});

const notMax = (g) => (id) => (g.cards[id] || 0) < MAX_LEVEL;

/** 空になったレア度の確率の行き先: 1つ下（保証・チケットの下限より下には行かない）→ なければ上 */
function redistributeTarget(r, avail, currency, guarantee) {
  const floor = Math.max(guarantee ? RANK[guarantee] : 0, currency === "ticket" ? RANK.R : 0);
  for (let k = RANK[r] - 1; k >= floor; k--) if (avail[RARITIES[k]] > 0) return RARITIES[k];
  for (let k = RANK[r] + 1; k <= RANK.SSR; k++) if (avail[RARITIES[k]] > 0) return RARITIES[k];
  return null;
}

/**
 * いまの排出の重み（MAX の除外と再分配を反映）。
 * @param guarantee "SR" | "SSR" | null  天井で、このレア度以上に限る
 * @returns {{ weights: Record<string, number>, total: number, avail: Record<string, number> }}
 */
export function effectiveWeights(gacha, catalog, pos, currency, guarantee = null) {
  const g = normalize(gacha);
  const pool = catalog.pools[pos] || catalog.pools.all;
  const avail = {};
  for (const r of RARITIES) avail[r] = pool[r].filter(notMax(g)).length;
  const weights = { ...RATES[currency] };
  if (guarantee) for (const r of RARITIES) if (RANK[r] < RANK[guarantee]) weights[r] = 0;
  for (const r of [...RARITIES].reverse()) {
    if (weights[r] > 0 && avail[r] === 0) {
      const to = redistributeTarget(r, avail, currency, guarantee);
      if (to) weights[to] += weights[r];
      weights[r] = 0;
    }
  }
  const total = RARITIES.reduce((n, r) => n + weights[r], 0);
  return { weights, total, avail };
}

/** 画面に出す「いまの確率」（%） */
export function currentRates(gacha, catalog, pos, currency) {
  const { weights, total } = effectiveWeights(gacha, catalog, pos, currency);
  const out = {};
  for (const r of RARITIES) out[r] = total ? (weights[r] / total) * 100 : 0;
  return out;
}

const pickFrom = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

function pickRarity(weights, total, rng) {
  let x = rng() * total;
  for (const r of RARITIES) {
    if (weights[r] <= 0) continue;
    if (x < weights[r]) return r;
    x -= weights[r];
  }
  return [...RARITIES].reverse().find((r) => weights[r] > 0);
}

/**
 * ガチャを引く。
 * @param opts { pos: "all"|"noun"|..., currency: "points"|"ticket", times: 1|10 }
 * @param rng () => [0, 1) の乱数
 * @returns {{ state, results?, newTitles?, newSecrets?, error? }}
 *   results[i] = { id, rarity, result: "new"|"levelup", level, byPity, exGain }
 */
export function pull(state, catalog, { pos = "all", currency = "points", times = 1 } = {}, rng = Math.random) {
  const g = normalize(state.gacha);
  const cost = currency === "points" ? PULL_COST * times : times;
  const balance = currency === "points" ? g.points : g.tickets;
  if (balance < cost) {
    return { state, error: currency === "points" ? `ポイントが ${cost - balance} 足りません` : "レアチケットが足りません" };
  }
  if (effectiveWeights(g, catalog, pos, currency).total === 0) {
    return { state, error: "この種類の単語は、すべて MAX です" };
  }
  const pool = catalog.pools[pos] || catalog.pools.all;
  const results = [];
  let gotSrPlus = false;
  for (let i = 0; i < times; i++) {
    let guarantee = null;
    if (g.pity[currency] + 1 >= PITY_SSR[currency]) guarantee = "SSR";
    else if (times >= 10 && i === times - 1 && !gotSrPlus) guarantee = "SR";
    let { weights, total } = effectiveWeights(g, catalog, pos, currency, guarantee);
    if (total === 0) {
      // 保証のレア度がすべて MAX → 保証なしで引く
      guarantee = null;
      ({ weights, total } = effectiveWeights(g, catalog, pos, currency));
    }
    if (total === 0) break; // 途中ですべて MAX になった（残りの回数分は下で返す）
    const rarity = pickRarity(weights, total, rng);
    const candidates = pool[rarity].filter(notMax(g));
    const unowned = guarantee === "SSR" ? candidates.filter((id) => !g.cards[id]) : [];
    const id = pickFrom(unowned.length ? unowned : candidates, rng);
    const before = g.cards[id] || 0;
    g.cards[id] = before + 1;
    const exGain = 1 + (before > 0 ? DUP_BONUS[rarity] : 0);
    g.exPoints += exGain;
    g.pity[currency] = rarity === "SSR" ? 0 : g.pity[currency] + 1;
    if (RANK[rarity] >= RANK.SR) gotSrPlus = true;
    results.push({
      id,
      rarity,
      result: before === 0 ? "new" : "levelup",
      level: levelOf(before + 1),
      byPity: guarantee && RANK[rarity] >= RANK[guarantee] ? guarantee : null,
      exGain,
    });
  }
  const used = currency === "points" ? PULL_COST * results.length : results.length;
  if (currency === "points") g.points -= used;
  else g.tickets -= used;
  g.pulls += results.length;
  g.rev += 1;
  const { gacha, newTitles, newSecrets } = evaluateRewards(g, catalog);
  return { state: { ...state, gacha }, results, newTitles, newSecrets };
}

/**
 * 交換所: 好きな単語を1枚もらう（未所持なら獲得、所持なら Lv+1）。
 * @param payWith "exPoints" | "selSR" | "selSSR"（選択チケットは、そのレア度の未所持の単語だけ）
 */
export function exchange(state, catalog, id, payWith = "exPoints") {
  const g = normalize(state.gacha);
  const card = catalog.cards[id];
  if (!card || card.secret) return { state, error: "この単語は交換できません" };
  const copies = g.cards[id] || 0;
  if (copies >= MAX_LEVEL) return { state, error: "すでに MAX です" };
  if (payWith === "exPoints") {
    const cost = EXCHANGE_COST[card.rarity];
    if (g.exPoints < cost) return { state, error: `交換ポイントが ${cost - g.exPoints} 足りません` };
    g.exPoints -= cost;
  } else {
    const need = payWith === "selSR" ? "SR" : "SSR";
    if (card.rarity !== need) return { state, error: `${need} 選択チケットは ${need} の単語にだけ使えます` };
    if (copies > 0) return { state, error: "選択チケットは、まだ持っていない単語にだけ使えます" };
    if (g[payWith] < 1) return { state, error: "選択チケットがありません" };
    g[payWith] -= 1;
  }
  g.cards[id] = copies + 1;
  g.rev += 1;
  const { gacha, newTitles, newSecrets } = evaluateRewards(g, catalog);
  return { state: { ...state, gacha }, result: { id, rarity: card.rarity, result: copies ? "levelup" : "new", level: levelOf(copies + 1) }, newTitles, newSecrets };
}

// ---------------------------------------------------------------------------
// 称号・シークレット
// ---------------------------------------------------------------------------

const owns = (g, id) => (g.cards[id] || 0) > 0;

export function titleProgress(gacha, catalog, rule) {
  const g = normalize(gacha);
  const owned = Object.keys(g.cards).filter((id) => owns(g, id) && catalog.cards[id]);
  switch (rule.type) {
    case "set":
      return { have: rule.ids.filter((id) => owns(g, id)).length, need: rule.ids.length };
    case "count":
      return { have: owned.length, need: rule.min };
    case "rarity":
      return { have: owned.filter((id) => catalog.cards[id].rarity === rule.rarity).length, need: rule.min };
    case "max":
      return { have: owned.filter((id) => g.cards[id] >= MAX_LEVEL).length, need: rule.min };
    default:
      return { have: 0, need: 1 };
  }
}

/** シークレット解放と称号の獲得を判定する（新しく得たものを返す） */
export function evaluateRewards(gacha, catalog) {
  const g = normalize(gacha);
  const newSecrets = [];
  for (const s of SECRETS) {
    if (g.secrets.includes(s.id)) continue;
    if (s.rule.ids.filter((id) => owns(g, id)).length >= s.rule.min) {
      g.secrets.push(s.id);
      g.cards[s.id] = Math.max(g.cards[s.id] || 0, 1);
      newSecrets.push(s.id);
    }
  }
  const newTitles = [];
  for (const t of TITLES) {
    if (g.titles.includes(t.id)) continue;
    const { have, need } = titleProgress(g, catalog, t.rule);
    if (have >= need) {
      g.titles.push(t.id);
      newTitles.push(t.id);
    }
  }
  return { gacha: g, newTitles, newSecrets };
}

// ---------------------------------------------------------------------------
// ポイントをもらう
// ---------------------------------------------------------------------------

const withGacha = (state, fn) => {
  const g = normalize(state.gacha);
  fn(g);
  g.rev += 1;
  return { ...state, gacha: g };
};

/** はじめてガチャ画面を開いたときのボーナス（1回だけ） */
export function claimStarter(state) {
  if (state.gacha?.starter) return state;
  return withGacha(state, (g) => {
    g.starter = true;
    g.points += STARTER.points;
    g.tickets += STARTER.tickets;
  });
}

/**
 * ログインボーナスのガチャ分: 毎日 100pt、7日ごとにレアチケット、
 * 連続30日ごとに SR 選択チケット、累計100日ごとに SSR 選択チケット。
 */
export function loginGachaReward(day, totalDays) {
  return {
    points: LOGIN_POINTS,
    tickets: day % 7 === 0 ? 1 : 0,
    selSR: day % 30 === 0 ? 1 : 0,
    selSSR: totalDays % 100 === 0 ? 1 : 0,
  };
}

export function grant(state, { points = 0, tickets = 0, selSR = 0, selSSR = 0 }) {
  if (!points && !tickets && !selSR && !selSSR) return state;
  return withGacha(state, (g) => {
    g.points += points;
    g.tickets += tickets;
    g.selSR += selSR;
    g.selSSR += selSSR;
  });
}

/** 学習でポイントをもらう（1日 STUDY_DAILY_CAP まで）。count は「覚えた」枚数や正解数 */
export function earnStudyPoints(state, today, count = 1) {
  if (count <= 0) return state;
  const g0 = normalize(state.gacha);
  const earned = g0.studyDay === today ? g0.studyEarned : 0;
  const add = Math.min(count * STUDY_POINTS, STUDY_DAILY_CAP - earned);
  if (add <= 0) return state;
  return withGacha(state, (g) => {
    g.studyDay = today;
    g.studyEarned = earned + add;
    g.points += add;
  });
}

// ---------------------------------------------------------------------------
// 保存データ
// ---------------------------------------------------------------------------

const nonNegInt = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** 保存データのガチャ部分を整える。rename は問題IDの付け替え（教材の英語を直したとき） */
export function restoreGacha(saved, rename = (id) => id) {
  const base = initialGacha();
  if (!saved || typeof saved !== "object") return base;
  const cards = {};
  for (const [id, n] of Object.entries(saved.cards || {})) {
    const cur = rename(id);
    if (nonNegInt(n) > 0) cards[cur] = Math.max(cards[cur] || 0, nonNegInt(n));
  }
  return {
    ...base,
    points: nonNegInt(saved.points),
    tickets: nonNegInt(saved.tickets),
    exPoints: nonNegInt(saved.exPoints),
    selSR: nonNegInt(saved.selSR),
    selSSR: nonNegInt(saved.selSSR),
    cards,
    pity: { points: nonNegInt(saved.pity?.points), ticket: nonNegInt(saved.pity?.ticket) },
    titles: Array.isArray(saved.titles) ? [...new Set(saved.titles)] : [],
    secrets: Array.isArray(saved.secrets) ? [...new Set(saved.secrets)] : [],
    pulls: nonNegInt(saved.pulls),
    rev: nonNegInt(saved.rev),
    studyDay: typeof saved.studyDay === "string" ? saved.studyDay : null,
    studyEarned: nonNegInt(saved.studyEarned),
    starter: !!saved.starter,
  };
}

/**
 * 2台の端末のガチャを統合する。ポイントや天井は変更の多い（rev が大きい）方を使い、
 * 集めた単語は枚数の多い方、称号とシークレットは和集合にする（集めたものは失わない）。
 */
export function mergeGacha(a, b) {
  const ga = restoreGacha(a);
  const gb = restoreGacha(b);
  const base = gb.rev >= ga.rev ? gb : ga;
  const cards = { ...ga.cards };
  for (const [id, n] of Object.entries(gb.cards)) cards[id] = Math.max(cards[id] || 0, n);
  return {
    ...base,
    cards,
    titles: [...new Set([...ga.titles, ...gb.titles])],
    secrets: [...new Set([...ga.secrets, ...gb.secrets])],
    pulls: Math.max(ga.pulls, gb.pulls),
    starter: ga.starter || gb.starter,
  };
}
