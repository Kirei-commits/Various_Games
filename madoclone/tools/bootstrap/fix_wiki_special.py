#!/usr/bin/env python3
"""apply_wiki_tiers.py の後に流す。wikiの記述で形が変わる5件の直しと、needsReview の整理。1回きり。"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
D = ROOT / "Assets/Game/Data/Json"
sk = json.load(open(D / "skills.json"))
cr = json.load(open(D / "crystals.json"))
by = {x["id"]: x for x in sk["items"]}

def eff(rid, buff, **kw):
    e = {"type": "applyBuff", "buffId": buff}
    e.update(kw)
    return e

# クリティカルシールド（段階なし）
for rid in ("skl_chr_059_n", "skl_chr_073_n"):
    for e in by[rid]["effects"]:
        if e.get("buffId") == "shield":
            e["buffId"] = "crit_shield"; e.pop("tier", None)

# ダメージ反射シールド30%（段階なし。30%は buffs.json 側）
for e in by["skl_chr_059_s"]["effects"]:
    if e.get("buffId") == "shield":
        e["buffId"] = "reflect_shield"; e.pop("tier", None)

# chr_072 必殺：wikiの全文に合わせて作り直す
u = by["skl_chr_072_u"]
dmg = [e for e in u["effects"] if e["type"] == "damage"][0]
u["effects"] = [
    dmg,
    eff("", "crit_shield", target="self", durationSec=[5, 6, 7], when="afterHit"),
    eff("", "regen", tier="supreme", target="self", durationSec=[5, 6, 7], when="afterHit"),
    eff("", "atk_up", tier="supreme", target="self", durationSec=[5, 6, 7], when="afterHit"),
    {"type": "heal", "multiplierPct": 1000, "target": "self", "when": "afterHit"},
    eff("", "atk_up", tier="supreme", target="ally_all", durationSec=3, chancePct=50, when="afterHit"),
    eff("", "crit_shield", target="ally_all", durationSec=3, chancePct=50, when="afterHit"),
]
u["needsReview"] = True  # 「味方ごとに」独立に判定するかが未確認（target に ally_each が無い）

# 痺れが級なしで書かれている1件は、そのまま空欄で残して見直し対象にする
by["skl_chr_003_u"]["needsReview"] = True

# needsReview の整理：理由が「段階」だけだったものを外す
reasons, cur = {}, None
for line in (ROOT / "out/import_report.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"### (\S+?)（", line)
    if m:
        cur = m.group(1); reasons[cur] = []
    elif cur and line.startswith("- "):
        reasons[cur].append(line[2:])
touched = set(json.load(open(ROOT / "out/wiki_tier_apply.json"))["touched"])
RESOLVED = ("段階（最上級など）が書かれていないバフ", "「クリティカルシールド」", "読めなかった部分: 「ダメージ反射」", "バフの対象が書かれていない（自分として取り込んだ）: shield")
cleared = kept = 0
for rec in sk["items"] + cr["items"]:
    if not rec.get("needsReview") or rec["id"] in ("skl_chr_072_u", "skl_chr_003_u"):
        continue
    rest = [r for r in reasons.get(rec["id"], []) if not r.startswith(RESOLVED)]
    # まだ tier が null のバフが残っていれば外さない
    has_null = any(e.get("type") == "applyBuff" and "tier" in e and e["tier"] is None for e in rec["effects"])
    if not rest and not has_null:
        del rec["needsReview"]; cleared += 1
    else:
        kept += 1
(D / "skills.json").write_text(json.dumps(sk, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(D / "crystals.json").write_text(json.dumps(cr, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("needsReview cleared:", cleared, "kept:", kept)
