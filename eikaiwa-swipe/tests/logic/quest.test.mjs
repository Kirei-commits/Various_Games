import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gearOf,
  elementOf,
  elementMultiplier,
  statsOf,
  baseStats,
  createRun,
  act,
  nextFloor,
  retreat,
  enemyFor,
  isBossFloor,
  startFloors,
  gainExp,
  expToNext,
  equip,
  autoEquip,
  applyQuest,
  restoreQuest,
  mergeQuest,
  initialQuest,
  SPELL_MP,
  START_HERBS,
  RARITY_POWER,
  EFFECTS,
} from "../../src/quest.js";
import { freshState, restoreState, buildLibrary, STATE_VERSION } from "../../src/logic.js";
import rawChapters from "../../src/data/index.js";

const card = (id, english, rarity = "N", pos = "noun") => ({ id, english, japanese: "訳", rarity, pos });
const cards = {
  sword: card("sword", "sword", "N", "noun"),
  fire: card("fire", "fire", "R", "noun"),
  flame: card("flame", "flame", "SR", "verb"),
  blaze: card("blaze", "blaze", "SSR", "adj"),
  snow: card("snow", "snowman", "R", "noun"),
};
/** いつも同じ値を返す乱数 */
const fixed = (v) => () => v;

test("装備の強さはレア度で分かれる（同じ単語なら N < R < SR < SSR）", () => {
  const powers = ["N", "R", "SR", "SSR"].map((r) => gearOf(card("x", "adventure", r), 1).power);
  assert.ok(powers[0] < powers[1] && powers[1] < powers[2] && powers[2] < powers[3], powers.join(","));
  // Lv（ダブり）で伸びる
  assert.equal(gearOf(card("x", "cat", "R"), 4).power - gearOf(card("x", "cat", "R"), 1).power, RARITY_POWER.R.grow * 3);
});

test("かっこよさ: 長い単語・熟語・めずらしい文字ほど少し強い（レア度の差は超えない）", () => {
  const short = gearOf(card("a", "cat", "N"), 1).power;
  const long = gearOf(card("b", "extraordinary jazz", "N"), 1).power;
  assert.ok(long > short);
  assert.ok(gearOf(card("c", "cat", "R"), 1).power > long, "N の長い単語より R の短い単語が強い");
});

test("効果: 品詞で種類が決まり、数値はレア度で決まる。SSR は効果が2つ", () => {
  const noun = gearOf(card("n1", "table", "N", "noun"), 1);
  assert.ok(["defUp", "hpUp", "regen"].includes(noun.effects[0].key));
  const verb = gearOf(card("v1", "run", "SR", "verb"), 1);
  assert.ok(["atkUp", "crit", "drain"].includes(verb.effects[0].key));
  assert.equal(verb.effects[0].value, EFFECTS[verb.effects[0].key].values.SR);
  assert.equal(gearOf(card("s1", "run", "SSR", "verb"), 1).effects.length, 2);
  assert.equal(gearOf(card("s1", "run", "R", "verb"), 1).effects.length, 1);
});

test("属性: 単語の意味から決まる（fire → 炎、snowman → 氷）。相性で1.5倍・0.75倍", () => {
  assert.equal(elementOf(cards.fire), "fire");
  assert.equal(elementOf(cards.snow), "ice");
  assert.equal(elementOf(card("school", "school", "SSR")) === "ice", false, "cool を含むだけでは氷にしない");
  assert.equal(elementMultiplier("fire", "ice"), 1.5);
  assert.equal(elementMultiplier("ice", "fire"), 0.75);
  assert.equal(elementMultiplier("light", "dark"), 1.5);
  assert.equal(elementMultiplier("none", "dark"), 1);
});

test("能力値: Lv の土台に装備が足される。持っていない単語は効かない。属性がそろうとボーナス", () => {
  const q = { ...initialQuest(), equip: { weapon: "fire", armor: "flame", charm: "blaze" } };
  const owned = { fire: 1, flame: 1, blaze: 1 };
  const s = statsOf(q, cards, owned);
  assert.ok(s.atk > baseStats(1).atk);
  assert.ok(s.def > baseStats(1).def);
  assert.ok(s.hp > baseStats(1).hp);
  assert.equal(s.element, "fire");
  assert.equal(s.setBonus, true);
  const none = statsOf(q, cards, {});
  assert.deepEqual([none.atk, none.def], [baseStats(1).atk, baseStats(1).def]);
});

test("戦闘: 正解で攻撃・不正解はミス。敵の番でダメージを受ける", () => {
  const stats = statsOf(initialQuest(), cards, {});
  let run = createRun(stats, 1, fixed(0.5));
  const hp = run.enemy.hp;
  run = act(run, stats, "attack", { id: "w1", correct: true }, fixed(0.5));
  assert.ok(run.enemy.hp < hp);
  assert.equal(run.events[0].type, "hit");
  assert.ok(run.hp < stats.hp, "敵の番でダメージ");
  const before = run.enemy.hp;
  run = act(run, stats, "attack", { id: "w2", correct: false }, fixed(0.5));
  assert.equal(run.enemy.hp, before);
  assert.equal(run.events[0].type, "miss");
  assert.deepEqual(run.results, { w1: true, w2: false });
});

test("ぼうぎょはダメージ半分と MP 回復、やくそうは HP 回復、じゅもんは MP を使う", () => {
  const stats = statsOf(initialQuest(), cards, {});
  const base = createRun(stats, 3, fixed(0.5));
  const hit = act(base, stats, "attack", { id: "x", correct: false }, fixed(0.5));
  const guarded = act(base, stats, "defend", null, fixed(0.5));
  assert.ok(stats.hp - guarded.hp < stats.hp - hit.hp);
  const herb = act({ ...base, hp: 5 }, stats, "herb", null, fixed(0.5));
  assert.equal(herb.herbs, START_HERBS - 1);
  assert.ok(herb.hp > 5 - 20);
  const spell = act(base, stats, "spell", { id: "y", correct: true }, fixed(0.5));
  assert.equal(spell.mp, stats.mp - SPELL_MP);
  assert.equal(act({ ...base, mp: 0 }, stats, "spell", { id: "y", correct: true }).error, "MPがたりない！");
});

test("敵を倒すと経験値。次の階へ進める。5階ごとにボス", () => {
  const stats = { ...statsOf(initialQuest(), cards, {}), atk: 9999 };
  let run = createRun(stats, 1, fixed(0.5));
  run = act(run, stats, "attack", { id: "a", correct: true }, fixed(0.5));
  assert.equal(run.won, true);
  assert.ok(run.expGained > 0);
  assert.equal(run.bestFloor, 1);
  run = nextFloor(run, stats, fixed(0.5));
  assert.equal(run.floor, 2);
  assert.equal(run.won, false);
  assert.equal(isBossFloor(5), true);
  assert.equal(enemyFor(5, fixed(0.5)).boss, true);
  assert.ok(enemyFor(5, fixed(0.5)).hp > enemyFor(4, fixed(0.5)).hp * 2);
  assert.deepEqual(startFloors(12), [1, 6, 11]);
  assert.equal(retreat(run).over, true);
});

test("HP が 0 になると負け", () => {
  const stats = { ...statsOf(initialQuest(), cards, {}), evade: 0 };
  const run = act({ ...createRun(stats, 10, fixed(0.5)), hp: 1 }, stats, "attack", { id: "a", correct: false }, fixed(0.5));
  assert.equal(run.over, true);
  assert.equal(run.lost, true);
});

test("経験値で Lv が上がる（複数上がることもある）", () => {
  const { quest, levels } = gainExp(initialQuest(), expToNext(1) + expToNext(2) + 1);
  assert.equal(quest.level, 3);
  assert.equal(levels, 2);
  assert.equal(quest.exp, 1);
});

test("装備: 持っていない単語は付けられない。同じ単語はほかの枠から外れる。おまかせ装備は強い順", () => {
  let s = { ...freshState(), gacha: { ...freshState().gacha, cards: { fire: 1, blaze: 2, sword: 1 } } };
  assert.equal(equip(s, "weapon", "flame"), s);
  s = equip(s, "weapon", "fire");
  s = equip(s, "armor", "fire");
  assert.deepEqual(s.quest.equip, { weapon: null, armor: "fire", charm: null });
  const auto = autoEquip(s, cards);
  assert.equal(auto.quest.equip.weapon, "blaze");
  assert.equal(auto.quest.equip.charm, "sword");
});

test("冒険の結果: 経験値・最高の階・時間ぶんのポイントが記録される", () => {
  const s = freshState();
  const run = { ...createRun(statsOf(s.quest, cards, {}), 1, fixed(0.5)), expGained: 100, bestFloor: 6, cleared: 6, over: true };
  const { state, reward } = applyQuest(s, run, 120, 0);
  assert.equal(state.quest.best, 6);
  assert.ok(state.quest.level > 1);
  assert.equal(reward.points, 1200);
  assert.equal(state.gacha.points, s.gacha.points + 1200);
  assert.equal(reward.newBest, true);
});

test("保存データ: v5 から移行すると冒険の記録が加わる。統合は経験値の多い方", () => {
  assert.equal(STATE_VERSION, 6);
  const library = buildLibrary(rawChapters);
  const s = restoreState({ version: 5, learned: {} }, library);
  assert.deepEqual(s.quest, initialQuest());
  assert.equal(restoreQuest({ level: 0, equip: { weapon: 5 } }).level, 1);
  const a = { ...initialQuest(), level: 5, totalExp: 300, best: 3, equip: { weapon: "fire", armor: null, charm: null } };
  const b = { ...initialQuest(), level: 2, totalExp: 40, best: 9 };
  const m = mergeQuest(a, b);
  assert.equal(m.level, 5);
  assert.equal(m.equip.weapon, "fire");
  assert.equal(m.best, 9);
});
