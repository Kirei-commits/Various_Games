using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>rewards.json：敵を倒したときに落ちる素材の量。ExpPerEnemy は Mado.Sim rewards が計算して書く（手で書かない）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class RewardsConfig
    {
        public int SchemaVersion { get; init; }

        /// <summary>ランクごとの経験値の余裕（1.0 ちょうどだと、クリアだけで標準の育ちに届く）。</summary>
        public double PaceSlack { get; init; }

        /// <summary>1ウェーブの敵の数。ボス戦の敵の数。</summary>
        public int EnemiesPerWave { get; init; }
        public int EnemiesPerBoss { get; init; }

        /// <summary>ランク1〜32 の、敵1体を倒したときの経験値。</summary>
        public IReadOnlyList<double> ExpPerEnemy { get; init; }
    }
}
