using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Metrics;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>ショップ・交換所・ルーレット・実績。</summary>
    public class EconomyTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 17UL);
            public Wallet.Wallet Wallet;
            public MetricCounter Metrics;
            public ShopService Shop; public RouletteService Roulette; public AchievementService Achievements;
            public bool Dev;

            public Env()
            {
                Wallet = new Wallet.Wallet(Data.Currencies, new WalletState(), () => Dev);
                Metrics = new MetricCounter(Save);
                Shop = new ShopService(Data, Wallet); Roulette = new RouletteService(Data, Save, Wallet);
                Achievements = new AchievementService(Data, Save, Wallet, Metrics);
            }

            public void Give(string c, double v) { Wallet.Grant(new Reward(c, v), new GrantReason("t")); }
        }

        // ---------------- ショップ ----------------

        [Test]
        public void Shop_BuysByCount_AllOrNothing_WithNoPurchaseLimit()
        {
            var e = new Env();
            e.Give("gem", 100000);
            Assert.AreEqual(ShopFailure.None, e.Shop.Buy("gem_ticket", 1));
            Assert.AreEqual(1, e.Wallet.Balance("gacha_ticket"));
            Assert.AreEqual(99700, e.Wallet.Balance("gem"));
            Assert.AreEqual(ShopFailure.None, e.Shop.Buy("gem_ticket", 300));              // 回数の制限は無い
            Assert.AreEqual(301, e.Wallet.Balance("gacha_ticket"));
            Assert.AreEqual(99700 - 300 * 300, e.Wallet.Balance("gem"));
            Assert.AreEqual(ShopFailure.None, e.Shop.Buy("gem_roulette", 2));
            Assert.AreEqual(10, e.Wallet.Balance("roulette_coin"));                        // 5 × 2
        }

        [Test]
        public void Shop_RejectsUnknownItemsBadCounts_AndShortfalls_WithoutChangingAnything()
        {
            var e = new Env();
            e.Give("gem", 299);
            Assert.AreEqual(ShopFailure.UnknownItem, e.Shop.Buy("nope", 1));
            Assert.AreEqual(ShopFailure.InvalidCount, e.Shop.Buy("gem_ticket", 0));
            Assert.AreEqual(ShopFailure.NotEnough, e.Shop.Buy("gem_ticket", 1));
            Assert.AreEqual(299, e.Wallet.Balance("gem"));
            Assert.AreEqual(0, e.Wallet.Balance("gacha_ticket"));
        }

        [Test]
        public void Exchange_UsesItsOwnCurrencies_AndEveryItemIsReachable()
        {
            var e = new Env();
            e.Give("tournament_point", 500);
            Assert.AreEqual(ShopFailure.None, e.Shop.Buy("tp_ticket", 1));
            Assert.AreEqual(10, e.Wallet.Balance("gacha_ticket"));
            Assert.IsTrue(Data.Economy.Shop.Any(s => s.Tab == "exchange") && Data.Economy.Shop.Any(s => s.Tab == "item"));
            foreach (ShopItemDef item in Data.Economy.Shop)                                 // どの商品も、費用の通貨を持っていれば買える
            {
                var f = new Env();
                foreach (MoneyDef c in item.Cost) { f.Give(c.CurrencyId, c.Amount); }
                Assert.AreEqual(ShopFailure.None, f.Shop.Buy(item.Id, 1), item.Id);
            }
        }

        // ---------------- ルーレット ----------------

        [Test]
        public void Roulette_PaysTheCoin_AndTheRewardsMatchTheHits()
        {
            var e = new Env();
            e.Give("roulette_coin", 100);
            Assert.AreEqual(RouletteFailure.None, e.Roulette.Spin(50, out RouletteResult r));
            Assert.AreEqual(50, r.Hits.Count);
            Assert.AreEqual(50, e.Wallet.Balance("roulette_coin"));
            double gem = 0;
            foreach (int hit in r.Hits) { foreach (MoneyDef m in Data.Economy.Roulette.Entries[hit].Reward) { if (m.CurrencyId == "gem") { gem += m.Amount; } } }
            Assert.AreEqual(gem, e.Wallet.Balance("gem"), 1e-6);
        }

        [Test]
        public void Roulette_FollowsTheWeights_AndIsDeterministic()
        {
            var e = new Env { Dev = true };
            e.Roulette.Spin(20000, out RouletteResult r);
            double total = Data.Economy.Roulette.Entries.Sum(x => x.Weight);
            for (int i = 0; i < Data.Economy.Roulette.Entries.Count; i++)
            {
                double expected = 100.0 * Data.Economy.Roulette.Entries[i].Weight / total;
                Assert.AreEqual(expected, 100.0 * r.Hits.Count(h => h == i) / r.Hits.Count, Math.Max(1.0, expected * 0.15), "当たり" + i);
            }
            var a = new Env { Dev = true }; var b = new Env { Dev = true };
            a.Roulette.Spin(100, out RouletteResult ra); b.Roulette.Spin(100, out RouletteResult rb);
            CollectionAssert.AreEqual(ra.Hits, rb.Hits);
        }

        [Test]
        public void Roulette_RejectsBadCounts_AndShortCoins_WithoutChangingAnything()
        {
            var e = new Env();
            uint[] rng = (uint[])e.Save.Rng.Gacha.Clone();
            Assert.AreEqual(RouletteFailure.InvalidCount, e.Roulette.Spin(0, out _));
            Assert.AreEqual(RouletteFailure.NotEnough, e.Roulette.Spin(1, out RouletteResult r));
            Assert.IsEmpty(r.Hits);
            CollectionAssert.AreEqual(rng, e.Save.Rng.Gacha);
        }

        // ---------------- 実績 ----------------

        [Test]
        public void Achievements_PayOncePerTier_WhenTheMetricReachesTheTarget()
        {
            var e = new Env();
            AchievementDef pulls = Data.Economy.Achievements.First(a => a.Id == "pulls");
            Assert.AreEqual(AchievementFailure.NothingToClaim, e.Achievements.Claim("pulls", out _));
            e.Metrics.Add("gacha.pulls", 9);
            Assert.AreEqual(0, e.Achievements.Claimable(pulls));
            e.Metrics.Add("gacha.pulls", 1);                                                  // 10回：1段目
            Assert.AreEqual(1, e.Achievements.Claimable(pulls));
            Assert.AreEqual(AchievementFailure.None, e.Achievements.Claim("pulls", out int n));
            Assert.AreEqual(1, n);
            Assert.AreEqual(30, e.Wallet.Balance("gem"));
            Assert.AreEqual(AchievementFailure.NothingToClaim, e.Achievements.Claim("pulls", out _));   // 二重取りしない
            e.Metrics.Add("gacha.pulls", 5000);                                                // 一気に3段目まで
            Assert.AreEqual(3, e.Achievements.Reached(pulls));
            Assert.AreEqual(2, e.Achievements.Claimable(pulls));
            Assert.AreEqual(AchievementFailure.None, e.Achievements.Claim("pulls", out n));
            Assert.AreEqual(2, n);
            Assert.AreEqual(30 + 100 + 300, e.Wallet.Balance("gem"));
            Assert.AreEqual(3, e.Achievements.Claimed("pulls"));
            Assert.AreEqual(AchievementFailure.UnknownAchievement, e.Achievements.Claim("nope", out _));
            Assert.AreEqual(5010, e.Achievements.Progress(pulls));
        }

        [Test]
        public void ClaimAll_TakesEveryReadyTier()
        {
            var e = new Env();
            e.Metrics.Add("battle.enemies_defeated", 300);          // 50・200 の2段
            e.Metrics.Add("growth.awakenings", 1);                   // 1段
            Assert.AreEqual(3, e.Achievements.ClaimAll());
            Assert.AreEqual(30 + 60 + 50, e.Wallet.Balance("gem"));
            Assert.AreEqual(0, e.Achievements.ClaimAll());
        }

        [Test]
        public void SpendingAchievements_SeeWalletSpendsThroughTheMetricCounter()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 3UL);
            s.Debug.GrantCurrency("gem", 5000);
            s.DrainEvents();
            Assert.IsTrue(s.BuyShopItem("gem_ticket", 4).Success);                   // ジェム 1,200 を使う
            Assert.AreEqual(1200, s.State.Metric("spent.gem"));
            var (value, reached, claimed) = s.State.AchievementOf("gem_spent");
            Assert.AreEqual(1200, value);
            Assert.AreEqual(1, reached);
            Assert.AreEqual(0, claimed);
            Assert.IsTrue(s.ClaimAchievement("gem_spent", out int tiers).Success);
            Assert.AreEqual(1, tiers);
            Assert.AreEqual(5000 - 1200 + 50, s.State.Balance("gem"));
            Assert.AreEqual(1, s.State.AchievementOf("gem_spent").Claimed);
            Assert.AreEqual("NothingToClaim", s.ClaimAchievement("gem_spent", out _).Failure);
            Assert.AreEqual("NothingToClaim", s.ClaimAllAchievements(out _).Failure);
            Assert.AreEqual((0.0, 0, 0), s.State.AchievementOf("nope"));
        }

        // ---------------- セーブ・GameSession ----------------

        [Test]
        public void Save_RoundTrips_IsValidated_AndRepaired()
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            s.Achievements.Claimed["pulls"] = 2;
            s.Achievements.Claimed["ghost"] = 1;
            byte[] bytes = SaveCodec.Serialize(s);
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(2, r.Save.Achievements.Claimed["pulls"]);
            Assert.IsTrue(r.Issues.Any(i => i.Code == "ACHIEVEMENT_UNKNOWN"));
            CollectionAssert.AreEqual(bytes, SaveCodec.Serialize(r.Save));
            s.Achievements.Claimed["pulls"] = 99;
            Assert.IsTrue(SaveValidator.Validate(s, Data).Any(i => i.Code == "ACHIEVEMENT_TIER" && i.Severity == SaveSeverity.Error));
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(4, s.Achievements.Claimed["pulls"]);
            Assert.IsEmpty(SaveValidator.Validate(s, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());
            string bad = System.Text.Encoding.UTF8.GetString(bytes).Replace("\"pulls\":2", "\"pulls\":\"x\"");
            Assert.IsFalse(SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(bad), Data).Success);
        }

        [Test]
        public void Session_ShopAndRoulette_EmitEvents_AndReportFailures()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 3UL);
            Assert.AreEqual("NotEnough", s.BuyShopItem("gem_ticket", 1).Failure);
            Assert.AreEqual("UnknownItem", s.BuyShopItem("nope", 1).Failure);
            Assert.AreEqual("NotEnough", s.SpinRoulette(1, out _).Failure);
            s.Debug.GrantCurrency("gem", 1000);
            s.DrainEvents();
            Assert.IsTrue(s.BuyShopItem("gem_roulette", 2).Success);
            Assert.IsTrue(s.SpinRoulette(5, out RouletteResult r).Success);
            Assert.AreEqual(5, r.Hits.Count);
            IReadOnlyList<GameEvent> evs = s.DrainEvents();
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.ShopBought && x.Id == "gem_roulette" && x.Amount == 2));
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.RouletteSpun && x.Amount == 5));
            Assert.AreEqual(5, s.State.Balance("roulette_coin"));
        }
    }
}
