using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>
    /// サポート1体（使い魔・契約霊・竜）。戦闘中、intervalSec ごとに effects を発動する（ダメージ・回復は味方全員の平均攻撃力が基準）。
    /// unlockTrial の試練を unlockLv までクリアすると仲間になる [仮：契約霊・竜の入手条件は未確認]。
    /// </summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class SupportDef
    {
        public string Id { get; init; }
        public SupportKind Kind { get; init; }
        public double IntervalSec { get; init; }

        /// <summary>★1つにつき、付与する効果の時間が何秒延びるか（使い魔は 1 秒。docs/01 5.1節）。</summary>
        public double StarDurationBonusSec { get; init; }

        /// <summary>
        /// 所持効果：持っているだけで、全キャラの ownedStat（atk・hp・def）が ownedBasePct ＋ ownedPerStarPct × ★ ％ 上がる（docs/01 5.1節：使い魔D SR★3 で HP+200％）。
        /// </summary>
        public string OwnedStat { get; init; }
        public double OwnedBasePct { get; init; }
        public double OwnedPerStarPct { get; init; }

        /// <summary>★ s → s+1 に要る覚醒の欠片 ＝ starCostShards ×（s＋1）。</summary>
        public double StarCostShards { get; init; }

        public string UnlockTrial { get; init; }
        public int UnlockLv { get; init; }
        public IReadOnlyList<EffectDef> Effects { get; init; }
    }

    /// <summary>supports.json。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class SupportsConfig
    {
        public int SchemaVersion { get; init; }
        public IReadOnlyList<SupportDef> Supports { get; init; }

        public bool TryGet(string id, out SupportDef def)
        {
            foreach (SupportDef s in Supports) { if (s.Id == id) { def = s; return true; } }
            def = null;
            return false;
        }
    }
}
