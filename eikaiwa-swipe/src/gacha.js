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
 * - 課金はない。ポイントはログインボーナス・今日の目標・学習・テスト・バトル・コード入力でもらう。
 * - 学習・テスト・バトルのポイントは「かかった時間」に比例させる（どれで遊んでも1分あたりほぼ同じ）。
 * - 5倍ブースト（ログインボーナスでもらえる）を使うと、1時間は学習・テスト・バトルのポイントが5倍。
 */
import { CHAPTER_POS, POS_OVERRIDES, TRIVIA, SECRETS, TITLES } from "./data/gacha-data.js";

export const RARITIES = ["N", "R", "SR", "SSR"];
const RANK = { N: 0, R: 1, SR: 2, SSR: 3 };
/**
 * 排出の重み（1万分率）。points=通常ガチャ、ticket=レアチケット（R 以上）、
 * sr=SR ガチャチケット（SR 以上）、ssr=SSR ガチャチケット（SSR 確定）
 */
export const RATES = {
  points: { N: 9390, R: 500, SR: 100, SSR: 10 }, // N 93.9%・R 5%・SR 1%・SSR 0.1%（すぐにコンプリートしないように）
  ticket: { N: 0, R: 7000, SR: 2500, SSR: 500 },
  sr: { N: 0, R: 0, SR: 8500, SSR: 1500 },
  ssr: { N: 0, R: 0, SR: 0, SSR: 10000 },
};
/** 通貨ごとの、ガチャの記録の中の残高の名前 */
export const BALANCE_KEY = { points: "points", ticket: "tickets", sr: "srTickets", ssr: "ssrTickets" };
/** その通貨で出る最低のレア度 */
const FLOOR_RANK = { points: 0, ticket: 1, sr: 2, ssr: 3 };
export const PULL_COST = 100; // 通常ガチャ1回のポイント
export const PITY_SSR = { points: 100, ticket: 20, sr: 10 }; // この回数目で SSR 確定
export const MAX_LEVEL = 4;
/** 図鑑の交換所で1枚もらうのに必要な交換ポイント（やり込み向けに高め） */
export const EXCHANGE_COST = { N: 200, R: 800, SR: 3000, SSR: 10000 };
/** ダブったときにもらえるメダル（ショップで道具と交換） */
export const DUP_MEDALS = { N: 1, R: 3, SR: 10, SSR: 30 };
/** チケットの交換: 下のチケット100枚で上のチケット1枚 */
export const TICKET_UPGRADE = 100;
/** メダルショップ */
export const SHOP = [
  { id: "boost", name: "5倍ブースト", price: 150, desc: "1時間、学習・テスト・バトルのポイントが5倍" },
  { id: "freeze", name: "時止めの砂時計", price: 40, desc: "バトル中、敵の動きを5秒止める" },
  { id: "special", name: "必殺技の巻物", price: 60, desc: "バトル中、わからない単語の敵を一撃で倒す（苦手に入ります）" },
];
export const POS_KEYS = ["all", "noun", "verb", "adj", "other"];

// ポイントのもらい方
export const LOGIN_POINTS = 1000; // 毎日のログインボーナス（1回分）
export const GOAL_POINTS = 3000; // 今日の目標達成
export const POINTS_PER_MINUTE = 600; // 学習・テスト・バトルで、1分あたりにもらえるポイント
export const BOOST_RATE = 5; // 5倍ブースト
export const BOOST_MS = 60 * 60 * 1000; // ブーストが続く時間（1時間）
export const STARTER = { points: 1000, tickets: 1 }; // はじめてボーナス
export const MULTI_PULLS = [1, 10, 50, 100, 500, 1000]; // 選べる連数
export const MAX_PULLS = 5000; // 「全部引く」で一度に引く上限
export const CODE_DAILY_LIMIT = 5; // コード入力は1日5回まで
export const DEV_CODE = "aaa"; // 開発者コード: ポイント無限

export const levelOf = (copies) => Math.min(copies || 0, MAX_LEVEL);

export const initialGacha = () => ({
  points: 0,
  tickets: 0,
  exPoints: 0, // 交換ポイント
  selSR: 0, // SR 選択チケット
  selSSR: 0, // SSR 選択チケット
  cards: {}, // 単語ID → 引いた枚数（Lv は min(枚数, 4)）
  pity: { points: 0, ticket: 0, sr: 0 }, // 最後の SSR から何回引いたか
  titles: [],
  secrets: [],
  pulls: 0,
  rev: 0, // 変更のたびに増える（端末をまたいだ統合で新しい方を選ぶため）
  studyDay: null,
  studyEarned: 0,
  starter: false,
  boosts: 0, // 5倍ブーストの所持数
  boostUntil: 0, // ブーストが切れる時刻（ms）
  codeDay: null, // コードを最後に入れた日
  codeCount: 0, // その日に入れた回数
  codesUsed: [], // 入れたことのある単語ID（同じ単語は1回だけ）
  unlimited: false, // 開発者コードでポイント無限
  srTickets: 0, // SR ガチャチケット（SR 以上）
  ssrTickets: 0, // SSR ガチャチケット（SSR 確定）
  medals: 0, // ダブりメダル
  items: { freeze: 0, special: 0 }, // バトルの道具
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
  codesUsed: [...(g?.codesUsed || [])],
  items: { ...initialGacha().items, ...(g?.items || {}) },
});

const notMax = (g) => (id) => (g.cards[id] || 0) < MAX_LEVEL;

/** 空になったレア度の確率の行き先: 1つ下（保証・チケットの下限より下には行かない）→ なければ上 */
function redistributeTarget(r, avail, currency, guarantee) {
  const floor = Math.max(guarantee ? RANK[guarantee] : 0, FLOOR_RANK[currency] || 0);
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
  if (!RATES[currency]) return { state, error: "ない種類のガチャです" };
  const key = BALANCE_KEY[currency];
  const free = currency === "points" && g.unlimited;
  const cost = free ? 0 : currency === "points" ? PULL_COST * times : times;
  const balance = g[key];
  if (balance < cost) {
    const names = { ticket: "レアチケット", sr: "SR ガチャチケット", ssr: "SSR ガチャチケット" };
    return { state, error: currency === "points" ? `ポイントが ${cost - balance} 足りません` : `${names[currency]}が足りません` };
  }
  if (effectiveWeights(g, catalog, pos, currency).total === 0) {
    return { state, error: "この種類の単語は、すべて MAX です" };
  }
  const pool = catalog.pools[pos] || catalog.pools.all;
  const results = [];
  let gotSrPlus = false;
  for (let i = 0; i < times; i++) {
    // 10回ごとに SR 以上1枚確定（50連なら5回分）
    if (i % 10 === 0) gotSrPlus = false;
    let guarantee = null;
    if ((g.pity[currency] || 0) + 1 >= PITY_SSR[currency]) guarantee = "SSR";
    else if (times >= 10 && i % 10 === 9 && !gotSrPlus) guarantee = "SR";
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
    const exGain = 1;
    const medals = before > 0 ? DUP_MEDALS[rarity] : 0;
    g.exPoints += exGain;
    g.medals += medals;
    if (PITY_SSR[currency]) g.pity[currency] = rarity === "SSR" ? 0 : (g.pity[currency] || 0) + 1;
    if (RANK[rarity] >= RANK.SR) gotSrPlus = true;
    results.push({
      id,
      rarity,
      result: before === 0 ? "new" : "levelup",
      level: levelOf(before + 1),
      byPity: guarantee && RANK[rarity] >= RANK[guarantee] ? guarantee : null,
      exGain,
      medals,
    });
  }
  const used = free ? 0 : currency === "points" ? PULL_COST * results.length : results.length;
  g[key] -= used;
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

/** 毎日のログインでもらえる SR ガチャチケットの枚数 */
export const LOGIN_SR_TICKETS = 3;
/**
 * ログインボーナスのガチャ分: 毎日 1000pt・5倍ブースト1つ・SR ガチャチケット3枚、
 * 累計3日ごとに SSR ガチャチケット1枚、連続7日ごとにレアチケット1枚。
 * （以前の選択チケットは配らない。持っている分は図鑑でそのまま使える）
 */
export function loginGachaReward(day, totalDays) {
  return {
    points: LOGIN_POINTS,
    boosts: 1,
    srTickets: LOGIN_SR_TICKETS,
    ssrTickets: totalDays % 3 === 0 ? 1 : 0,
    tickets: day % 7 === 0 ? 1 : 0,
  };
}

export function grant(state, { points = 0, tickets = 0, selSR = 0, selSSR = 0, boosts = 0, srTickets = 0, ssrTickets = 0, medals = 0 }) {
  if (!points && !tickets && !selSR && !selSSR && !boosts && !srTickets && !ssrTickets && !medals) return state;
  return withGacha(state, (g) => {
    g.boosts += boosts;
    g.srTickets += srTickets;
    g.ssrTickets += ssrTickets;
    g.medals += medals;
    g.points += points;
    g.tickets += tickets;
    g.selSR += selSR;
    g.selSSR += selSSR;
  });
}

/** 5倍ブーストが効いているか */
export const boostActive = (gacha, now) => (gacha?.boostUntil || 0) > now;

/** ブーストの倍率（効いていれば BOOST_RATE、なければ 1） */
export const boostRate = (gacha, now) => (boostActive(gacha, now) ? BOOST_RATE : 1);

/** かかった時間（秒）に応じたポイント（ブーストの倍率はかけない） */
export const pointsForTime = (seconds) => Math.max(0, Math.round((Math.max(0, seconds) * POINTS_PER_MINUTE) / 60));

/**
 * 学習・テストでポイントをもらう。seconds は実際に取り組んだ時間（放置した時間は呼ぶ側で除く）。
 * ブーストが効いていれば5倍。@returns {{ state, points }}
 */
export function earnTimePoints(state, seconds, now) {
  const points = pointsForTime(seconds) * boostRate(state.gacha, now);
  if (points <= 0) return { state, points: 0 };
  return { state: withGacha(state, (g) => (g.points += points)), points };
}

/**
 * チケットを上のチケットに交換する（100枚 → 1枚）。
 * @param to "sr"（レアチケット → SR ガチャチケット）| "ssr"（SR → SSR ガチャチケット）
 */
export function upgradeTickets(state, to) {
  const from = to === "sr" ? "tickets" : to === "ssr" ? "srTickets" : null;
  if (!from) return { state, error: "交換できないチケットです" };
  const g0 = normalize(state.gacha);
  if (g0[from] < TICKET_UPGRADE) return { state, error: `あと ${TICKET_UPGRADE - g0[from]} 枚で交換できます` };
  return {
    state: withGacha(state, (g) => {
      g[from] -= TICKET_UPGRADE;
      g[BALANCE_KEY[to]] += 1;
    }),
  };
}

/** メダルショップで買う（ブーストはブーストの所持数、ほかはバトルの道具に入る） */
export function buyItem(state, id) {
  const item = SHOP.find((x) => x.id === id);
  if (!item) return { state, error: "ない商品です" };
  const g0 = normalize(state.gacha);
  if (g0.medals < item.price) return { state, error: `メダルが ${item.price - g0.medals} 枚足りません` };
  return {
    state: withGacha(state, (g) => {
      g.medals -= item.price;
      if (id === "boost") g.boosts += 1;
      else g.items[id] = (g.items[id] || 0) + 1;
    }),
  };
}

/** バトルの道具を1つ使う（なければ error） */
export function consumeItem(state, id) {
  const g0 = normalize(state.gacha);
  if (!(g0.items[id] > 0)) return { state, error: "持っていません" };
  return { state: withGacha(state, (g) => (g.items[id] -= 1)) };
}

/** 5倍ブーストを1つ使う（使用中なら1時間延長） */
export function activateBoost(state, now) {
  const g0 = normalize(state.gacha);
  if (g0.boosts < 1) return { state, error: "5倍ブーストを持っていません" };
  return {
    state: withGacha(state, (g) => {
      g.boosts -= 1;
      g.boostUntil = Math.max(now, g.boostUntil) + BOOST_MS;
    }),
  };
}

// ---------------------------------------------------------------------------
// コード入力: 英単語を入れるとポイント（難しい単語ほど多い）。1日5回まで・同じ単語は1回だけ
// ---------------------------------------------------------------------------

/** レア度ごとのポイントの幅（短い単語ほど下、長い単語ほど上） */
export const CODE_POINTS = {
  N: [1000, 5000],
  R: [5000, 20000],
  SR: [20000, 50000],
  SSR: [50000, 90000],
  secret: [100000, 100000],
};

/** 単語のコードの価値（ポイント） */
export function codeValue(card) {
  const [lo, hi] = CODE_POINTS[card.secret ? "secret" : card.rarity];
  const letters = card.english.replace(/[^a-z]/gi, "").length;
  const t = Math.min(1, Math.max(0, (letters - 3) / 9));
  return Math.round((lo + (hi - lo) * t) / 10) * 10;
}

const codeIndex = new WeakMap();
/** 英語（小文字）→ カード。カタログごとに1回だけ作る */
function findCard(catalog, text) {
  let index = codeIndex.get(catalog);
  if (!index) {
    index = new Map(Object.values(catalog.cards).map((c) => [c.english.toLowerCase(), c]));
    codeIndex.set(catalog, index);
  }
  return index.get(text) || null;
}

export const codesLeft = (gacha, today) => (gacha?.codeDay === today ? Math.max(0, CODE_DAILY_LIMIT - gacha.codeCount) : CODE_DAILY_LIMIT);

/**
 * コードを入れる。
 * @returns {{ state, points?, card?, unlimited?, error? }}
 */
export function redeemCode(state, catalog, code, today) {
  const text = String(code || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return { state, error: "コードを入れてください" };
  if (text === DEV_CODE) {
    return { state: withGacha(state, (g) => (g.unlimited = true)), unlimited: true };
  }
  const g0 = normalize(state.gacha);
  if (codesLeft(g0, today) <= 0) return { state, error: `今日はもう ${CODE_DAILY_LIMIT} 回入れました。また明日！` };
  const card = findCard(catalog, text);
  if (!card) return { state, error: "その単語は単語帳にありません（スペルを確かめてください）" };
  if (g0.codesUsed.includes(card.id)) return { state, error: `「${card.english}」はもう使いました。別の単語を入れてください` };
  const points = codeValue(card);
  return {
    state: withGacha(state, (g) => {
      g.codeCount = g.codeDay === today ? g.codeCount + 1 : 1;
      g.codeDay = today;
      g.codesUsed.push(card.id);
      g.points += points;
    }),
    points,
    card,
  };
}

/** 開発者モード（ポイント無限）をやめる */
export const endUnlimited = (state) => withGacha(state, (g) => (g.unlimited = false));

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
    pity: { points: nonNegInt(saved.pity?.points), ticket: nonNegInt(saved.pity?.ticket), sr: nonNegInt(saved.pity?.sr) },
    titles: Array.isArray(saved.titles) ? [...new Set(saved.titles)] : [],
    secrets: Array.isArray(saved.secrets) ? [...new Set(saved.secrets)] : [],
    pulls: nonNegInt(saved.pulls),
    rev: nonNegInt(saved.rev),
    studyDay: typeof saved.studyDay === "string" ? saved.studyDay : null,
    studyEarned: nonNegInt(saved.studyEarned),
    starter: !!saved.starter,
    boosts: nonNegInt(saved.boosts),
    boostUntil: nonNegInt(saved.boostUntil),
    codeDay: typeof saved.codeDay === "string" ? saved.codeDay : null,
    codeCount: nonNegInt(saved.codeCount),
    codesUsed: Array.isArray(saved.codesUsed) ? [...new Set(saved.codesUsed.map(rename))] : [],
    unlimited: !!saved.unlimited,
    srTickets: nonNegInt(saved.srTickets),
    ssrTickets: nonNegInt(saved.ssrTickets),
    medals: nonNegInt(saved.medals),
    items: { freeze: nonNegInt(saved.items?.freeze), special: nonNegInt(saved.items?.special) },
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
    codesUsed: [...new Set([...ga.codesUsed, ...gb.codesUsed])],
  };
}
