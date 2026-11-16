using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>霊石版のレア1段階（青＜紫＜黄＜橙＜赤＜ピンク）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class StoneRarityDef
    {
        public string Id { get; init; }

        /// <summary>メイン効果の1Lvあたりの％（実測：赤 +50、ピンク +100）。</summary>
        public double MainPerLv { get; init; }

        /// <summary>隠し能力の1段あたりの値（率系のポイント）。</summary>
        public double SubBase { get; init; }

        /// <summary>星霊王の稽古でのドロップ率（％。実測、合計100）。</summary>
        public double DropPct { get; init; }

        /// <summary>分解で得る星の砂の基準（× (Lv＋1)）。</summary>
        public double SandBase { get; init; }
    }

    /// <summary>隠し能力：霊石版のLv が appearLv に着くと現れ、以降 1Lv ごとに subBase だけ伸びる。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class StoneSubDef
    {
        public string Stat { get; init; }
        public int AppearLv { get; init; }
    }

    /// <summary>星座のセット効果：同じページに同じ星座を2枚／4枚はめると、setStat が set2／set4（4枚のときは set4 だけ）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class ConstellationDef
    {
        public string Id { get; init; }
        public string SetStat { get; init; }
        public double Set2 { get; init; }
        public double Set4 { get; init; }
    }

    /// <summary>spirit_stones.json：霊界の特殊能力（霊石版。docs/01 5.2節）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class SpiritStonesConfig
    {
        public int SchemaVersion { get; init; }
        public int MaxStones { get; init; }
        public int MaxLv { get; init; }
        public int Pages { get; init; }

        /// <summary>円盤の枠ごとのメイン効果の対象（1・6番＝攻撃、2・5番＝HP、3・4番＝防御）。長さ＝1ページの枠数。</summary>
        public IReadOnlyList<string> SlotMainStat { get; init; }

        /// <summary>Lv L → L+1 の星の砂 ＝ levelCostBase ×（レアの順番＋1）× L。</summary>
        public double LevelCostBase { get; init; }

        /// <summary>LevelCostGrowthFromLv 以上の Lv では、1Lv ごとに費用がこの倍率ずつ増える（終盤の星の砂の使い道）。</summary>
        public int LevelCostGrowthFromLv { get; init; }
        public double LevelCostGrowth { get; init; }

        /// <summary>星霊王の稽古の報酬1回で出る枚数（実測：24）。</summary>
        public int DropsPerClear { get; init; }

        public IReadOnlyList<StoneRarityDef> Rarities { get; init; }
        public IReadOnlyList<StoneSubDef> SubOrder { get; init; }
        public IReadOnlyList<ConstellationDef> Constellations { get; init; }
    }
}
