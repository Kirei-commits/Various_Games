using System.Collections.Generic;
using System.Runtime.Serialization;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>記憶カードの種類。メイン効果が決まる（docs/01 7.2節）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum MemoryKind
    {
        [EnumMember(Value = "hp")] Hp,
        [EnumMember(Value = "atk")] Atk,
        [EnumMember(Value = "def")] Def,
        [EnumMember(Value = "speed")] Speed,
    }

    /// <summary>固定値を基礎ステータスの単位に直す係数（実測は全体強化込みの単位。決めたことは docs/decisions/2026-11-16_記憶カードと放置報酬の数値の検証.md）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class FixedUnitScale
    {
        public double Hp { get; init; }
        public double Atk { get; init; }
        public double Def { get; init; }
    }

    /// <summary>サブ効果の1種類。値の幅は、レアが UR・カードLv＋3 が subRefLv のときの実測。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class MemorySubEffectDef
    {
        public SubstatKey Stat { get; init; }
        public double Min { get; init; }
        public double Max { get; init; }
    }

    /// <summary>レアリティ1つ分の係数。％ ＝ 係数 ×（カードLv＋levelOffset）。固定値 ＝ fixed係数 ×（カードLv＋levelOffset）² × 単位換算。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class MemoryRarityDef
    {
        public string Id { get; init; }

        /// <summary>メイン％の係数。引いたときに [Min, Max] から一様に決まる（UR+ は実測で 5.0〜5.5）。</summary>
        public double MainCoefMin { get; init; }
        public double MainCoefMax { get; init; }

        /// <summary>スピードカードの攻撃スピード％の係数。</summary>
        public double SpeedCoef { get; init; }

        /// <summary>スピードカードの HP・攻撃・防御％の係数（3つそれぞれ [Min, Max] から決まる）。</summary>
        public double SpeedStatCoefMin { get; init; }
        public double SpeedStatCoefMax { get; init; }

        /// <summary>サブ効果の倍率（UR ＝ 1.0）。</summary>
        public double SubScale { get; init; }

        public double FixedHp { get; init; }
        public double FixedAtk { get; init; }
        public double FixedDef { get; init; }
    }

    /// <summary>絆ガチャLv が minLv 以上のときの排出率（％）。weights はレアリティの並びと同じ順で、合計 100。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class GachaBand
    {
        public int MinLv { get; init; }
        public IReadOnlyList<double> Weights { get; init; }
    }

    /// <summary>memory_cards.json：記憶カード（docs/01 7.2節）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class MemoryCardsConfig
    {
        public int SchemaVersion { get; init; }

        /// <summary>カードLv・絆ガチャLv の上限（実測：絆ガチャの最大Lv 140）。</summary>
        public int MaxCardLv { get; init; }
        public int LevelOffset { get; init; }
        public int SubRefLv { get; init; }

        /// <summary>1回引くのに要る絆ハート。</summary>
        public double PullCostBondHeart { get; init; }

        /// <summary>絆ガチャLv を lv → lv+1 に上げる費用（コイン）＝ Base × Growth^(lv−1)。</summary>
        public double GachaLvCostBase { get; init; }
        public double GachaLvCostGrowth { get; init; }

        /// <summary>カードの売値（コイン）＝ SellCoinBase ×（レアの順番＋1）× カードLv。</summary>
        public double SellCoinBase { get; init; }

        public FixedUnitScale FixedUnitScale { get; init; }
        public IReadOnlyList<MemorySubEffectDef> SubEffects { get; init; }

        /// <summary>弱いほうから強いほうへの並び。</summary>
        public IReadOnlyList<MemoryRarityDef> Rarities { get; init; }
        public IReadOnlyList<GachaBand> GachaBands { get; init; }
    }
}
