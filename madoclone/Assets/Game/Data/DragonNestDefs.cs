using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>ツリーの段1つ。kind が pct なら atk・hp・def の％、sub なら副ステータス（1Lvあたり ＝ subPerLv × perLv）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class DragonTierDef
    {
        public string Id { get; init; }
        public string Kind { get; init; }
        public IReadOnlyList<string> Stats { get; init; }
        public double PerLv { get; init; }

        /// <summary>節目の大ノード：Lv1 でこの値、以降は perLv ずつ（省略は perLv ずつ）。</summary>
        [JsonProperty(Required = Required.Default)]
        public double? FirstLv { get; init; }
        public int MaxLv { get; init; }

        /// <summary>Lv L → L+1 の費用（竜の炎）＝（costBase ＋ costStep × L）×（blockMultiplier ^ (ブロック−1)）。</summary>
        public double CostBase { get; init; }
        public double CostStep { get; init; }
    }

    /// <summary>
    /// dragon_nest.json：竜の巣の特殊能力ツリー（docs/01 5.3節）。属性ごとに同じ形のツリーを持つ。
    /// 1ブロック＝段1〜4＋大ノード。ブロックが進むごとに上昇量とコストを blockMultiplier 倍にする。
    /// 「1つ前の段のノードが全て unlockLv 以上」で次の段が解放される（最初の段は常に）。
    /// </summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class DragonNestConfig
    {
        public int SchemaVersion { get; init; }
        public int Blocks { get; init; }
        public double BlockMultiplier { get; init; }
        public int UnlockLv { get; init; }
        public IReadOnlyDictionary<string, double> SubPerLv { get; init; }
        public IReadOnlyList<DragonTierDef> Tiers { get; init; }
    }
}
