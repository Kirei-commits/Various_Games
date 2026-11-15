#!/usr/bin/env python3
"""Mado.Core.Util.Rng の参照実装（Python）。C# の期待値をここで作る。

サンドボックスに .NET が無いので、乱数の計算を先に Python で動かして確かめ、
その結果を Assets/Game/Tests/Core/RngVectors.g.cs に書き出す。C# の RngTests はこの値と一致することを確かめる。
アルゴリズムを変えたら、このファイルと Rng.cs を同時に直して、もう一度流す（docs/02 5.5節）。

  python3 tools/bootstrap/rng_reference.py          # RngVectors.g.cs を作り直す
  python3 tools/bootstrap/rng_reference.py --check  # 今のファイルと一致するか確かめるだけ（check.sh から呼ぶ）
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "Assets/Game/Tests/Core/RngVectors.g.cs"

M64 = (1 << 64) - 1
M32 = (1 << 32) - 1
STREAM_MIX = 0xD1B54A32D192ED03


class SplitMix64:
    def __init__(self, seed):
        self.s = seed & M64

    def next(self):
        self.s = (self.s + 0x9E3779B97F4A7C15) & M64
        z = self.s
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M64
        return z ^ (z >> 31)


def rotl32(x, k):
    return ((x << k) | (x >> (32 - k))) & M32


class Rng:
    """xoshiro128**。種は SplitMix64 から取る。"""

    def __init__(self, seed):
        sm = SplitMix64(seed)
        a = sm.next()
        b = sm.next()
        self.s = [a & M32, a >> 32, b & M32, b >> 32]
        if not any(self.s):
            self.s[0] = 1

    @staticmethod
    def create(seed, stream):
        # 用途（戦闘・ガチャ・その他）ごとに別の流れにする
        mixed = SplitMix64((seed + stream * STREAM_MIX) & M64).next()
        return Rng(mixed)

    def next_uint(self):
        s = self.s
        result = (rotl32((s[1] * 5) & M32, 7) * 9) & M32
        t = (s[1] << 9) & M32
        s[2] ^= s[0]
        s[3] ^= s[1]
        s[1] ^= s[2]
        s[0] ^= s[3]
        s[2] ^= t
        s[3] = rotl32(s[3], 11)
        return result

    def next_int(self, n):
        """0 以上 n 未満。偏りが出ないよう、はみ出す部分を捨てて引き直す。"""
        assert 1 <= n <= 0x7FFFFFFF
        threshold = ((1 << 32) - n) % n
        while True:
            r = self.next_uint()
            if r >= threshold:
                return r % n

    def next_int_range(self, lo, hi):
        return lo + self.next_int(hi - lo)

    def next_double_numerator(self):
        """NextDouble() = これ / 2^24。0 以上 1 未満。"""
        return self.next_uint() >> 8

    def chance(self, percent):
        """percent は 0〜100。確率が何であっても、必ず1回だけ引く。"""
        return self.next_double_numerator() * 100 / 16777216 < percent


# ---- 期待値 ----------------------------------------------------------------

SM_SEEDS = [0, 1, 42, M64, 0x123456789ABCDEF0]
RNG_SEEDS = [0, 1, 42, M64]


def vectors():
    v = {}
    rows = []
    for s in SM_SEEDS:
        sm = SplitMix64(s)
        rows.append((s, [sm.next() for _ in range(6)]))
    v["SplitMix64"] = rows
    outs = []
    for s in RNG_SEEDS:
        r = Rng(s)
        outs.append((s, [r.next_uint() for _ in range(8)]))
    v["NextUInt"] = outs
    r = Rng(12345)
    v["NextInt6"] = (12345, [r.next_int(6) for _ in range(12)])
    r = Rng(7)
    v["NextInt1000"] = (7, [r.next_int(1000) for _ in range(8)])
    r = Rng(99)
    v["NextIntRange"] = (99, [r.next_int_range(-3, 4) for _ in range(8)])
    r = Rng(5)
    v["NextDoubleNumerator"] = (5, [r.next_double_numerator() for _ in range(6)])
    r = Rng.create(2026, 1)
    v["Chance30"] = (2026, 1, [1 if r.chance(30) else 0 for _ in range(24)])
    streams = []
    for seed in (1, 2026):
        for st in (1, 2, 3):
            r = Rng.create(seed, st)
            streams.append((seed, st, [r.next_uint() for _ in range(4)]))
    v["Streams"] = streams
    r = Rng(1)
    counts = [0] * 6
    for _ in range(60000):
        counts[r.next_int(6)] += 1
    v["Counts6"] = (1, 60000, counts)
    return v


def ul(x):
    return "0x%016XUL" % x


def ui(x):
    return "0x%08XU" % x


def render(v):
    L = []
    w = L.append
    w("// 自動生成：tools/bootstrap/rng_reference.py（手で直さない）。")
    w("// Mado.Core.Util.Rng と同じ計算を Python で動かした結果。アルゴリズムを変えたら、Rng.cs と一緒に作り直す。")
    w("namespace Mado.Core.Tests")
    w("{")
    w("    public static class RngVectors")
    w("    {")
    w("        public static readonly ulong[] SplitMixSeeds = { %s };" % ", ".join(ul(s) for s, _ in v["SplitMix64"]))
    w("        public static readonly ulong[][] SplitMixOutputs =")
    w("        {")
    for _, outs in v["SplitMix64"]:
        w("            new ulong[] { %s }," % ", ".join(ul(x) for x in outs))
    w("        };")
    w("")
    w("        public static readonly ulong[] NextUIntSeeds = { %s };" % ", ".join(ul(s) for s, _ in v["NextUInt"]))
    w("        public static readonly uint[][] NextUIntOutputs =")
    w("        {")
    for _, outs in v["NextUInt"]:
        w("            new uint[] { %s }," % ", ".join(ui(x) for x in outs))
    w("        };")
    w("")
    s, a = v["NextInt6"]
    w("        public const ulong NextInt6Seed = %s;" % ul(s))
    w("        public static readonly int[] NextInt6 = { %s };" % ", ".join(map(str, a)))
    s, a = v["NextInt1000"]
    w("        public const ulong NextInt1000Seed = %s;" % ul(s))
    w("        public static readonly int[] NextInt1000 = { %s };" % ", ".join(map(str, a)))
    s, a = v["NextIntRange"]
    w("        public const ulong NextIntRangeSeed = %s;  // NextInt(-3, 4)" % ul(s))
    w("        public static readonly int[] NextIntRange = { %s };" % ", ".join(map(str, a)))
    s, a = v["NextDoubleNumerator"]
    w("        public const ulong NextDoubleSeed = %s;  // NextDouble() * 16777216 がこの整数になる" % ul(s))
    w("        public static readonly int[] NextDoubleNumerators = { %s };" % ", ".join(map(str, a)))
    s, st, a = v["Chance30"]
    w("        public const ulong ChanceSeed = %s;  // Rng.Create(seed, RngStream.Battle) で Chance(30) を24回" % ul(s))
    w("        public static readonly bool[] Chance30 = { %s };" % ", ".join("true" if x else "false" for x in a))
    w("")
    w("        public static readonly ulong[] StreamSeeds = { %s };" % ", ".join(ul(s) for s, _, _ in v["Streams"]))
    w("        public static readonly int[] StreamIds = { %s };" % ", ".join(str(st) for _, st, _ in v["Streams"]))
    w("        public static readonly uint[][] StreamOutputs =")
    w("        {")
    for _, _, outs in v["Streams"]:
        w("            new uint[] { %s }," % ", ".join(ui(x) for x in outs))
    w("        };")
    w("")
    s, n, c = v["Counts6"]
    w("        public const ulong CountsSeed = %s;  // NextInt(6) を %d 回引いた各目の回数" % (ul(s), n))
    w("        public const int CountsDraws = %d;" % n)
    w("        public static readonly int[] Counts6 = { %s };" % ", ".join(map(str, c)))
    w("    }")
    w("}")
    return "\n".join(L) + "\n"


def main():
    # 既知の値で参照実装そのものを確かめる（SplitMix64 の公開されている出力）
    assert SplitMix64(0).next() == 0xE220A8397B1DCDAF, "SplitMix64(0) の最初の出力が公開値と違う"
    text = render(vectors())
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print("rng_reference: RngVectors.g.cs が参照実装と食い違う。python3 tools/bootstrap/rng_reference.py で作り直す")
            sys.exit(1)
        print("rng_reference: 期待値は参照実装と一致")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print("書き出した:", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
