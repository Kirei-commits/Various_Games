using System;
using System.Collections.Generic;
using Mado.Core.Metrics;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Progress
{
    public enum ShopFailure { None, UnknownItem, InvalidCount, NotEnough }

    /// <summary>ショップ・交換所（docs/01 7.8節）：商品を count 個ぶん買う（払うのは全部か無しか。購入回数の制限は無い）。</summary>
    public sealed class ShopService
    {
        private readonly GameData _data;
        private readonly Wallet.Wallet _wallet;

        public ShopService(GameData data, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        public ShopFailure Buy(string itemId, int count)
        {
            if (!_data.Economy.TryShopItem(itemId, out ShopItemDef item)) { return ShopFailure.UnknownItem; }
            if (count < 1) { return ShopFailure.InvalidCount; }
            PayResult pay = _wallet.Pay(new Cost(Scale(item.Cost, count)), new PayReason(WalletReasons.ShopBuy));
            if (!pay.Success) { return ShopFailure.NotEnough; }
            _wallet.Grant(new Reward(Scale(item.Reward, count)), new GrantReason(WalletReasons.ShopBuy));
            return ShopFailure.None;
        }

        internal static List<Money> Scale(IReadOnlyList<MoneyDef> list, int count)
        {
            var result = new List<Money>();
            foreach (MoneyDef m in list) { result.Add(new Money(m.CurrencyId, m.Amount * count)); }
            return result;
        }
    }

    public enum RouletteFailure { None, InvalidCount, NotEnough }

    public sealed class RouletteResult
    {
        /// <summary>当たった報酬（1回ごと）。entries の番号。</summary>
        public List<int> Hits { get; } = new List<int>();
    }

    /// <summary>ルーレット：ルーレットコインを払い、重みに従って報酬が当たる。乱数はセーブの Gacha ストリーム。</summary>
    public sealed class RouletteService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public RouletteService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        public RouletteFailure Spin(int count, out RouletteResult result)
        {
            result = new RouletteResult();
            if (count < 1) { return RouletteFailure.InvalidCount; }
            RouletteDef def = _data.Economy.Roulette;
            PayResult pay = _wallet.Pay(new Cost(def.CurrencyId, def.CostPerSpin * count), new PayReason(WalletReasons.RouletteSpin));
            if (!pay.Success) { return RouletteFailure.NotEnough; }
            Rng rng = Rng.FromState(_save.Rng.Gacha);
            double total = 0;
            foreach (RouletteEntry e in def.Entries) { total += e.Weight; }
            var rewards = new List<Money>();
            for (int i = 0; i < count; i++)
            {
                double roll = rng.NextDouble() * total, acc = 0;
                int hit = def.Entries.Count - 1;
                for (int k = 0; k < def.Entries.Count; k++) { acc += def.Entries[k].Weight; if (roll < acc) { hit = k; break; } }
                result.Hits.Add(hit);
                rewards.AddRange(ShopService.Scale(def.Entries[hit].Reward, 1));
            }
            _save.Rng.Gacha = rng.GetState();
            _wallet.Grant(new Reward(rewards), new GrantReason(WalletReasons.RouletteWin));
            return RouletteFailure.None;
        }
    }

    public enum AchievementFailure { None, UnknownAchievement, NothingToClaim }

    /// <summary>実績：MetricCounter の値が各段の目標に達したら、報酬を段ごとに1回だけ受け取れる。</summary>
    public sealed class AchievementService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;
        private readonly MetricCounter _metrics;

        public AchievementService(GameData data, SaveData save, Wallet.Wallet wallet, MetricCounter metrics)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
            _metrics = metrics ?? throw new ArgumentNullException(nameof(metrics));
        }

        public int Claimed(string id) { return _save.Achievements.Claimed.TryGetValue(id ?? "", out int v) ? v : 0; }

        public double Progress(AchievementDef a) { return _metrics.Get(a.Metric); }

        /// <summary>目標に達している段の数（受け取り済みを含む）。</summary>
        public int Reached(AchievementDef a)
        {
            double v = Progress(a);
            int n = 0;
            foreach (AchievementTier t in a.Tiers) { if (v >= t.Target) { n++; } }
            return n;
        }

        public int Claimable(AchievementDef a) { return Math.Max(0, Reached(a) - Claimed(a.Id)); }

        /// <summary>1つの実績の、受け取れる段を全部受け取る（受け取った段の数を returned に）。</summary>
        public AchievementFailure Claim(string id, out int claimedTiers)
        {
            claimedTiers = 0;
            if (!_data.Economy.TryAchievement(id, out AchievementDef a)) { return AchievementFailure.UnknownAchievement; }
            int ready = Claimable(a);
            if (ready == 0) { return AchievementFailure.NothingToClaim; }
            int from = Claimed(id);
            var rewards = new List<Money>();
            for (int i = from; i < from + ready; i++) { rewards.AddRange(ShopService.Scale(a.Tiers[i].Reward, 1)); }
            _wallet.Grant(new Reward(rewards), new GrantReason(WalletReasons.AchievementReward));
            _save.Achievements.Claimed[id] = from + ready;
            claimedTiers = ready;
            return AchievementFailure.None;
        }

        /// <summary>受け取れるものを全部受け取る。</summary>
        public int ClaimAll()
        {
            int total = 0;
            foreach (AchievementDef a in _data.Economy.Achievements)
            {
                if (Claim(a.Id, out int n) == AchievementFailure.None) { total += n; }
            }
            return total;
        }
    }
}
