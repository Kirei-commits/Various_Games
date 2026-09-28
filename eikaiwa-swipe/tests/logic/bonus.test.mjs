import { test } from "node:test";
import assert from "node:assert/strict";
import rawChapters from "../../src/data/index.js";
import {
  buildLibrary,
  freshState,
  restoreState,
  mergeStates,
  claimDailyBonus,
  claimGoalBonus,
  canClaimGoal,
  themeById,
  recordActivity,
  DAILY_GOAL,
} from "../../src/logic.js";

const lib = buildLibrary(rawChapters);
const days = (n) => `2026-10-${String(n).padStart(2, "0")}`;

test("ログインボーナスは1日1回。ガチャポイント1000と5倍ブースト1つ、7日ごとにレアチケット。コインはもうない", () => {
  let s = freshState();
  const r1 = claimDailyBonus(s, days(1), days(0));
  assert.equal(r1.reward.day, 1);
  assert.equal(r1.reward.coins, undefined);
  assert.deepEqual([r1.reward.gacha.points, r1.reward.gacha.boosts], [1000, 1]);
  s = r1.state;
  assert.equal(s.gacha.boosts, 1);
  assert.equal(claimDailyBonus(s, days(1), days(0)).reward, null); // 同じ日は受け取れない
  for (let d = 2; d <= 7; d++) s = claimDailyBonus(s, days(d), days(d - 1)).state;
  assert.equal(s.bonus.loginStreak, 7);
  assert.equal(s.gacha.boosts, 7);
  assert.equal(s.gacha.tickets, 1);
  assert.equal(s.bonus.coins, 0);
});

test("1日空くと連続は1日目に戻る", () => {
  let s = claimDailyBonus(freshState(), days(1), days(0)).state;
  s = claimDailyBonus(s, days(3), days(2)).state;
  assert.equal(s.bonus.loginStreak, 1);
  assert.equal(s.bonus.totalDays, 2);
});

test("今日の目標を達成すると、1日1回ガチャポイントのボーナス", () => {
  let s = freshState();
  for (let i = 0; i < DAILY_GOAL - 1; i++) s = { ...s, stats: recordActivity(s.stats, days(1), days(0), { swipes: 1 }) };
  assert.equal(canClaimGoal(s, days(1)), false);
  s = { ...s, stats: recordActivity(s.stats, days(1), days(0), { swipes: 1 }) };
  assert.equal(canClaimGoal(s, days(1)), true);
  s = claimGoalBonus(s, days(1));
  assert.equal(s.gacha.points, 3000);
  assert.equal(canClaimGoal(s, days(1)), false);
});

test("着せかえは id で選べ、知らない id はスタンダード", () => {
  assert.equal(themeById("sakura").id, "sakura");
  assert.equal(themeById("nope").id, "default");
  assert.equal(themeById(undefined).id, "default");
});

test("ボーナスは保存データから復元され、端末の統合でも失われない", () => {
  const withBonus = claimDailyBonus(freshState(), days(1), days(0)).state;
  assert.equal(restoreState(JSON.parse(JSON.stringify(withBonus)), lib).bonus.totalDays, 1);
  assert.equal(restoreState({ version: 2, learned: {} }, lib).bonus.totalDays, 0); // 古いデータにはボーナスが無い
  // 廃止したコインも、古いデータの値は消さない
  assert.equal(restoreState({ version: 3, learned: {}, bonus: { coins: 70 } }, lib).bonus.coins, 70);

  const a = { ...freshState(), bonus: { ...freshState().bonus, coins: 30, unlocked: ["default", "sakura"] } };
  const b = { ...freshState(), bonus: { ...freshState().bonus, coins: 50, lastClaim: days(5), loginStreak: 3 } };
  const m = mergeStates(a, b, lib);
  assert.equal(m.bonus.coins, 50);
  assert.deepEqual(m.bonus.unlocked.sort(), ["default", "sakura"]);
  assert.equal(m.bonus.loginStreak, 3);
});
