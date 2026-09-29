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
  rollChest,
  openChest,
  chestRarity,
  questReward,
  savePreset,
  loadPreset,
  START_HERBS,
  SKILLS,
  guardRate,
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

test("能力値: Lv の土台に装備が足される。持っていない単語は効かない。4か所の属性がそろうとボーナス", () => {
  const cards2 = { ...cards, burn: card("burn", "burn", "N", "verb") };
  const q = { ...initialQuest(), equip: { ...initialQuest().equip, weapon: "fire", body: "flame", accessory: "blaze", shield: "burn" } };
  const owned = { fire: 1, flame: 1, blaze: 1, burn: 1 };
  const s = statsOf(q, cards2, owned);
  assert.ok(s.atk > baseStats(1).atk);
  assert.ok(s.def > baseStats(1).def);
  assert.ok(s.hp > baseStats(1).hp);
  assert.equal(s.element, "fire");
  assert.equal(s.guard, "fire");
  assert.equal(s.setBonus, 15);
  assert.equal(statsOf({ ...q, equip: { ...q.equip, shield: null } }, cards2, owned).setBonus, 0, "3か所ではそろわない");
  const none = statsOf(q, cards2, {});
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

test("ぼうぎょはダメージ半分と MP 回復、やくそうは HP 回復。ふつうのじゅもんはない（呪文は SSR 装備だけ）", () => {
  const stats = statsOf(initialQuest(), cards, {});
  const base = createRun(stats, 3, fixed(0.5));
  const hit = act(base, stats, "attack", { id: "x", correct: false }, fixed(0.5));
  const guarded = act(base, stats, "defend", null, fixed(0.5));
  assert.ok(stats.hp - guarded.hp < stats.hp - hit.hp);
  const herb = act({ ...base, hp: 5 }, stats, "herb", null, fixed(0.5));
  assert.equal(herb.herbs, START_HERBS - 1);
  assert.ok(herb.hp > 5 - 20);
  const spell = act(base, stats, "spell", { id: "y", correct: true }, fixed(0.5));
  assert.equal(spell.mp, base.mp, "spell という行動はなく、MP は減らない");
  assert.equal(spell.enemy.hp, base.enemy.hp);
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
  s = equip(s, "shield", "fire");
  assert.equal(s.quest.equip.weapon, null, "同じ単語はほかの場所から外れる");
  assert.equal(equip(s, "armor", "fire"), s, "知らない場所には付けない");
  assert.equal(s.quest.equip.shield, "fire");
  const auto = autoEquip(s, cards);
  assert.equal(auto.quest.equip.weapon, "blaze");
  assert.equal(auto.quest.equip.body, "fire");
  assert.equal(auto.quest.equip.shield, "sword");
  assert.equal(Object.keys(auto.quest.equip).length, 7);
});

test("冒険の報酬はバトル（エンドレス）と同じ水準: 1000〜3000pt ＋ 3階ごとのレベルボーナス、レアチケット", () => {
  const s = freshState();
  const run = { ...createRun(statsOf(s.quest, cards, {}), 1, fixed(0.5)), expGained: 100, bestFloor: 6, cleared: 6, over: true };
  // 2分 = 1200pt × (1 + 最高記録 0.3) = 1560、レベル3（6階）のボーナス 1500、チケット2枚
  assert.deepEqual(questReward(run, 120, s.quest), { points: 3060, tickets: 2, levelBonus: 1500, newBest: true });
  const { state, reward } = applyQuest(s, run, 120, 0);
  assert.equal(state.quest.best, 6);
  assert.ok(state.quest.level > 1);
  assert.equal(reward.points, 3060);
  assert.equal(state.gacha.points, s.gacha.points + 3060);
  assert.equal(state.gacha.tickets, s.gacha.tickets + 2);
  // 2階しか倒さなければ時間ぶんだけ
  assert.deepEqual(questReward({ ...run, cleared: 2 }, 30, s.quest).tickets, 0);
});

test("宝箱: ボスの階ごとに中身が決まり、序盤は強い単語が出ない。単語はガチャの記録に入る", () => {
  const words = [
    { id: "w-n", rarity: "N" },
    { id: "w-r", rarity: "R" },
    { id: "w-sr", rarity: "SR" },
    { id: "w-ssr", rarity: "SSR" },
  ];
  assert.deepEqual(chestRarity(5), { N: 75, R: 25, SR: 0, SSR: 0 });
  // 5階では何回あけても SR・SSR は出ない
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 300; i++) {
    for (const it of rollChest(5, words, rng)) if (it.kind === "word") assert.ok(["N", "R"].includes(it.rarity), it.rarity);
  }
  const deep = new Set();
  for (let i = 0; i < 600; i++) for (const it of rollChest(40, words, rng)) if (it.kind === "word") deep.add(it.rarity);
  assert.ok(deep.has("SSR") && !deep.has("N"), [...deep].join(","));
  // 乱数 0 → 単語（45% の枠）・N
  const items = rollChest(5, words, () => 0);
  assert.deepEqual(items, [{ kind: "points", amount: 300 }, { kind: "word", id: "w-n", rarity: "N" }]);
  // 持ち帰り
  const s = freshState();
  const run = openChest({ ...createRun(statsOf(s.quest, cards, {}), 5, fixed(0.5)), bestFloor: 5, cleared: 1 }, words, () => 0);
  const { state, reward } = applyQuest(s, run, 10, 0);
  assert.equal(state.gacha.cards["w-n"], 1);
  assert.equal(reward.loot.points, 300);
  assert.deepEqual(reward.words.map((w) => w.id), ["w-n"]);
});

test("装備のプリセット: 保存して付け替えられる。持っていない単語は外れる", () => {
  let s = { ...freshState(), gacha: { ...freshState().gacha, cards: { fire: 1, blaze: 1 } } };
  s = equip(s, "weapon", "fire");
  s = equip(s, "body", "blaze");
  s = savePreset(s, 0);
  s = equip(s, "weapon", null);
  s = loadPreset(s, 0);
  assert.equal(s.quest.equip.weapon, "fire");
  assert.equal(s.quest.equip.body, "blaze");
  const lost = loadPreset({ ...s, gacha: { ...s.gacha, cards: { fire: 1 } } }, 0);
  assert.equal(lost.quest.equip.body, null);
  assert.equal(loadPreset(s, 2), s, "空のプリセットは何もしない");
  assert.deepEqual(restoreQuest({ presets: [{ equip: { weapon: "fire" } }, 5] }).presets.map((p) => p?.equip.weapon ?? null), ["fire", null, null]);
});

test("保存データ: v5 から移行すると冒険の記録が加わる。統合は経験値の多い方", () => {
  assert.equal(STATE_VERSION, 7);
  const library = buildLibrary(rawChapters);
  const s = restoreState({ version: 5, learned: {} }, library);
  assert.deepEqual(s.quest, initialQuest());
  assert.equal(restoreQuest({ level: 0, equip: { weapon: 5 } }).level, 1);
  // 以前の3か所（防具・お守り）は、体・アクセへ引っ越す
  const old = restoreQuest({ level: 2, equip: { weapon: "a", armor: "b", charm: "c" } });
  assert.deepEqual([old.equip.weapon, old.equip.body, old.equip.accessory, old.equip.shield], ["a", "b", "c", null]);
  const a = { ...initialQuest(), level: 5, totalExp: 300, best: 3, equip: { ...initialQuest().equip, weapon: "fire" } };
  const b = { ...initialQuest(), level: 2, totalExp: 40, best: 9 };
  const m = mergeQuest(a, b);
  assert.equal(m.level, 5);
  assert.equal(m.equip.weapon, "fire");
  assert.equal(m.best, 9);
});

test("敵がちからをためると、次のターンは大こうげき。ぼうぎょで大きく減らし、はんげきする", () => {
  const stats = { ...statsOf(initialQuest(), cards, {}), evade: 0 };
  // 2階・乱数 0.1 → ためる（22% 未満）
  let run = createRun(stats, 2, fixed(0.5));
  run = act(run, stats, "attack", { id: "a", correct: false }, fixed(0.1));
  assert.equal(run.enemy.charging, true);
  assert.equal(run.events.at(-1).type, "charge");
  const hp = run.hp;
  const hit = act(run, stats, "attack", { id: "b", correct: false }, fixed(0.5));
  const guarded = act(run, stats, "defend", null, fixed(0.5));
  const bigDmg = hp - hit.hp;
  const smallDmg = hp - guarded.hp;
  assert.ok(hit.events.some((e) => e.type === "hurt" && e.smash));
  assert.ok(smallDmg * 3 < bigDmg, `${smallDmg} vs ${bigDmg}`);
  assert.ok(guarded.events.some((e) => e.type === "counter"), "ぼうぎょで受けるとはんげき");
  assert.ok(guarded.enemy.hp < run.enemy.hp);
  assert.ok(guardRate(true, 60) < guardRate(true, 0), "盾が強いほど大こうげきを減らす");
});

test("ボスは3ターンごとにちからをためる", () => {
  const stats = { ...statsOf(initialQuest(), cards, {}), evade: 0, hp: 9999 };
  let run = { ...createRun(stats, 5, fixed(0.5)), hp: 9999 };
  const types = [];
  for (let i = 0; i < 3; i++) {
    run = act(run, stats, "defend", null, fixed(0.5));
    types.push(run.events.map((e) => e.type).join(","));
  }
  assert.ok(types[1].includes("charge"), types.join(" | "));
  assert.ok(types[2].includes("counter"), types.join(" | "));
});

test("SSR の装備には属性ごとの特製の呪文が付く（ブリザードは敵を1ターン止める）", () => {
  const q = { ...initialQuest(), equip: { ...initialQuest().equip, weapon: "blaze", body: "flame" } };
  const ice = card("ice", "snowstorm", "SSR", "noun");
  const cards2 = { ...cards, ice };
  const s = statsOf({ ...q, equip: { ...q.equip, shield: "ice" } }, cards2, { blaze: 1, flame: 1, ice: 1 });
  assert.deepEqual(s.skills.map((x) => x.id).sort(), ["fire", "ice"]);
  assert.equal(statsOf(q, cards2, { blaze: 1, flame: 1 }).skills.length, 1, "SR には呪文がない");
  const stats = { ...s, evade: 0 };
  let run = createRun(stats, 1, fixed(0.5));
  run = { ...run, enemy: { ...run.enemy, hp: 9999, maxHp: 9999 } };
  const frozen = act(run, stats, "skill", { id: "w", correct: true }, fixed(0.5), "ice");
  assert.equal(frozen.mp, stats.mp - SKILLS.ice.mp);
  assert.ok(frozen.events.some((e) => e.type === "freeze"));
  assert.ok(frozen.events.some((e) => e.type === "frozen"), "凍った敵はそのターン動けない");
  assert.equal(frozen.hp, run.hp, "ダメージを受けない");
  assert.equal(act(run, stats, "skill", { id: "w", correct: true }, fixed(0.5), "dark").error, "その呪文は使えない！");
});
