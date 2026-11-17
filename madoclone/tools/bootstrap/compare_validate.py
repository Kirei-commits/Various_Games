#!/usr/bin/env python3
"""validate（Python 版）と Mado.Sim validate（C# 版）が、同じデータで同じ合否になるかを確かめる（docs/04 4節）。

正しいデータと、1か所ずつ壊したデータ（一時フォルダに作る）の両方を、2つの検証に通す。
合否（終了コード）が食い違ったら失敗。C# 版を check.sh の正にするのは、これが緑のあと。
dotnet が無ければ何もせず成功で終わる。
"""
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "Assets", "Game", "Data", "Json")
SIM = os.path.join(ROOT, "tools", "Mado.Sim")


def load(d, name):
    with open(os.path.join(d, name), encoding="utf-8") as f:
        return json.load(f)


def save(d, name, obj):
    with open(os.path.join(d, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def m_unknown_field(d):
    c = load(d, "characters.json")
    c["items"][0]["bogus"] = 1
    save(d, "characters.json", c)


def m_unknown_buff(d):
    s = load(d, "skills.json")
    for sk in s["items"]:
        for e in sk["effects"]:
            if e.get("buffId"):
                e["buffId"] = "no_such_buff"
                save(d, "skills.json", s)
                return


def m_duplicate_character(d):
    c = load(d, "characters.json")
    c["items"][1]["id"] = c["items"][0]["id"]
    save(d, "characters.json", c)


def m_bad_enum(d):
    s = load(d, "skills.json")
    s["items"][0]["trigger"]["type"] = "whenever"
    save(d, "skills.json", s)


def m_missing_skill(d):
    c = load(d, "characters.json")
    c["items"][0]["skills"]["normal"] = "skl_nope"
    save(d, "characters.json", c)


def m_crystal_owner(d):
    c = load(d, "crystals.json")
    c["items"][0]["ownerId"] = "chr_nope"
    save(d, "crystals.json", c)


MUTATIONS = [m_unknown_field, m_unknown_buff, m_duplicate_character, m_bad_enum, m_missing_skill, m_crystal_owner]


def py(d):
    env = dict(os.environ, MADO_DATA_DIR=d)
    return subprocess.run([sys.executable, os.path.join(ROOT, "tools", "bootstrap", "validate.py")], env=env,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT).returncode


def cs(d):
    return subprocess.run(["dotnet", "run", "--no-build", "--project", SIM, "--", "validate", "--data", d],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT).returncode


def main():
    if shutil.which("dotnet") is None:
        print("compare_validate: dotnet が無いので飛ばした")
        return 0
    subprocess.run(["dotnet", "build", SIM, "-v", "q", "-nologo"], stdout=subprocess.DEVNULL, check=True)
    bad = 0
    cases = [("正しいデータ", None)] + [(m.__name__, m) for m in MUTATIONS]
    for name, mut in cases:
        tmp = tempfile.mkdtemp(prefix="mado_validate_")
        try:
            d = os.path.join(tmp, "Json")
            shutil.copytree(DATA, d)
            if mut:
                mut(d)
            a, b = py(d), cs(d)
            want = 0 if mut is None else 1
            ok = a == b == want
            print("%s %-24s python=%d  c#=%d（期待 %d）" % ("✓" if ok else "✗", name, a, b, want))
            bad += 0 if ok else 1
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    print("compare_validate: 食い違い %d" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
