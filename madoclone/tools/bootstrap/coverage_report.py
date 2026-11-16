#!/usr/bin/env python3
"""カバレッジ（cobertura の XML）を、ファイルごとの行・分岐の割合と、通っていない行の一覧にする。

使い方:
  dotnet test tests/Mado.Core.Tests --collect:"XPlat Code Coverage" --results-directory out/cov
  python3 tools/bootstrap/coverage_report.py out/cov [--lines ファイル名の一部] [--min-line 95] [--min-branch 88]

--min-line・--min-branch を付けると、合計がその値（％）を下回ったとき終了コード1。
"""
import glob
import os
import sys
import xml.etree.ElementTree as ET


def main():
    root_dir = sys.argv[1] if len(sys.argv) > 1 else "out/cov"
    want = sys.argv[sys.argv.index("--lines") + 1] if "--lines" in sys.argv else None
    files = sorted(glob.glob(os.path.join(root_dir, "**", "coverage.cobertura.xml"), recursive=True), key=os.path.getmtime)
    if not files:
        print("coverage.cobertura.xml が無い: " + root_dir)
        return 1
    tree = ET.parse(files[-1])
    per = {}
    for cls in tree.iter("class"):
        name = cls.get("filename").replace("\\", "/")
        name = name[name.index("Assets/Game/") + len("Assets/Game/"):] if "Assets/Game/" in name else name
        d = per.setdefault(name, {"lines": {}, "br": {}})
        for line in cls.iter("line"):
            n = int(line.get("number"))
            d["lines"][n] = max(d["lines"].get(n, 0), int(line.get("hits")))
            cc = line.get("condition-coverage")
            if cc:
                got, total = cc[cc.index("(") + 1:-1].split("/")
                prev = d["br"].get(n, (0, int(total)))
                d["br"][n] = (max(prev[0], int(got)), int(total))
    tl = tc = tb = tbc = 0
    rows = []
    for name, d in per.items():
        l, c = len(d["lines"]), sum(1 for h in d["lines"].values() if h > 0)
        b, bc = sum(t for _, t in d["br"].values()), sum(g for g, _ in d["br"].values())
        tl, tc, tb, tbc = tl + l, tc + c, tb + b, tbc + bc
        rows.append((c / l if l else 1, name, l, c, b, bc, d))
    for ratio, name, l, c, b, bc, d in sorted(rows):
        print("%5.1f%%  分岐 %5.1f%%  %s" % (100 * ratio, 100 * bc / b if b else 100, name))
        if want and want in name:
            miss = sorted(n for n, h in d["lines"].items() if h == 0)
            part = sorted(n for n, (g, t) in d["br"].items() if g < t and d["lines"][n] > 0)
            print("        通っていない行: " + ", ".join(map(str, miss)))
            print("        片側しか通っていない分岐: " + ", ".join(map(str, part)))
    line_pct, branch_pct = 100 * tc / tl, 100 * tbc / tb
    print("合計: 行 %.1f%%（%d/%d）  分岐 %.1f%%（%d/%d）" % (line_pct, tc, tl, branch_pct, tbc, tb))
    failed = False
    for flag, actual, label in (("--min-line", line_pct, "行"), ("--min-branch", branch_pct, "分岐")):
        if flag in sys.argv:
            floor = float(sys.argv[sys.argv.index(flag) + 1])
            if actual < floor:
                print("エラー: %sのカバレッジ %.1f%% が下限 %.1f%% を下回った" % (label, actual, floor))
                failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
