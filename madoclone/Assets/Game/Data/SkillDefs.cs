using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>「対象が次の状態のどれかになっている」という条件（skills.json の if）。</summary>
    public sealed class StatusIf
    {
        /// <summary>buffs.json の ID。どれか1つでも付いていれば満たす。</summary>
        [JsonProperty(Required = Required.Always)]
        public IReadOnlyList<string> TargetHasAnyStatus { get; init; }
    }

    /// <summary>スキルが発動するきっかけと、その条件。</summary>
    public sealed class TriggerDef
    {
        [JsonProperty(Required = Required.Always)]
        public TriggerType Type { get; init; }

        /// <summary>interval：何秒ごとか。</summary>
        public double? EverySec { get; init; }

        /// <summary>cooldown など：クールタイム（秒）。</summary>
        public double? CooldownSec { get; init; }

        /// <summary>発動する確率（％）。省略は 100。</summary>
        public double? ChancePct { get; init; }

        /// <summary>onHpBelow：HP の割合（％）。</summary>
        public double? Pct { get; init; }

        /// <summary>1戦闘に1回だけ。</summary>
        public bool Once { get; init; }

        public StatusIf If { get; init; }
    }

    /// <summary>
    /// 効果1つ。1つの型に全項目を持ち、使わない項目は null（または false）。
    /// type ごとにどの項目を使うかは docs/04 9.3節、意味は docs/02 4.3節。
    /// </summary>
    public sealed class EffectDef
    {
        [JsonProperty(Required = Required.Always)]
        public EffectType Type { get; init; }

        public TargetType? Target { get; init; }

        /// <summary>ally_element の対象の属性。</summary>
        public Element? Element { get; init; }

        public Ranked<double> MultiplierPct { get; init; }

        public Ranked<double> BonusSelfLostHpPct { get; init; }

        /// <summary>メインのヒットとは別の追加ダメージ（if の条件つき）。</summary>
        public bool Bonus { get; init; }

        public string BuffId { get; init; }

        /// <summary>段階。1つなら全ランク同じ、3つならランクで変わる。null は「段階なし」。</summary>
        public Ranked<TierLevel?> Tier { get; init; }

        public Ranked<double> DurationSec { get; init; }

        public double? ChancePct { get; init; }

        public EffectWhen? When { get; init; }

        public StatusIf If { get; init; }

        /// <summary>gaugeShift：必殺ゲージの増減（秒）。elementCountBonus の秒の単位もここ。</summary>
        public Ranked<double> Sec { get; init; }

        public double? Pct { get; init; }

        /// <summary>人数補正の上限。</summary>
        public double? Max { get; init; }

        public CountUnit? Unit { get; init; }

        public CountScope? Scope { get; init; }

        /// <summary>この効果が出るランクの下限（0〜2）。</summary>
        public int? MinRank { get; init; }

        /// <summary>onHit／onCrit のとき、このきっかけで追加する効果。</summary>
        public TriggerType? OnTrigger { get; init; }

        public Ranked<Element[]> TargetElements { get; init; }
    }

    /// <summary>スキルと魔晶に共通の部分（発動のきっかけ＋効果の並び）。</summary>
    public abstract class SkillDefBase
    {
        [JsonProperty(Required = Required.Always)]
        public string Id { get; init; }

        [JsonProperty(Required = Required.Always)]
        public TriggerDef Trigger { get; init; }

        [JsonProperty(Required = Required.Always)]
        public IReadOnlyList<EffectDef> Effects { get; init; }
    }

    /// <summary>通常・特殊・必殺スキル（skills.json）。</summary>
    public sealed class SkillDef : SkillDefBase
    {
        [JsonProperty(Required = Required.Always)]
        public SkillKind Kind { get; init; }
    }

    /// <summary>魔晶（crystals.json）。スキルと同じ trigger・effects を持ち、ランクは持たない（常に0）。</summary>
    public sealed class CrystalDef : SkillDefBase
    {
        /// <summary>常に "crystal"（DataValidator が確かめる）。</summary>
        [JsonProperty(Required = Required.Always)]
        public string Kind { get; init; }

        /// <summary>専用の魔晶の持ち主（characters.json の id）。</summary>
        [JsonProperty(Required = Required.Always)]
        public string OwnerId { get; init; }

        /// <summary>見た目だけの区別。どの魔晶もどの枠にも付く（docs/01 4.4節）。</summary>
        [JsonProperty(Required = Required.Always)]
        public CrystalSlot Slot { get; init; }
    }
}
