import { test } from "node:test";
import assert from "node:assert/strict";
import raw, { PARTS } from "../../src/data/index.js";
import { SECRETS, TITLES, TRIVIA } from "../../src/data/gacha-data.js";
import {
  buildLibrary,
  mulberry32,
  freshState,
  restoreState,
  mergeStates,
  claimDailyBonus,
  claimGoalBonus,
  STATE_VERSION,
} from "../../src/logic.js";
import {
  buildCatalog,
  pull,
  exchange,
  effectiveWeights,
  currentRates,
  claimStarter,
  earnStudyPoints,
  guessPos,
  grant,
  RATES,
  PITY_SSR,
  MAX_LEVEL,
  EXCHANGE_COST,
  STUDY_DAILY_CAP,
  STARTER,
} from "../../src/gacha.js";

const lib = buildLibrary(raw);
const catalog = buildCatalog(lib, PARTS);
const withPoints = (points, tickets = 0) => grant(freshState(), { points, tickets });

test("カタログ: 単語3000語＋シークレット。基礎=N・生活=R・応用=SR、語源のある単語は SSR", () => {
  const ids = Object.keys(catalog.cards);
  assert.equal(ids.length, 3000 + SECRETS.length);
  assert.equal(catalog.cards.go.rarity, "N");
  assert.equal(catalog.cards.school.rarity, "SSR");
  assert.equal(catalog.cards.revenue.rarity, "SR");
  assert.equal(catalog.pools.all.SSR.length, Object.keys(TRIVIA).length);
  // 語源データと称号・シークレットの条件が、実在する単語を指している
  for (const id of Object.keys(TRIVIA)) assert.ok(catalog.cards[id], `TRIVIA: ${id}`);
  for (const s of SECRETS) for (const id of s.rule.ids) assert.ok(catalog.cards[id], `SECRET ${s.id}: ${id}`);
  for (const t of TITLES) for (const id of t.rule.ids || []) assert.ok(catalog.cards[id], `TITLE ${t.id}: ${id}`);
  // シークレットはガチャに出ない
  assert.ok(!catalog.pools.all.SSR.some((id) => catalog.cards[id].secret));
});

test("品詞の推定: 〜る は動詞、〜い・〜な は形容詞、それ以外は名詞", () => {
  assert.equal(guessPos("落ちる／転ぶ"), "verb");
  assert.equal(guessPos("（サイズが）合う"), "verb");
  assert.equal(guessPos("明るい"), "adj");
  assert.equal(guessPos("有名な"), "adj");
  assert.equal(guessPos("疲れた"), "adj");
  assert.equal(guessPos("パン"), "noun");
  assert.equal(catalog.cards.whisk.pos, "verb");
  assert.equal(catalog.cards.go.pos, "verb");
});

test("排出確率は通常 74.5/20/4.5/1.0、レアチケット 0/70/25/5", () => {
  const r = currentRates(freshState().gacha, catalog, "all", "points");
  assert.deepEqual([r.N, r.R, r.SR, r.SSR].map((x) => Math.round(x * 10) / 10), [74.5, 20, 4.5, 1]);
  const t = currentRates(freshState().gacha, catalog, "all", "ticket");
  assert.deepEqual([t.N, t.R, t.SR, t.SSR], [0, 70, 25, 5]);
});

test("たくさん引くと、出たレア度の割合が表示確率に近い", () => {
  let s = withPoints(100 * 6000);
  const rng = mulberry32(42);
  const count = { N: 0, R: 0, SR: 0, SSR: 0 };
  // 単発で引く（10連の SR 確定枠を含めない）。集めた単語は毎回リセットして、MAX による再分配の影響を除く
  for (let i = 0; i < 6000; i++) {
    const r = pull({ ...s, gacha: { ...s.gacha, cards: {} } }, catalog, { times: 1 }, rng);
    s = r.state;
    for (const x of r.results) count[x.rarity]++;
  }
  const n = 6000;
  assert.ok(Math.abs(count.N / n - 0.745) < 0.03, JSON.stringify(count));
  // SSR は 1% ＋100回天井で、平均すると約1.6%
  assert.ok(count.SSR / n > 0.011 && count.SSR / n < 0.021, JSON.stringify(count));
});

test("ポイントを使い、足りなければ引けない", () => {
  const s = withPoints(150);
  const r = pull(s, catalog, { times: 1 }, mulberry32(1));
  assert.equal(r.state.gacha.points, 50);
  assert.equal(r.results.length, 1);
  assert.match(pull(r.state, catalog, { times: 1 }, mulberry32(1)).error, /足りません/);
  assert.match(pull(s, catalog, { times: 10 }, mulberry32(1)).error, /足りません/);
});

test("10連は SR 以上が1枚確定", () => {
  // 乱数が常に 0 → 毎回 N の先頭（レア度の抽選で N が選ばれる）
  const r = pull(withPoints(1000), catalog, { times: 10 }, () => 0);
  assert.equal(r.results.filter((x) => x.rarity === "N").length, 9);
  assert.ok(["SR", "SSR"].includes(r.results[9].rarity));
  assert.equal(r.results[9].byPity, "SR");
});

test("天井: 通常ガチャ100回目・レアチケット20回目は SSR 確定で、未所持を優先する", () => {
  let s = withPoints(100 * PITY_SSR.points, 0);
  s = { ...s, gacha: { ...s.gacha, pity: { points: PITY_SSR.points - 1, ticket: PITY_SSR.ticket - 1 }, tickets: 1 } };
  const r = pull(s, catalog, { times: 1 }, () => 0);
  assert.equal(r.results[0].rarity, "SSR");
  assert.equal(r.results[0].byPity, "SSR");
  assert.equal(r.state.gacha.pity.points, 0);
  const t = pull(s, catalog, { currency: "ticket", times: 1 }, () => 0);
  assert.equal(t.results[0].rarity, "SSR");
});

test("ダブりで Lv が上がり、MAX（Lv.4）になった単語は出なくなる", () => {
  const nouns = catalog.pools.all.N;
  // N を1語だけ残してすべて MAX にする
  const cards = Object.fromEntries(nouns.slice(1).map((id) => [id, MAX_LEVEL]));
  let s = withPoints(100 * 10);
  s = { ...s, gacha: { ...s.gacha, cards } };
  const rng = () => 0; // 常に N を引く
  const levels = [];
  for (let i = 0; i < 4; i++) {
    const r = pull(s, catalog, { times: 1 }, rng);
    s = r.state;
    assert.equal(r.results[0].id, nouns[0]);
    levels.push(r.results[0].level);
  }
  assert.deepEqual(levels, [1, 2, 3, 4]);
  // N がすべて MAX → N の確率は1つ下がないので上（R）に回る
  const w = effectiveWeights(s.gacha, catalog, "all", "points");
  assert.equal(w.weights.N, 0);
  assert.equal(w.weights.R, RATES.points.N + RATES.points.R);
  assert.notEqual(pull(s, catalog, { times: 1 }, rng).results[0].rarity, "N");
});

test("再分配: SSR がすべて MAX なら SR へ。レアチケットは R がなくなっても N には流さない", () => {
  const ssrMax = Object.fromEntries(catalog.pools.all.SSR.map((id) => [id, MAX_LEVEL]));
  const w = effectiveWeights({ cards: ssrMax }, catalog, "all", "points");
  assert.equal(w.weights.SSR, 0);
  assert.equal(w.weights.SR, RATES.points.SR + RATES.points.SSR);
  const rMax = Object.fromEntries(catalog.pools.all.R.map((id) => [id, MAX_LEVEL]));
  const t = effectiveWeights({ cards: rMax }, catalog, "all", "ticket");
  assert.equal(t.weights.N, 0);
  assert.equal(t.weights.SR, RATES.ticket.SR + RATES.ticket.R);
});

test("品詞別ガチャは、その品詞の単語だけが出る", () => {
  let s = withPoints(100 * 50);
  const rng = mulberry32(7);
  for (let i = 0; i < 5; i++) {
    const r = pull(s, catalog, { pos: "verb", times: 10 }, rng);
    s = r.state;
    for (const x of r.results) assert.equal(catalog.cards[x.id].pos, "verb", x.id);
  }
});

test("交換ポイント: 1回ごとに1、ダブりで追加。好きな単語と交換できる", () => {
  const r = pull(withPoints(1000), catalog, { times: 10 }, mulberry32(3));
  assert.ok(r.state.gacha.exPoints >= 10);
  let s = { ...r.state, gacha: { ...r.state.gacha, exPoints: EXCHANGE_COST.SSR } };
  const e = exchange(s, catalog, "sandwich");
  assert.equal(e.error, undefined);
  assert.equal(e.state.gacha.cards.sandwich, 1);
  assert.equal(e.state.gacha.exPoints, 0);
  assert.match(exchange(e.state, catalog, "sandwich").error, /足りません/);
  // シークレットは交換できない
  assert.ok(exchange(s, catalog, "secret-unicorn").error);
});

test("選択チケットは、そのレア度の未所持の単語にだけ使える", () => {
  const s = grant(freshState(), { selSSR: 1 });
  assert.ok(exchange(s, catalog, "go", "selSSR").error);
  const e = exchange(s, catalog, "robot", "selSSR");
  assert.equal(e.state.gacha.cards.robot, 1);
  assert.equal(e.state.gacha.selSSR, 0);
});

test("シークレット単語: com の付く単語を3つ集めると companion が解放される", () => {
  let s = grant(freshState(), {});
  s = { ...s, gacha: { ...s.gacha, exPoints: 10000 } };
  s = exchange(s, catalog, "company").state;
  s = exchange(s, catalog, "combine").state;
  const r = exchange(s, catalog, "compete");
  assert.deepEqual(r.newSecrets, ["secret-companion"]);
  assert.equal(r.state.gacha.cards["secret-companion"], 1);
});

test("称号: テーマの単語をそろえると獲得（天体観測者）", () => {
  let s = { ...freshState(), gacha: { ...freshState().gacha, exPoints: 10000 } };
  let got = [];
  for (const id of ["sun", "moon", "star", "planet", "sky"]) {
    const r = exchange(s, catalog, id);
    s = r.state;
    got = got.concat(r.newTitles);
  }
  assert.ok(got.includes("stargazer"));
});

test("ポイントのもらい方: はじめてボーナス・ログイン・今日の目標・学習（1日の上限あり）", () => {
  let s = claimStarter(freshState());
  assert.equal(s.gacha.points, STARTER.points);
  assert.equal(claimStarter(s).gacha.points, STARTER.points); // 2回目はもらえない

  const { state, reward } = claimDailyBonus(freshState(), "2026-01-07", "2026-01-06");
  assert.equal(state.gacha.points, 100);
  assert.equal(reward.gacha.points, 100);
  // 7日連続でレアチケット
  let w = freshState();
  for (let d = 1; d <= 7; d++) {
    const day = `2026-01-0${d}`;
    const prev = d === 1 ? "2025-12-31" : `2026-01-0${d - 1}`;
    w = claimDailyBonus(w, day, prev).state;
  }
  assert.equal(w.gacha.tickets, 1);

  let g = { ...freshState(), stats: { ...freshState().stats, todayDate: "2026-01-01", todayCount: 20 } };
  g = claimGoalBonus(g, "2026-01-01");
  assert.equal(g.gacha.points, 300);

  let st = freshState();
  for (let i = 0; i < 100; i++) st = earnStudyPoints(st, "2026-01-01", 1);
  assert.equal(st.gacha.points, STUDY_DAILY_CAP);
  st = earnStudyPoints(st, "2026-01-02", 1);
  assert.equal(st.gacha.points, STUDY_DAILY_CAP + 10);
});

test("保存データ: v2 から v3 へ移行し、ガチャのデータは端末をまたいでも失わない", () => {
  assert.equal(STATE_VERSION, 3);
  const old = { version: 2, learned: { "make-sense": true }, queues: {}, misses: {}, tests: {}, stats: {} };
  const s = restoreState(old, lib);
  assert.equal(s.gacha.points, 0);
  assert.equal(s.learned["make-sense"], true);

  const a = { ...freshState(), gacha: { ...freshState().gacha, cards: { go: 2, sandwich: 1 }, points: 500, rev: 5, titles: ["week"] } };
  const b = { ...freshState(), gacha: { ...freshState().gacha, cards: { go: 1, robot: 3 }, points: 100, rev: 9 } };
  const m = mergeStates(a, b, lib);
  assert.deepEqual(m.gacha.cards, { go: 2, sandwich: 1, robot: 3 });
  assert.equal(m.gacha.points, 100); // 変更の多い方
  assert.deepEqual(m.gacha.titles, ["week"]);
  // 壊れた値は 0 に
  assert.equal(restoreState({ ...old, version: 3, gacha: { points: -5, cards: { go: "x" } } }, lib).gacha.points, 0);
});

test("チラ見せの文は、答えの単語そのもの（英語）を含まない", () => {
  for (const [id, t] of Object.entries(TRIVIA)) {
    const english = catalog.cards[id].english.toLowerCase();
    assert.ok(!t.teaser.toLowerCase().includes(english), `${id}: ${t.teaser}`);
  }
});
