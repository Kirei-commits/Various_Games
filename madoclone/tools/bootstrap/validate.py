#!/usr/bin/env python3
"""データの検証（docs/02 4.10節）。tools/Mado.Sim validate（C#）ができるまでの代わり。

エラーが1つでもあれば終了コード1。needsReview などは警告で、--strict を付けるとエラーになる。
必要なもの: Python 3 と jsonschema。
"""
import io
import json
import os
import sys

import jsonschema

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.environ.get("MADO_DATA_DIR") or os.path.join(ROOT, "Assets", "Game", "Data", "Json")
SCHEMAS = os.path.join(ROOT, "Schemas")
STRICT = "--strict" in sys.argv

errors, warnings = [], []


def load(name):
    return json.load(io.open(os.path.join(DATA, name), encoding="utf-8"))


def err(msg):
    errors.append(msg)


def warn(msg):
    (errors if STRICT else warnings).append(msg)


# 1. スキーマ
masters = {}
for fn in sorted(os.listdir(SCHEMAS)):
    name = fn.replace(".schema.json", ".json")
    schema = json.load(io.open(os.path.join(SCHEMAS, fn), encoding="utf-8"))
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        err("スキーマはあるがデータが無い: " + name)
        continue
    masters[name] = load(name)
    v = jsonschema.Draft202012Validator(schema)
    for e in sorted(v.iter_errors(masters[name]), key=lambda e: list(e.absolute_path)):
        err("[schema] %s %s: %s" % (name, "/".join(str(p) for p in e.absolute_path), e.message[:160]))

chars = load("characters.json")["items"]
skills = {s["id"]: s for s in load("skills.json")["items"]}
crystals = {c["id"]: c for c in load("crystals.json")["items"]}
buffs = {b["id"]: b for b in load("buffs.json")["items"]}
tiers = {t["id"]: t for t in load("tiers.json")["items"]}
ja = load("text/ja.json")
system = load("system.json")
stat = load("stat_tables.json")
diff = load("difficulty.json")

# 2. 参照
ids = [c["id"] for c in chars]
if len(ids) != len(set(ids)):
    err("キャラIDが重複している")
char_ids = set(ids)
for c in chars:
    for kind, sid in c["skills"].items():
        if sid not in skills:
            err("%s: スキルが無い %s" % (c["id"], sid))
        elif skills[sid]["kind"] != kind:
            err("%s: スキルの種類が違う %s" % (c["id"], sid))
    if c["crystalId"] not in crystals:
        err("%s: 魔晶が無い %s" % (c["id"], c["crystalId"]))
    if c["id"] + ".name" not in ja:
        err("%s: 表示名が text/ja.json に無い" % c["id"])
    if [b["star"] for b in c["substatBonuses"]] != [2, 4, 8, 10]:
        err("%s: 凸ステの★が 2・4・8・10 ではない" % c["id"])
for cid in system["starterCharacters"]:
    if cid not in char_ids:
        err("system.starterCharacters: キャラが無い " + cid)
for cry in crystals.values():
    if cry["ownerId"] not in char_ids:
        err("%s: 持ち主が無い" % cry["id"])

review = 0
no_tier = 0
for item in list(skills.values()) + list(crystals.values()):
    if item.get("needsReview"):
        review += 1
    if item["trigger"]["type"] == "unknown" and not item.get("needsReview"):
        err("%s: 発動条件が不明なのに needsReview が無い" % item["id"])
    for e in item["effects"]:
        if e["type"] != "applyBuff":
            continue
        b = buffs.get(e["buffId"])
        if not b:
            err("%s: バフが buffs.json に無い %s" % (item["id"], e["buffId"]))
            continue
        tiered = "none" not in b["tiers"]
        if tiered:
            if e.get("tier") is None:
                no_tier += 1
                if not item.get("needsReview"):
                    err("%s: 段階が無いのに needsReview が無い %s" % (item["id"], e["buffId"]))
            else:
                for t in (e["tier"] if isinstance(e["tier"], list) else [e["tier"]]):
                    if t not in b["tiers"]:
                        err("%s: %s に段階 %s が無い" % (item["id"], e["buffId"], t))
        elif e.get("tier") is not None:
            err("%s: 段階を持たないバフに段階がある %s" % (item["id"], e["buffId"]))
if review:
    warn("確認が要るスキル・魔晶が %d 件ある（needsReview。一覧は python3 tools/bootstrap/review_report.py で out/review_report.md に出す）" % review)
if no_tier:
    warn("段階が決まっていないバフが %d か所ある" % no_tier)

# 3. 人数
EXPECT = {"lr": 2, "kyoku": 17, "ten": 38, "kou": 19, "sai": 11, "tou": 13, "so": 5}
count = {}
for c in chars:
    count[c["tier"]] = count.get(c["tier"], 0) + 1
if len(chars) != 105:
    err("キャラが105体ではない: %d" % len(chars))
for k, v in EXPECT.items():
    if count.get(k, 0) != v:
        err("格 %s の体数が違う: %d（正しくは %d）" % (k, count.get(k, 0), v))
    if tiers[k]["count"] != v:
        err("tiers.json の %s の体数が違う" % k)
for c in chars:
    if (c["tier"] == "lr") != (c["obtain"] == "boss_first_clear"):
        err("%s: LR と入手方法が合わない" % c["id"])

# 4. スキルの中身
for c in chars:
    for kind in ("normal", "ultimate"):
        s = skills.get(c["skills"][kind])
        # 巨人化のように、無敵を付けるだけの必殺はダメージも回復も無くてよい
        if s and not any(e["type"] in ("damage", "heal") or e.get("buffId") == "invincible" for e in s["effects"]) and not s.get("needsReview"):
            err("%s: ダメージも回復も無い" % s["id"])
    u = skills.get(c["skills"]["ultimate"])
    if u and not u["trigger"].get("cooldownSec"):
        err("%s: 必殺のクールタイムが無い" % u["id"])
for item in list(skills.values()) + list(crystals.values()):
    for e in item["effects"]:
        for k in ("multiplierPct", "durationSec", "bonusSelfLostHpPct"):
            v = e.get(k)
            if isinstance(v, list) and not (v[0] <= v[1] <= v[2]):
                err("%s: %s が凸で増えていない %s" % (item["id"], k, v))

# 5. ステータス表
lt = stat["levelTable"]
if [r["lv"] for r in lt] != list(range(1, 201)):
    err("levelTable が Lv1〜200 ではない")
for a, b in zip(lt, lt[1:]):
    if not (b["atk"] > a["atk"] and b["hp"] > a["hp"] and b["def"] > a["def"]):
        err("levelTable が増えていない: Lv%d" % b["lv"])
if len(stat["starMultipliers"]) != 17 or len(stat["starMaxLv"]) != 17 or len(stat["awakenCost"]) != 17:
    err("★の表が17個ではない")
if sum(stat["awakenCost"][:12]) != 46 or sum(stat["awakenCost"]) != 96:
    err("覚醒の必要枚数の合計が（★0〜11で46、全体で96）ではない")

# 6. 難易度（仕様書6.1節の表）
EXP_BOSS = [45.0e6, 135.0e6, 405.0e6, 1.2e9, 3.6e9, 10.9e9, 32.8e9, 55.1e9, 92.6e9, 155.5e9, 261.3e9, 439.0e9,
            737.6e9, 1.2e12, 2.1e12, 3.5e12, 5.6e12, 9.1e12, 14.5e12, 22.7e12, 35.1e12, 53.5e12, 80.3e12, 118.7e12,
            172.9e12, 247.9e12, 350.0e12, 486.3e12, 664.9e12, 894.0e12, 1.2e15, 1.5e15]


def growth(r):
    for seg in diff["growth"]:
        if seg["fromRank"] <= r <= seg["toRank"]:
            if "g" in seg:
                return seg["g"]
            t = (r - seg["fromRank"]) / (seg["toRank"] - seg["fromRank"])
            return seg["gFrom"] + (seg["gTo"] - seg["gFrom"]) * t
    raise ValueError(r)


E = diff["e1"]
for r in range(1, 33):
    E *= growth(r)
    # 表は上2〜4桁の表示なので、表示の丸め（最大4%）までを許す
    if abs(E / EXP_BOSS[r - 1] - 1) > 0.04:
        err("ランク%d のボス推奨戦力が仕様書と合わない: %.4g（表は %.4g）" % (r, E, EXP_BOSS[r - 1]))
if [s["rank"] for s in diff["enemyScale"]] != list(range(1, diff["ranks"] + 1)):
    err("enemyScale がランク1〜ranks ではない")

# 9. 元作品の名前が混ざっていないか（dev/sourcemap.json があるときだけ）
sm_path = os.path.join(ROOT, "dev", "sourcemap.json")
if os.path.exists(sm_path):
    sm = json.load(io.open(sm_path, encoding="utf-8"))
    names = set()
    for v in sm.values():
        if len(v["name"]) >= 3:
            names.add(v["name"])
        for n in v["skills"].values():
            if len(n) >= 3 and not n.startswith("通常攻撃"):
                names.add(n)
    for dirpath, _, files in os.walk(DATA):
        for fn in files:
            if not fn.endswith(".json"):
                continue
            body = io.open(os.path.join(dirpath, fn), encoding="utf-8").read()
            for n in names:
                if n in body:
                    err("元作品の名前がデータに入っている: %s（%s）" % (n, fn))
else:
    warnings.append("dev/sourcemap.json が無いので、元作品の名前の混入チェックを飛ばした")

for w in warnings:
    print("警告: " + w)
for e in errors:
    print("エラー: " + e)
print("validate: エラー %d、警告 %d（キャラ %d、スキル %d、魔晶 %d、バフ %d）" % (
    len(errors), len(warnings), len(chars), len(skills), len(crystals), len(buffs)))
sys.exit(1 if errors else 0)
