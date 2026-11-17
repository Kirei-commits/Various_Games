using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>カードの売却と自動絆ガチャ。</summary>
    public class AutoGachaTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 21UL);
            public Wallet.Wallet Wallet;
            public MemoryCardService Service;
            public bool Dev;

            public Env(double hearts = 1000)
            {
                var state = new WalletState();
                state.Balances["bond_heart"] = hearts;
                Wallet = new Wallet.Wallet(Data.Currencies, state, () => Dev);
                Service = new MemoryCardService(Data, Save, Wallet);
            }

            public MemoryCardState Add(string id, string rarity, MemoryKind kind, int lv, params SubstatKey[] subs)
            {
                var c = new MemoryCardState
                {
                    Id = id, Rarity = rarity, Kind = kind, Lv = lv, Main = Data.MemoryCards.Rarities.First(r => r.Id == rarity).MainCoefMin,
                    Extra = kind == MemoryKind.Speed ? new[] { 1.0, 1.0, 1.0 } : new double[0],
                    Subs = subs.Select(s => new MemorySubState { Stat = s, Value = 2.5 }).ToList(),
                };
                Save.Memory.Cards.Add(c);
                return c;
            }
        }

        private static AutoGachaSettings Any() { return new AutoGachaSettings(); }

        // ---------------- 売却 ----------------

        [Test]
        public void Sell_PaysByRarityAndLevel_AndRemovesTheCard()
        {
            var e = new Env();
            e.Add("a", "SR", MemoryKind.Hp, 50, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            double expected = Data.MemoryCards.SellCoinBase * (MemoryCardEffects.RarityIndex(Data, "SR") + 1) * 50;
            Assert.AreEqual(MemoryFailure.None, e.Service.Sell("a", out double coin));
            Assert.AreEqual(expected, coin);
            Assert.AreEqual(expected, e.Wallet.Balance("coin"));
            Assert.IsEmpty(e.Save.Memory.Cards);
        }

        [Test]
        public void Sell_RefusesEquippedAndUnknownCards()
        {
            var e = new Env();
            e.Add("a", "SR", MemoryKind.Hp, 50, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            e.Service.Equip("a", 0);
            Assert.AreEqual(MemoryFailure.Equipped, e.Service.Sell("a", out _));
            Assert.AreEqual(MemoryFailure.UnknownCard, e.Service.Sell("zzz", out _));
            Assert.AreEqual(1, e.Save.Memory.Cards.Count);
            Assert.AreEqual(0, e.Wallet.Balance("coin"));
        }

        // ---------------- 判定 ----------------

        [Test]
        public void Matches_ChecksRarityFiltersAndPowerUp()
        {
            var e = new Env();
            MemoryCardState sr = e.Add("a", "SR", MemoryKind.Hp, 50, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            var s = new AutoGachaSettings { MinRarityIndex = MemoryCardEffects.RarityIndex(Data, "SSR") };
            Assert.IsFalse(MemoryCardRules.Matches(Data, e.Save.Memory, sr, s));          // レア不足
            s.MinRarityIndex = MemoryCardEffects.RarityIndex(Data, "SR");
            Assert.IsTrue(MemoryCardRules.Matches(Data, e.Save.Memory, sr, s));
            s.Filter1 = new[] { SubstatKey.EvasionPct };
            Assert.IsTrue(MemoryCardRules.Matches(Data, e.Save.Memory, sr, s));
            s.Filter2 = new[] { SubstatKey.CritDamagePct };                                  // 持っていない
            Assert.IsFalse(MemoryCardRules.Matches(Data, e.Save.Memory, sr, s));
            s.Filter2 = new[] { SubstatKey.CritRatePct, SubstatKey.EvasionPct };            // 2つとも持っている
            Assert.IsTrue(MemoryCardRules.Matches(Data, e.Save.Memory, sr, s));
        }

        [Test]
        public void PowerUp_ComparesWithTheWeakerEquippedCardOfTheSameKind()
        {
            var e = new Env();
            e.Add("strong", "UR", MemoryKind.Hp, 100, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            e.Add("weak", "R", MemoryKind.Hp, 100, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            MemoryCardState cand = e.Add("cand", "SR", MemoryKind.Hp, 100, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            var s = new AutoGachaSettings { RequirePowerUp = true };
            Assert.IsTrue(MemoryCardRules.Matches(Data, e.Save.Memory, cand, s));          // 空き枠があれば強くなる
            e.Service.Equip("strong", 0);
            Assert.IsTrue(MemoryCardRules.Matches(Data, e.Save.Memory, cand, s));          // もう1枠は空き
            e.Service.Equip("weak", 1);
            Assert.IsTrue(MemoryCardRules.Matches(Data, e.Save.Memory, cand, s));          // SR は R より強い
            e.Save.Memory.Cards.Find(c => c.Id == "weak").Rarity = "UR+";
            e.Save.Memory.Cards.Find(c => c.Id == "weak").Main = 5.0;
            Assert.IsFalse(MemoryCardRules.Matches(Data, e.Save.Memory, cand, s));         // 付いている2枚より弱い
            Assert.IsTrue(MemoryCardRules.Score(Data, e.Save.Memory.Cards.Find(c => c.Id == "strong")) > 0);
        }

        [Test]
        public void Score_CountsSpeedCards_ByTheirSpeedAndStats()
        {
            var e = new Env();
            MemoryCardState sp = e.Add("s", "UR", MemoryKind.Speed, 100, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            Assert.Greater(MemoryCardRules.Score(Data, sp), 0.75 * 103);                    // 速度だけより大きい
        }

        // ---------------- 自動ガチャ ----------------

        [Test]
        public void AutoPull_StopsOnAMatch_ConvertsTheRest_AndEquipsTheMatch()
        {
            var e = new Env(hearts: 5000);
            e.Save.Memory.GachaLv = 140;
            var s = new AutoGachaSettings { MinRarityIndex = MemoryCardEffects.RarityIndex(Data, "SSR") };
            Assert.AreEqual(MemoryFailure.None, e.Service.AutoPull(s, 5000, out AutoGachaResult r));
            Assert.AreEqual(AutoStop.Found, r.Stop);
            Assert.IsNotNull(r.Found);
            Assert.GreaterOrEqual(MemoryCardEffects.RarityIndex(Data, r.Found.Rarity), s.MinRarityIndex);
            Assert.AreEqual(r.Pulls - 1, r.Sold);
            Assert.AreEqual(1, e.Save.Memory.Cards.Count);                                  // 合うカードだけが残る
            Assert.AreEqual(1, e.Save.Memory.Equipped.Count(x => x == r.Found.Id));        // 空き枠に自動で装備される
            Assert.Greater(r.CoinGained, 0);
            Assert.AreEqual(r.CoinGained, e.Wallet.Balance("coin"), 1e-6);
            Assert.AreEqual(r.ExpGained, e.Wallet.Balance("exp"), 1e-3);
            Assert.AreEqual(r.CoinGained * Data.MemoryCards.SellExpPerCoin, r.ExpGained, 1e-3);
            Assert.AreEqual(5000 - r.Pulls, e.Wallet.Balance("bond_heart"));
        }

        [Test]
        public void AutoPull_StopsWhenHeartsRunOut_AndWhenTheLimitIsReached()
        {
            var poor = new Env(hearts: 3);
            var never = new AutoGachaSettings { MinRarityIndex = Data.MemoryCards.Rarities.Count - 1 };   // EX だけ
            poor.Service.AutoPull(never, 100, out AutoGachaResult a);
            Assert.AreEqual(AutoStop.NotEnough, a.Stop);
            Assert.AreEqual(3, a.Pulls);
            Assert.AreEqual(3, a.Sold);
            Assert.IsNull(a.Found);

            var rich = new Env(hearts: 1000);
            rich.Service.AutoPull(never, 10, out AutoGachaResult b);
            Assert.AreEqual(AutoStop.Limit, b.Stop);
            Assert.AreEqual(10, b.Pulls);
            Assert.IsEmpty(rich.Save.Memory.Cards);
        }

        [Test]
        public void AutoPull_RejectsBadSettings_WithoutPaying()
        {
            var e = new Env();
            AutoGachaResult r;
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.AutoPull(null, 5, out r));
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.AutoPull(Any(), 0, out r));
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.AutoPull(new AutoGachaSettings { MinRarityIndex = 99 }, 5, out r));
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.AutoPull(new AutoGachaSettings { MinRarityIndex = -1 }, 5, out r));
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.AutoPull(new AutoGachaSettings { Filter1 = new[] { SubstatKey.EvasionPct, SubstatKey.CritRatePct, SubstatKey.AccuracyPct } }, 5, out r));
            Assert.AreEqual(1000, e.Wallet.Balance("bond_heart"));
        }

        // ---------------- GameSession ----------------

        [Test]
        public void Session_SellAndAutoPull_EmitEvents_AndFeedMetrics()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 5UL);
            s.Debug.GrantCurrency("bond_heart", 500);
            s.DrainEvents();
            Assert.IsTrue(s.AutoPullMemoryCard(new AutoGachaSettings { MinRarityIndex = 5 }, 100, out AutoGachaResult r).Success);
            Assert.AreEqual(r.Pulls, 500 - s.State.Balance("bond_heart"), 1e-9);
            IReadOnlyList<GameEvent> evs = s.DrainEvents();
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.MemoryCardSold || r.Sold == 0));
            Assert.AreEqual(r.CoinGained, s.State.Metric("earned.coin"), 1e-6);
            Assert.AreEqual("InvalidSettings", s.AutoPullMemoryCard(null, 1, out _).Failure);

            if (r.Found != null)
            {
                Assert.IsTrue(s.SellMemoryCard(r.Found.Id).Success);
                Assert.IsTrue(s.DrainEvents().Any(x => x.Kind == GameEventKind.MemoryCardSold && x.Id == r.Found.Id));
            }
            Assert.AreEqual("UnknownCard", s.SellMemoryCard("zzz").Failure);
        }

        [Test]
        public void Batch_UnlocksByRank_AndPullsToTheEndWithoutStopping()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 5UL, null, unlockAll: false);
            s.Debug.GrantCurrency("bond_heart", 5000);
            s.Debug.SetProgress(2, 1, 1);
            CollectionAssert.AreEqual(new[] { 20 }, s.State.MemoryPullCounts.ToArray());
            Assert.AreEqual("Locked", s.PullMemoryCards(100, out _).Failure);                   // まだ解放されていない回数
            Assert.AreEqual("InvalidSettings", s.PullMemoryCards(30, out _).Failure);           // 選択肢に無い回数
            Assert.IsTrue(s.PullMemoryCards(20, out AutoGachaResult r).Success);
            Assert.AreEqual(20, r.Pulls);                                                       // 条件に合うカードが出ても止まらない
            Assert.Greater(r.Kept, 0);
            Assert.AreEqual(5000 - 20, s.State.Balance("bond_heart"), 1e-9);
            s.Debug.SetProgress(36, 1, 1);
            CollectionAssert.AreEqual(new[] { 20, 100, 250, 500, 1000 }, s.State.MemoryPullCounts.ToArray());
            Assert.IsTrue(s.PullMemoryCards(1000, out r).Success);
            Assert.AreEqual(1000, r.Pulls);
            Assert.LessOrEqual(s.State.MemoryCards.Count, 8);
            Assert.AreEqual(5000 - 1020, s.State.Balance("bond_heart"), 1e-9);
            int total = 1020;
            while (s.PullMemoryCards(1000, out r).Success) { total += r.Pulls; }                // 絆ハートが尽きたら、引けた分で止まる（最後は端数）
            Assert.AreEqual(5000, total);
            Assert.AreEqual(0, s.State.Balance("bond_heart"), 1e-9);
        }
    }
}
