using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>敵専用のスキル（skills.json のスキルと同じ trigger・effects。ランクは持たない）。</summary>
    public sealed class EnemySkillDef : SkillDefBase { }

    /// <summary>
    /// ボスの特徴1つ（docs/01 6.1節の表）。skills の他に、ステータスの補正（加算の％ポイントと倍率）と、属性への耐性を持てる。
    /// 使わない項目は省略（0／null）。
    /// </summary>
    public sealed class BossTraitDef
    {
        [JsonProperty(Required = Required.Always)]
        public string Id { get; init; }

        public IReadOnlyList<string> Skills { get; init; }

        public double AccuracyPt { get; init; }
        public double EvasionPt { get; init; }
        public double CritRatePt { get; init; }

        /// <summary>クリティカルダメージ・攻撃力への倍率（省略は 1.0）。</summary>
        public double? CritDamageMultiplier { get; init; }
        public double? AtkMultiplier { get; init; }

        /// <summary>この属性の攻撃から受けるダメージを resistMultiplier 倍にする。</summary>
        public Element? ResistElement { get; init; }
        public double? ResistMultiplier { get; init; }
    }

    /// <summary>fromRank〜toRank のボスが持つ特徴（trait の ID）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class BossPlanRow
    {
        public int FromRank { get; init; }
        public int ToRank { get; init; }
        public IReadOnlyList<string> Traits { get; init; }
    }

    /// <summary>enemy_kits.json：敵の専用スキルとボスの特徴（docs/01 6.1〜6.3節）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class EnemyKitsConfig
    {
        public int SchemaVersion { get; init; }
        public IReadOnlyList<EnemySkillDef> Skills { get; init; }

        /// <summary>型（attacker／tank／healer／disrupt）ごとの専用スキルの ID。</summary>
        public IReadOnlyDictionary<string, IReadOnlyList<string>> RoleSkills { get; init; }

        public IReadOnlyList<BossTraitDef> Traits { get; init; }
        public IReadOnlyList<BossPlanRow> BossPlan { get; init; }

        /// <summary>最終ボス（ランク32の 10-10）だけが追加で持つ特徴。</summary>
        public IReadOnlyList<string> FinalBossTraits { get; init; }
    }
}
