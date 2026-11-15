#!/usr/bin/env python3
"""いま needsReview が付いているスキル・魔晶の一覧を out/review_report.md に出す。理由は取り込み時の out/import_report.md から引く。"""
import json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
D = ROOT / "Assets/Game/Data/Json"
recs = {x["id"]: x for f in ("skills.json", "crystals.json") for x in json.load(open(D / f))["items"]}
open_ids = [i for i, x in recs.items() if x.get("needsReview")]
reasons, orig, cur = {}, {}, None
for line in (ROOT / "out/import_report.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"### (\S+?)（", line)
    if m:
        cur = m.group(1); reasons[cur] = []
    elif cur and line.startswith("元の行:"):
        orig[cur] = line[4:].strip(" `")
    elif cur and line.startswith("- "):
        reasons[cur].append(line[2:])
RES = ("段階（最上級など）が書かれていないバフ", "「クリティカルシールド」", "読めなかった部分: 「ダメージ反射」")
out = ["# 確認が要る一覧", "", "needsReview が残っているもの: %d 件" % len(open_ids), ""]
for i in sorted(open_ids):
    out += ["### " + i, ""]
    if i in orig: out += ["元の行: `%s`" % orig[i], ""]
    rs = [r for r in reasons.get(i, []) if not r.startswith(RES)]
    out += ["- " + r for r in rs] or ["- （理由は docs/03 5節）"]
    out.append("")
(ROOT / "out/review_report.md").write_text("\n".join(out), encoding="utf-8")
print("out/review_report.md:", len(open_ids), "件")
