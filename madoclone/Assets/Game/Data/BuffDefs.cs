using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>バフが変える能力値1つ。op が pct なら掛ける割合（％）、pt なら％ポイントを足す。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class StatMod
    {
        public StatKey Stat { get; init; }
        public StatOp Op { get; init; }
        public double Value { get; init; }
    }

    /// <summary>バフの1段階ぶんの中身（最上級・上級…。段階を持たないバフは "none" の1つ）。</summary>
    public sealed class BuffTierDef
    {
        private static readonly IReadOnlyList<StatMod> NoMods = new StatMod[0];
        private static readonly IReadOnlyList<string> NoStrings = new string[0];

        private IReadOnlyList<StatMod> _statMods;
        private IReadOnlyList<string> _immuneTo;

        public IReadOnlyList<StatMod> StatMods
        {
            get { return _statMods ?? NoMods; }
            init { _statMods = value; }
        }

        /// <summary>仮の値（要確認）。</summary>
        public bool Provisional { get; init; }

        /// <summary>継続ダメージ：攻撃力に対する割合（％）。10刻みごとに1回、防御を無視して与える。</summary>
        public double? DotAtkPct { get; init; }

        /// <summary>持続回復：攻撃力に対する割合（％）。</summary>
        public double? HotAtkPct { get; init; }

        /// <summary>シールド：最大HPに対する割合（％）。</summary>
        public double? ShieldMaxHpPct { get; init; }

        public bool CannotAct { get; init; }
        public bool UltimateGaugeStopped { get; init; }
        public bool ForceTargetCaster { get; init; }
        public bool HealBlocked { get; init; }
        public bool DamageImmune { get; init; }
        public bool CritDamageImmune { get; init; }

        /// <summary>この状態にならなくなる buffs.json の ID。</summary>
        public IReadOnlyList<string> ImmuneTo
        {
            get { return _immuneTo ?? NoStrings; }
            init { _immuneTo = value; }
        }

        /// <summary>反射するダメージの割合（％）。</summary>
        public double? ReflectPct { get; init; }
    }

    /// <summary>バフ・状態異常の1種類（buffs.json の1件）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class BuffDef
    {
        public const string NoTierKey = "none";

        public string Id { get; init; }
        public BuffCategory Category { get; init; }
        public BuffPolarity Polarity { get; init; }

        /// <summary>キーは supreme／high／mid／low、または none（段階を持たない）。</summary>
        public IReadOnlyDictionary<string, BuffTierDef> Tiers { get; init; }

        /// <summary>段階を持たない（"none" だけ）バフか。</summary>
        [JsonIgnore]
        public bool IsTierless
        {
            get { return Tiers != null && Tiers.ContainsKey(NoTierKey); }
        }

        /// <summary>段階の中身。tier が null なら "none"。無ければ null。</summary>
        public BuffTierDef FindTier(TierLevel? tier)
        {
            string key = tier.HasValue ? EnumStringConverter.Text(tier.Value) : NoTierKey;
            BuffTierDef def;
            return Tiers != null && Tiers.TryGetValue(key, out def) ? def : null;
        }
    }

    /// <summary>同じバフが重なったときの決まり（文字列で書いてあり、戦闘が固定の規則として実装する）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class StackRuleDef
    {
        public string SameId { get; init; }
        public string SameTier { get; init; }
        public string LowerTier { get; init; }
        public string DifferentId { get; init; }
    }

    /// <summary>buffs.json のルート。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class BuffTable
    {
        public int SchemaVersion { get; init; }
        public StackRuleDef StackRule { get; init; }
        public IReadOnlyList<BuffDef> Items { get; init; }
    }
}
