#!/usr/bin/env python3
"""Core・Data の C# ソースが、不変条件に反していないかを文字列で調べる（docs/02 6.3節の暫定版）。

dotnet が使える環境では、同じ内容を C# のアーキテクチャテストでも確かめる。ここは「コンパイルしなくても今すぐ分かる」ための関門。
- Core と Data に UnityEngine・System.Random・DateTime.Now が出てこない（コメントは除く）
- 名前空間の依存の向き：Battle は Growth・Progress・Economy・Wallet を参照しない／Stats は Growth を参照しない
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
GAME = ROOT / "Assets/Game"

FORBIDDEN = [
    (r"\bUnityEngine\b", "UnityEngine（Core・Data は Unity を参照しない）"),
    (r"\bUnityEditor\b", "UnityEditor（Core・Data は Unity を参照しない）"),
    (r"\bSystem\.Random\b|\bnew\s+Random\s*\(", "System.Random（自前の Rng を使う）"),
    (r"\bDateTime\.(Now|UtcNow|Today)\b", "DateTime.Now（時刻は IClock から受け取る）"),
]
# Core だけの禁止。init と record は IsExternalInit（Data アセンブリの内部クラス）が要るので、Core では使わない。
CORE_ONLY_FORBIDDEN = [
    (r"\binit\s*[;{]", "init アクセサ（Core では使わない。コンストラクタと読み取り専用で書く。docs/04 1.1節）"),
    (r"\brecord\s+(class|struct)?\s*\w+\s*[({]", "record（Core では使わない。docs/04 1.1節）"),
]
# フォルダ（Core 直下）ごとに、参照してはいけない名前空間
DEPENDENCY_RULES = {
    "Battle": ["Mado.Core.Growth", "Mado.Core.Progress", "Mado.Core.Economy", "Mado.Core.Wallet", "Mado.Core.Session"],
    "Stats": ["Mado.Core.Growth", "Mado.Core.Progress", "Mado.Core.Economy", "Mado.Core.Session"],
    "Util": ["Mado.Core.Battle", "Mado.Core.Stats", "Mado.Core.Growth", "Mado.Core.Progress", "Mado.Core.Economy", "Mado.Core.Wallet", "Mado.Core.Session", "Mado.Core.Save", "Mado.Core.Metrics"],
}


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def main():
    errors = []
    files = [p for sub in ("Core", "Data") for p in (GAME / sub).rglob("*.cs")]
    for path in files:
        code = strip_comments(path.read_text(encoding="utf-8"))
        rel = path.relative_to(ROOT)
        for pattern, label in FORBIDDEN:
            if re.search(pattern, code):
                errors.append("%s: %s が出てくる" % (rel, label))
        parts = path.relative_to(GAME).parts
        if parts[0] == "Core":
            for pattern, label in CORE_ONLY_FORBIDDEN:
                if re.search(pattern, code):
                    errors.append("%s: %s が出てくる" % (rel, label))
        if parts[0] == "Core" and len(parts) > 2 and parts[1] in DEPENDENCY_RULES:
            for ns in DEPENDENCY_RULES[parts[1]]:
                if re.search(r"\b%s\b" % re.escape(ns), code):
                    errors.append("%s: %s は %s を参照できない" % (rel, parts[1], ns))
    for e in errors:
        print("エラー:", e)
    print("check_sources: ソース %d 本、エラー %d" % (len(files), len(errors)))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
