using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TrialReward
    {
        public string CurrencyId { get; init; }

        /// <summary>試練Lv 1 あたりの量（報酬 ＝ これ × クリアしたLv。実測：docs/01 5.4節）。</summary>
        public double Amount { get; init; }
    }

    /// <summary>繰り返せる収入の歯止め（docs/02 4.6節）。chargePerDay は1日に貯まる回数、cap は貯められる上限（省略＝上限なし）。</summary>
    public sealed class GateDef
    {
        [JsonProperty(Required = Required.Always)]
        public double ChargePerDay { get; init; }
        public double? Cap { get; init; }
    }

    /// <summary>試練1つ。敵の強さは「powerBase × powerGrowth^(Lv−1)」を合計戦力として、statRank のボス戦の組み立て（副ステータス・倍率）で作る [仮]。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TrialDef
    {
        public string Id { get; init; }
        public double TimeLimitSec { get; init; }

        /// <summary>連戦の数（バトルラッシュは3）。全部に勝つとクリア。制限時間は連戦の合計で、1戦あたり timeLimitSec ÷ fights。</summary>
        public int Fights { get; init; }
        public int LevelOnClear { get; init; }
        public IReadOnlyList<TrialReward> RewardPerLv { get; init; }

        [JsonProperty(Required = Required.Default)]
        public GateDef Gate { get; init; }

        public int StatRank { get; init; }
        public double PowerBase { get; init; }
        public double PowerGrowth { get; init; }

        /// <summary>ボス本体に付ける特徴（enemy_kits.json の traits の id）。</summary>
        public IReadOnlyList<string> Traits { get; init; }

        /// <summary>報酬を受け取るたびに、霊石版が spirit_stones.json の dropsPerClear 枚ドロップする（星霊王の稽古）。</summary>
        public bool DropsStones { get; init; }
    }

    /// <summary>trials.json。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TrialsConfig
    {
        public int SchemaVersion { get; init; }
        public IReadOnlyList<TrialDef> Trials { get; init; }

        public bool TryGet(string id, out TrialDef trial)
        {
            foreach (TrialDef t in Trials) { if (t.Id == id) { trial = t; return true; } }
            trial = null;
            return false;
        }
    }
}
