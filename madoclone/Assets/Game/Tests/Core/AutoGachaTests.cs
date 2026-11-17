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

        // ---------------- 自動ガチャ（確認つき） ----------------

        [Test]
        public void AutoPull_StopsOnAMatch_ConvertsTheRest_AndWaitsForTheAnswer()
        {
            var e = new Env(hearts: 5000);
            e.Save.Memory.GachaLv = 140;
            Assert.AreEqual(MemoryFailure.None, e.Service.SetRule(new AutoGachaSettings { MinRarityIndex = MemoryCardEffects.RarityIndex(Data, "SSR") }));
            Assert.AreEqual(MemoryFailure.None, e.Service.AutoPull(5000, out AutoGachaResult r));
            Assert.AreEqual(AutoStop.Found, r.Stop);
            Assert.IsNotNull(r.Found);
            Assert.GreaterOrEqual(MemoryCardEffects.RarityIndex(Data, r.Found.Rarity), MemoryCardEffects.RarityIndex(Data, "SSR"));
            Assert.AreEqual(r.Pulls - 1, r.Sold);
            Assert.AreSame(r.Found, e.Save.Memory.Pending);                                  // 返事待ち（勝手に装備しない）
            Assert.IsEmpty(e.Save.Memory.Cards);
            Assert.IsTrue(e.Save.Memory.Equipped.All(x => x == null));
            Assert.AreEqual(r.CoinGained, e.Wallet.Balance("coin"), 1e-6);
            Assert.AreEqual(r.CoinGained * Data.MemoryCards.SellExpPerCoin, e.Wallet.Balance("exp"), 1e-3);
            Assert.AreEqual(5000 - r.Pulls, e.Wallet.Balance("bond_heart"));
            Assert.AreEqual(MemoryFailure.HasPending, e.Service.AutoPull(10, out _));        // 返事をするまで引けない
            Assert.AreEqual(MemoryFailure.HasPending, e.Service.Pull().Failure);
            Assert.AreEqual(5000 - r.Pulls, e.Wallet.Balance("bond_heart"));
        }

        [Test]
        public void Resolve_Equip_PutsTheCardInTheWeakerSlot_AndConvertsTheOneThatLeaves()
        {
            var e = new Env();
            MemoryCardState weak = e.Add("weak", "R", MemoryKind.Hp, 100, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            MemoryCardState strong = e.Add("strong", "UR", MemoryKind.Hp, 100, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            e.Service.Equip("weak", 0); e.Service.Equip("strong", 1);
            MemoryCardState cand = new MemoryCardState { Id = "cand", Rarity = "SR", Kind = MemoryKind.Hp, Lv = 100, Main = Data.MemoryCards.Rarities.First(r => r.Id == "SR").MainCoefMin, Subs = strong.Subs };
            e.Save.Memory.Pending = cand;
            Assert.AreEqual(MemoryFailure.WrongSlot, e.Service.Resolve(true, 2, out _, out _));    // 種類の違う枠
            Assert.AreSame(cand, e.Save.Memory.Pending);
            Assert.AreEqual(MemoryFailure.None, e.Service.Resolve(true, -1, out double coin, out double exp));
            Assert.IsNull(e.Save.Memory.Pending);
            Assert.AreEqual("cand", e.Save.Memory.Equipped[0]);                                      // 弱いほうの枠
            Assert.AreEqual("strong", e.Save.Memory.Equipped[1]);
            CollectionAssert.DoesNotContain(e.Save.Memory.Cards, weak);                              // 外れたカードは還元
            Assert.AreEqual(MemoryCardRules.SellPrice(Data, weak), coin);
            Assert.AreEqual(coin, e.Wallet.Balance("coin"));
            Assert.AreEqual(coin * Data.MemoryCards.SellExpPerCoin, exp, 1e-3);
            Assert.AreEqual(MemoryFailure.NoPending, e.Service.Resolve(true, -1, out _, out _));
        }

        [Test]
        public void Resolve_Decline_ConvertsTheCardAndKeepsTheEquipment()
        {
            var e = new Env();
            e.Add("a", "UR", MemoryKind.Atk, 100, SubstatKey.EvasionPct, SubstatKey.CritRatePct);
            e.Service.Equip("a", 2);
            var cand = new MemoryCardState { Id = "cand", Rarity = "SSR", Kind = MemoryKind.Atk, Lv = 50, Main = 1, Subs = e.Save.Memory.Cards[0].Subs };
            e.Save.Memory.Pending = cand;
            Assert.AreEqual(MemoryFailure.None, e.Service.Resolve(false, -1, out double coin, out _));
            Assert.IsNull(e.Save.Memory.Pending);
            Assert.AreEqual("a", e.Save.Memory.Equipped[2]);
            Assert.AreEqual(MemoryCardRules.SellPrice(Data, cand), coin);
            Assert.AreEqual(1, e.Save.Memory.Cards.Count);
        }

        [Test]
        public void AutoPull_StopsWhenHeartsRunOut_AndWhenTheLimitIsReached()
        {
            var never = new AutoGachaSettings { MinRarityIndex = Data.MemoryCards.Rarities.Count - 1, RequirePowerUp = false };   // EX だけ
            var poor = new Env(hearts: 3);
            poor.Service.SetRule(never);
            poor.Service.AutoPull(100, out AutoGachaResult a);
            Assert.AreEqual(AutoStop.NotEnough, a.Stop);
            Assert.AreEqual(3, a.Pulls);
            Assert.AreEqual(3, a.Sold);
            Assert.IsNull(a.Found);

            var rich = new Env(hearts: 1000);
            rich.Service.SetRule(never);
            rich.Service.AutoPull(10, out AutoGachaResult b);
            Assert.AreEqual(AutoStop.Limit, b.Stop);
            Assert.AreEqual(10, b.Pulls);
            Assert.IsEmpty(rich.Save.Memory.Cards);
            Assert.IsNull(rich.Save.Memory.Pending);
        }

        [Test]
        public void Rule_RejectsBadSettings_AndKeepsTheOldOne()
        {
            var e = new Env();
            e.Service.SetRule(new AutoGachaSettings { MinRarityIndex = 3, RequirePowerUp = false });
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.SetRule(null));
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.SetRule(new AutoGachaSettings { MinRarityIndex = 99 }));
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.SetRule(new AutoGachaSettings { MinRarityIndex = -1 }));
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.SetRule(new AutoGachaSettings { Filter1 = new[] { SubstatKey.EvasionPct, SubstatKey.CritRatePct, SubstatKey.AccuracyPct } }));
            Assert.AreEqual(3, e.Save.Memory.Rule.MinRarityIndex);
            Assert.IsFalse(e.Save.Memory.Rule.RequirePowerUp);
            Assert.AreEqual(MemoryFailure.InvalidSettings, e.Service.AutoPull(0, out _));
            Assert.AreEqual(1000, e.Wallet.Balance("bond_heart"));
        }

        [Test]
        public void Rule_FiltersBySubStats_SoOnlyMatchingCardsAskForAnAnswer()
        {
            var e = new Env(hearts: 5000);
            e.Save.Memory.GachaLv = 140;
            e.Service.SetRule(new AutoGachaSettings { RequirePowerUp = false, Filter1 = new[] { SubstatKey.CritDamagePct } });
            for (int i = 0; i < 10; i++)
            {
                Assert.AreEqual(MemoryFailure.None, e.Service.AutoPull(5000, out AutoGachaResult r));
                Assert.AreEqual(AutoStop.Found, r.Stop);
                Assert.IsTrue(r.Found.Subs.Any(x => x.Stat == SubstatKey.CritDamagePct));      // 絞り込みのサブ効果を持つカードだけが確認に回る
                Assert.AreEqual(MemoryFailure.None, e.Service.Resolve(i % 2 == 0, -1, out _, out _));
            }
        }

        [Test]
        public void Rule_AndPending_SurviveTheSaveRoundTrip_AndBrokenOnesAreRepaired()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            save.Memory.Rule = new MemoryRuleState { MinRarityIndex = 4, RequirePowerUp = false, Filter1 = new List<SubstatKey> { SubstatKey.CritRatePct }, Filter2 = new List<SubstatKey> { SubstatKey.EvasionPct, SubstatKey.AccuracyPct } };
            save.Memory.Pending = new MemoryCardState { Id = "p1", Rarity = "SR", Kind = MemoryKind.Def, Lv = 9, Main = 1.5, Subs = new List<MemorySubState> { new MemorySubState { Stat = SubstatKey.CritRatePct, Value = 1 }, new MemorySubState { Stat = SubstatKey.EvasionPct, Value = 2 } } };
            LoadResult back = SaveCodec.Load(SaveCodec.Serialize(save), Data);
            Assert.AreEqual(4, back.Save.Memory.Rule.MinRarityIndex);
            Assert.IsFalse(back.Save.Memory.Rule.RequirePowerUp);
            CollectionAssert.AreEqual(new[] { SubstatKey.EvasionPct, SubstatKey.AccuracyPct }, back.Save.Memory.Rule.Filter2);
            Assert.AreEqual("p1", back.Save.Memory.Pending.Id);
            Assert.IsEmpty(SaveValidator.Validate(back.Save, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());

            save.Memory.Pending.Rarity = "???";
            save.Memory.Rule.MinRarityIndex = 99;
            Assert.IsTrue(SaveValidator.Validate(save, Data).Any(i => i.Code == "MEMORY_PENDING"));
            Assert.IsTrue(SaveValidator.Validate(save, Data).Any(i => i.Code == "MEMORY_RULE"));
            SaveRepair.Repair(save, Data);
            Assert.IsNull(save.Memory.Pending);
            Assert.AreEqual(0, save.Memory.Rule.MinRarityIndex);
            Assert.IsTrue(save.Memory.Rule.RequirePowerUp);
        }

        // ---------------- GameSession ----------------

        private static GameSession NewSession(bool unlockAll = true)
        {
            return GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 5UL, null, unlockAll: unlockAll);
        }

        [Test]
        public void Session_Pull_AsksBeforeEquipping_AndTheAnswerChangesTheEquipment()
        {
            GameSession s = NewSession();
            s.Debug.GrantCurrency("bond_heart", 500);
            s.DrainEvents();
            MemoryCardView card = default(MemoryCardView);
            int guard = 0;
            while (s.State.MemoryPending == null && guard++ < 500) { Assert.IsTrue(s.PullMemoryCard(out card).Success); }
            Assert.IsNotNull(s.State.MemoryPending);                                            // 初期の条件（いまより強い）に合うカードが出た
            Assert.IsTrue(s.DrainEvents().Any(x => x.Kind == GameEventKind.MemoryCardPending));
            Assert.AreEqual("HasPending", s.PullMemoryCard(out _).Failure);
            Assert.IsTrue(s.State.EquippedMemoryCards.All(x => x == null));                     // まだ装備していない
            string id = s.State.MemoryPending.Value.Id;
            Assert.IsTrue(s.ResolveMemoryCard(true).Success);
            Assert.IsNull(s.State.MemoryPending);
            Assert.IsTrue(s.State.EquippedMemoryCards.Contains(id));
            Assert.AreEqual("NoPending", s.ResolveMemoryCard(true).Failure);
        }

        [Test]
        public void Session_Batch_UnlocksByRank_StopsAtAMatch_AndContinuesAfterTheAnswer()
        {
            GameSession s = NewSession(unlockAll: false);
            s.Debug.GrantCurrency("bond_heart", 5000);
            s.Debug.SetProgress(2, 1, 1);
            CollectionAssert.AreEqual(new[] { 20 }, s.State.MemoryPullCounts.ToArray());
            Assert.AreEqual("Locked", s.PullMemoryCards(100, out _).Failure);                   // まだ解放されていない回数
            Assert.AreEqual("InvalidSettings", s.PullMemoryCards(0, out _).Failure);
            Assert.IsTrue(s.PullMemoryCards(20, out AutoGachaResult r).Success);
            Assert.AreEqual(AutoStop.Found, r.Stop);                                            // 空き枠だらけなので、最初のカードが条件に合う
            Assert.IsNotNull(s.State.MemoryPending);
            Assert.AreEqual("HasPending", s.PullMemoryCards(20, out _).Failure);
            Assert.IsTrue(s.ResolveMemoryCard(true).Success);
            s.Debug.SetProgress(36, 1, 1);
            CollectionAssert.AreEqual(new[] { 20, 100, 250, 500, 1000 }, s.State.MemoryPullCounts.ToArray());
            double hearts = s.State.Balance("bond_heart");
            int total = 0, guard = 0;
            while (hearts > 0 && guard++ < 5000)
            {
                Assert.IsTrue(s.PullMemoryCards(1000, out r).Success || s.State.Balance("bond_heart") == 0);
                total += r == null ? 0 : r.Pulls;
                if (s.State.MemoryPending != null) { Assert.IsTrue(s.ResolveMemoryCard(guard % 2 == 0).Success); }
                hearts = s.State.Balance("bond_heart");
            }
            Assert.AreEqual(0, s.State.Balance("bond_heart"), 1e-9);
            Assert.LessOrEqual(s.State.MemoryCards.Count, 8);
            Assert.Greater(total, 4000);
        }

        [Test]
        public void Session_SetMemoryRule_ChangesWhatAsksForAnAnswer()
        {
            GameSession s = NewSession();
            Assert.IsTrue(s.State.MemoryRule.RequirePowerUp);                                   // 既定：いまより強いカード
            Assert.IsTrue(s.SetMemoryRule(new AutoGachaSettings { MinRarityIndex = 8, RequirePowerUp = false, Filter1 = new[] { SubstatKey.CritRatePct } }).Success);
            Assert.AreEqual(8, s.State.MemoryRule.MinRarityIndex);
            Assert.AreEqual("InvalidSettings", s.SetMemoryRule(new AutoGachaSettings { MinRarityIndex = 99 }).Failure);
            Assert.AreEqual(8, s.State.MemoryRule.MinRarityIndex);
            Assert.AreEqual("Locked", NewSession(unlockAll: false).SetMemoryRule(new AutoGachaSettings()).Failure);
        }
    }
}
