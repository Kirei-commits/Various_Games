using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Metrics;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>レベルアップ・覚醒・敵のドロップ・数え上げ（フェーズ2の育成の費用）。</summary>
    public class GrowthEconomyTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 1UL);
            public Wallet.Wallet Wallet;
            public bool Dev;
            public CrystalService Crystals;
            public RosterService Roster;
            public LevelService Level;
            public AwakenService Awaken;

            public Env(double exp = 0, double shards = 0)
            {
                var state = new WalletState();
                state.Balances[CurrencyIds.Exp] = exp;
                state.Balances[CurrencyIds.AwakenShard] = shards;
                Wallet = new Wallet.Wallet(Data.Currencies, state, () => Dev);
                Crystals = new CrystalService(Data, Save);
                Roster = new RosterService(Data, Save, Crystals);
                Level = new LevelService(Data, Save, Wallet);
                Awaken = new AwakenService(Data, Save, Wallet, Roster);
                Roster.TryGrant("chr_001");
            }

            public CharacterState C { get { return Save.Characters["chr_001"]; } }
        }

        // ---------------- レベルアップ ----------------

        [Test]
        public void LevelUp_PaysTheTableCost_AndRaisesTheLevelByOne()
        {
            var e = new Env(exp: 10000);
            LevelResult r = e.Level.LevelUp("chr_001");
            Assert.IsTrue(r.Success);
            Assert.AreEqual(2, e.C.Lv);
            Assert.AreEqual(2100, r.ExpSpent);                       // Lv1→2 は 2,100（実測）
            Assert.AreEqual(10000 - 2100, e.Wallet.Balance(CurrencyIds.Exp));
            Assert.AreEqual(1, r.LevelsGained);
        }

        [Test]
        public void LevelUp_NotEnough_FailsAndChangesNothing()
        {
            var e = new Env(exp: 2099);
            LevelResult r = e.Level.LevelUp("chr_001");
            Assert.AreEqual(LevelFailure.NotEnoughExp, r.Failure);
            Assert.AreEqual(1, r.ShortBy, 1e-9);
            Assert.AreEqual(1, e.C.Lv);
            Assert.AreEqual(2099, e.Wallet.Balance(CurrencyIds.Exp));
            Assert.AreEqual(0, e.Wallet.DrainEvents().Count);
        }

        [Test]
        public void LevelTo_IsAllOrNothing_AndRespectsTheStarCap()
        {
            var e = new Env(exp: 1e9);
            double cost = e.Level.TotalCost(1, 30);
            Assert.IsTrue(e.Level.LevelTo("chr_001", 30).Success);
            Assert.AreEqual(30, e.C.Lv);
            Assert.AreEqual(1e9 - cost, e.Wallet.Balance(CurrencyIds.Exp), 1e-3);
            Assert.AreEqual(LevelFailure.InvalidTarget, e.Level.LevelTo("chr_001", 30).Failure);   // 同じ Lv
            Assert.AreEqual(LevelFailure.InvalidTarget, e.Level.LevelTo("chr_001", 51).Failure);   // ★0 の上限は 50
            Assert.AreEqual(LevelFailure.InvalidTarget, e.Level.LevelTo("chr_001", 10).Failure);   // 下げない
            Assert.AreEqual(30, e.C.Lv);

            var poor = new Env(exp: cost - 1);
            Assert.AreEqual(LevelFailure.NotEnoughExp, poor.Level.LevelTo("chr_001", 30).Failure);
            Assert.AreEqual(1, poor.C.Lv);
        }

        [Test]
        public void LevelUp_StopsAtTheStarCap_AndAwakeningRaisesIt()
        {
            var e = new Env(exp: 1e12, shards: 100);
            Assert.IsTrue(e.Level.LevelTo("chr_001", 50).Success);
            Assert.AreEqual(LevelFailure.AtMaxLevel, e.Level.LevelUp("chr_001").Failure);
            Assert.IsTrue(e.Awaken.Awaken("chr_001").Success);                // ★1：上限 55
            Assert.AreEqual(55, e.Level.MaxLevel(e.C));
            Assert.IsTrue(e.Level.LevelUp("chr_001").Success);
        }

        [Test]
        public void LevelUpMax_GoesAsFarAsTheBalanceAllows()
        {
            var e = new Env(exp: 2100 + 3450 + 5850 + 100);      // Lv1→4 まで払える（次の 8,000 弱には足りない）
            LevelResult r = e.Level.LevelUpMax("chr_001");
            Assert.IsTrue(r.Success);
            Assert.AreEqual(4, e.C.Lv);
            Assert.AreEqual(100, e.Wallet.Balance(CurrencyIds.Exp), 1e-9);
            Assert.AreEqual(LevelFailure.NotEnoughExp, e.Level.LevelUpMax("chr_001").Failure);
        }

        [Test]
        public void LevelUpMax_InDevMode_GoesToTheCap_WithoutSpending()
        {
            var e = new Env(exp: 0) { Dev = true };
            Assert.IsTrue(e.Level.LevelUpMax("chr_001").Success);
            Assert.AreEqual(50, e.C.Lv);
            Assert.AreEqual(0, e.Wallet.Balance(CurrencyIds.Exp));
            Assert.AreEqual(1, e.Wallet.DrainEvents().Count);       // Spent は出る（実績の数えのため）
        }

        [Test]
        public void LevelService_RejectsUnknownAndUnownedCharacters_AndBadLevels()
        {
            var e = new Env(exp: 1e6);
            Assert.AreEqual(LevelFailure.UnknownCharacter, e.Level.LevelUp("chr_nope").Failure);
            Assert.AreEqual(LevelFailure.UnknownCharacter, e.Level.LevelUp(null).Failure);
            Assert.AreEqual(LevelFailure.NotOwned, e.Level.LevelUp("chr_002").Failure);
            Assert.Throws<ArgumentException>(() => e.Level.CostToNext(0));
            Assert.Throws<ArgumentException>(() => e.Level.CostToNext(200));   // 最大レベルに次は無い
            Assert.Throws<ArgumentNullException>(() => new LevelService(Data, e.Save, null));
        }

        [Test]
        public void TotalCost_MatchesTheMeasuredCumulative_Lv30To50()
        {
            var e = new Env();
            Assert.AreEqual(73.0e6, e.Level.TotalCost(30, 50), 73.0e6 * 0.001);   // docs/01 4.6節の実測 73,027k
        }

        // ---------------- 覚醒 ----------------

        [Test]
        public void Awaken_PaysTheTableShards_AndRaisesTheStar()
        {
            var e = new Env(shards: 10);
            AwakenResult r = e.Awaken.Awaken("chr_001");
            Assert.IsTrue(r.Success);
            Assert.AreEqual(1, e.C.Star);
            Assert.AreEqual(1, r.ShardsSpent);                       // ★0→1 は 1 枚
            Assert.AreEqual(9, e.Wallet.Balance(CurrencyIds.AwakenShard));
            Assert.IsTrue(e.Awaken.Awaken("chr_001").Success);        // ★1→2 は 2 枚
            Assert.AreEqual(7, e.Wallet.Balance(CurrencyIds.AwakenShard));
        }

        [Test]
        public void Awaken_NotEnough_FailsAndChangesNothing()
        {
            var e = new Env(shards: 1);
            e.Awaken.Awaken("chr_001");                              // ★1 へ。残り 0
            AwakenResult r = e.Awaken.Awaken("chr_001");              // ★2 には 2 枚要る
            Assert.AreEqual(AwakenFailure.NotEnoughShards, r.Failure);
            Assert.AreEqual(2, r.ShortBy, 1e-9);
            Assert.AreEqual(1, e.C.Star);
        }

        [Test]
        public void Awaken_TotalCostToMax_Is96()
        {
            var e = new Env(shards: 96);
            for (int star = 0; star < e.Awaken.MaxStar; star++) { Assert.IsTrue(e.Awaken.Awaken("chr_001").Success, "★" + star); }
            Assert.AreEqual(16, e.C.Star);                              // 限界突破の★16まで（★0〜11 は46枚、★12〜16 は50枚）
            Assert.AreEqual(0, e.Wallet.Balance(CurrencyIds.AwakenShard));
            Assert.AreEqual(AwakenFailure.AtMaxStar, e.Awaken.Awaken("chr_001").Failure);
        }

        [Test]
        public void Awaken_ToStarSix_PutsTheOwnCrystalInItsSlot()
        {
            var e = new Env(shards: 17);
            for (int i = 0; i < 5; i++) { e.Awaken.Awaken("chr_001"); }
            Assert.IsNull(e.Crystals.Equipped("chr_001")[CharacterState.OwnCrystalSlot]);
            e.Awaken.Awaken("chr_001");                              // ★5→6
            Assert.AreEqual("cry_chr_001", e.Crystals.Equipped("chr_001")[CharacterState.OwnCrystalSlot]);
        }

        [Test]
        public void Awaken_InDevMode_DoesNotSpend_ButStillRaisesTheStar()
        {
            var e = new Env(shards: 0) { Dev = true };
            Assert.IsTrue(e.Awaken.Awaken("chr_001").Success);
            Assert.AreEqual(1, e.C.Star);
            Assert.AreEqual(0, e.Wallet.Balance(CurrencyIds.AwakenShard));
        }

        [Test]
        public void Awaken_RejectsUnknownAndUnowned_AndBrokenState_DoesNotLoseShards()
        {
            var e = new Env(shards: 20);
            Assert.AreEqual(AwakenFailure.UnknownCharacter, e.Awaken.Awaken("chr_nope").Failure);
            Assert.AreEqual(AwakenFailure.NotOwned, e.Awaken.Awaken("chr_002").Failure);
            Assert.Throws<ArgumentException>(() => e.Awaken.CostToNext(16));
            e.C.Star = 5;
            e.C.Crystals[CharacterState.OwnCrystalSlot] = "cry_chr_002";   // ★6 で開く枠が既に埋まっている（壊れた状態）
            Assert.Throws<InvalidOperationException>(() => e.Awaken.Awaken("chr_001"));
            Assert.AreEqual(20, e.Wallet.Balance(CurrencyIds.AwakenShard), "欠片が減らない");
            Assert.AreEqual(5, e.C.Star);
        }

        // ---------------- ドロップ ----------------

        [Test]
        public void Drops_AreExpPerEnemyTimesDefeated_ForEveryRank()
        {
            var calc = new RewardCalculator(Data);
            var result = new BattleResult { EnemiesDefeated = 4 };
            for (int rank = 1; rank <= Data.Difficulty.Ranks; rank++)
            {
                Reward r = calc.ForBattle(rank, result);
                Assert.AreEqual(2, r.Items.Count);
                Assert.AreEqual(CurrencyIds.Exp, r.Items[0].CurrencyId);
                Assert.AreEqual(calc.ExpPerEnemy(rank) * 4, r.Items[0].Amount, 1e-6);
                Assert.AreEqual(CurrencyIds.AwakenShard, r.Items[1].CurrencyId);                       // 覚醒の欠片も確定ドロップ
                Assert.AreEqual(Data.Rewards.AwakenShardPerEnemy * 4, r.Items[1].Amount, 1e-9);
            }
            Assert.IsTrue(calc.ForBattle(1, new BattleResult()).Items.All(m => m.Amount == 0));   // 倒していなければ0
            Assert.Throws<ArgumentException>(() => calc.ExpPerEnemy(0));
            Assert.Throws<ArgumentException>(() => calc.ExpPerEnemy(51));
            Assert.Throws<ArgumentNullException>(() => calc.ForBattle(1, null));
            Assert.AreEqual(1500, calc.KillsPerRankClear);   // 100 ステージ × (4 ウェーブ × 3 体 ＋ ボス 3 体)
        }

        [Test]
        public void BattleResult_CountsDefeatedEnemiesAndLostAllies()
        {
            var b = new Growth.BattleSetupBuilder(Data, new Mado.Core.Stats.StatResolver(Data));
            var allies = new List<Mado.Core.Battle.UnitSetup> { b.BuildAlly("chr_101", 0, 50, null, false) };
            var enemies = new StageFactory(Data).BuildWithPower(1, allies[0].Stats.Power * 0.2, StageKind.Wave, 1, 1);
            BattleResult r = new BattleSim(b.Assemble(allies, enemies, 1, 60)).RunToEnd(null);
            Assert.AreEqual(BattleOutcome.Win, r.Outcome);
            Assert.AreEqual(3, r.EnemiesDefeated);
            Assert.AreEqual(0, r.AlliesLost);

            var weak = new List<Mado.Core.Battle.UnitSetup> { b.BuildAlly("chr_101", 0, 1, null, false) };
            var strong = new StageFactory(Data).BuildWithPower(1, weak[0].Stats.Power * 100, StageKind.Wave, 1, 1);
            BattleResult lost = new BattleSim(b.Assemble(weak, strong, 1, 60)).RunToEnd(null);
            Assert.AreEqual(BattleOutcome.Lose, lost.Outcome);
            Assert.AreEqual(1, lost.AlliesLost);
        }

        // ---------------- 数え上げ ----------------

        [Test]
        public void MetricCounter_CountsAndNotifies_AndRejectsBadInput()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            var m = new MetricCounter(save);
            var seen = new List<string>();
            m.Changed += (k, add, total) => seen.Add(k + ":" + add + ":" + total);
            m.Add("pull_done");
            m.Add("pull_done", 10);
            m.Add("pull_done", 0);       // 0 は数えない（通知もしない）
            Assert.AreEqual(11, m.Get("pull_done"));
            Assert.AreEqual(11, save.Metrics["pull_done"]);
            CollectionAssert.AreEqual(new[] { "pull_done:1:1", "pull_done:10:11" }, seen);
            Assert.AreEqual(0, m.Get("nothing"));
            Assert.AreEqual(0, m.Get(null));
            Assert.Throws<ArgumentException>(() => m.Add("", 1));
            Assert.Throws<ArgumentException>(() => m.Add("x", -1));
            Assert.Throws<ArgumentException>(() => m.Add("x", double.NaN));
            Assert.Throws<ArgumentNullException>(() => new MetricCounter(null));
        }

        [Test]
        public void MetricCounter_ObservesWalletEvents_EvenInDevMode()
        {
            var e = new Env(exp: 100) { Dev = true };
            var m = new MetricCounter(e.Save);
            e.Wallet.Pay(new Cost(CurrencyIds.Exp, 5000), new PayReason("t"));       // 開発者モード：減らないが数えは進む
            e.Wallet.Grant(new Reward(CurrencyIds.Coin, 7), new GrantReason("t"));
            m.Observe(e.Wallet.DrainEvents());
            Assert.AreEqual(5000, m.Get("spent.exp"));
            Assert.AreEqual(7, m.Get("earned.coin"));
            Assert.AreEqual(100, e.Wallet.Balance(CurrencyIds.Exp));
        }

        [Test]
        public void MetricsSurviveTheSaveRoundTrip()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            new MetricCounter(save).Add(MetricCounter.Keys.EnemiesDefeated, 1234567);
            LoadResult r = SaveCodec.Load(SaveCodec.Serialize(save), Data);
            Assert.AreEqual(1234567, new MetricCounter(r.Save).Get(MetricCounter.Keys.EnemiesDefeated));
        }

        [Test]
        public void Awaken_UsesSpareCopiesFirst_ThenShards()
        {
            var e = new Env(shards: 10);
            e.C.Star = 3;                                         // ★3→4 は 3 枚
            e.C.Copies = 2;
            AwakenResult r = e.Awaken.Awaken("chr_001");
            Assert.IsTrue(r.Success);
            Assert.AreEqual(2, r.CopiesUsed);
            Assert.AreEqual(1, r.ShardsSpent);                    // 足りない 1 枚だけ欠片
            Assert.AreEqual(0, e.C.Copies);
            Assert.AreEqual(9, e.Wallet.Balance(CurrencyIds.AwakenShard));

            var rich = new Env(shards: 0);
            rich.C.Star = 0;
            rich.C.Copies = 5;                                    // ★0→1 は 1 枚：コピーだけで足りる
            AwakenResult only = rich.Awaken.Awaken("chr_001");
            Assert.IsTrue(only.Success);
            Assert.AreEqual(1, only.CopiesUsed);
            Assert.AreEqual(0, only.ShardsSpent);
            Assert.AreEqual(4, rich.C.Copies);
            Assert.AreEqual(0, rich.Wallet.Balance(CurrencyIds.AwakenShard));

            var poor = new Env(shards: 0);
            poor.C.Star = 3; poor.C.Copies = 2;
            AwakenResult no = poor.Awaken.Awaken("chr_001");       // 3 枚のところ、コピー 2＋欠片 0
            Assert.AreEqual(AwakenFailure.NotEnoughShards, no.Failure);
            Assert.AreEqual(1, no.ShortBy);
            Assert.AreEqual(2, poor.C.Copies);                    // 失敗ではコピーも減らない
            Assert.AreEqual(3, poor.C.Star);
        }
    }
}
