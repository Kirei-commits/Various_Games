// 自動生成：tools/bootstrap/rng_reference.py（手で直さない）。
// Mado.Core.Util.Rng と同じ計算を Python で動かした結果。アルゴリズムを変えたら、Rng.cs と一緒に作り直す。
namespace Mado.Core.Tests
{
    public static class RngVectors
    {
        public static readonly ulong[] SplitMixSeeds = { 0x0000000000000000UL, 0x0000000000000001UL, 0x000000000000002AUL, 0xFFFFFFFFFFFFFFFFUL, 0x123456789ABCDEF0UL };
        public static readonly ulong[][] SplitMixOutputs =
        {
            new ulong[] { 0xE220A8397B1DCDAFUL, 0x6E789E6AA1B965F4UL, 0x06C45D188009454FUL, 0xF88BB8A8724C81ECUL, 0x1B39896A51A8749BUL, 0x53CB9F0C747EA2EAUL },
            new ulong[] { 0x910A2DEC89025CC1UL, 0xBEEB8DA1658EEC67UL, 0xF893A2EEFB32555EUL, 0x71C18690EE42C90BUL, 0x71BB54D8D101B5B9UL, 0xC34D0BFF90150280UL },
            new ulong[] { 0xBDD732262FEB6E95UL, 0x28EFE333B266F103UL, 0x47526757130F9F52UL, 0x581CE1FF0E4AE394UL, 0x09BC585A244823F2UL, 0xDE4431FA3C80DB06UL },
            new ulong[] { 0xE4D971771B652C20UL, 0xE99FF867DBF682C9UL, 0x382FF84CB27281E9UL, 0x6D1DB36CCBA982D2UL, 0xB4A0472E578069AEUL, 0xD31DADBDA438BB33UL },
            new ulong[] { 0x161922C645CE50E8UL, 0xAD760CAFA1697B60UL, 0x3501FF44902CA50DUL, 0x417CB9A826D831DFUL, 0x99AF6F9B0C4476B6UL, 0x5D51F5F75B762C59UL },
        };

        public static readonly ulong[] NextUIntSeeds = { 0x0000000000000000UL, 0x0000000000000001UL, 0x000000000000002AUL, 0xFFFFFFFFFFFFFFFFUL };
        public static readonly uint[][] NextUIntOutputs =
        {
            new uint[] { 0xDEC9045DU, 0x9A089D75U, 0xAB77D362U, 0xC3E16405U, 0x5C95A8DAU, 0x60DEA056U, 0xC25A5140U, 0xA4290614U },
            new uint[] { 0x650941BAU, 0x54D30301U, 0x25D2F321U, 0x3FABDCA9U, 0x2AB8E0A6U, 0xF9890067U, 0xE12B0AD9U, 0xA193D86AU },
            new uint[] { 0x69E85A2AU, 0xF843FAD0U, 0x0105185FU, 0x8A1F1EA6U, 0xA66BE2A9U, 0x9844904EU, 0xAF4213E7U, 0x85C95CD7U },
            new uint[] { 0x1C78F79CU, 0x94A7662AU, 0x211F3EA0U, 0x243A6BA3U, 0x03A7FD33U, 0x11F80560U, 0x93BAAF24U, 0x98F02A6AU },
        };

        public const ulong NextInt6Seed = 0x0000000000003039UL;
        public static readonly int[] NextInt6 = { 5, 0, 2, 2, 4, 4, 5, 1, 0, 4, 3, 2 };
        public const ulong NextInt1000Seed = 0x0000000000000007UL;
        public static readonly int[] NextInt1000 = { 769, 924, 842, 540, 966, 551, 478, 494 };
        public const ulong NextIntRangeSeed = 0x0000000000000063UL;  // NextInt(-3, 4)
        public static readonly int[] NextIntRange = { 0, -3, 1, -3, -2, -3, 3, 2 };
        public const ulong NextDoubleSeed = 0x0000000000000005UL;  // NextDouble() * 16777216 がこの整数になる
        public static readonly int[] NextDoubleNumerators = { 13152402, 2009677, 12096265, 154781, 11485183, 1119467 };
        public const ulong ChanceSeed = 0x00000000000007EAUL;  // Rng.Create(seed, RngStream.Battle) で Chance(30) を24回
        public static readonly bool[] Chance30 = { false, true, false, false, true, false, false, true, false, true, false, false, false, false, false, false, false, false, true, false, false, false, true, true };

        public static readonly ulong[] StreamSeeds = { 0x0000000000000001UL, 0x0000000000000001UL, 0x0000000000000001UL, 0x00000000000007EAUL, 0x00000000000007EAUL, 0x00000000000007EAUL };
        public static readonly int[] StreamIds = { 1, 2, 3, 1, 2, 3 };
        public static readonly uint[][] StreamOutputs =
        {
            new uint[] { 0xD4D18B2CU, 0x1B8B4A8BU, 0x23915BA9U, 0x868D3750U },
            new uint[] { 0x1A0F2DB1U, 0x546BB81DU, 0xA3FA62CAU, 0xF17ADCEDU },
            new uint[] { 0x071D2F30U, 0x83B5B214U, 0x054DCE27U, 0xC43C2958U },
            new uint[] { 0x5CD87DFDU, 0x23E5E525U, 0xB7092356U, 0xD4B53655U },
            new uint[] { 0x9FA0EC6FU, 0x9F671055U, 0x185BB262U, 0x17A0BD87U },
            new uint[] { 0x2DF8338EU, 0x3621017DU, 0x20ABB2AAU, 0xEABC66E4U },
        };

        public const ulong CountsSeed = 0x0000000000000001UL;  // NextInt(6) を 60000 回引いた各目の回数
        public const int CountsDraws = 60000;
        public static readonly int[] Counts6 = { 10087, 9936, 9915, 9995, 10055, 10012 };
    }
}
