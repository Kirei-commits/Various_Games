/*
 * 冒険（ドラクエ風のターン制 RPG）。ガチャで集めた単語を「装備」にして、塔を1階ずつ登る。
 * 画面や音声には触らない純粋関数。乱数は引数で受け取るので Node でテストできる。
 *
 * - 装備は7か所: 武器・盾・頭・体・腕・足・アクセ。どの単語でもどこにでも付けられ、場所ごとに上がる能力値が違う（slotBonus）。
 * - 単語の強さ（power）はレア度で決まる土台（RARITY_POWER）に、Lv（ガチャでダブった数）と
 *   「かっこよさ」（長い単語・熟語・x/z/q/j を含む単語ほど少し強い）を足したもの。
 * - 単語ごとに効果が付く: 品詞で種類が決まり（名詞=守り、動詞=攻め、形容詞=からめ手、その他=おまけ）、
 *   数値はレア度で決まる。SSR は効果が2つと、属性ごとの特製の呪文（SKILLS）が付く。
 * - 属性（炎・氷・雷・光・闇）は単語の意味（fire・snow など）か ID で決まる。武器の属性で攻撃し、盾の属性の攻撃は半分に抑える。
 *   4か所以上の属性がそろうと「属性そろい」で攻撃力 +15%（7か所そろうと +30%）。
 * - 戦闘: 「たたかう」と SSR の呪文は単語の4択に正解すると攻撃できる（間違えるとミス）。MP は呪文にだけ使う。
 * - 敵はときどき「ちからをためる」。次のターンの大こうげきは、ぼうぎょしないと大ダメージ。
 *   ぼうぎょしていれば大きく減らし、はんげきする（盾が強いほど減らす）。ボスは3ターンごとにためる。
 * - 5階ごとにボス（ドラゴン）。倒した階は記録され、次からはその次の階（5の倍数+1）から始められる。
 * - ボスを倒すと宝箱: ガチャのポイントと、冒険限定の単語・チケット・メダルのどれか（深い階ほどレア。rollChest）。
 * - 報酬はバトル（エンドレス）と同じ水準（questReward）。装備はプリセットに3組まで保存できる。
 */
import { grant, boostRate, pointsForTime, MAX_LEVEL as CARD_MAX, DUP_MEDALS } from "./gacha.js";
import { BATTLE_POINTS, BATTLE_TICKETS, REWARD_MIN_KILLS, endlessLevelBonus } from "./battle.js";

export const SLOTS = [
  { id: "weapon", name: "武器", icon: "⚔️", stat: "攻撃力" },
  { id: "shield", name: "盾", icon: "🛡️", stat: "守備力・ぼうぎょ" },
  { id: "head", name: "頭", icon: "⛑️", stat: "守備力・MP" },
  { id: "body", name: "体", icon: "🥋", stat: "HP・守備力" },
  { id: "arms", name: "腕", icon: "🧤", stat: "攻撃力・会心" },
  { id: "feet", name: "足", icon: "👢", stat: "みかわし・守備力" },
  { id: "accessory", name: "アクセ", icon: "💍", stat: "HP・MP" },
];
/** 以前の3か所の装備（武器・防具・お守り）から、今の場所への引っ越し先 */
export const OLD_SLOTS = { armor: "body", charm: "accessory" };
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

/** 装備の場所に付けたときに増える能力値 */
export function slotBonus(slot, power) {
  switch (slot) {
    case "weapon":
      return { atk: power };
    case "shield":
      return { def: Math.round(power * 0.5), block: Math.round(power / 4) };
    case "head":
      return { def: Math.round(power * 0.3), mp: Math.round(power / 3) };
    case "body":
      return { hp: Math.round(power * 1.5), def: Math.round(power * 0.3) };
    case "arms":
      return { atk: Math.round(power * 0.4), crit: Math.max(1, Math.round(power / 10)) };
    case "feet":
      return { evade: Math.max(1, Math.round(power / 8)), def: Math.round(power * 0.2) };
    default:
      return { hp: power, mp: Math.round(power / 4) };
  }
}

/**
 * SSR の特製の呪文（属性ごと）。MP を使い、4択に正解すると出せる。
 * mult はこうげきの倍率。effect: freeze = 敵を1ターン止める（ためも消える）／pierce = 守備を無視／heal = 最大 HP の割合を回復／
 * drain = 与えたダメージの割合を吸収
 */
export const SKILLS = {
  fire: { id: "fire", name: "フレイムバースト", icon: "🔥", mp: 10, mult: 2.4, element: "fire", text: "炎の大爆発" },
  ice: { id: "ice", name: "ブリザード", icon: "❄️", mp: 10, mult: 1.8, element: "ice", effect: "freeze", text: "敵を凍らせて1ターン止める" },
  thunder: { id: "thunder", name: "ライトニング", icon: "⚡", mp: 9, mult: 2.0, element: "thunder", effect: "pierce", text: "守備を無視する雷" },
  light: { id: "light", name: "ホーリーライト", icon: "✨", mp: 8, mult: 1.2, element: "light", effect: "heal", value: 40, text: "光の攻撃と HP 40% 回復" },
  dark: { id: "dark", name: "ダークドレイン", icon: "🌑", mp: 10, mult: 1.8, element: "dark", effect: "drain", value: 50, text: "与えたダメージの半分を吸収" },
  none: { id: "none", name: "メテオストライク", icon: "☄️", mp: 12, mult: 2.8, element: "none", text: "隕石の超こうげき" },
};

/** 装備している SSR の呪文（同じ呪文は1つだけ） */
export function skillsOf(gear) {
  const out = [];
  for (const g of Object.values(gear)) {
    const sk = g?.rarity === "SSR" ? SKILLS[g.element] : null;
    if (sk && !out.some((x) => x.id === sk.id)) out.push({ ...sk, from: g.english });
  }
  return out;
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
  const s = { ...baseStats(quest.level), crit: 5, evade: 3, block: 0, regen: 0, expUp: 0, elemUp: 0, drain: 0, element: "none", guard: "none", setBonus: 0 };
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
  s.guard = (gear.shield || gear.body)?.element || "none";
  // 属性そろい: 同じ属性が4か所以上で攻撃力 +15%、7か所すべてで +30%
  const counts = {};
  for (const g of Object.values(gear)) if (g.element !== "none") counts[g.element] = (counts[g.element] || 0) + 1;
  const most = Math.max(0, ...Object.values(counts));
  if (most >= 4) {
    s.setBonus = most >= SLOT_IDS.length ? 30 : 15;
    add.atkUp += s.setBonus;
  }
  s.atk = Math.round(s.atk * (1 + add.atkUp / 100));
  s.def = Math.round(s.def * (1 + add.defUp / 100));
  s.hp = Math.round(s.hp * (1 + add.hpUp / 100));
  s.crit = Math.min(s.crit, 60);
  s.evade = Math.min(s.evade, 40);
  s.drain = Math.min(s.drain, 40);
  s.block = Math.min(s.block, 60);
  return { ...s, gear, skills: skillsOf(gear) };
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
export const HERB_HEAL = 0.5; // 最大 HP の割合
export const DEFEND_MP = 3;
export const CRIT_RATE = 1.8;
/** ちからをためたあとの大こうげきの倍率（ボスはブレスでもっと強い） */
export const SMASH_RATE = 2.6;
export const BOSS_SMASH_RATE = 3;
/** ふつうの敵がちからをためる確率（2階から） */
export const CHARGE_CHANCE = 0.22;
/** 連続正解でダメージが上がる（1つごとに +10%、最大 +50%） */
export const comboRate = (combo) => 1 + Math.min(combo, 5) * 0.1;
/** ぼうぎょしたときに受けるダメージの割合（ふつうのこうげき・大こうげき）。盾の block で大こうげきはさらに減る */
export const guardRate = (smash, block = 0) => (smash ? Math.max(0.1, 0.25 - block / 400) : 0.5);

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
    chests: [], // あけた宝箱 [{ floor, items }]
    over: false, // 負けた・帰った
    lost: false,
    results: {}, // 問題ID → 最後まで間違えずに答えられたか（苦手の記録に使う）
    events: [], // 直前の行動で起きたこと（画面の演出とメッセージ用）
  };
}

/**
 * 1ターン進める。
 * @param action "attack" | "skill" | "defend" | "herb"
 * @param answer { id, correct }（attack・skill のときの4択の答え）
 * @param skillId skill のときの呪文（SKILLS のキー。装備している SSR のものだけ）
 * @returns 新しい run（error があれば行動できなかった）
 */
export function act(run, stats, action, answer = null, rng = Math.random, skillId = null) {
  if (run.over || run.won) return run;
  const skill = action === "skill" ? (stats.skills || []).find((x) => x.id === skillId) : null;
  if (action === "skill" && !skill) return { ...run, error: "その呪文は使えない！" };
  const cost = skill ? skill.mp : 0;
  if (cost && run.mp < cost) return { ...run, error: "MPがたりない！" };
  if (action === "herb" && run.herbs <= 0) return { ...run, error: "やくそうがない！" };
  const r = { ...run, enemy: { ...run.enemy }, results: { ...run.results }, events: [], defending: false };
  const ev = (e) => r.events.push(e);
  const e = r.enemy;
  r.turn += 1;

  if (action === "attack" || skill) {
    if (answer?.id && !(answer.id in r.results)) r.results[answer.id] = !!answer.correct;
    else if (answer?.id && !answer.correct) r.results[answer.id] = false;
    r.mp -= cost;
    const magic = skill ? "skill" : null;
    if (!answer?.correct) {
      r.combo = 0;
      ev({ type: "miss", magic, skill: skill?.name });
    } else {
      r.combo += 1;
      const element = skill ? skill.element : stats.element;
      const elem = elementMultiplier(element, e.element);
      const elemBoost = element !== "none" ? 1 + stats.elemUp / 100 : 1;
      const crit = rng() * 100 < stats.crit;
      const mult = skill ? skill.mult : 1;
      const power = stats.atk * comboRate(r.combo - 1) * mult * elem * elemBoost * (crit ? CRIT_RATE : 1);
      const def = skill?.effect === "pierce" ? 0 : magic ? e.def / 2 : e.def;
      const dmg = damageOf(power, def, rng);
      e.hp = Math.max(0, e.hp - dmg);
      ev({ type: "hit", dmg, crit, magic, skill: skill?.name, element, weak: elem > 1, resist: elem < 1, combo: r.combo });
      const drain = skill?.effect === "drain" ? skill.value : stats.drain;
      if (drain > 0) {
        const heal = Math.min(stats.hp - r.hp, Math.round((dmg * drain) / 100));
        if (heal > 0) {
          r.hp += heal;
          ev({ type: "drain", heal });
        }
      }
      if (skill?.effect === "heal") {
        const heal = Math.min(stats.hp - r.hp, Math.round((stats.hp * skill.value) / 100));
        if (heal > 0) {
          r.hp += heal;
          ev({ type: "heal", heal });
        }
      }
      if (skill?.effect === "freeze" && e.hp > 0) {
        e.frozen = true;
        e.charging = false;
        ev({ type: "freeze" });
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

  enemyTurn(r, stats, rng);
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

/** 敵の番: 凍っていれば休み。ためていれば大こうげき。ときどき（ボスは3ターンごとに）ちからをためる。それ以外はふつうのこうげき */
function enemyTurn(r, stats, rng) {
  const e = r.enemy;
  const ev = (x) => r.events.push(x);
  if (e.frozen) {
    e.frozen = false;
    ev({ type: "frozen" });
    return;
  }
  const smash = !!e.charging;
  e.charging = false;
  if (!smash) {
    const charge = e.boss ? r.turn % 3 === 2 : r.floor >= 2 && rng() < CHARGE_CHANCE;
    if (charge) {
      e.charging = true;
      ev({ type: "charge", boss: e.boss });
      return;
    }
  }
  // 大こうげきはかわせない（ぼうぎょで受けるしかない）
  if (!smash && rng() * 100 < stats.evade) {
    ev({ type: "evade" });
    return;
  }
  const resist = stats.guard !== "none" && stats.guard === e.element;
  const rate = smash ? (e.boss ? BOSS_SMASH_RATE : SMASH_RATE) : 1;
  const raw = damageOf(e.atk * rate, stats.def, rng);
  const guarded = r.defending ? guardRate(smash, stats.block) : 1;
  const dmg = Math.max(1, Math.round(raw * guarded * (resist ? 0.5 : 1)));
  r.hp = Math.max(0, r.hp - dmg);
  ev({ type: "hurt", dmg, smash, boss: e.boss, guarded: r.defending, resist });
  // 大こうげきをぼうぎょで受けとめたら、はんげき（守備力と盾で決まる）
  if (smash && r.defending && r.hp > 0) {
    const counter = Math.max(1, Math.round((stats.def + stats.block * 2) * (0.9 + rng() * 0.2)));
    e.hp = Math.max(0, e.hp - counter);
    ev({ type: "counter", dmg: counter });
    if (e.hp <= 0) {
      const exp = Math.round(e.exp * (1 + stats.expUp / 100));
      r.expGained += exp;
      r.cleared += 1;
      r.bestFloor = Math.max(r.bestFloor, r.floor);
      r.won = true;
      ev({ type: "win", exp, boss: e.boss });
    }
  }
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

const emptyEquip = () => Object.fromEntries(SLOT_IDS.map((k) => [k, null]));

export const initialQuest = () => ({
  level: 1,
  exp: 0, // 今の Lv で貯めた経験値
  totalExp: 0,
  equip: emptyEquip(),
  best: 0, // 倒した一番上の階
  wins: 0, // 倒した敵の数
  runs: 0,
  presets: [null, null, null], // 装備のプリセット（{ equip } か null）
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

/**
 * いちばん強くなるように自動で装備する。power の高い順に、武器 → 体 → 盾 → 腕 → 頭 → 足 → アクセ。
 * SSR は呪文が付くので、できるだけ（属性の違う SSR を）付ける
 */
export const AUTO_ORDER = ["weapon", "body", "shield", "arms", "head", "feet", "accessory"];
export function autoEquip(state, cards) {
  const owned = Object.entries(state.gacha?.cards || {}).filter(([id, n]) => n > 0 && cards[id]);
  const ranked = owned.map(([id, n]) => gearOf(cards[id], n)).sort((a, b) => b.power - a.power || (a.id < b.id ? -1 : 1));
  const q = { ...initialQuest(), ...state.quest };
  const eq = emptyEquip();
  AUTO_ORDER.forEach((slot, i) => (eq[slot] = ranked[i]?.id || null));
  return { ...state, quest: { ...q, equip: eq } };
}

// ---------------------------------------------------------------------------
// 宝箱（ボスを倒すと1つ）
// ---------------------------------------------------------------------------

/** 冒険限定の単語のレア度の出やすさ（ボスの階ごと）。序盤で強い単語を配りすぎない */
export function chestRarity(floor) {
  if (floor <= 10) return { N: 75, R: 25, SR: 0, SSR: 0 };
  if (floor <= 20) return { N: 35, R: 50, SR: 15, SSR: 0 };
  if (floor <= 30) return { N: 10, R: 45, SR: 40, SSR: 5 };
  return { N: 0, R: 30, SR: 55, SSR: 15 };
}

const pickWeighted = (weights, rng) => {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (const [k, w] of Object.entries(weights)) {
    if ((x -= w) < 0) return k;
  }
  return Object.keys(weights)[0];
};

/**
 * 宝箱の中身。ガチャのポイント（深いほど多い）＋ もう1つ（冒険限定の単語 45%・レアチケット 25%・メダル 20%・SR チケット 10%。
 * SR チケットは15階より前はレアチケットになる）。
 * @param words 冒険限定の単語 [{ id, rarity }]
 * @returns [{ kind: "points"|"tickets"|"srTickets"|"medals"|"word", amount?, id?, rarity? }]
 */
export function rollChest(floor, words, rng = Math.random) {
  const tier = Math.max(1, Math.floor(floor / BOSS_EVERY));
  const items = [{ kind: "points", amount: 300 * tier }];
  const kind = pickWeighted({ word: 45, tickets: 25, medals: 20, srTickets: 10 }, rng);
  if (kind === "word" && words.length) {
    const odds = chestRarity(floor);
    let rarity = pickWeighted(odds, rng);
    // そのレア度の単語が無ければ、1つ下のレア度から
    const order = ["SSR", "SR", "R", "N"];
    let list = words.filter((w) => w.rarity === rarity);
    for (let i = order.indexOf(rarity) + 1; !list.length && i < order.length; i++) {
      rarity = order[i];
      list = words.filter((w) => w.rarity === rarity);
    }
    const w = list[Math.floor(rng() * list.length)];
    if (w) items.push({ kind: "word", id: w.id, rarity: w.rarity });
  } else if (kind === "srTickets" && floor >= 15) items.push({ kind: "srTickets", amount: 1 });
  else if (kind === "medals") items.push({ kind: "medals", amount: 5 * tier });
  else items.push({ kind: "tickets", amount: Math.min(3, 1 + Math.floor(tier / 3)) });
  return items;
}

/** 宝箱をあける（run.chests に足す。持ち帰りは冒険の終わり） */
export function openChest(run, words, rng = Math.random) {
  const items = rollChest(run.floor, words, rng);
  return { ...run, chests: [...(run.chests || []), { floor: run.floor, items }] };
}

// ---------------------------------------------------------------------------
// 報酬と記録
// ---------------------------------------------------------------------------

/** 正解率（0〜1） */
const accuracyOf = (run) => {
  const r = Object.values(run.results || {});
  return r.length ? r.filter(Boolean).length / r.length : 0;
};

/**
 * 冒険の報酬（ブースト前）。バトルのエンドレスと同じ水準にそろえる:
 * - ポイント: 遊んだ時間ぶん × (1 + 0.5 × 正解率 + ボスを倒した 0.5 + 最高記録 0.3) を 1000〜3000 に収め、
 *   さらに到達レベルのボーナス（endlessLevelBonus。3階倒すごとに1レベル。バトルは10体ごと＝1階あたり約3問のため）
 * - レアチケット: 1 + (レベル-1)/2 枚（1〜8）
 * - 倒した階が REWARD_MIN_KILLS 未満なら、時間ぶんのポイントだけ
 */
export const QUEST_LEVEL_FLOORS = 3;
export function questReward(run, seconds, rec = initialQuest()) {
  const timePoints = pointsForTime(seconds);
  const newBest = run.bestFloor > (rec.best || 0);
  if (run.cleared < REWARD_MIN_KILLS) return { points: Math.min(timePoints, BATTLE_POINTS.max), tickets: 0, levelBonus: 0, newBest };
  const bossBeaten = (run.chests || []).length > 0;
  const bonus = 1 + 0.5 * accuracyOf(run) + (bossBeaten ? 0.5 : 0) + (newBest ? 0.3 : 0);
  const level = 1 + Math.floor(run.cleared / QUEST_LEVEL_FLOORS);
  const levelBonus = endlessLevelBonus(level);
  const points = Math.round(Math.min(BATTLE_POINTS.max, Math.max(BATTLE_POINTS.min, timePoints * bonus)) / 10) * 10 + levelBonus;
  const tickets = Math.min(BATTLE_TICKETS.max, Math.max(BATTLE_TICKETS.min, 1 + Math.floor((level - 1) / 2)));
  return { points, tickets, levelBonus, newBest };
}

/** 冒険の結果を記録する: 経験値（Lv）・最高の階・報酬（ブースト中はポイント5倍）・宝箱の中身（単語はガチャの記録に足す） */
export function applyQuest(state, run, seconds, now = 0) {
  const q = { ...initialQuest(), ...state.quest };
  const { quest, levels } = gainExp(q, run.expGained);
  const rate = boostRate(state.gacha, now);
  const base = questReward(run, seconds, q);
  const next = { ...quest, best: Math.max(q.best, run.bestFloor), wins: q.wins + run.cleared, runs: q.runs + 1 };
  // 宝箱
  const loot = { points: 0, tickets: 0, srTickets: 0, medals: 0 };
  const cards = { ...(state.gacha?.cards || {}) };
  const words = [];
  for (const chest of run.chests || []) {
    for (const it of chest.items) {
      if (it.kind === "word") {
        if ((cards[it.id] || 0) >= CARD_MAX) loot.medals += DUP_MEDALS[it.rarity] || 1; // MAX の単語はメダルに
        else cards[it.id] = (cards[it.id] || 0) + 1;
        words.push(it);
      } else loot[it.kind] += it.amount;
    }
  }
  const points = base.points * rate;
  const withCards = { ...state, quest: next, gacha: { ...state.gacha, cards, rev: (state.gacha?.rev || 0) + (words.length ? 1 : 0) } };
  return {
    state: grant(withCards, { points: points + loot.points, tickets: base.tickets + loot.tickets, srTickets: loot.srTickets, medals: loot.medals }),
    reward: {
      exp: run.expGained,
      levels,
      level: next.level,
      points,
      tickets: base.tickets,
      levelBonus: base.levelBonus * rate,
      boosted: rate > 1,
      best: next.best,
      newBest: base.newBest,
      loot,
      words,
    },
  };
}

// ---------------------------------------------------------------------------
// 装備のプリセット
// ---------------------------------------------------------------------------

export const PRESETS = 3;

/** 今の装備をプリセット i に保存する */
export function savePreset(state, i) {
  const q = { ...initialQuest(), ...state.quest };
  const presets = [...q.presets];
  presets[i] = { equip: { ...q.equip } };
  return { ...state, quest: { ...q, presets } };
}

/** プリセット i の装備に付け替える（持っていない単語は外す） */
export function loadPreset(state, i) {
  const q = { ...initialQuest(), ...state.quest };
  const p = q.presets[i];
  if (!p) return state;
  const owned = state.gacha?.cards || {};
  const eq = emptyEquip();
  for (const k of SLOT_IDS) if (p.equip[k] && owned[p.equip[k]] > 0) eq[k] = p.equip[k];
  return { ...state, quest: { ...q, equip: eq } };
}

const nonNeg = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function restoreQuest(saved, rename = (id) => id) {
  const base = initialQuest();
  if (!saved || typeof saved !== "object") return base;
  const equipSaved = saved.equip && typeof saved.equip === "object" ? { ...saved.equip } : {};
  // 以前の3か所の装備（防具・お守り）は、今の場所（体・アクセ）へ
  for (const [old, now] of Object.entries(OLD_SLOTS)) if (equipSaved[now] == null && typeof equipSaved[old] === "string") equipSaved[now] = equipSaved[old];
  const eq = emptyEquip();
  const used = new Set();
  for (const k of SLOT_IDS) {
    const id = typeof equipSaved[k] === "string" ? rename(equipSaved[k]) : null;
    if (id && !used.has(id)) {
      eq[k] = id;
      used.add(id);
    }
  }
  const presets = Array.from({ length: PRESETS }, (_, i) => {
    const p = Array.isArray(saved.presets) ? saved.presets[i] : null;
    if (!p || typeof p !== "object" || !p.equip || typeof p.equip !== "object") return null;
    const pe = emptyEquip();
    for (const k of SLOT_IDS) pe[k] = typeof p.equip[k] === "string" ? rename(p.equip[k]) : null;
    return { equip: pe };
  });
  return {
    level: Math.min(MAX_LEVEL, Math.max(1, nonNeg(saved.level) || 1)),
    exp: nonNeg(saved.exp),
    totalExp: nonNeg(saved.totalExp),
    equip: eq,
    best: nonNeg(saved.best),
    wins: nonNeg(saved.wins),
    runs: nonNeg(saved.runs),
    presets,
  };
}

/** 2台の端末の記録を統合する（経験値の多い方の Lv・装備、最高の階・回数は大きい方） */
export function mergeQuest(a, b) {
  const x = restoreQuest(a);
  const y = restoreQuest(b);
  const main = y.totalExp >= x.totalExp ? y : x;
  return { ...main, best: Math.max(x.best, y.best), wins: Math.max(x.wins, y.wins), runs: Math.max(x.runs, y.runs) };
}
