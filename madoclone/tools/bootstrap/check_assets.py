#!/usr/bin/env python3
"""
絵・音の台帳（ledger/assets.json）の検査（docs/02 第8節）。
- すべての項目に id・type・path・origin・license がある。free なら source と author も。ID は重複しない。
- placeholder 以外は、path のファイルが実在する。
- Data が参照する絵の ID（characters.json の assetIds、currencies.json の assetId）が、台帳にある。
- View の AssetLibrary の規則（art.a.b → Resources/MadoArt/a/b.png、audio.a.b → Resources/MadoAudio/a/b.wav）と path が一致する。
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "Assets", "Game", "Data", "Json")
errors = []


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def expected_path(aid):
    if aid.startswith("art."):
        return "Assets/Game/View/Resources/MadoArt/" + aid[4:].replace(".", "/") + ".png"
    if aid.startswith("audio."):
        return "Assets/Game/View/Resources/MadoAudio/" + aid[6:].replace(".", "/") + ".wav"
    return None


def main():
    ledger = load(os.path.join(ROOT, "ledger", "assets.json"))["assets"]
    ids = set()
    for e in ledger:
        aid = e.get("id", "?")
        for k in ("id", "type", "path", "origin", "license"):
            if not e.get(k):
                errors.append("台帳 %s：%s が無い" % (aid, k))
        if aid in ids:
            errors.append("台帳の ID が重複: " + aid)
        ids.add(aid)
        if e.get("origin") == "free" and (not e.get("source") or not e.get("author")):
            errors.append("台帳 %s：free には source と author が要る" % aid)
        if e.get("origin") not in ("placeholder", "self", "free"):
            errors.append("台帳 %s：origin は placeholder／self／free" % aid)
        if e.get("origin") != "placeholder" and not os.path.exists(os.path.join(ROOT, e.get("path", ""))):
            errors.append("台帳 %s：ファイルが無い %s" % (aid, e.get("path")))
        exp = expected_path(aid)
        if exp and e.get("path") != exp:
            errors.append("台帳 %s：path が AssetLibrary の規則と違う（期待 %s）" % (aid, exp))
    for c in load(os.path.join(DATA, "characters.json"))["items"]:
        for kind, aid in c["assetIds"].items():
            if aid not in ids:
                errors.append("%s の %s（%s）が台帳に無い" % (c["id"], kind, aid))
    for cur in load(os.path.join(DATA, "currencies.json"))["items"]:
        if cur["assetId"] not in ids:
            errors.append("通貨 %s の assetId（%s）が台帳に無い" % (cur["id"], cur["assetId"]))
    if errors:
        print("assets: エラー %d 件" % len(errors))
        for e in errors[:30]:
            print("  " + e)
        return 1
    print("assets: 台帳 %d 件、すべて実在・参照も揃っている" % len(ledger))
    return 0


if __name__ == "__main__":
    sys.exit(main())
