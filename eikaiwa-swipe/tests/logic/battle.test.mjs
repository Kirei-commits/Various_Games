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
  KILL_POINTS,
  CLEAR_POINTS,
  BATTLE_DAILY_CAP,
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
  tick(b, 3000, rng, 0);
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
  for (let i = 0; i < 20; i++) assert.ok(killNext(b, rng));
  assert.equal(b.level, 3);
  assert.equal(b.over, false);
  quit(b);
  assert.equal(b.over, true);
});

test("報酬: 1体5pt・クリア+50pt、初めての星3でレアチケット（2回目はなし）、1日の上限あり", () => {
  const rng = mulberry32(6);
  const play = () => {
    const b = createBattle({ mode: "stage", items: chapter.items, key: "ch51@en-ja", rng });
    while (!b.over) killNext(b, rng);
    return b;
  };
  let s = freshState();
  const first = applyBattle(s, play(), "2026-01-01");
  const kills = STAGE_ENEMIES + 1;
  assert.equal(first.reward.points, kills * KILL_POINTS + CLEAR_POINTS);
  assert.equal(first.reward.tickets, 1);
  assert.equal(first.state.gacha.tickets, 1);
  assert.equal(first.state.battle.stars["ch51@en-ja"], 3);
  const second = applyBattle(first.state, play(), "2026-01-01");
  assert.equal(second.reward.tickets, 0);

  s = second.state;
  for (let i = 0; i < 20; i++) s = applyBattle(s, play(), "2026-01-01").state;
  assert.equal(s.battle.earned, BATTLE_DAILY_CAP);
  assert.equal(applyBattle(s, play(), "2026-01-02").reward.points, kills * KILL_POINTS + CLEAR_POINTS);
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
