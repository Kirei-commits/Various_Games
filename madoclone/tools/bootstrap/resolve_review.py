#!/usr/bin/env python3
"""needsReview の81件を、推測で確定して外す（ユーザー指示 2026-11-15）。1回きり。

- 条件・人数補正・確率の意味は docs/02 の「条件・人数補正・確率の約束」で決めた。
- 形が足りなかったものは、スキーマに型を足して直した（tier の3段配列、minRank、onTrigger、targetElements、debuffCountBonus）。
- 判断は docs/decisions/2026-11-15_確認待ちの確定.md に書いた。
"""
import json, pathlib, copy

ROOT = pathlib.Path(__file__).resolve().parents[2]
D = ROOT / "Assets/Game/Data/Json"
TIERS = ["supreme", "high", "mid", "low"]

# ---------- スキーマ ----------
for name in ("skills", "crystals"):
    p = ROOT / ("Schemas/%s.schema.json" % name)
    s = json.load(open(p))
    e = s["$defs"]["effect"]["properties"]
    e["tier"] = {"oneOf": [{"enum": TIERS + [None]}, {"type": "array", "minItems": 3, "maxItems": 3, "items": {"enum": TIERS}}]}
    if "debuffCountBonus" not in e["type"]["enum"]:
        e["type"]["enum"].append("debuffCountBonus")
    e["minRank"] = {"type": "integer", "minimum": 0, "maximum": 2}
    e["onTrigger"] = {"enum": ["onHit", "onCrit"]}
    e["scope"] = {"enum": ["enemy_all", "target"]}
    e["targetElements"] = {"type": "array", "minItems": 3, "maxItems": 3,
                           "items": {"type": "array", "minItems": 1, "items": {"enum": ["valor", "skill", "heart", "wisdom"]}}}
    p.write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# ---------- データ ----------
sk = json.load(open(D / "skills.json"))
cr = json.load(open(D / "crystals.json"))
by = {x["id"]: x for x in sk["items"] + cr["items"]}

def eff(rid, buff=None, typ=None):
    return [e for e in by[rid]["effects"] if (buff is None or e.get("buffId") == buff) and (typ is None or e["type"] == typ)]

def buff(buffId, tier=None, target="self", **kw):
    e = {"type": "applyBuff", "buffId": buffId}
    if tier is not None:
        e["tier"] = tier
    e["target"] = target
    e.update(kw)
    return e

# 人数補正：1人あたりの量を入れる（威力・回復は50%ずつ、秒数は0.5秒ずつ）
for rec in by.values():
    for e in rec["effects"]:
        if e["type"] == "elementCountBonus":
            if e["unit"] == "pct":
                e["pct"] = 50
            else:
                e["sec"] = 0.5

# 003 必殺：wikiに級が無い痺れは最上級とする（他の必殺の痺れがすべて最上級）
eff("skl_chr_003_u", "paralysis")[0]["tier"] = "supreme"

# 凸で段階が変わるもの：[基本, 3凸, 9凸]（特殊）
def set_tier(rid, buffId, tier):
    for e in eff(rid, buffId):
        e["tier"] = tier
set_tier("skl_chr_005_s", "crit_resist_up", ["mid", "high", "supreme"])
set_tier("skl_chr_016_s", "atk_down", ["high", "high", "supreme"])
set_tier("skl_chr_016_s", "evasion_down", ["high", "high", "supreme"])
for b in ("atk_up", "crit_dmg_up", "accuracy_up"):
    set_tier("skl_chr_042_s", b, ["mid", "high", "supreme"])
for b in ("crit_dmg_up", "accuracy_up"):
    set_tier("skl_chr_050_s", b, ["mid", "high", "supreme"])
for b in ("atk_up", "crit_rate_up"):
    set_tier("skl_chr_056_s", b, ["mid", "high", "supreme"])
set_tier("skl_chr_072_s", "def_up", ["high", "supreme", "supreme"])
set_tier("skl_chr_072_s", "crit_def_up", ["high", "high", "supreme"])
for b in ("def_down", "crit_resist_down"):
    set_tier("skl_chr_075_s", b, ["low", "mid", "high"])

# 005 必殺：自分に5秒 シールド・攻撃・防御（最上級）、50%で味方ごとに3秒 攻撃・シールド（最上級）
dmg = eff("skl_chr_005_u", typ="damage")[0]
by["skl_chr_005_u"]["effects"] = [dmg] + [
    buff(b, "supreme", "self", durationSec=[3, 4, 5], when="afterHit") for b in ("shield", "atk_up", "def_up")
] + [
    buff(b, "supreme", "ally_all", durationSec=[3, 4, 5], chancePct=50, when="afterHit") for b in ("atk_up", "shield")
]

# 017 特殊：束縛中の敵だけが対象（束縛を付けるのではない）
IF_BIND = {"targetHasAnyStatus": ["bind"]}
by["skl_chr_017_s"]["trigger"] = {"type": "onHit", "chancePct": 100}
by["skl_chr_017_s"]["effects"] = [
    dict(buff(b, "supreme", "enemy_area", durationSec=[3, 4, 5]), **{"if": IF_BIND}) for b in ("def_down", "crit_def_down", "evasion_down")
] + [dict(buff("heal_block", None, "enemy_area", durationSec=[3, 4, 5]), **{"if": IF_BIND})]

# 022 必殺：「防御系ダウン」は防御・クリ耐性・クリ防御の3つ（wikiの文）
e0 = eff("skl_chr_022_u", "def_down")[0]
i = by["skl_chr_022_u"]["effects"].index(e0)
by["skl_chr_022_u"]["effects"][i + 1:i + 1] = [dict(copy.deepcopy(e0), buffId=b) for b in ("crit_resist_down", "crit_def_down")]

# デバフ数による補正（wikiの文：敵全体についているデバフ・状態異常の数に応じて）
by["skl_chr_032_u"]["effects"].insert(0, {"type": "debuffCountBonus", "scope": "target", "pct": 5, "max": 300, "unit": "pct"})
by["skl_chr_055_u"]["effects"].insert(0, {"type": "debuffCountBonus", "scope": "target", "pct": 5, "max": 500, "unit": "pct"})

# 効果時間・確率が抜けていたもの
for e in eff("skl_chr_035_n", typ="applyBuff"):
    e["durationSec"] = 3
for e in eff("skl_chr_035_u", typ="applyBuff"):
    e["durationSec"] = [3, 4, 5]
for e in eff("skl_chr_036_u", typ="applyBuff"):
    e["durationSec"] = 3

# 063 特殊：常時。心属性の味方全体に、代償として防御ダウン
by["skl_chr_063_s"]["trigger"] = {"type": "always"}
by["skl_chr_063_s"]["effects"] = [
    buff("atk_up", "supreme", "ally_element", element="heart"),
    buff("crit_dmg_up", ["high", "supreme", "supreme"], "ally_element", element="heart"),
    buff("accuracy_up", ["high", "high", "supreme"], "ally_element", element="heart"),
    buff("def_down", "high", "ally_element", element="heart"),
]

# 064 特殊：3凸から、通常命中後10%で3秒の束縛を足す
by["skl_chr_064_s"]["effects"].append(buff("bind", None, "target", durationSec=3, chancePct=10, minRank=1, onTrigger="onHit"))

# 066 特殊：対象の属性が凸で増える（基本 勇・知／3凸 技を足す／9凸 全属性）
for e in by["skl_chr_066_s"]["effects"]:
    e["targetElements"] = [["valor", "wisdom"], ["valor", "wisdom", "skill"], ["valor", "wisdom", "skill", "heart"]]

# 067 特殊：痺れも条件つき（wikiの文）
IF67 = {"targetHasAnyStatus": ["freeze", "burn", "bleed"]}
for e in eff("skl_chr_067_s", "paralysis"):
    e["if"] = IF67

# 071 必殺：出血中の対象に、防御ダウン（推定。必殺なので最上級）と束縛
by["skl_chr_071_u"]["effects"] = [eff("skl_chr_071_u", typ="damage")[0],
    dict(buff("def_down", "supreme", "enemy_area", durationSec=[3, 4, 5]), **{"if": {"targetHasAnyStatus": ["bleed"]}}),
    dict(buff("bind", None, "enemy_area", durationSec=[3, 4, 5]), **{"if": {"targetHasAnyStatus": ["bleed"]}})]

# 072 通常：30%で自分を700%回復＋3秒シールド（上級）（wikiの文）
by["skl_chr_072_n"]["effects"] = [eff("skl_chr_072_n", typ="damage")[0],
    {"type": "heal", "multiplierPct": 700, "target": "self", "chancePct": 30},
    buff("shield", "high", "self", durationSec=3, chancePct=30)]

# 081 必殺：出血だけ50%。自分のバフは必ず付く。時間は 出血3/4/5秒、バフ5/6/7秒
for e in eff("skl_chr_081_u", typ="applyBuff"):
    if e["buffId"] == "bleed":
        e["durationSec"] = [3, 4, 5]
    else:
        e["durationSec"] = [5, 6, 7]; e.pop("chancePct", None)

# 「X%で味方ごとに」は味方1人ずつがX%で判定（005_u・072_u は効果側に確率が入っている）
by["skl_chr_095_s"]["trigger"]["chancePct"] = 100
for e in by["skl_chr_095_s"]["effects"]:
    e["chancePct"] = 20
by["cry_chr_005"]["trigger"]["chancePct"] = 100
for e in by["cry_chr_005"]["effects"]:
    e["chancePct"] = 20

# 093 必殺：ゲージを戻す秒数が凸で変わる
eff("skl_chr_093_u", typ="gaugeShift")[0]["sec"] = [-1, -2, -3]

# ---------- 確定 ----------
cleared = 0
for rec in by.values():
    if rec.pop("needsReview", None):
        cleared += 1
(D / "skills.json").write_text(json.dumps(sk, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(D / "crystals.json").write_text(json.dumps(cr, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("needsReview を外した:", cleared)
