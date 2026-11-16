using System;
using System.Globalization;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Progress
{
    /// <summary>受け取れる放置報酬の見積もり。</summary>
    public readonly struct IdleReport
    {
        /// <summary>数えた時間（上限で切った後）。</summary>
        public readonly TimeSpan Elapsed;

        /// <summary>上限（idleCapHours）で切った。</summary>
        public readonly bool Capped;

        /// <summary>時計が戻っていた（最後の受け取りより前の時刻）。報酬は 0 で、受け取りの基準時刻も動かさない。</summary>
        public readonly bool ClockWentBack;

        public readonly double Exp, Coin, BondHeart, Wine;

        public IdleReport(TimeSpan elapsed, bool capped, bool clockWentBack, double exp, double coin, double bondHeart, double wine = 0)
        {
            Elapsed = elapsed; Capped = capped; ClockWentBack = clockWentBack; Exp = exp; Coin = coin; BondHeart = bondHeart; Wine = wine;
        }

        public bool IsEmpty { get { return !(Exp > 0) && !(Coin > 0) && !(BondHeart > 0) && !(Wine > 0); } }
    }

    /// <summary>
    /// 放置報酬（docs/01 7.9節・第8章）。最後に受け取った時刻から、上限（rewards.json の idleCapHours）までの時間ぶんがたまる。
    /// 経験値＝ ランクの敵1体の経験値 × 1分あたりの撃破数 ×（分）。コインは経験値の一定割合、絆ハートは毎時一定。
    /// 時刻は IClock から（Core は時計を直接読まない）。時計を戻して稼ぐことはできない（戻っている間は 0、基準時刻も動かさない）。
    /// </summary>
    public sealed class IdleService
    {
        /// <summary>これより短い時間では受け取れない（受け取っても基準時刻を動かさない＝端数を捨てない）。</summary>
        public static readonly TimeSpan MinClaim = TimeSpan.FromMinutes(1);

        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;
        private readonly IClock _clock;
        private readonly RewardCalculator _rewards;

        public IdleService(GameData data, SaveData save, Wallet.Wallet wallet, IClock clock)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
            _rewards = new RewardCalculator(data);
        }

        public TimeSpan Cap { get { return TimeSpan.FromHours(_data.Rewards.IdleCapHours); } }

        /// <summary>数え始める（まだ基準時刻が無い、または壊れているとき、いまを基準にする）。何度呼んでもよい。</summary>
        public void EnsureStarted()
        {
            if (!TryReadLast(out _)) { _save.Idle.LastClaimUtc = Format(_clock.UtcNow); }
        }

        /// <summary>いま受け取るといくらか（何も変えない）。</summary>
        public IdleReport Pending()
        {
            if (!TryReadLast(out DateTime last)) { return new IdleReport(TimeSpan.Zero, false, false, 0, 0, 0); }
            TimeSpan elapsed = _clock.UtcNow - last;
            if (elapsed < TimeSpan.Zero) { return new IdleReport(TimeSpan.Zero, false, true, 0, 0, 0); }
            bool capped = elapsed > Cap;
            if (capped) { elapsed = Cap; }

            RewardsConfig r = _data.Rewards;
            double minutes = elapsed.TotalMinutes;
            double exp = _rewards.ExpPerEnemy(_save.Progress.Rank) * r.IdleKillsPerMinute * minutes;
            return new IdleReport(elapsed, capped, false, exp, exp * r.IdleCoinPerExp, r.IdleBondHeartPerHour * elapsed.TotalHours, r.IdleWinePerMinute * minutes);
        }

        /// <summary>受け取る。受け取れた報酬を返す（1分未満・時計が戻っているときは空で、基準時刻も動かさない）。</summary>
        public IdleReport Claim()
        {
            EnsureStarted();
            IdleReport report = Pending();
            if (report.ClockWentBack || report.Elapsed < MinClaim) { return new IdleReport(TimeSpan.Zero, false, report.ClockWentBack, 0, 0, 0); }

            var items = new System.Collections.Generic.List<Money>
            {
                new Money(CurrencyIds.Exp, report.Exp),
                new Money(CurrencyIds.Coin, report.Coin),
                new Money(CurrencyIds.BondHeart, report.BondHeart),
                new Money(CurrencyIds.Wine, report.Wine),
            };
            _wallet.Grant(new Reward(items), new GrantReason(WalletReasons.IdleClaim));
            _save.Idle.LastClaimUtc = Format(_clock.UtcNow);
            return report;
        }

        private bool TryReadLast(out DateTime last)
        {
            return DateTime.TryParse(_save.Idle.LastClaimUtc, CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out last)
                && !string.IsNullOrEmpty(_save.Idle.LastClaimUtc);
        }

        private static string Format(DateTime utc)
        {
            return utc.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
        }
    }
}
