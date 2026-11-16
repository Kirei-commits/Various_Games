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

        /// <summary>放置報酬：たまる上限の時間（docs/01 第8章の置き換え一覧で 24 時間。実測は 8 時間）。</summary>
        public double IdleCapHours { get; init; }

        /// <summary>放置中、1分に敵を何体ぶん倒したことにするか。経験値は 敵1体の経験値 × この数 ×（分）。</summary>
        public double IdleKillsPerMinute { get; init; }

        /// <summary>放置のコインは、放置の経験値のこの割合（実測：コイン 4,600万 ／ 経験値 4.6 億）。</summary>
        public double IdleCoinPerExp { get; init; }

        /// <summary>放置で毎時たまる絆ハート（実測：毎時 380）。</summary>
        public double IdleBondHeartPerHour { get; init; }

        /// <summary>放置で毎分たまるワイン（docs/01 7.5節：制作Lv50相当の約62,000本／日）。</summary>
        public double IdleWinePerMinute { get; init; }

        /// <summary>ランク1〜32 の、敵1体を倒したときの経験値。</summary>
        public IReadOnlyList<double> ExpPerEnemy { get; init; }
    }
}
