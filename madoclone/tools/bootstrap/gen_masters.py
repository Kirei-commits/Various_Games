#!/usr/bin/env python3
"""仕様書（docs/01）の表から、基礎マスタを作る。

作るもの: system.json / tiers.json / stat_tables.json / buffs.json / difficulty.json / currencies.json
初回の生成用。作ったあとは JSON が正で、調整は JSON を直接直す（このスクリプトを流し直すと上書きされる）。
"""
import io
import json
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "Assets", "Game", "Data", "Json")


def dump(name, obj):
    with io.open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


# ---------------------------------------------------------------- system.json（仕様書 2.x、3.1、7.9）
system = {
    "schemaVersion": 1,
    "tickSec": 0.1,
    "baseAttackIntervalSec": 1.0,                 # [仮] 2.4節
    "enemyAttackSpeed": 1.0,                      # [仮] docs/03 3.2
    "attackSpeedMax": 5.0,                        # [仮]
    "elementCycle": ["valor", "skill", "heart", "wisdom"],  # 矢印の先に有利
    "elementAdvantagePct": 120,
    "elementDisadvantagePct": 80,
    "hitChanceMinPct": 5,
    "hitChanceMaxPct": 100,
    "critMultiplierMin": 1.0,
    "minDamage": 1,
    "defenseBuffAppliesBeforeSubtract": True,     # [仮] 2.1節、第11章
    "timeLimitSec": {"stage": 60, "boss": 60, "finalBoss": 180, "trial": 30, "trialLong": 60, "pvp": 60},
    "skipAvailableAfterSec": 1,
    "chainLimit": 64,
    "baseSubstats": {                              # [推定] 2.0節の「残り」
        "evasionPct": 5, "accuracyPct": 100, "critRatePct": 30,
        "critResistPct": 10, "critDamagePct": 1000, "critDefensePct": 1000
    },
    "powerFormula": {"hp": 1, "atk": 3, "def": 3},  # [推定] 2.3節
    "partySlots": 6,
    "leaderMinStar": 5,
    "crystalSlotStars": [2, 4, 6, 8, 10],
    "starterCharacters": ["chr_101", "chr_102", "chr_103", "chr_104", "chr_105"],  # [仮] 素格の5体
    "idleCapHours": 24,                           # [仮] 第8章
    "numberUnits": ["", "K", "M", "G", "T", "P", "E", "Z", "Y"],
    "devModeCodeSha256": "559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd"
}

# ---------------------------------------------------------------- tiers.json（4.7節）
tiers = {"schemaVersion": 1, "items": [
    {"id": "lr",    "count": 2,  "unlockRank": 12, "exchangeMultiplier": 3.0,  "statMultiplier": 1.1, "gacha": False},
    {"id": "kyoku", "count": 17, "unlockRank": 16, "exchangeMultiplier": 2.0,  "statMultiplier": 1.0, "gacha": True},
    {"id": "ten",   "count": 38, "unlockRank": 10, "exchangeMultiplier": 1.5,  "statMultiplier": 1.0, "gacha": True},
    {"id": "kou",   "count": 19, "unlockRank": 6,  "exchangeMultiplier": 1.0,  "statMultiplier": 1.0, "gacha": True},
    {"id": "sai",   "count": 11, "unlockRank": 3,  "exchangeMultiplier": 0.75, "statMultiplier": 1.0, "gacha": True},
    {"id": "tou",   "count": 13, "unlockRank": 1,  "exchangeMultiplier": 0.5,  "statMultiplier": 1.0, "gacha": True},
    {"id": "so",    "count": 5,  "unlockRank": 1,  "exchangeMultiplier": 0.5,  "statMultiplier": 1.0, "gacha": True},
]}

# ---------------------------------------------------------------- stat_tables.json（4.2、4.6節）
# 実測（★0・遠距離・全体強化込み）。形だけを使い、Lv1 を基本値に合わせ直す（docs/decisions 参照）。
MEASURED = {  # Lv: (atk, hp, def, expToNext)
    1: (556e3, 15671e3, 197e3, 2100), 2: (591e3, 16461e3, 203e3, 3450), 3: (672e3, 18240e3, 215e3, 5850),
    5: (1036e3, 26344e3, 270e3, 15000), 10: (3971e3, 91573e3, 712e3, 77250), 20: (26073e3, 582e6, 4046e3, 498e3),
    30: (84642e3, 1884e6, 12879e3, 1563e3), 40: (197e6, 4391e6, 29894e3, 3574e3), 50: (382e6, 8500e6, 57774e3, None),
}
BASE_LV1 = {"atk": 225.0, "hp": 8500.0, "def": 60.0}   # 4.1節 URアタッカーの基本値


def hp_fit(lv):
    return 65913 * lv ** 3 + 97728 * lv ** 2 + 19412 * lv + 15527137


def def_fit(lv):
    return 447.1 * lv ** 3 + 672.8 * lv ** 2 + 197.6 * lv + 196080


def exp_fit(lv):
    return 50.1 * lv ** 3 + 219.8 * lv ** 2 + 392.5 * lv + 1363


def atk_measured_shape(lv):
    """Lv50までは実測点の間を対数で補間。Lv51以降は HP と同じ伸び（4.6節）。"""
    pts = sorted(MEASURED)
    if lv >= 50:
        return MEASURED[50][0] * hp_fit(lv) / hp_fit(50)
    for a, b in zip(pts, pts[1:]):
        if a <= lv <= b:
            t = (lv - a) / (b - a)
            return math.exp(math.log(MEASURED[a][0]) * (1 - t) + math.log(MEASURED[b][0]) * t)
    raise ValueError(lv)


def sig(x, n=6):
    if x == 0:
        return 0
    d = n - 1 - int(math.floor(math.log10(abs(x))))
    v = round(x, d)
    return int(v) if v == int(v) else v


level_table = []
for lv in range(1, 121):
    m = MEASURED.get(lv)
    atk = (m[0] if m else atk_measured_shape(lv)) / MEASURED[1][0] * BASE_LV1["atk"]
    hp = (m[1] if m else hp_fit(lv)) / MEASURED[1][1] * BASE_LV1["hp"]
    de = (m[2] if m else def_fit(lv)) / MEASURED[1][2] * BASE_LV1["def"]
    ex = m[3] if (m and m[3]) else exp_fit(lv)
    level_table.append({"lv": lv, "atk": sig(atk), "hp": sig(hp), "def": sig(de),
                        "expToNext": None if lv == 120 else int(round(ex)),
                        "measured": bool(m)})

stat_tables = {
    "schemaVersion": 1,
    "baseRole": "ranged",
    "levelTable": level_table,
    "roleMultipliers": {
        "ranged":  {"atk": 1.0,   "hp": 1.0,   "def": 1.0,   "provisional": False},
        "melee":   {"atk": 0.865, "hp": 1.156, "def": 1.087, "provisional": False},  # 実測
        "defense": {"atk": 0.6,   "hp": 1.4,   "def": 1.5,   "provisional": True},   # [仮] docs/02 4.5
        "heal":    {"atk": 0.9,   "hp": 1.0,   "def": 1.0,   "provisional": True},   # [仮]
        "disrupt": {"atk": 0.9,   "hp": 1.0,   "def": 1.0,   "provisional": True},   # [仮]
    },
    "starMultipliers": [1 + 0.5 * n for n in range(12)],            # ★1だけ実測。他は等差の仮
    "starMaxLv": [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 110, 120],
    "awakenCost": [0, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],            # ★10・★11は推定
    "skillRankStars": {"normal": [1, 7], "special": [3, 9], "ultimate": [5, 11]},
}

# ---------------------------------------------------------------- buffs.json（3.3、3.4節）
def updown(stat, kind, sup, high, mid, low, prov):
    """kind: pct=（1＋合計）倍、pt=パーセントポイントを足す"""
    items = []
    for suffix, sign, pol in (("_up", 1, "buff"), ("_down", -1, "debuff")):
        t = {}
        for name, v in (("supreme", sup), ("high", high), ("mid", mid), ("low", low)):
            t[name] = {"statMods": [{"stat": stat, "op": kind, "value": sign * v}]}
            if name in prov:
                t[name]["provisional"] = True
        items.append({"id": stat + suffix, "category": "buff", "polarity": pol, "tiers": t})
    return items


buff_items = []
buff_items += updown("atk", "pct", 50, 35, 20, 10, {"mid", "low"})
buff_items += updown("def", "pct", 50, 35, 20, 10, {"mid", "low"})
buff_items += updown("crit_rate", "pt", 30, 20, 10, 5, {"low"})
buff_items += updown("crit_dmg", "pct", 50, 40, 25, 15, {"mid", "low"})
buff_items += updown("crit_resist", "pt", 30, 20, 10, 5, {"mid", "low"})
buff_items += updown("crit_def", "pct", 50, 40, 25, 15, {"mid", "low"})
buff_items += updown("accuracy", "pt", 30, 20, 10, 5, {"mid", "low"})
buff_items += updown("evasion", "pt", 30, 20, 10, 5, {"high", "mid", "low"})

RATIO = {"supreme": 1.0, "high": 0.7, "mid": 0.5, "low": 0.35}   # [仮] 表に無い段階


def scaled(key, sup, known=None, extra=None):
    t = {}
    for name, r in RATIO.items():
        v = (known or {}).get(name)
        d = {key: v if v is not None else round(sup * r, 2)}
        if v is None and name != "supreme":
            d["provisional"] = True
        if extra and name in extra:
            d.update(extra[name])
        t[name] = d
    return t


def dot(bid, sup, known, stat=None, stat_vals=None, prov_sup=False):
    extra = None
    if stat:
        extra = {n: {"statMods": [{"stat": stat, "op": "pct", "value": -v}]} for n, v in stat_vals.items()}
    t = scaled("dotAtkPct", sup, known, extra)
    for n in ("mid", "low"):
        t[n]["provisional"] = True
    if prov_sup:
        t["supreme"]["provisional"] = True
    return {"id": bid, "category": "status", "polarity": "debuff", "tiers": t}


buff_items += [
    dot("burn", 70, {"high": 50}, "atk", {"supreme": 30, "high": 20, "mid": 15, "low": 10}),
    dot("paralysis", 70, {"high": 50}, "def", {"supreme": 30, "high": 20, "mid": 15, "low": 10}),
    dot("bleed", 100, {"high": 70}, prov_sup=True),   # 最上級は100%（70%との記載もある）
    {"id": "regen", "category": "buff", "polarity": "buff", "tiers": scaled("hotAtkPct", 120)},
    {"id": "blessing_regen", "category": "buff", "polarity": "buff", "tiers": {"supreme": {"hotAtkPct": 150}}},
    {"id": "shield", "category": "buff", "polarity": "buff", "tiers": scaled("shieldMaxHpPct", 25)},
    {"id": "freeze", "category": "control", "polarity": "debuff", "tiers": {
        "supreme": {"cannotAct": True, "statMods": [{"stat": "crit_def", "op": "pct", "value": -50}]},
        "high": {"cannotAct": True, "statMods": [{"stat": "crit_def", "op": "pct", "value": -40}]},
        "mid": {"cannotAct": True, "statMods": [{"stat": "crit_def", "op": "pct", "value": -25}], "provisional": True},
        "low": {"cannotAct": True, "statMods": [{"stat": "crit_def", "op": "pct", "value": -15}], "provisional": True}}},
    {"id": "bind", "category": "control", "polarity": "debuff", "tiers": {"none": {"cannotAct": True}}},
    {"id": "silence", "category": "control", "polarity": "debuff", "tiers": {"none": {"ultimateGaugeStopped": True}}},
    {"id": "blind", "category": "status", "polarity": "debuff", "tiers": {
        "none": {"statMods": [{"stat": "accuracy", "op": "pt", "value": -10}], "provisional": True}}},
    {"id": "taunt", "category": "control", "polarity": "debuff", "tiers": {"none": {"forceTargetCaster": True, "provisional": True}}},
    {"id": "heal_block", "category": "status", "polarity": "debuff", "tiers": {"none": {"healBlocked": True}}},
    {"id": "invincible", "category": "buff", "polarity": "buff", "tiers": {"none": {"damageImmune": True}}},
    {"id": "cc_barrier", "category": "buff", "polarity": "buff", "tiers": {"none": {"immuneTo": ["bind", "freeze"]}}},
    {"id": "crit_shield", "category": "buff", "polarity": "buff", "tiers": {"none": {"critDamageImmune": True, "provisional": True}}},
    {"id": "reflect_shield", "category": "buff", "polarity": "buff", "tiers": {"none": {"reflectPct": 30, "provisional": True}}},
]
buffs = {"schemaVersion": 1,
         "stackRule": {"sameId": "keepHigherTier", "sameTier": "replace", "lowerTier": "ignore", "differentId": "add"},
         "items": buff_items}

# ---------------------------------------------------------------- difficulty.json（6.1、6.2節）
difficulty = {
    "schemaVersion": 1,
    "e1": 15000000,
    "ranks": 32, "areasPerRank": 10, "stagesPerArea": 10, "wavesPerStage": 4,
    "areaBossMultiplier": 1.15,
    "growth": [
        {"fromRank": 1, "toRank": 7, "g": 3.0},
        {"fromRank": 8, "toRank": 14, "g": 1.68},
        {"fromRank": 15, "toRank": 32, "gFrom": 1.68, "gTo": 1.30, "interp": "linear"},
    ],
    "wavePowerRatio": 0.25, "bossFightPowerRatio": 0.8, "bossShareOfFight": 0.6,
    "enemyStatShare": {"hp": 0.89, "atk": 0.031, "def": 0.0058},
    "enemyTypes": {
        "attacker": {"hp": 0.8, "atk": 1.4, "def": 1.0},
        "tank": {"hp": 1.3, "atk": 0.6, "def": 1.6},
        "disrupt": {"hp": 1.0, "atk": 0.9, "def": 1.0},
        "healer": {"hp": 0.9, "atk": 0.8, "def": 1.0},
    },
    "enemySubstats": {   # a + b×ランク（6.2節）
        "accuracyPct": {"a": 80, "b": 2.5}, "evasionPct": {"a": 5, "b": 1.5},
        "critRatePct": {"a": 20, "b": 2}, "critDamagePct": {"a": 200, "b": 250},
        "critResistPct": {"a": -45, "b": 4, "min": 0}, "critDefensePct": {"a": 0, "b": 360},
    },
    "enemyScale": [{"rank": r, "hp": 1.0, "atk": 1.0} for r in range(1, 33)],   # calibrate が書き換える
    "balanceTarget": {"winRatePct": 80, "bossFightSec": [20, 40], "waveSec": [3, 10]},
}

# ---------------------------------------------------------------- currencies.json（7.6節、docs/02 4.7）
CUR = ["gem", "gacha_ticket", "roulette_coin", "merit_medal", "coin", "exp", "bond_heart", "collection_medal",
       "familiar_power", "familiar_fish", "spirit_power", "star_sand", "dragon_power", "dragon_flame",
       "mana_shard", "mana_crystal", "awaken_shard", "wine", "research_memo", "magnifier",
       "tournament_point", "guild_coin"]
INTEGER = {"gacha_ticket", "roulette_coin", "magnifier", "awaken_shard", "merit_medal"}
currencies = {"schemaVersion": 1, "items": [
    {"id": c, "integer": c in INTEGER, "assetId": "art.cur.%s" % c} for c in CUR]}

JA = {
    "gem": "ジェム", "gacha_ticket": "ガチャチケット", "roulette_coin": "ルーレットコイン", "merit_medal": "功績メダル",
    "coin": "コイン", "exp": "経験値", "bond_heart": "絆ハート", "collection_medal": "コレクションメダル",
    "familiar_power": "使い魔の力", "familiar_fish": "使い魔のごはん", "spirit_power": "契約霊の力", "star_sand": "星の砂",
    "dragon_power": "竜の力", "dragon_flame": "竜の炎", "mana_shard": "魔力の欠片", "mana_crystal": "魔力の結晶",
    "awaken_shard": "覚醒の欠片", "wine": "ワイン", "research_memo": "研究メモ", "magnifier": "虫眼鏡",
    "tournament_point": "魔闘ポイント", "guild_coin": "ギルドコイン",
}

if __name__ == "__main__":
    dump("system.json", system)
    dump("tiers.json", tiers)
    dump("stat_tables.json", stat_tables)
    dump("buffs.json", buffs)
    dump("difficulty.json", difficulty)
    dump("currencies.json", currencies)
    ja_path = os.path.join(OUT, "text", "ja.json")
    ja = json.load(io.open(ja_path, encoding="utf-8")) if os.path.exists(ja_path) else {}
    for k, v in JA.items():
        ja["cur.%s.name" % k] = v
    with io.open(ja_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(dict(sorted(ja.items())), f, ensure_ascii=False, indent=2)
        f.write("\n")
    lt = level_table
    print("masters written. Lv1 %s / Lv50 %s / Lv120 %s" % (
        (lt[0]["atk"], lt[0]["hp"], lt[0]["def"]), (lt[49]["atk"], lt[49]["hp"], lt[49]["def"]),
        (lt[119]["atk"], lt[119]["hp"], lt[119]["def"])))
