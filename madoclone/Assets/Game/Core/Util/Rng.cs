using System;

namespace Mado.Core.Util
{
    /// <summary>乱数の流れの種類。用途ごとに別の流れにして、一方を使っても他方の結果がずれないようにする。</summary>
    public enum RngStream
    {
        Battle = 1,
        Gacha = 2,
        Misc = 3,
    }

    /// <summary>
    /// 自前のシード付き乱数（xoshiro128**）。System.Random はランタイムで結果が違うので使わない（docs/02 5.5節）。
    /// 計算は整数だけ。参照実装：tools/bootstrap/rng_reference.py（期待値は Tests/Core/RngVectors.g.cs）。
    /// アルゴリズムを変えるときは、Rng.cs と参照実装を同時に直す。
    /// </summary>
    public sealed class Rng
    {
        private uint _s0, _s1, _s2, _s3;

        /// <summary>種から作る。同じ種なら同じ列になる。</summary>
        public Rng(ulong seed)
        {
            unchecked
            {
                var sm = new SplitMix64(seed);
                ulong a = sm.Next();
                ulong b = sm.Next();
                _s0 = (uint)a;
                _s1 = (uint)(a >> 32);
                _s2 = (uint)b;
                _s3 = (uint)(b >> 32);
                if ((_s0 | _s1 | _s2 | _s3) == 0u)
                {
                    _s0 = 1u; // 全部0だと止まってしまう
                }
            }
        }

        /// <summary>用途（戦闘・ガチャ・その他）ごとの流れを、1つのシードから作る。</summary>
        public static Rng Create(ulong seed, RngStream stream)
        {
            unchecked
            {
                var sm = new SplitMix64(seed + (ulong)(int)stream * 0xD1B54A32D192ED03UL);
                return new Rng(sm.Next());
            }
        }

        /// <summary>内部状態（uint 4つ）を取り出す。セーブ用。</summary>
        public uint[] GetState()
        {
            return new[] { _s0, _s1, _s2, _s3 };
        }

        /// <summary>GetState の値から続きの列を再現する。</summary>
        public static Rng FromState(uint[] state)
        {
            if (state == null || state.Length != 4)
            {
                throw new ArgumentException("状態は uint 4つ");
            }
            if ((state[0] | state[1] | state[2] | state[3]) == 0u)
            {
                throw new ArgumentException("状態が全部0だと列が止まる");
            }
            var r = new Rng(0UL);
            r._s0 = state[0];
            r._s1 = state[1];
            r._s2 = state[2];
            r._s3 = state[3];
            return r;
        }

        /// <summary>0 以上 uint.MaxValue 以下の整数。</summary>
        public uint NextUInt()
        {
            unchecked
            {
                uint result = RotL(_s1 * 5u, 7) * 9u;
                uint t = _s1 << 9;
                _s2 ^= _s0;
                _s3 ^= _s1;
                _s1 ^= _s2;
                _s0 ^= _s3;
                _s2 ^= t;
                _s3 = RotL(_s3, 11);
                return result;
            }
        }

        /// <summary>0 以上 maxExclusive 未満の整数。偏りが出ないよう、はみ出す部分は捨てて引き直す。</summary>
        public int NextInt(int maxExclusive)
        {
            if (maxExclusive <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(maxExclusive), "1 以上にする");
            }
            uint n = (uint)maxExclusive;
            uint threshold = (uint)((0x100000000UL - n) % n);
            while (true)
            {
                uint r = NextUInt();
                if (r >= threshold)
                {
                    return (int)(r % n);
                }
            }
        }

        /// <summary>minInclusive 以上 maxExclusive 未満の整数。</summary>
        public int NextInt(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive)
            {
                throw new ArgumentOutOfRangeException(nameof(maxExclusive), "min より大きくする");
            }
            long span = (long)maxExclusive - minInclusive;
            if (span > int.MaxValue)
            {
                throw new ArgumentOutOfRangeException(nameof(maxExclusive), "幅が int に入らない");
            }
            return (int)(minInclusive + (long)NextInt((int)span));
        }

        /// <summary>0 以上 1 未満（2^-24 刻み）。1回だけ引く。</summary>
        public double NextDouble()
        {
            return (NextUInt() >> 8) * (1.0 / 16777216.0);
        }

        /// <summary>
        /// percent（0〜100）の確率で true。確率が 0 でも 100 でも必ず1回引く
        /// （確率の値で引く回数が変わると、あとの乱数の列がずれるため）。
        /// </summary>
        public bool Chance(double percent)
        {
            return NextDouble() * 100.0 < percent;
        }

        private static uint RotL(uint x, int k)
        {
            return (x << k) | (x >> (32 - k));
        }
    }
}
