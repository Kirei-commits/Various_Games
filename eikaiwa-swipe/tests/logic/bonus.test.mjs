import { test } from "node:test";
import assert from "node:assert/strict";
import rawChapters from "../../src/data/index.js";
import {
  buildLibrary,
  freshState,
  restoreState,
  mergeStates,
  claimDailyBonus,
  dailyReward,
  claimGoalBonus,
  canClaimGoal,
  buyTheme,
  applyTheme,
  themeOf,
  recordActivity,
  DAILY_GOAL,
} from "../../src/logic.js";

const lib = buildLibrary(rawChapters);
const days = (n) => `2026-10-${String(n).padStart(2, "0")}`;

test("ログインボーナスは1日1回。連続すると増え、7日目は +50", () => {
  let s = freshState();
  const r1 = claimDailyBonus(s, days(1), days(0));
  assert.equal(r1.reward.day, 1);
  assert.equal(r1.reward.coins, 10);
  s = r1.state;
  assert.equal(claimDailyBonus(s, days(1), days(0)).reward, null); // 同じ日は受け取れない
  for (let d = 2; d <= 7; d++) s = claimDailyBonus(s, days(d), days(d - 1)).state;
  assert.equal(s.bonus.loginStreak, 7);
  assert.equal(dailyReward(7).weekly, true);
  assert.equal(s.bonus.coins, [1, 2, 3, 4, 5, 6, 7].reduce((n, d) => n + dailyReward(d).coins, 0));
});

test("1日空くと連続は1日目に戻る（コインはそのまま）", () => {
  let s = claimDailyBonus(freshState(), days(1), days(0)).state;
  s = claimDailyBonus(s, days(3), days(2)).state;
  assert.equal(s.bonus.loginStreak, 1);
  assert.equal(s.bonus.coins, 20);
  assert.equal(s.bonus.totalDays, 2);
});

test("今日の目標を達成すると、1日1回ボーナス", () => {
  let s = freshState();
  for (let i = 0; i < DAILY_GOAL - 1; i++) s = { ...s, stats: recordActivity(s.stats, days(1), days(0), { swipes: 1 }) };
  assert.equal(canClaimGoal(s, days(1)), false);
  s = { ...s, stats: recordActivity(s.stats, days(1), days(0), { swipes: 1 }) };
  assert.equal(canClaimGoal(s, days(1)), true);
  s = claimGoalBonus(s, days(1));
  assert.equal(s.bonus.coins, 20);
  assert.equal(canClaimGoal(s, days(1)), false);
});

test("着せかえはコインで買え、買うとそのまま使われる。足りなければ買えない", () => {
  let s = { ...freshState(), bonus: { ...freshState().bonus, coins: 120 } };
  assert.match(buyTheme(s, "ocean").error, /足りません/);
  s = buyTheme(s, "sakura").state;
  assert.equal(s.bonus.coins, 20);
  assert.equal(themeOf(s).id, "sakura");
  s = applyTheme(s, "default");
  assert.equal(themeOf(s).id, "default");
  assert.equal(applyTheme(s, "night").bonus.theme, "default"); // 持っていないものは使えない
});

test("ボーナスは保存データから復元され、端末の統合でも失われない", () => {
  const withBonus = claimDailyBonus(freshState(), days(1), days(0)).state;
  assert.equal(restoreState(JSON.parse(JSON.stringify(withBonus)), lib).bonus.coins, 10);
  assert.equal(restoreState({ version: 2, learned: {} }, lib).bonus.coins, 0); // 古いデータにはボーナスが無い

  const a = { ...freshState(), bonus: { ...freshState().bonus, coins: 30, unlocked: ["default", "sakura"] } };
  const b = { ...freshState(), bonus: { ...freshState().bonus, coins: 50, lastClaim: days(5), loginStreak: 3 } };
  const m = mergeStates(a, b, lib);
  assert.equal(m.bonus.coins, 50);
  assert.deepEqual(m.bonus.unlocked.sort(), ["default", "sakura"]);
  assert.equal(m.bonus.loginStreak, 3);
});
