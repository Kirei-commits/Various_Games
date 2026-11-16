using System;
using Mado.Core.Save;
using Mado.Core.Wallet;

namespace Mado.Core.Metrics
{
    /// <summary>
    /// 「◯◯を累計N回」の数え上げを1か所に持つ（docs/02 3.1節）。実績・パス・レース・図鑑は、これを読むだけにする。
    /// 数えた値は SaveData.Metrics（キー → 累計）に入り、セーブされる。
    /// </summary>
    public sealed class MetricCounter
    {
        private readonly SaveData _save;

        /// <summary>数えたとき（キー、増えた量、いまの累計）。実績などが購読する。</summary>
        public event Action<string, double, double> Changed;

        public MetricCounter(SaveData save)
        {
            _save = save ?? throw new ArgumentNullException(nameof(save));
        }

        public double Get(string key)
        {
            return _save.Metrics.TryGetValue(key ?? "", out double v) ? v : 0;
        }

        public void Add(string key, double amount = 1)
        {
            if (string.IsNullOrEmpty(key)) { throw new ArgumentException("キーが空"); }
            if (double.IsNaN(amount) || double.IsInfinity(amount) || amount < 0) { throw new ArgumentException("増やす量が不正: " + amount); }
            if (amount == 0) { return; }
            double total = Get(key) + amount;
            _save.Metrics[key] = total;
            Changed?.Invoke(key, amount, total);
        }

        /// <summary>Wallet のイベントを数える（"spent.通貨"、"earned.通貨"）。開発者モードの支払いも、実績の数えは通常どおり進む。</summary>
        public void Observe(System.Collections.Generic.IReadOnlyList<WalletEvent> events)
        {
            foreach (WalletEvent e in events)
            {
                Add((e.Kind == WalletEventKind.Spent ? Keys.SpentPrefix : Keys.EarnedPrefix) + e.CurrencyId, e.Amount);
            }
        }

        /// <summary>数えるキーの名前。ここに足していく。</summary>
        public static class Keys
        {
            public const string SpentPrefix = "spent.";
            public const string EarnedPrefix = "earned.";
            public const string EnemiesDefeated = "battle.enemies_defeated";
            public const string BattlesWon = "battle.won";
            public const string LevelUps = "growth.level_ups";
            public const string Awakenings = "growth.awakenings";
        }
    }
}
