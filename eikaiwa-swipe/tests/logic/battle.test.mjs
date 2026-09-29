import { test } from "node:test";
import assert from "node:assert/strict";
import raw from "../../src/data/index.js";
import { buildLibrary, mulberry32, freshState, restoreState, mergeStates } from "../../src/logic.js";
import {
  createBattle,
  tick,
  attack,
  target,
  quit,
  starsOf,
  resultsOf,
  applyBattle,
  PLAYER_HP,
  STAGE_ENEMIES,
  BOSS_HP,
  PACE,
  RESPAWN_AFTER_KILL,
  RESPAWN_EMPTY,
  battleReward,
  byDifficulty,
  difficultyOf,
  BATTLE_POINTS,
  BATTLE_TICKETS,
  endlessLevelBonus,
  difficultyTiers,
  freeze,
  isFrozen,
  special,
  FREEZE_MS,
  TIERS,
  LEVEL_UP_KILLS,
  speedOf,
  maxOnField,
} from "../../src/battle.js";

const lib = buildLibrary(raw);
const chapter = lib.chapters[50]; // 第51章（単語）

/** 敵が出るまで時間を進めて、狙う敵を倒す（敵は動かさない） */
function killNext(b, rng) {
  for (let i = 0; i < 100 && !target(b); i++) tick(b, 500, rng, 0);
  return attack(b, true, rng);
}

test("ステージ: ザコ10体を倒すとボス（HP3）が出て、倒せばクリア。ノーダメージは星3", () => {
  const rng = mulberry32(1);
  const b = createBattle({ mode: "stage", items: chapter.items, key: "ch51@en-ja", rng });
  for (let i = 0; i < STAGE_ENEMIES; i++) assert.ok(killNext(b, rng));
  assert.equal(b.kills, STAGE_ENEMIES);
  tick(b, 10, rng, 0);
  const boss = target(b);
  assert.ok(boss.boss);
  const words = new Set();
  for (let i = 0; i < BOSS_HP; i++) words.add(attack(b, true, rng).id);
  assert.equal(words.size, BOSS_HP); // ボスは攻撃のたびに別の単語
  assert.equal(b.cleared, true);
  assert.equal(b.over, true);
  assert.equal(starsOf(b), 3);
  assert.ok(resultsOf(b).every((r) => r.correct));
});

test("敵が届くと HP が減り、HP が尽きたら終わり", () => {
  const rng = mulberry32(2);
  const b = createBattle({ mode: "stage", items: chapter.items, rng });
  // 1フレームずつ進めて、最初の敵が届いた時点を見る（届くまで約 PACE.choice.reach ms）
  let t = 0;
  while (b.hp === PLAYER_HP && t < PACE.choice.reach * 2) {
    tick(b, 50, rng);
    t += 50;
  }
  assert.equal(b.hp, PLAYER_HP - 1);
  assert.ok(Math.abs(t - PACE.choice.reach) <= 100, `${t}`);
  assert.ok(resultsOf(b).some((r) => !r.correct));
  for (let i = 0; i < 200 && !b.over; i++) tick(b, 1000, rng);
  assert.equal(b.over, true);
  assert.equal(b.cleared, false);
  assert.equal(starsOf(b), 0);
});

test("間違えると敵が近づき、コンボが切れる。その単語は苦手として記録される", () => {
  const rng = mulberry32(3);
  const b = createBattle({ mode: "stage", items: chapter.items, rng });
  killNext(b, rng);
  killNext(b, rng);
  assert.equal(b.combo, 2);
  tick(b, PACE.choice.interval, rng, 0);
  const t = target(b);
  const y = t.y;
  const item = attack(b, false, rng);
  assert.equal(b.combo, 0);
  assert.ok(target(b).y > y);
  // あとで倒しても「間違えた」ままにする
  attack(b, true, rng);
  assert.equal(resultsOf(b).find((r) => r.id === item.id).correct, false);
});

test("コンボが続くと得点が上がる（5連続ごとに倍率）", () => {
  const rng = mulberry32(4);
  const b = createBattle({ mode: "endless", items: chapter.items, rng });
  for (let i = 0; i < 6; i++) killNext(b, rng);
  assert.equal(b.score, 10 * 5 + 20);
});

test("エンドレス: 倒すほどレベルが上がって敵が速くなり、敵は尽きない", () => {
  const rng = mulberry32(5);
  const b = createBattle({ mode: "endless", items: chapter.items.slice(0, 5), rng });
  for (let i = 0; i < LEVEL_UP_KILLS * 2; i++) assert.ok(killNext(b, rng));
  assert.equal(b.level, 3);
  assert.equal(b.over, false);
  quit(b);
  assert.equal(b.over, true);
});

test("報酬: ポイントは 100〜300（時間と成績）、レアチケットは 1〜8 枚。初めての★3はチケット多め。1日の上限はない", () => {
  const rng = mulberry32(6);
  const play = () => {
    const b = createBattle({ mode: "stage", items: chapter.items, key: "ch51@en-ja", rng });
    while (!b.over) killNext(b, rng);
    return b;
  };
  let s = freshState();
  const first = applyBattle(s, play(), "2026-01-01");
  assert.equal(first.reward.points, BATTLE_POINTS.min); // 短いバトルでも最低 100
  assert.equal(first.reward.tickets, BATTLE_TICKETS.max); // ★3（6枚）＋初回（2枚）
  assert.equal(first.state.gacha.tickets, 8);
  assert.equal(first.state.battle.stars["ch51@en-ja"], 3);
  assert.deepEqual(first.state.battle.ticketStages, ["ch51@en-ja"]);
  const second = applyBattle(first.state, play(), "2026-01-01");
  assert.equal(second.reward.tickets, 6);

  s = second.state;
  for (let i = 0; i < 20; i++) s = applyBattle(s, play(), "2026-01-01").state;
  assert.equal(applyBattle(s, play(), "2026-01-01").reward.points, BATTLE_POINTS.min);
  assert.equal(s.battle.earned, 22 * BATTLE_POINTS.min);
});

test("報酬: 長く遊ぶほどポイントが増える（時間ぶんは 300 まで＋エンドレスはレベルボーナス）。すぐやめたら時間ぶんだけでチケットなし", () => {
  const rng = mulberry32(9);
  const b = createBattle({ mode: "endless", items: chapter.items, rng });
  for (let i = 0; i < 25; i++) killNext(b, rng);
  b.elapsed = 4 * 60 * 1000; // 4分遊んだ
  quit(b);
  const r = battleReward(b);
  assert.equal(r.levelBonus, endlessLevelBonus(b.level));
  const base = r.points - r.levelBonus;
  assert.ok(base > BATTLE_POINTS.min && base <= BATTLE_POINTS.max, `${base}`);
  assert.equal(r.tickets, 1 + Math.floor((b.level - 1) / 2));
  b.elapsed = 60 * 60 * 1000;
  assert.equal(battleReward(b).points, BATTLE_POINTS.max + r.levelBonus);

  const early = createBattle({ mode: "stage", items: chapter.items, rng });
  killNext(early, rng);
  early.elapsed = 6000;
  quit(early);
  assert.deepEqual([battleReward(early).points, battleReward(early).tickets], [6, 0]);
});

test("5倍ブースト中はバトルのポイントも5倍（チケットはそのまま）", () => {
  const rng = mulberry32(10);
  const b = createBattle({ mode: "stage", items: chapter.items, key: "ch52@en-ja", rng });
  while (!b.over) killNext(b, rng);
  const s = { ...freshState(), gacha: { ...freshState().gacha, boostUntil: 5000 } };
  const r = applyBattle(s, b, "2026-01-01", 1000);
  assert.equal(r.reward.points, BATTLE_POINTS.min * 5);
  assert.equal(r.reward.boosted, true);
  assert.equal(r.reward.tickets, 8);
  assert.equal(applyBattle(s, b, "2026-01-01", 6000).reward.points, BATTLE_POINTS.min); // 切れたら元どおり
});

test("難易度順: おおむね やさしい → むずかしい の順で、毎回少しずつ違う", () => {
  const items = [...lib.chapters[50].items, ...lib.chapters[70].items, ...lib.chapters[100].items]; // 基礎・生活・応用
  const a = byDifficulty(items, mulberry32(1));
  const b = byDifficulty(items, mulberry32(2));
  assert.notDeepEqual(a.map((x) => x.id), b.map((x) => x.id));
  const avg = (list) => list.reduce((n, x) => n + difficultyOf(x), 0) / list.length;
  assert.ok(avg(a.slice(0, 30)) < avg(a.slice(60, 90)));
  assert.ok(avg(a.slice(60, 90)) < avg(a.slice(120)));
  // 最初の20体はほぼ基礎の章から
  assert.ok(a.slice(0, 20).every((x) => x.chapterId === "ch51" || x.chapterId === "ch71"));

  const stage = createBattle({ mode: "stage", items: chapter.items, order: "level", rng: mulberry32(3) });
  const lens = [...stage.queue, ...stage.bossWords].map((x) => x.english.length);
  assert.ok(lens.slice(0, 4).reduce((n, x) => n + x, 0) <= lens.slice(-4).reduce((n, x) => n + x, 0));
});

test("エンドレスの最高得点を記録し、更新したらボーナス", () => {
  const rng = mulberry32(7);
  const b = createBattle({ mode: "endless", items: chapter.items, key: "word@en-ja", rng });
  for (let i = 0; i < 3; i++) killNext(b, rng);
  quit(b);
  const r = applyBattle(freshState(), b, "2026-01-01");
  assert.equal(r.reward.newBest, true);
  assert.equal(r.state.battle.best["word@en-ja"], b.score);
  assert.equal(applyBattle(r.state, b, "2026-01-01").reward.newBest, false);
});

test("保存データ: バトルの記録は復元でき、端末をまたいで大きい方を残す", () => {
  const a = { ...freshState(), battle: { stars: { "ch51@en-ja": 3 }, best: { "all@en-ja": 500 }, ticketStages: ["ch51@en-ja"] } };
  const b = { ...freshState(), battle: { stars: { "ch51@en-ja": 1, "ch52@en-ja": 2 }, best: { "all@en-ja": 900 } } };
  const m = mergeStates(a, b, lib);
  assert.deepEqual(m.battle.stars, { "ch51@en-ja": 3, "ch52@en-ja": 2 });
  assert.equal(m.battle.best["all@en-ja"], 900);
  assert.deepEqual(m.battle.ticketStages, ["ch51@en-ja"]);
  assert.deepEqual(restoreState({ version: 2, learned: {} }, lib).battle.stars, {});
});

test("同時に出ている敵は、別々の列に出る（重ならない）", () => {
  const rng = mulberry32(8);
  const b = createBattle({ mode: "stage", items: chapter.items, rng }); // ステージは同時に3体まで
  for (let i = 0; i < 3; i++) tick(b, PACE.choice.interval, rng, 0);
  assert.equal(b.enemies.length, 3);
  assert.equal(new Set(b.enemies.map((e) => e.x)).size, 3);
});

test("エンドレスの速さはゆっくり上がる（レベル10でも1.63倍、最大2倍）。同時に出る敵は最大4体", () => {
  const at = (level) => ({ mode: "endless", level });
  assert.equal(speedOf(at(1)), 1);
  assert.ok(Math.abs(speedOf(at(10)) - 1.63) < 1e-9);
  assert.equal(speedOf(at(50)), 2);
  assert.equal(maxOnField(at(1)), 2);
  assert.equal(maxOnField(at(4)), 3);
  assert.equal(maxOnField(at(30)), 4);
  assert.equal(speedOf({ mode: "stage", level: 1 }), 1);
});

test("エンドレスのレベルボーナスは、後半ほど大きく増える", () => {
  assert.deepEqual([1, 2, 5, 10, 15].map(endlessLevelBonus), [0, 50, 500, 2250, 5250]);
});

test("難易度5段階: 単語をやさしい順に均等に5つに分ける", () => {
  const words = lib.chapters.slice(50).flatMap((c) => c.items);
  const tiers = difficultyTiers(words);
  assert.equal(tiers.length, TIERS);
  assert.equal(tiers.reduce((n, t) => n + t.length, 0), words.length);
  assert.ok(tiers[0].every((x) => Number(x.chapterId.slice(2)) <= 71)); // ★1 は基礎の章
  assert.ok(tiers[4].every((x) => Number(x.chapterId.slice(2)) >= 90)); // ★5 は応用の章
});

test("時止め: 5秒間は敵が動かず、新しい敵も出ない", () => {
  const rng = mulberry32(11);
  const b = createBattle({ mode: "stage", items: chapter.items, rng });
  tick(b, 10, rng);
  const y = target(b).y;
  const count = b.enemies.length;
  assert.ok(freeze(b));
  tick(b, FREEZE_MS - 100, rng);
  assert.equal(isFrozen(b), true);
  assert.equal(target(b).y, y);
  assert.equal(b.enemies.length, count);
  tick(b, 200, rng);
  assert.equal(isFrozen(b), false);
  tick(b, 500, rng);
  assert.ok(target(b).y > y);
});

test("必殺技: 答えずに敵を倒せる。コンボはそのままで、その単語は苦手に入る", () => {
  const rng = mulberry32(12);
  const b = createBattle({ mode: "stage", items: chapter.items, rng });
  killNext(b, rng);
  killNext(b, rng);
  tick(b, PACE.choice.interval, rng, 0);
  const item = special(b, rng);
  assert.equal(b.kills, 3);
  assert.equal(b.combo, 2);
  assert.equal(resultsOf(b).find((r) => r.id === item.id).correct, false);
});

test("敵はゆっくり近づき、テンポよく出てくる（4択で上から届くまで15秒、次の敵まで2.4秒）", () => {
  assert.deepEqual(PACE.choice, { reach: 15000, interval: 2400 });
  assert.ok(PACE.type.reach > PACE.choice.reach && PACE.voice.reach > PACE.choice.reach);
});

test("倒すとすぐ次の敵が出る（場が空なら0.25秒、ほかの敵がいても0.9秒以内）", () => {
  const rng = mulberry32(5);
  const b = createBattle({ mode: "endless", items: chapter.items, answer: "type", rng });
  tick(b, 16, rng, 0); // 1体目が出る（次は4.2秒後の予定）
  assert.equal(b.enemies.length, 1);
  attack(b, true, rng);
  assert.equal(b.enemies.length, 0);
  tick(b, RESPAWN_EMPTY, rng, 0);
  assert.equal(b.enemies.length, 1, "場が空になったら0.25秒で次が出る");
  tick(b, PACE.type.interval, rng, 0); // 2体いる状態にする
  assert.equal(b.enemies.length, 2);
  attack(b, true, rng);
  tick(b, RESPAWN_AFTER_KILL, rng, 0);
  assert.equal(b.enemies.length, 2, "ほかの敵がいても0.9秒で補充される");
});
