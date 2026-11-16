using System;
using Mado.Core.Battle;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Progress
{
    /// <summary>敵を倒したときに落ちる素材（docs/decisions/2026-11-16_記憶カードと放置報酬の数値の検証.md）。いまは経験値だけ。</summary>
    public sealed class RewardCalculator
    {
        private readonly GameData _data;

        public RewardCalculator(GameData data)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
        }

        /// <summary>ランク rank（1〜）の敵1体の経験値。</summary>
        public double ExpPerEnemy(int rank)
        {
            if (rank < 1 || rank > _data.Rewards.ExpPerEnemy.Count) { throw new ArgumentException("ランクが範囲外: " + rank); }
            return _data.Rewards.ExpPerEnemy[rank - 1];
        }

        /// <summary>1ランクをクリアするまでに倒す敵の数（全ステージを1回ずつ。雑魚ウェーブ＋ボス）。</summary>
        public int KillsPerRankClear
        {
            get
            {
                DifficultyConfig d = _data.Difficulty;
                int perStage = d.WavesPerStage * _data.Rewards.EnemiesPerWave + _data.Rewards.EnemiesPerBoss;
                return d.AreasPerRank * d.StagesPerArea * perStage;
            }
        }

        /// <summary>1回の戦闘のドロップ。倒した敵の数だけ（勝敗によらない）。何も倒していなければ空。</summary>
        public Reward ForBattle(int rank, BattleResult result)
        {
            if (result == null) { throw new ArgumentNullException(nameof(result)); }
            double exp = ExpPerEnemy(rank) * result.EnemiesDefeated;
            double shards = _data.Rewards.AwakenShardPerEnemy * result.EnemiesDefeated;
            return new Reward(new[] { new Money(CurrencyIds.Exp, exp), new Money(CurrencyIds.AwakenShard, shards) });
        }
    }
}
