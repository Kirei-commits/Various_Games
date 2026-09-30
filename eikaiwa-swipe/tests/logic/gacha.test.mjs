import { test } from "node:test";
import assert from "node:assert/strict";
import raw, { PARTS } from "../../src/data/index.js";
import { SECRETS, TITLES, TRIVIA, QUEST_WORDS } from "../../src/data/gacha-data.js";
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
  earnTimePoints,
  activateBoost,
  boostActive,
  redeemCode,
  codeValue,
  codesLeft,
  endUnlimited,
  pointsForTime,
  guessPos,
  grant,
  RATES,
  PITY_SSR,
  MAX_LEVEL,
  OVERFLOW_EX,
  EXCHANGE_COST,
  STARTER,
  POINTS_PER_MINUTE,
  BOOST_MS,
  CODE_DAILY_LIMIT,
  upgradeTickets,
  makeMyTitle,
  equipMyTitle,
  deleteMyTitle,
  equippedMyTitle,
  myTitleText,
  buyItem,
  consumeItem,
  DUP_MEDALS,
  SHOP,
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
  // 冒険限定の単語はガチャに出ない
  const questOnly = Object.values(catalog.cards).filter((c) => c.questOnly);
  assert.equal(questOnly.length, QUEST_WORDS.length);
  assert.equal(catalog.pools.all.SSR.length, Object.keys(TRIVIA).filter((id) => !QUEST_WORDS.includes(id)).length);
  assert.ok(!Object.values(catalog.pools.all).flat().some((id) => catalog.cards[id].questOnly));
  // 冒険限定の単語は、称号・シークレットの条件に使わない（ガチャで集められなくなるため）
  for (const t of TITLES) for (const id of t.rule.ids || []) assert.ok(!QUEST_WORDS.includes(id), `TITLE ${t.id}: ${id}`);
  for (const s of SECRETS) for (const id of s.rule.ids) assert.ok(!QUEST_WORDS.includes(id), `SECRET ${s.id}: ${id}`);
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

test("排出確率は通常 R 6%・SR 1%・SSR 0.1%。チケットは対象のランクだけ（レア=R・SR=SR・SSR=SSR）", () => {
  const r = currentRates(freshState().gacha, catalog, "all", "points");
  assert.deepEqual([r.N, r.R, r.SR, r.SSR].map((x) => Math.round(x * 1000) / 1000), [92.9, 6, 1, 0.1]);
  assert.deepEqual(Object.values(currentRates(freshState().gacha, catalog, "all", "ticket")), [0, 100, 0, 0]);
  assert.deepEqual(Object.values(currentRates(freshState().gacha, catalog, "all", "sr")), [0, 0, 100, 0]);
  assert.deepEqual(Object.values(currentRates(freshState().gacha, catalog, "all", "ssr")), [0, 0, 0, 100]);
  const s = { ...freshState(), gacha: { ...freshState().gacha, tickets: 10 } };
  assert.ok(pull(s, catalog, { currency: "ticket", times: 10 }, Math.random).results.every((x) => x.rarity === "R"));
});

test("冒険限定の単語は交換所でも交換できない", () => {
  const s = { ...freshState(), gacha: { ...freshState().gacha, exPoints: 100000 } };
  assert.match(exchange(s, catalog, "legend").error, /冒険の宝箱/);
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
  assert.ok(Math.abs(count.N / n - 0.929) < 0.02, JSON.stringify(count));
  // SSR は 0.1% ＋1000回天井で、6000回なら6回前後（天井ぶんを含めて多くても十数回）
  assert.ok(count.SSR >= 3 && count.SSR <= 16, JSON.stringify(count));
  assert.ok(Math.abs(count.SR / n - 0.01) < 0.005, JSON.stringify(count));
});

test("ポイントを使い、足りなければ引けない", () => {
  const s = withPoints(150);
  const r = pull(s, catalog, { times: 1 }, mulberry32(1));
  assert.equal(r.state.gacha.points, 50);
  assert.equal(r.results.length, 1);
  assert.match(pull(r.state, catalog, { times: 1 }, mulberry32(1)).error, /足りません/);
  assert.match(pull(s, catalog, { times: 10 }, mulberry32(1)).error, /足りません/);
});

test("10連に SR 以上の確定枠はない（全部 N のこともある）", () => {
  // 乱数が常に 0 → 毎回 N の先頭（レア度の抽選で N が選ばれる）
  const r = pull(withPoints(1000), catalog, { times: 10 }, () => 0);
  assert.equal(r.results.filter((x) => x.rarity === "N").length, 10);
  assert.ok(r.results.every((x) => !x.byPity));
});

test("天井: 通常ガチャの1000回目は SSR 確定で、未所持を優先する。チケットに天井はない", () => {
  let s = withPoints(100 * PITY_SSR.points, 0);
  s = { ...s, gacha: { ...s.gacha, pity: { points: PITY_SSR.points - 1, ticket: 999 }, tickets: 1 } };
  const r = pull(s, catalog, { times: 1 }, () => 0);
  assert.equal(r.results[0].rarity, "SSR");
  assert.equal(r.results[0].byPity, "SSR");
  assert.equal(r.state.gacha.pity.points, 0);
  const t = pull(s, catalog, { currency: "ticket", times: 1 }, () => 0);
  assert.equal(t.results[0].rarity, "R");
});

test("ダブりで Lv が上がり MAX（Lv.4）で止まる。MAX の単語もまた出て、そのときは交換ポイントが上乗せされる", () => {
  const first = catalog.pools.all.N[0];
  let s = withPoints(100 * 10);
  const rng = () => 0; // 常に N の先頭を引く
  const got = [];
  for (let i = 0; i < 6; i++) {
    const r = pull(s, catalog, { times: 1 }, rng);
    s = r.state;
    assert.equal(r.results[0].id, first);
    got.push([r.results[0].result, r.results[0].level, r.results[0].exGain]);
  }
  assert.deepEqual(got, [
    ["new", 1, 1],
    ["levelup", 2, 1],
    ["levelup", 3, 1],
    ["levelup", 4, 1],
    ["overflow", 4, 1 + OVERFLOW_EX.N],
    ["overflow", 4, 1 + OVERFLOW_EX.N],
  ]);
  assert.equal(s.gacha.cards[first], MAX_LEVEL, "枚数は MAX で止まる");
  assert.equal(s.gacha.exPoints, 6 + 2 * OVERFLOW_EX.N);
  // すべて MAX でも確率は変わらない（出なくならない）
  const allMax = Object.fromEntries(catalog.order.map((id) => [id, MAX_LEVEL]));
  const w = effectiveWeights({ cards: allMax }, catalog, "all", "points");
  assert.deepEqual(w.weights, RATES.points);
  assert.equal(effectiveWeights({ cards: allMax }, catalog, "all", "ticket").weights.R, RATES.ticket.R);
});

test("天井の SSR は未所持 → MAX でないもの の順に選ぶ（全部 MAX でも出る）", () => {
  const ssr = catalog.pools.all.SSR;
  const cards = Object.fromEntries(ssr.map((id) => [id, MAX_LEVEL]));
  cards[ssr[1]] = 2;
  let s = withPoints(100);
  s = { ...s, gacha: { ...s.gacha, cards, pity: { ...s.gacha.pity, points: PITY_SSR.points - 1 } } };
  const r = pull(s, catalog, { times: 1 }, () => 0.5);
  assert.equal(r.results[0].id, ssr[1]);
  assert.equal(r.results[0].byPity, "SSR");
  const all = { ...cards, [ssr[1]]: MAX_LEVEL };
  const r2 = pull({ ...s, gacha: { ...s.gacha, cards: all } }, catalog, { times: 1 }, () => 0.5);
  assert.equal(r2.results[0].result, "overflow");
  assert.equal(r2.results[0].exGain, 1 + OVERFLOW_EX.SSR);
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
  s = { ...s, gacha: { ...s.gacha, exPoints: 100000 } };
  s = exchange(s, catalog, "company").state;
  s = exchange(s, catalog, "combine").state;
  const r = exchange(s, catalog, "compete");
  assert.deepEqual(r.newSecrets, ["secret-companion"]);
  assert.equal(r.state.gacha.cards["secret-companion"], 1);
});

test("称号: テーマの単語をそろえると獲得（天体観測者）", () => {
  let s = { ...freshState(), gacha: { ...freshState().gacha, exPoints: 100000 } };
  let got = [];
  for (const id of ["sun", "moon", "star", "planet", "sky"]) {
    const r = exchange(s, catalog, id);
    s = r.state;
    got = got.concat(r.newTitles);
  }
  assert.ok(got.includes("stargazer"));
});

test("ポイントのもらい方: はじめてボーナス・ログイン・今日の目標", () => {
  let s = claimStarter(freshState());
  assert.equal(s.gacha.points, STARTER.points);
  assert.equal(claimStarter(s).gacha.points, STARTER.points); // 2回目はもらえない

  const { state, reward } = claimDailyBonus(freshState(), "2026-01-07", "2026-01-06");
  assert.equal(state.gacha.points, 300);
  assert.equal(reward.gacha.points, 300);
  // 7日連続でレアチケット
  let w = freshState();
  for (let d = 1; d <= 7; d++) {
    const day = `2026-01-0${d}`;
    const prev = d === 1 ? "2025-12-31" : `2026-01-0${d - 1}`;
    w = claimDailyBonus(w, day, prev).state;
  }
  assert.equal(w.gacha.tickets, 1);
  // 毎日 SR ガチャチケット3枚、累計3日ごとに SSR ガチャチケット1枚（選択チケットはもう配らない）
  assert.equal(w.gacha.srTickets, 21);
  assert.equal(w.gacha.ssrTickets, 2);
  assert.equal(w.gacha.selSR + w.gacha.selSSR, 0);

  let g = { ...freshState(), stats: { ...freshState().stats, todayDate: "2026-01-01", todayCount: 20 } };
  g = claimGoalBonus(g, "2026-01-01");
  assert.equal(g.gacha.points, 900);
});

test("学習・テストのポイントは時間に比例（1分 180pt）。上限はない", () => {
  assert.equal(POINTS_PER_MINUTE, 180);
  assert.equal(pointsForTime(60), POINTS_PER_MINUTE);
  assert.equal(pointsForTime(10), 30);
  assert.equal(pointsForTime(-3), 0);
  let st = freshState();
  for (let i = 0; i < 200; i++) st = earnTimePoints(st, 10, 0).state;
  assert.equal(st.gacha.points, 200 * 30);
});

test("5倍ブースト: 使うと1時間ポイント5倍。使用中にもう1つ使うと延長。持っていなければ使えない", () => {
  let s = freshState();
  assert.match(activateBoost(s, 0).error, /持っていません/);
  s = { ...s, gacha: { ...s.gacha, boosts: 2 } };
  s = activateBoost(s, 1000).state;
  assert.equal(s.gacha.boosts, 1);
  assert.equal(boostActive(s.gacha, 1000 + BOOST_MS - 1), true);
  assert.equal(boostActive(s.gacha, 1000 + BOOST_MS), false);
  const r = earnTimePoints(s, 60, 2000);
  assert.equal(r.points, POINTS_PER_MINUTE * 5);
  assert.equal(earnTimePoints(s, 60, 1000 + BOOST_MS).points, POINTS_PER_MINUTE);
  s = activateBoost(s, 1000 + BOOST_MS / 2).state;
  assert.equal(s.gacha.boostUntil, 1000 + BOOST_MS * 2);
});

test("コード: 単語帳の単語を入れるとポイント（100〜最大5000）とその単語。難しい単語ほど多く、1日5回・同じ単語は1回だけ", () => {
  const day = "2026-01-01";
  let s = freshState();
  const easy = redeemCode(s, catalog, "go", day);
  assert.ok(easy.points >= 100 && easy.points <= 500, `${easy.points}`);
  assert.equal(easy.got, true);
  assert.equal(easy.state.gacha.cards.go, 1, "入れた単語が手に入る");
  const ssrId = Object.keys(catalog.cards).find((id) => catalog.cards[id].rarity === "SSR" && !catalog.cards[id].secret);
  const hard = redeemCode(easy.state, catalog, `  ${catalog.cards[ssrId].english.toUpperCase()} `, day);
  assert.ok(hard.points >= 3000 && hard.points <= 5000, `${hard.points}`);
  const secret = redeemCode(s, catalog, "companion", day);
  assert.equal(secret.points, 5000); // シークレット単語は最高（5000）
  assert.equal(secret.got, false, "シークレット単語はコードでは手に入らない");
  assert.equal(redeemCode(s, catalog, "legend", day).got, false, "冒険限定の単語もポイントだけ");
  const values = Object.values(catalog.cards).map(codeValue);
  assert.ok(Math.min(...values) >= 100 && Math.max(...values) <= 5000);

  s = hard.state;
  assert.match(redeemCode(s, catalog, "go", day).error, /もう使いました/);
  assert.match(redeemCode(s, catalog, "qwertyzz", day).error, /単語帳にありません/);
  assert.equal(codesLeft(s.gacha, day), CODE_DAILY_LIMIT - 2); // 間違いは数えない
  for (const w of ["sun", "moon", "star"]) s = redeemCode(s, catalog, w, day).state;
  assert.equal(codesLeft(s.gacha, day), 0);
  assert.match(redeemCode(s, catalog, "sky", day).error, /また明日/);
  assert.ok(redeemCode(s, catalog, "sky", "2026-01-02").points > 0); // 次の日はまた入れられる
});

test("開発者コード aaa: ポイント無限（引いても減らない）。やめることもできる", () => {
  let s = { ...freshState(), gacha: { ...freshState().gacha, points: 0 } };
  const r = redeemCode(s, catalog, "AAA", "2026-01-01");
  assert.equal(r.unlimited, true);
  s = r.state;
  assert.equal(codesLeft(s.gacha, "2026-01-01"), CODE_DAILY_LIMIT); // 回数は使わない
  const p = pull(s, catalog, { times: 1000 }, mulberry32(1));
  assert.equal(p.results.length, 1000);
  assert.equal(p.state.gacha.points, 0);
  s = endUnlimited(p.state);
  assert.match(pull(s, catalog, { times: 1 }, mulberry32(1)).error, /足りません/);
});

test("通常ガチャの天井は1000回: 999回 SSR が出なくても、1000回目で SSR", () => {
  assert.equal(PITY_SSR.points, 1000);
  const s = { ...freshState(), gacha: { ...freshState().gacha, points: 100 * 1000 } };
  const p = pull(s, catalog, { times: 1000 }, () => 0.01);
  assert.equal(p.results.length, 1000);
  assert.equal(p.results.slice(0, 999).filter((r) => r.rarity === "SSR").length, 0);
  assert.equal(p.results[999].rarity, "SSR");
  assert.equal(p.results[999].byPity, "SSR");
  assert.equal(p.state.gacha.points, 0);
});

test("保存データ: v2 から最新へ移行し、ガチャのデータは端末をまたいでも失わない", () => {
  assert.equal(STATE_VERSION, 8);
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

test("SR ガチャチケットは SR 以上、SSR ガチャチケットは SSR 確定", () => {
  const s = grant(freshState(), { srTickets: 50, ssrTickets: 5 });
  const sr = pull(s, catalog, { currency: "sr", times: 50 }, mulberry32(3));
  assert.equal(sr.results.length, 50);
  assert.ok(sr.results.every((r) => r.rarity === "SR" || r.rarity === "SSR"));
  assert.equal(sr.state.gacha.srTickets, 0);
  const ssr = pull(s, catalog, { currency: "ssr", times: 5 }, mulberry32(4));
  assert.ok(ssr.results.every((r) => r.rarity === "SSR"));
  assert.match(pull(ssr.state, catalog, { currency: "ssr", times: 1 }).error, /足りません/);
});

test("チケット交換: レアチケット100枚で SR ガチャチケット、SR ガチャチケット100枚で SSR ガチャチケット", () => {
  let s = grant(freshState(), { tickets: 150, srTickets: 99 });
  assert.match(upgradeTickets(s, "ssr").error, /あと 1 枚/);
  s = upgradeTickets(s, "sr").state;
  assert.deepEqual([s.gacha.tickets, s.gacha.srTickets], [50, 100]);
  s = upgradeTickets(s, "ssr").state;
  assert.deepEqual([s.gacha.srTickets, s.gacha.ssrTickets], [0, 1]);
});

test("図鑑の交換は高め（やり込み向け）: SSR は交換ポイント 10000", () => {
  assert.deepEqual(EXCHANGE_COST, { N: 200, R: 800, SR: 3000, SSR: 10000 });
});

test("ダブるとメダルが貯まり、ショップで5倍ブースト・時止め・必殺技と交換できる", () => {
  let s = { ...freshState(), gacha: { ...freshState().gacha, cards: { go: 1 } } };
  // 乱数 0 で N の先頭の単語を引く。それを1枚持っている状況で、ダブりを作る
  const first = catalog.pools.all.N[0];
  s = { ...s, gacha: { ...s.gacha, cards: { [first]: 1 }, points: 100 } };
  const r = pull(s, catalog, { times: 1 }, () => 0);
  assert.equal(r.results[0].id, first);
  assert.equal(r.results[0].medals, DUP_MEDALS.N);
  assert.equal(r.state.gacha.medals, DUP_MEDALS.N);
  assert.equal(r.results[0].exGain, 1);

  let m = grant(freshState(), { medals: 300 });
  assert.match(buyItem(grant(freshState(), { medals: 10 }), "freeze").error, /足りません/);
  m = buyItem(m, "boost").state;
  m = buyItem(m, "freeze").state;
  m = buyItem(m, "special").state;
  assert.equal(m.gacha.medals, 300 - SHOP.reduce((n, x) => n + x.price, 0));
  assert.equal(m.gacha.boosts, 1);
  assert.deepEqual(m.gacha.items, { freeze: 1, special: 1 });
  m = consumeItem(m, "freeze").state;
  assert.equal(m.gacha.items.freeze, 0);
  assert.ok(consumeItem(m, "freeze").error);
  // 保存データから復元できる
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(m)), lib).gacha.items, { freeze: 0, special: 1 });
});

test("マイ称号: 集めた単語を1〜3個組み合わせて作り、付け替え・削除できる", () => {
  let s = { ...freshState(), gacha: { ...freshState().gacha, cards: { happy: 1, sun: 1, robot: 2 } } };
  assert.match(makeMyTitle(s, catalog, [], 1).error, /1〜3/);
  assert.match(makeMyTitle(s, catalog, ["happy", "moon"], 1).error, /持っている単語/);
  assert.match(makeMyTitle(s, catalog, ["happy", "sun", "robot", "happy"].concat(["x"]), 1).error, /1〜3|持っている/);
  const a = makeMyTitle(s, catalog, ["happy", "sun"], 10);
  s = a.state;
  assert.equal(equippedMyTitle(s.gacha).id, a.id);
  assert.equal(myTitleText(catalog, equippedMyTitle(s.gacha)).en, "Happy Sun");
  assert.match(makeMyTitle(s, catalog, ["happy", "sun"], 11).error, /同じ称号/);
  const b = makeMyTitle(s, catalog, ["robot"], 12);
  s = b.state;
  assert.equal(s.gacha.equippedTitle, b.id);
  s = equipMyTitle(s, a.id);
  assert.equal(equippedMyTitle(s.gacha).parts.join(","), "happy,sun");
  s = equipMyTitle(s, null);
  assert.equal(equippedMyTitle(s.gacha), null);
  s = deleteMyTitle(equipMyTitle(s, b.id), b.id);
  assert.deepEqual([s.gacha.myTitles.length, s.gacha.equippedTitle], [1, null]);
  // 保存データから復元でき、端末の統合でも失わない
  const back = restoreState(JSON.parse(JSON.stringify(s)), lib);
  assert.equal(back.gacha.myTitles[0].id, a.id);
  const other = makeMyTitle({ ...freshState(), gacha: { ...freshState().gacha, cards: { sun: 1 } } }, catalog, ["sun"], 20).state;
  assert.equal(mergeStates(s, other, lib).gacha.myTitles.length, 2);
});
