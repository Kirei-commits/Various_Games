#!/usr/bin/env python3
"""wikiで確認した級（最上級など）を、段階が空のバフに埋める。1回きりの取り込み用。

入力: tools/bootstrap/wiki_tiers_2026-11-15.txt （キャラID|枠:バフID=級,...）
対象: Assets/Game/Data/Json/skills.json と crystals.json の、tier が null のバフ
使い方: python3 tools/bootstrap/apply_wiki_tiers.py [--write]
"""
import json, re, sys, pathlib, collections

ROOT = pathlib.Path(__file__).resolve().parents[2]
D = ROOT / "Assets/Game/Data/Json"
TIER = {"S": "supreme", "H": "high", "M": "mid", "W": "low"}
SLOT_OF = {"n": "n", "s": "s", "u": "u"}

def load_wiki():
    wiki = {}
    for line in (ROOT / "tools/bootstrap/wiki_tiers_2026-11-15.txt").read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        cid = parts[0]
        wiki[cid] = {}
        for p in parts[1:]:
            if p.startswith("NOTE:"):
                continue
            slot, _, body = p.partition(":")
            m = {}
            for kv in filter(None, body.split(",")):
                k, _, v = kv.partition("=")
                m[k] = TIER[v]
            wiki[cid][slot] = m
    return wiki

def slot_and_char(rec):
    rid = rec["id"]
    if rid.startswith("cry_"):
        return rid[len("cry_"):], "L"
    m = re.match(r"skl_(chr_\d+)_([nsu])$", rid)
    return m.group(1), m.group(2)

def effects_of(rec):
    out = []
    def walk(o):
        if isinstance(o, dict):
            if o.get("type") == "applyBuff":
                out.append(o)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(rec)
    return out

def main():
    write = "--write" in sys.argv
    wiki = load_wiki()
    buffs = {b["id"]: b for b in json.load(open(D / "buffs.json"))["items"]}
    filled = 0; unresolved = []; conflicts = []; touched = set(); open_ids = set()
    files = {}
    for name in ("skills.json", "crystals.json"):
        files[name] = json.load(open(D / name))
        for rec in files[name]["items"]:
            cid, slot = slot_and_char(rec)
            m = wiki.get(cid, {}).get(slot)
            for e in effects_of(rec):
                b = buffs.get(e["buffId"])
                if not b or "none" in b["tiers"]:
                    continue
                w = m.get(e["buffId"]) if m is not None else None
                if "tier" in e and e["tier"] is None:
                    if w:
                        e["tier"] = w; filled += 1; touched.add(rec["id"])
                    else:
                        unresolved.append((rec["id"], e["buffId"])); open_ids.add(rec["id"])
                elif w and isinstance(e.get("tier"), str) and e["tier"] != w:
                    conflicts.append((rec["id"], e["buffId"], e["tier"], w))
    print("filled:", filled, "records:", len(touched))
    print("unresolved:", unresolved)
    print("conflicts(既存の級とwikiが違う):", len(conflicts))
    for c in conflicts: print("  ", c)
    if write:
        for name, data in files.items():
            (D / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (ROOT / "out").mkdir(exist_ok=True)
        json.dump({"touched": sorted(touched), "open": sorted(open_ids)}, open(ROOT / "out/wiki_tier_apply.json", "w"), ensure_ascii=False)
        print("written")

main()
