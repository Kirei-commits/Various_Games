/*
 * 冒険（ドラクエ風のターン制 RPG）。ガチャで集めた単語を「装備」にして、塔を1階ずつ登る。
 * 画面や音声には触らない純粋関数。乱数は引数で受け取るので Node でテストできる。
 *
 * - 装備は3つ: 武器（攻撃力）・防具（守備力）・お守り（HP と MP）。どの単語でもどの枠に付けられる。
 * - 単語の強さ（power）はレア度で決まる土台（RARITY_POWER）に、Lv（ガチャでダブった数）と
 *   「かっこよさ」（長い単語・熟語・x/z/q/j を含む単語ほど少し強い）を足したもの。
 * - 単語ごとに効果が付く: 品詞で種類が決まり（名詞=守り、動詞=攻め、形容詞=からめ手、その他=おまけ）、
 *   数値はレア度で決まる。SSR は効果が2つ。属性（炎・氷・雷・光・闇）は単語の意味（fire・snow など）か ID で決まる。
 * - 武器の属性で攻撃し、防具の属性の攻撃は半分に抑える。3つの属性がそろうと「属性そろい」で攻撃力 +15%。
 * - 戦闘: 「たたかう」「じゅもん」は単語の4択に正解すると攻撃できる（間違えるとミス）。
 *   「ぼうぎょ」はダメージ半分と MP 回復、「やくそう」は HP 回復。敵を倒すと経験値、Lv が上がると強くなる。
 * - 5階ごとにボス（ドラゴン）。倒した階は記録され、次からはその次の階（5の倍数+1）から始められる。
 */
import { grant, boostRate, pointsForTime } from "./gacha.js";

export const SLOTS = [
  { id: "weapon", name: "武器", icon: "⚔️", stat: "攻撃力" },
  { id: "armor", name: "防具", icon: "🛡️", stat: "守備力" },
  { id: "charm", name: "お守り", icon: "📿", stat: "HP・MP" },
];
export const SLOT_IDS = SLOTS.map((s) => s.id);

/** レア度ごとの装備の強さ: 土台・Lv が1つ上がるごとの伸び・かっこよさの倍率 */
export const RARITY_POWER = {
  N: { base: 6, grow: 2, flair: 0.25 },
  R: { base: 14, grow: 4, flair: 0.5 },
  SR: { base: 28, grow: 7, flair: 0.8 },
  SSR: { base: 50, grow: 12, flair: 1.2 },
};
const RARITY_KEYS = ["N", "R", "SR", "SSR"];

export const ELEMENTS = {
  none: { name: "なし", icon: "" },
  fire: { name: "炎", icon: "🔥" },
  ice: { name: "氷", icon: "❄️" },
  thunder: { name: "雷", icon: "⚡" },
  light: { name: "光", icon: "✨" },
  dark: { name: "闇", icon: "🌑" },
};
const ELEMENT_KEYS = ["fire", "ice", "thunder", "light", "dark"];
/** 相性: 炎→氷→雷→炎 は矢印の先に強い（1.5倍、逆は0.75倍）。光と闇はおたがいに強い */
const BEATS = { fire: "ice", ice: "thunder", thunder: "fire" };
export function elementMultiplier(attack, defend) {
  if (!attack || attack === "none" || !defend || defend === "none") return 1;
  if ((attack === "light" && defend === "dark") || (attack === "dark" && defend === "light")) return 1.5;
  if (BEATS[attack] === defend) return 1.5;
  if (BEATS[defend] === attack) return 0.75;
  return 1;
}

/** 単語の意味から属性を決める（前方一致。短い語は完全一致） */
const ELEMENT_WORDS = {
  fire: ["fire", "flame", "burn", "hot", "heat", "spicy", "volcano", "blaze", "boil", "bake", "roast", "grill", "smoke", "candle", "pepper", "angry", "anger"],
  ice: ["ice", "cold", "snow", "freez", "frozen", "winter", "chill", "frost", "cool", "refrigerator", "fridge", "glacier", "shiver"],
  thunder: ["thunder", "lightning", "storm", "electric", "shock", "battery", "power", "energy", "flash", "spark", "charge", "plug", "outlet"],
  light: ["light", "sun", "shine", "bright", "holy", "angel", "hope", "star", "gold", "smile", "happy", "joy", "morning", "rainbow", "glow"],
  dark: ["dark", "night", "shadow", "ghost", "evil", "fear", "scar", "death", "dead", "secret", "curse", "nightmare", "black", "haunt", "grave", "lonely"],
};

/** 効果の種類。値はレア度で決まり、Lv で少し伸びる（Lv1 を 1 として 1 つごとに +15%） */
export const EFFECTS = {
  atkUp: { name: "攻撃力アップ", unit: "%", values: { N: 5, R: 10, SR: 18, SSR: 30 } },
  defUp: { name: "守備力アップ", unit: "%", values: { N: 5, R: 10, SR: 18, SSR: 30 } },
  hpUp: { name: "HPアップ", unit: "%", values: { N: 5, R: 10, SR: 18, SSR: 30 } },
  crit: { name: "会心率アップ", unit: "%", values: { N: 3, R: 6, SR: 10, SSR: 15 } },
  regen: { name: "自動回復", unit: "HP/ターン", values: { N: 1, R: 3, SR: 5, SSR: 9 } },
  evade: { name: "みかわし", unit: "%", values: { N: 3, R: 5, SR: 8, SSR: 12 } },
  mpUp: { name: "MPアップ", unit: "", values: { N: 3, R: 6, SR: 10, SSR: 16 } },
  expUp: { name: "経験値アップ", unit: "%", values: { N: 5, R: 10, SR: 20, SSR: 35 } },
  elemUp: { name: "属性強化", unit: "%", values: { N: 10, R: 15, SR: 25, SSR: 40 } },
  drain: { name: "HP吸収", unit: "%", values: { N: 3, R: 6, SR: 10, SSR: 15 } },
};
const EFFECT_KEYS = Object.keys(EFFECTS);
/** 品詞ごとに付きやすい効果（名詞=守り、動詞=攻め、形容詞=からめ手、その他=おまけ） */
const POS_EFFECTS = {
  noun: ["defUp", "hpUp", "regen"],
  verb: ["atkUp", "crit", "drain"],
  adj: ["evade", "elemUp", "regen"],
  other: ["mpUp", "expUp", "crit"],
};

export const effectText = (e) => `${EFFECTS[e.key].name} +${e.value}${EFFECTS[e.key].unit}`;

/** 文字列からいつも同じ数を作る */
export function hashOf(text, seed = 7) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}

const rarityOf = (card) => (RARITY_KEYS.includes(card?.rarity) ? card.rarity : "N");
const levelOf = (copies) => Math.max(1, Math.min(4, copies || 1));

export function elementOf(card) {
  const tokens = String(card.english || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const key of ELEMENT_KEYS) {
    if (ELEMENT_WORDS[key].some((kw) => tokens.some((t) => t === kw || (kw.length >= 4 && t.startsWith(kw))))) return key;
  }
  // 意味から決まらない単語: N は7割が無属性。レアほど属性が付きやすい
  const noneShare = { N: 70, R: 50, SR: 30, SSR: 0 }[rarityOf(card)];
  const h = hashOf(card.id, 11);
  if (h % 100 < noneShare) return "none";
  return ELEMENT_KEYS[(h >>> 8) % ELEMENT_KEYS.length];
}

/** かっこよさ: 長さ（16文字まで）＋ めずらしい文字（x z q j）＋ 熟語（空白を含む） */
export function flairOf(card) {
  const e = String(card.english || "").toLowerCase();
  const letters = e.replace(/[^a-z]/g, "");
  const rare = (letters.match(/[xzqj]/g) || []).length;
  return Math.min(letters.length, 16) + rare * 2 + (/\s/.test(e.trim()) ? 2 : 0);
}

/**
 * 単語を装備として見たときの情報。
 * @param card ガチャのカード（id・english・japanese・rarity・pos）
 * @param copies 持っている枚数（Lv = 枚数、最大4）
 */
export function gearOf(card, copies = 1) {
  const rarity = rarityOf(card);
  const level = levelOf(copies);
  const rp = RARITY_POWER[rarity];
  const flair = flairOf(card);
  const power = rp.base + rp.grow * (level - 1) + Math.round(rp.flair * flair);
  const scale = 1 + 0.15 * (level - 1);
  const pick = (list, seed) => list[hashOf(card.id, seed) % list.length];
  const first = pick(POS_EFFECTS[card.pos] || POS_EFFECTS.other, 3);
  const keys = [first];
  if (rarity === "SSR") keys.push(pick(EFFECT_KEYS.filter((k) => k !== first), 5));
  const effects = keys.map((key) => ({ key, value: Math.round(EFFECTS[key].values[rarity] * scale) }));
  return { id: card.id, english: card.english, japanese: card.japanese, rarity, level, power, flair, element: elementOf(card), effects };
}

/** 装備の枠に付けたときに増える能力値 */
export function slotBonus(slot, power) {
  if (slot === "weapon") return { atk: power };
  if (slot === "armor") return { def: Math.round(power * 0.7) };
  return { hp: power * 2, mp: Math.round(power / 3) };
}

// ---------------------------------------------------------------------------
// 主人公の能力値
// ---------------------------------------------------------------------------

export const MAX_LEVEL = 99;
/** 次の Lv までに必要な経験値 */
export const expToNext = (level) => Math.round(15 * level ** 1.5);

export const baseStats = (level) => ({
  hp: 40 + 10 * (level - 1),
  mp: 12 + 3 * (level - 1),
  atk: 10 + 3 * (level - 1),
  def: 5 + 2 * (level - 1),
});

/**
 * 能力値（Lv の土台 ＋ 装備 ＋ 効果）。
 * @param quest 冒険の記録（level・equip）
 * @param cards 単語ID → カード（ガチャのカタログ）
 * @param owned 単語ID → 持っている枚数（持っていない単語の装備は無視する）
 */
export function statsOf(quest, cards, owned = {}) {
  const s = { ...baseStats(quest.level), crit: 5, evade: 3, regen: 0, expUp: 0, elemUp: 0, drain: 0, element: "none", guard: "none", setBonus: false };
  const gear = {};
  const add = { atkUp: 0, defUp: 0, hpUp: 0 };
  for (const slot of SLOT_IDS) {
    const id = quest.equip?.[slot];
    const card = id && cards[id];
    if (!card || !(owned[id] > 0)) continue;
    const g = gearOf(card, owned[id]);
    gear[slot] = g;
    for (const [k, v] of Object.entries(slotBonus(slot, g.power))) s[k] += v;
    for (const e of g.effects) {
      if (e.key in add) add[e.key] += e.value;
      else if (e.key === "mpUp") s.mp += e.value;
      else s[e.key] += e.value;
    }
  }
  if (gear.weapon) s.element = gear.weapon.element;
  if (gear.armor) s.guard = gear.armor.element;
  const els = SLOT_IDS.map((k) => gear[k]?.element);
  if (els.every((e) => e && e !== "none" && e === els[0])) {
    s.setBonus = true;
    add.atkUp += 15;
  }
  s.atk = Math.round(s.atk * (1 + add.atkUp / 100));
  s.def = Math.round(s.def * (1 + add.defUp / 100));
  s.hp = Math.round(s.hp * (1 + add.hpUp / 100));
  s.crit = Math.min(s.crit, 60);
  s.evade = Math.min(s.evade, 40);
  s.drain = Math.min(s.drain, 40);
  return { ...s, gear };
}

// ---------------------------------------------------------------------------
// 敵
// ---------------------------------------------------------------------------

/** 敵の種類（絵はバトルと同じ。src/battle-art.jsx の MONSTER_KINDS） */
export const ENEMY_KINDS = [
  { kind: "slime", name: "スライム", element: "ice" },
  { kind: "bat", name: "こうもり", element: "dark" },
  { kind: "mushroom", name: "おばけキノコ", element: "none" },
  { kind: "goblin", name: "ゴブリン", element: "none" },
  { kind: "imp", name: "インプ", element: "fire" },
  { kind: "ghost", name: "ゴースト", element: "dark" },
  { kind: "eye", name: "まどうアイ", element: "light" },
  { kind: "fire", name: "ほのおのせい", element: "fire" },
  { kind: "skull", name: "どくろ", element: "dark" },
  { kind: "golem", name: "ゴーレム", element: "thunder" },
];
export const BOSS_EVERY = 5;
export const isBossFloor = (floor) => floor % BOSS_EVERY === 0;

export function enemyFor(floor, rng = Math.random) {
  const boss = isBossFloor(floor);
  const base = boss
    ? { kind: "dragon", name: floor % 10 === 0 ? "やみのドラゴン" : "ほのおのドラゴン", element: floor % 10 === 0 ? "dark" : "fire" }
    : ENEMY_KINDS[(Math.min(floor - 1, 6) + Math.floor(rng() * 4)) % ENEMY_KINDS.length];
  const hp = Math.round((22 + floor * 10) * (boss ? 3 : 1));
  return {
    ...base,
    boss,
    hp,
    maxHp: hp,
    atk: Math.round((6 + floor * 2.4) * (boss ? 1.3 : 1)),
    def: Math.round(2 + floor * 1.3),
    exp: Math.round((5 + floor * 3) * (boss ? 4 : 1)),
  };
}

// ---------------------------------------------------------------------------
// 戦闘
// ---------------------------------------------------------------------------

export const START_HERBS = 3;
export const SPELL_MP = 6;
export const HERB_HEAL = 0.5; // 最大 HP の割合
export const DEFEND_MP = 3;
export const CRIT_RATE = 1.8;
/** 連続正解でダメージが上がる（1つごとに +10%、最大 +50%） */
export const comboRate = (combo) => 1 + Math.min(combo, 5) * 0.1;

export const damageOf = (atk, def, rng) => Math.max(1, Math.round((atk - def / 2) * (0.9 + rng() * 0.2)));

/** 冒険を始める（start 階から） */
export function createRun(stats, start = 1, rng = Math.random) {
  return {
    floor: start,
    start,
    hp: stats.hp,
    mp: stats.mp,
    herbs: START_HERBS,
    enemy: enemyFor(start, rng),
    combo: 0,
    defending: false,
    turn: 0,
    expGained: 0,
    cleared: 0, // 倒したボス以外も含めた階の数
    bestFloor: start - 1, // 倒した一番上の階
    won: false, // 今の階の敵を倒した
    over: false, // 負けた・帰った
    lost: false,
    results: {}, // 問題ID → 最後まで間違えずに答えられたか（苦手の記録に使う）
    events: [], // 直前の行動で起きたこと（画面の演出とメッセージ用）
  };
}

/**
 * 1ターン進める。
 * @param action "attack" | "spell" | "defend" | "herb"
 * @param answer { id, correct }（attack・spell のときの4択の答え）
 * @returns 新しい run（error があれば行動できなかった）
 */
export function act(run, stats, action, answer = null, rng = Math.random) {
  if (run.over || run.won) return run;
  const r = { ...run, enemy: { ...run.enemy }, results: { ...run.results }, events: [], defending: false };
  const ev = (e) => r.events.push(e);
  const e = r.enemy;
  if (action === "spell" && r.mp < SPELL_MP) return { ...run, error: "MPがたりない！" };
  if (action === "herb" && r.herbs <= 0) return { ...run, error: "やくそうがない！" };
  r.turn += 1;

  if (action === "attack" || action === "spell") {
    if (answer?.id && !(answer.id in r.results)) r.results[answer.id] = !!answer.correct;
    else if (answer?.id && !answer.correct) r.results[answer.id] = false;
    if (action === "spell") r.mp -= SPELL_MP;
    if (!answer?.correct) {
      r.combo = 0;
      ev({ type: "miss", spell: action === "spell" });
    } else {
      r.combo += 1;
      const elem = elementMultiplier(stats.element, e.element);
      const elemBoost = stats.element !== "none" ? 1 + stats.elemUp / 100 : 1;
      const crit = rng() * 100 < stats.crit;
      const spell = action === "spell";
      const power = stats.atk * comboRate(r.combo - 1) * (spell ? 1.7 : 1) * elem * elemBoost * (crit ? CRIT_RATE : 1);
      const dmg = damageOf(power, spell ? e.def / 2 : e.def, rng);
      e.hp = Math.max(0, e.hp - dmg);
      ev({ type: "hit", dmg, crit, spell, weak: elem > 1, resist: elem < 1, combo: r.combo });
      if (stats.drain > 0) {
        const heal = Math.min(stats.hp - r.hp, Math.round((dmg * stats.drain) / 100));
        if (heal > 0) {
          r.hp += heal;
          ev({ type: "drain", heal });
        }
      }
    }
  } else if (action === "defend") {
    r.defending = true;
    r.mp = Math.min(stats.mp, r.mp + DEFEND_MP);
    ev({ type: "defend" });
  } else if (action === "herb") {
    r.herbs -= 1;
    const heal = Math.min(stats.hp - r.hp, Math.round(stats.hp * HERB_HEAL));
    r.hp += heal;
    ev({ type: "herb", heal });
  }

  if (e.hp <= 0) {
    const exp = Math.round(e.exp * (1 + stats.expUp / 100));
    r.expGained += exp;
    r.cleared += 1;
    r.bestFloor = Math.max(r.bestFloor, r.floor);
    r.won = true;
    ev({ type: "win", exp, boss: e.boss });
    return r;
  }

  // 敵の番。ボスは3ターンごとにブレス（1.6倍）
  const breath = e.boss && r.turn % 3 === 0;
  if (rng() * 100 < stats.evade) {
    ev({ type: "evade", breath });
  } else {
    const resist = stats.guard !== "none" && stats.guard === e.element;
    const raw = damageOf(e.atk * (breath ? 1.6 : 1), stats.def, rng);
    const dmg = Math.max(1, Math.round(raw * (r.defending ? 0.5 : 1) * (resist ? 0.5 : 1)));
    r.hp = Math.max(0, r.hp - dmg);
    ev({ type: "hurt", dmg, breath, guarded: r.defending, resist });
  }
  if (r.hp <= 0) {
    r.over = true;
    r.lost = true;
    ev({ type: "lose" });
    return r;
  }
  if (stats.regen > 0 && r.hp < stats.hp) {
    const heal = Math.min(stats.hp - r.hp, stats.regen);
    r.hp += heal;
    ev({ type: "regen", heal });
  }
  return r;
}

/** 次の階へ（HP は 15%、MP は 20% 回復。ボスを倒したあとはやくそう +1） */
export function nextFloor(run, stats, rng = Math.random) {
  if (!run.won || run.over) return run;
  const floor = run.floor + 1;
  return {
    ...run,
    floor,
    enemy: enemyFor(floor, rng),
    hp: Math.min(stats.hp, run.hp + Math.round(stats.hp * 0.15)),
    mp: Math.min(stats.mp, run.mp + Math.round(stats.mp * 0.2)),
    herbs: run.herbs + (run.enemy.boss ? 1 : 0),
    won: false,
    combo: run.combo,
    events: [],
  };
}

/** 街に帰る（倒した階までの経験値は持ち帰る） */
export const retreat = (run) => ({ ...run, over: true, events: [] });

/** 始められる階（1階と、倒したボスの次の階） */
export function startFloors(best) {
  const out = [1];
  for (let f = BOSS_EVERY; f <= best; f += BOSS_EVERY) out.push(f + 1);
  return out;
}

/** 苦手の記録に使う結果（テストと同じ形） */
export const runResults = (run) => Object.entries(run.results).map(([id, correct]) => ({ id, correct }));

// ---------------------------------------------------------------------------
// 記録
// ---------------------------------------------------------------------------

export const initialQuest = () => ({
  level: 1,
  exp: 0, // 今の Lv で貯めた経験値
  totalExp: 0,
  equip: { weapon: null, armor: null, charm: null },
  best: 0, // 倒した一番上の階
  wins: 0, // 倒した敵の数
  runs: 0,
});

/** 経験値を足して Lv を上げる */
export function gainExp(quest, exp) {
  const q = { ...quest, exp: quest.exp + exp, totalExp: quest.totalExp + exp };
  let levels = 0;
  while (q.level < MAX_LEVEL && q.exp >= expToNext(q.level)) {
    q.exp -= expToNext(q.level);
    q.level += 1;
    levels += 1;
  }
  if (q.level >= MAX_LEVEL) q.exp = 0;
  return { quest: q, levels };
}

/** 装備する（id が null なら外す）。持っていない単語は付けられない。同じ単語はほかの枠から外す */
export function equip(state, slot, id) {
  if (!SLOT_IDS.includes(slot)) return state;
  if (id && !(state.gacha?.cards?.[id] > 0)) return state;
  const q = { ...initialQuest(), ...state.quest };
  const eq = { ...q.equip };
  if (id) for (const k of SLOT_IDS) if (eq[k] === id) eq[k] = null;
  eq[slot] = id || null;
  return { ...state, quest: { ...q, equip: eq } };
}

/** いちばん強くなるように自動で装備する（power の高い順に、武器→防具→お守り） */
export function autoEquip(state, cards) {
  const owned = Object.entries(state.gacha?.cards || {}).filter(([id, n]) => n > 0 && cards[id]);
  const ranked = owned.map(([id, n]) => gearOf(cards[id], n)).sort((a, b) => b.power - a.power || (a.id < b.id ? -1 : 1));
  const q = { ...initialQuest(), ...state.quest };
  const eq = { weapon: null, armor: null, charm: null };
  SLOT_IDS.forEach((slot, i) => (eq[slot] = ranked[i]?.id || null));
  return { ...state, quest: { ...q, equip: eq } };
}

/** 冒険の報酬: 経験値（Lv が上がる）と、遊んだ時間ぶんのガチャのポイント（バトルと同じ量。最大 3000・ブースト中は5倍） */
export const QUEST_POINTS_MAX = 3000;
export function applyQuest(state, run, seconds, now = 0) {
  const q = { ...initialQuest(), ...state.quest };
  const { quest, levels } = gainExp(q, run.expGained);
  const rate = boostRate(state.gacha, now);
  const points = Math.min(pointsForTime(seconds), QUEST_POINTS_MAX) * rate;
  const next = { ...quest, best: Math.max(q.best, run.bestFloor), wins: q.wins + run.cleared, runs: q.runs + 1 };
  return {
    state: grant({ ...state, quest: next }, { points }),
    reward: { exp: run.expGained, levels, level: next.level, points, boosted: rate > 1, best: next.best, newBest: run.bestFloor > q.best },
  };
}

const nonNeg = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function restoreQuest(saved, rename = (id) => id) {
  const base = initialQuest();
  if (!saved || typeof saved !== "object") return base;
  const equipSaved = saved.equip && typeof saved.equip === "object" ? saved.equip : {};
  const eq = {};
  for (const k of SLOT_IDS) eq[k] = typeof equipSaved[k] === "string" ? rename(equipSaved[k]) : null;
  return {
    level: Math.min(MAX_LEVEL, Math.max(1, nonNeg(saved.level) || 1)),
    exp: nonNeg(saved.exp),
    totalExp: nonNeg(saved.totalExp),
    equip: eq,
    best: nonNeg(saved.best),
    wins: nonNeg(saved.wins),
    runs: nonNeg(saved.runs),
  };
}

/** 2台の端末の記録を統合する（経験値の多い方の Lv・装備、最高の階・回数は大きい方） */
export function mergeQuest(a, b) {
  const x = restoreQuest(a);
  const y = restoreQuest(b);
  const main = y.totalExp >= x.totalExp ? y : x;
  return { ...main, best: Math.max(x.best, y.best), wins: Math.max(x.wins, y.wins), runs: Math.max(x.runs, y.runs) };
}
