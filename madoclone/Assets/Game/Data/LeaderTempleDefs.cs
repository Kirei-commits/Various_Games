using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>leader_temple.json：リーダー神殿（docs/01 7.1節）。数値は実測（Lv17 で +1,572％・Lv18 で +1,732％・Lv17→18 の経験値 4,419M）と 6.4節の上限（Lv50 で +8,000％）に合わせた [仮]。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class LeaderTempleConfig
    {
        public int SchemaVersion { get; init; }
        public int MaxLv { get; init; }

        /// <summary>リーダーLv 1〜MaxLv の、リーダー本人の攻撃・HP・防御の増加％（長さ MaxLv、Lv1 から並ぶ）。</summary>
        public IReadOnlyList<double> LvPct { get; init; }

        /// <summary>Lv expCostBaseLv → +1 に要る経験値と、1レベルごとの倍率。Lv L → L+1 は Base × Growth^(L − BaseLv)。</summary>
        public double ExpCostBase { get; init; }
        public int ExpCostBaseLv { get; init; }
        public double ExpCostGrowth { get; init; }

        /// <summary>Lv L → L+1 に要る魔力の欠片 ＝ ShardCostPerLv × L。</summary>
        public int ShardCostPerLv { get; init; }

        /// <summary>レベル報酬：RewardMinLv 以上で RewardEveryLv の倍数の Lv に着いたとき、魔力の結晶を RewardCrystalPerLv × Lv だけもらう。</summary>
        public int RewardEveryLv { get; init; }
        public int RewardMinLv { get; init; }
        public int RewardCrystalPerLv { get; init; }
    }
}
