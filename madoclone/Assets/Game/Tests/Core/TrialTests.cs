using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>RepeatGate（繰り返せる収入の歯止め）と試練。</summary>
    public class TrialTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static readonly DateTime T0 = new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc);

        // ---------------- RepeatGate ----------------

        private static GateDef Gate(double perDay, double? cap = null) { return new GateDef { ChargePerDay = perDay, Cap = cap }; }

        [Test]
        public void Gate_StartsWithADayOfCharges_AndAccruesByElapsedTime()
        {
            var s = new GateState();
            RepeatGate.Accrue(s, Gate(3), T0);
            Assert.AreEqual(3, s.Charges);
            RepeatGate.Accrue(s, Gate(3), T0.AddHours(12));
            Assert.AreEqual(4.5, s.Charges, 1e-9);
            RepeatGate.Accrue(s, Gate(3), T0.AddHours(36));
            Assert.AreEqual(7.5, s.Charges, 1e-9);                               // 上限なしで持ち越せる（12時間後の 4.5 に、さらに1日ぶんの 3）
        }

        [Test]
        public void Gate_CapStopsTheAccrual_AndTheSpeedMultiplierApplies()
        {
            var s = new GateState();
            RepeatGate.Accrue(s, Gate(3, cap: 5), T0);
            RepeatGate.Accrue(s, Gate(3, cap: 5), T0.AddDays(10));
            Assert.AreEqual(5, s.Charges);
            var fast = new GateState { Charges = 0, LastUtc = T0.ToString("o") };
            RepeatGate.Accrue(fast, Gate(2), T0.AddDays(1), speedMultiplier: 3);
            Assert.AreEqual(6.0, fast.Charges, 1e-9);                            // 成長速度倍率
            var tiny = new GateState();
            RepeatGate.Accrue(tiny, Gate(3, cap: 1), T0);
            Assert.AreEqual(1, tiny.Charges);                                    // 最初の1日ぶんも上限で切る
        }

        [Test]
        public void Gate_ConsumeNeedsOneCharge_AndAGateOfNullIsUnlimited()
        {
            var s = new GateState { Charges = 1.5, LastUtc = T0.ToString("o") };
            Assert.IsTrue(RepeatGate.CanConsume(s, Gate(3)));
            RepeatGate.Consume(s, Gate(3));
            Assert.AreEqual(0.5, s.Charges, 1e-9);
            Assert.IsFalse(RepeatGate.CanConsume(s, Gate(3)));
            Assert.Throws<InvalidOperationException>(() => RepeatGate.Consume(s, Gate(3)));
            Assert.IsTrue(RepeatGate.CanConsume(s, null));
            RepeatGate.Consume(s, null);
            RepeatGate.Accrue(s, null, T0.AddDays(5));
            Assert.AreEqual(0.5, s.Charges, 1e-9);                               // gate なしは何も変えない
        }

        [Test]
        public void Gate_ClockGoingBack_NeitherAddsNorMovesTheBase()
        {
            var s = new GateState();
            RepeatGate.Accrue(s, Gate(3), T0);
            string baseTime = s.LastUtc;
            RepeatGate.Accrue(s, Gate(3), T0.AddDays(-2));
            Assert.AreEqual(3, s.Charges);
            Assert.AreEqual(baseTime, s.LastUtc);
            s.LastUtc = "broken";
            RepeatGate.Accrue(s, Gate(3), T0);                                   // 壊れた時刻は、最初と同じ扱い
            Assert.AreEqual(3, s.Charges);
            StringAssert.StartsWith("2026-11-16", s.LastUtc);
        }

        // ---------------- 試練 ----------------

        private sealed class Boost : IModifierSource
        {
            public void Collect(List<Modifier> sink, StatQuery q)
            {
                foreach (StatId st in new[] { StatId.Atk, StatId.Hp, StatId.Def }) { sink.Add(new Modifier(st, ModifierPool.Global, 1e12)); }
            }
        }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 1UL);
            public Wallet.Wallet Wallet;
            public FixedClock Clock = new FixedClock(T0);
            public TrialService Trials;
            public List<UnitSetup> Strong, Weak;

            public Env()
            {
                Wallet = new Wallet.Wallet(Data.Currencies, new WalletState(), () => false);
                var stages = new StageFactory(Data);
                var strongBuilder = new BattleSetupBuilder(Data, new StatResolver(Data, new IModifierSource[] { new Boost() }));
                var weakBuilder = new BattleSetupBuilder(Data, new StatResolver(Data));
                Trials = new TrialService(Data, Save, Wallet, Clock, stages, strongBuilder);
                Strong = new List<UnitSetup> { strongBuilder.BuildAlly("chr_001", 0, 50, null, false), strongBuilder.BuildAlly("chr_002", 0, 50, null, false) };
                Weak = new List<UnitSetup> { weakBuilder.BuildAlly("chr_001", 0, 1, null, false) };
            }
        }

        [Test]
        public void Challenge_AWin_RaisesTheLevelAndPaysByLevel()
        {
            var e = new Env();
            TrialResult r = e.Trials.Challenge("battle_rush", e.Strong, 1);
            Assert.IsTrue(r.Success);
            Assert.IsTrue(r.Cleared);
            Assert.AreEqual(1, r.RewardLv);
            Assert.IsTrue(r.RewardGranted);
            Assert.AreEqual(1, e.Trials.ClearedLv("battle_rush"));
            Assert.AreEqual(6.04, e.Wallet.Balance("gem"), 1e-9);                // Lv1：6.04 × 1（ジェムは小数のまま）
            r = e.Trials.Challenge("battle_rush", e.Strong, 2);
            Assert.AreEqual(2, r.RewardLv);
            Assert.AreEqual(2, e.Trials.ClearedLv("battle_rush"));
            Assert.AreEqual(6.04 * 3, e.Wallet.Balance("gem"), 1e-9);            // 累計：1Lv＋2Lv
            Assert.AreEqual(2.42 * 3, e.Wallet.Balance("gacha_ticket"), 1);     // 個数の通貨は端数を繰り越す
        }

        [Test]
        public void Challenge_ALoss_ChangesNothing()
        {
            var e = new Env();
            TrialResult r = e.Trials.Challenge("phantom", e.Weak, 1);
            Assert.IsTrue(r.Success);
            Assert.IsFalse(r.Cleared);
            Assert.AreNotEqual(BattleOutcome.Win, r.Outcome);
            Assert.AreEqual(0, e.Trials.ClearedLv("phantom"));
            Assert.AreEqual(0, e.Wallet.Balance("bond_heart"));
            Assert.AreEqual(3, e.Trials.Charges("phantom"));                    // 回数も減らない
        }

        [Test]
        public void Challenge_WithoutCharges_StillLevelsUp_ButPaysNothing()
        {
            var e = new Env();
            for (int i = 0; i < 3; i++) { Assert.IsTrue(e.Trials.Challenge("zeref", e.Strong, (ulong)i).Success); }   // zeref は1日2回
            Assert.AreEqual(3, e.Trials.ClearedLv("zeref"));
            TrialResult third = e.Trials.Challenge("zeref", e.Strong, 9);
            Assert.AreEqual(4, e.Trials.ClearedLv("zeref"));
            Assert.IsTrue(third.Cleared);
            Assert.IsFalse(third.RewardGranted);                                 // 回数が尽きている
            Assert.AreEqual(10.0 * (1 + 2), e.Wallet.Balance("mana_shard"), 1e-9);   // 報酬は最初の2回だけ（Lv1・Lv2）
            e.Clock.Advance(TimeSpan.FromDays(1));                               // 1日たつと2回貯まる
            Assert.AreEqual(2, e.Trials.Charges("zeref"), 1e-9);
            TrialResult next = e.Trials.Challenge("zeref", e.Strong, 10);
            Assert.IsTrue(next.RewardGranted);
            Assert.AreEqual(5, next.RewardLv);
        }

        [Test]
        public void Sweep_PaysTheHighestClearedLevel_UsingACharge_WithoutFighting()
        {
            var e = new Env();
            Assert.AreEqual(TrialFailure.NothingToSweep, e.Trials.Sweep("phantom").Failure);
            e.Trials.Challenge("phantom", e.Strong, 1);                          // Lv1 クリア（回数 3→2、絆ハート 6.04）
            e.Trials.Challenge("phantom", e.Strong, 2);                          // Lv2（回数 2→1）
            double before = e.Wallet.Balance("bond_heart");
            TrialResult s = e.Trials.Sweep("phantom");
            Assert.IsTrue(s.Success);
            Assert.IsFalse(s.Cleared);
            Assert.AreEqual(2, s.RewardLv);
            Assert.AreEqual(before + 6.04 * 2, e.Wallet.Balance("bond_heart"), 1e-9);
            Assert.AreEqual(2, e.Trials.ClearedLv("phantom"));                   // Lv は変わらない
            Assert.AreEqual(TrialFailure.NoCharge, e.Trials.Sweep("phantom").Failure);   // 回数が尽きた
            Assert.AreEqual(TrialFailure.UnknownTrial, e.Trials.Sweep("nope").Failure);
        }

        [Test]
        public void Challenge_Validates_AndTheEnemyGrowsWithTheLevel()
        {
            var e = new Env();
            Assert.AreEqual(TrialFailure.UnknownTrial, e.Trials.Challenge("nope", e.Strong, 1).Failure);
            Assert.AreEqual(TrialFailure.NoParty, e.Trials.Challenge("phantom", new List<UnitSetup>(), 1).Failure);
            Assert.AreEqual(TrialFailure.NoParty, e.Trials.Challenge("phantom", null, 1).Failure);
            Assert.Throws<ArgumentException>(() => e.Trials.Charges("nope"));
            TrialDef def = Data.Trials.Trials[0];
            Assert.AreEqual(def.PowerBase, e.Trials.EnemyPower(def, 1));
            Assert.AreEqual(def.PowerBase * Math.Pow(def.PowerGrowth, 99), e.Trials.EnemyPower(def, 100), 1e-3);
        }

        [Test]
        public void TheRushIsAChainOfFights_AndAnyLossEndsIt()
        {
            var e = new Env();
            TrialResult weak = e.Trials.Challenge("battle_rush", e.Weak, 1);
            Assert.IsFalse(weak.Cleared);
            Assert.AreEqual(3, Data.Trials.Trials.First(t => t.Id == "battle_rush").Fights);
        }

        [Test]
        public void ATrialWithoutAGate_IsUnlimited()
        {
            MemoryDataSource real = MemoryDataSource.CopyOf(new FileDataSource(TestData.FindDataDir()));
            Newtonsoft.Json.Linq.JObject root = Newtonsoft.Json.Linq.JObject.Parse(real.ReadText(DataLoader.TrialsFile));
            ((Newtonsoft.Json.Linq.JObject)root["trials"][0]).Remove("gate");
            GameData open = DataLoader.Load(real.With(DataLoader.TrialsFile, root.ToString()));
            var save = SaveData.CreateNew(1, "", 1UL);
            var wallet = new Wallet.Wallet(open.Currencies, new WalletState(), () => false);
            var clock = new FixedClock(T0);
            var builder = new BattleSetupBuilder(open, new StatResolver(open, new IModifierSource[] { new Boost() }));
            var trials = new TrialService(open, save, wallet, clock, new StageFactory(open), builder);
            Assert.AreEqual(double.PositiveInfinity, trials.Charges("phantom"));
            List<UnitSetup> strong = new List<UnitSetup> { builder.BuildAlly("chr_001", 0, 50, null, false) };
            for (int i = 0; i < 6; i++) { Assert.IsTrue(trials.Challenge("phantom", strong, (ulong)i).RewardGranted, "挑戦 " + i); }
            Assert.IsTrue(trials.Sweep("phantom").RewardGranted);
        }

        [Test]
        public void TrialRewardsMatchTheMeasuredRatesPerLevel()
        {
            var e = new Env();
            TrialDef rush = Data.Trials.Trials.First(t => t.Id == "battle_rush");
            Money[] r150 = e.Trials.RewardFor(rush, 150).ToArray();
            Assert.AreEqual(906.0, r150.First(m => m.CurrencyId == "gem").Amount, 0.5);          // 実測：Lv150 でジェム906
            Assert.AreEqual(363.0, r150.First(m => m.CurrencyId == "gacha_ticket").Amount, 0.5);  // チケット363
            TrialDef zeref = Data.Trials.Trials.First(t => t.Id == "zeref");
            Assert.AreEqual(190.0, e.Trials.RewardFor(zeref, 19)[0].Amount);                      // 魔力の欠片 Lv19 で190
            TrialDef phantom = Data.Trials.Trials.First(t => t.Id == "phantom");
            Assert.AreEqual(870.0, e.Trials.RewardFor(phantom, 144)[0].Amount, 1.0);              // 絆ハート Lv144 で870
        }

        // ---------------- セーブ・GameSession ----------------

        [Test]
        public void TrialState_RoundTrips_IsValidated_AndRepaired()
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            s.Trials["phantom"] = new TrialState { ClearedLv = 7, Gate = new GateState { Charges = 1.25, LastUtc = "2026-11-16T00:00:00.0000000Z" } };
            s.Trials["ghost"] = new TrialState { ClearedLv = 1 };
            byte[] bytes = SaveCodec.Serialize(s);
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(7, r.Save.Trials["phantom"].ClearedLv);
            Assert.AreEqual(1.25, r.Save.Trials["phantom"].Gate.Charges);
            Assert.IsTrue(r.Issues.Any(i => i.Code == "TRIAL_UNKNOWN"));
            CollectionAssert.AreEqual(bytes, SaveCodec.Serialize(r.Save));

            s.Trials["phantom"].ClearedLv = -4;
            s.Trials["phantom"].Gate.Charges = -1;
            Assert.IsTrue(SaveValidator.Validate(s, Data).Any(i => i.Code == "TRIAL_LV"));
            Assert.IsTrue(SaveValidator.Validate(s, Data).Any(i => i.Code == "TRIAL_CHARGES"));
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(0, s.Trials["phantom"].ClearedLv);
            Assert.AreEqual(0, s.Trials["phantom"].Gate.Charges);
            Assert.IsEmpty(SaveValidator.Validate(s, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());
        }

        [Test]
        public void Session_ChallengesAndSweeps_EmitsEvents_AndFeedsTheWallet()
        {
            var store = new MemorySaveStore();
            var clock = new FixedClock(T0);
            GameSession s = GameSession.LoadOrCreate(Data, store, clock, 5UL, new IModifierSource[] { new Boost() });
            Assert.AreEqual(TrialFailure.NoParty, s.ChallengeTrial("phantom").Failure);
            s.Debug.GrantCharacter("chr_001");
            s.Debug.GrantCharacter("chr_002");
            s.Debug.SetParty(new[] { "chr_001", "chr_002" });
            s.DrainEvents();
            Assert.AreEqual(0, s.State.TrialClearedLv("phantom"));
            Assert.AreEqual(3, s.State.TrialCharges("phantom"));

            TrialResult r = s.ChallengeTrial("phantom");
            Assert.IsTrue(r.Cleared);
            Assert.AreEqual(1, s.State.TrialClearedLv("phantom"));
            Assert.AreEqual(2, s.State.TrialCharges("phantom"), 1e-9);
            IReadOnlyList<GameEvent> evs = s.DrainEvents();
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.TrialCleared && x.Id == "phantom" && x.Value == 1));
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.TrialRewarded));
            Assert.AreEqual(6.04, s.State.Balance("bond_heart"), 1e-9);
            Assert.AreEqual(6.04, s.State.Metric("earned.bond_heart"), 1e-9);

            Assert.IsTrue(s.SweepTrial("phantom").RewardGranted);
            Assert.AreEqual(12.08, s.State.Balance("bond_heart"), 1e-9);
            Assert.AreEqual(TrialFailure.UnknownTrial, s.SweepTrial("nope").Failure);
            Assert.AreEqual(TrialFailure.UnknownTrial, s.ChallengeTrial("nope").Failure);

            s.Save();
            GameSession again = GameSession.LoadOrCreate(Data, store, clock, 5UL);
            Assert.AreEqual(1, again.State.TrialClearedLv("phantom"));
            Assert.AreEqual(1, again.State.TrialCharges("phantom"), 1e-9);
        }

        // ---------------- damage 型（vsマスターハデス型） ----------------

        [Test]
        public void DamageLevel_MatchesTheMeasuredHadesRecord()
        {
            TrialDef hades = Data.Trials.Trials.First(t => t.Id == "hades");
            Assert.IsTrue(hades.IsDamageKind);
            Assert.AreEqual(0, TrialService.DamageLevel(hades, 1));
            Assert.AreEqual(1, TrialService.DamageLevel(hades, hades.DamageBase));
            Assert.AreEqual(148, TrialService.DamageLevel(hades, 537e12), 1);        // 実測：最高記録 537T が Lv148
            Assert.AreEqual(144, TrialService.DamageLevel(hades, 356e12), 2);        // 今回のダメージ 356T が Lv144
            for (double d = 1e6; d < 1e18; d *= 3) { Assert.GreaterOrEqual(TrialService.DamageLevel(hades, d * 3), TrialService.DamageLevel(hades, d)); }
        }

        [Test]
        public void DamageTrial_LevelFollowsTheDamage_TheRecordOnlyRises_AndRewardsUseTheRecord()
        {
            var e = new Env();
            TrialResult r = e.Trials.Challenge("hades", e.Strong, 1);
            Assert.IsTrue(r.Success);
            Assert.Greater(r.Damage, 0);
            Assert.IsTrue(r.Cleared);
            int record = e.Trials.ClearedLv("hades");
            Assert.AreEqual(TrialService.DamageLevel(Data.Trials.Trials.First(t => t.Id == "hades"), r.Damage), record);
            Assert.IsTrue(r.RewardGranted);
            Assert.AreEqual(0.5 * record, e.Wallet.Balance("collection_medal"), 1e-6);          // 報酬は Lv に比例（メダル 0.5/Lv）
            TrialResult weaker = e.Trials.Challenge("hades", e.Weak, 2);                       // 弱い編成：記録は下がらない
            Assert.IsFalse(weaker.Cleared);
            Assert.AreEqual(record, e.Trials.ClearedLv("hades"));
            Assert.AreEqual(record, weaker.RewardLv);                                          // 報酬は記録のLvぶん
        }

        [Test]
        public void DamageTrial_WithNoDamage_GivesNothing()
        {
            var e = new Env();
            var idle = new List<UnitSetup> { new UnitSetup { Id = "idle", Stats = new Mado.Core.Stats.BattleStats { Hp = 1e9, AttackSpeed = 1 }, Row = Row.Front } };
            TrialResult r = e.Trials.Challenge("hades", idle, 1);
            Assert.IsTrue(r.Success);
            Assert.AreEqual(0, r.Damage);
            Assert.IsFalse(r.Cleared);
            Assert.IsFalse(r.RewardGranted);
            Assert.AreEqual(0, e.Trials.ClearedLv("hades"));
        }

        // ---------------- mirror 型（大魔闘演武の対戦） ----------------

        [Test]
        public void MirrorPower_StaysWithinTenPercentOfTheOwnParty_AndFollowsTheSeed()
        {
            var e = new Env();
            TrialDef arena = Data.Trials.Trials.First(t => t.Id == "arena");
            Assert.IsTrue(arena.IsMirrorKind);
            double own = e.Strong.Sum(u => u.Stats.Power);
            double lo = double.MaxValue, hi = 0;
            for (ulong seed = 1; seed <= 200; seed++)
            {
                double p = TrialService.MirrorPower(arena, e.Strong, seed);
                Assert.GreaterOrEqual(p, own * 0.9 - 1e-6);
                Assert.LessOrEqual(p, own * 1.1 + 1e-6);
                lo = Math.Min(lo, p); hi = Math.Max(hi, p);
            }
            Assert.Greater(hi - lo, own * 0.1, "シードで値が散らばっている");
            Assert.AreEqual(TrialService.MirrorPower(arena, e.Strong, 5), TrialService.MirrorPower(arena, e.Strong, 5));
        }

        [Test]
        public void TheArena_PaysAFixedAmountPerWin_AndKeepsCountingWins()
        {
            var e = new Env();
            TrialResult r = e.Trials.Challenge("arena", e.Strong, 1);
            Assert.IsTrue(r.Success);
            if (r.Cleared)
            {
                Assert.AreEqual(190.0, e.Wallet.Balance("tournament_point"), 1e-9);          // 19 × 固定Lv10 ＝ 190（実測：勝つと魔闘ポイント190）
                Assert.AreEqual(1, e.Trials.ClearedLv("arena"));
                Assert.AreEqual(10, r.RewardLv);
            }
            var weak = new Env();
            TrialResult lost = weak.Trials.Challenge("arena", weak.Weak, 1);                 // 同じ戦力の相手には、弱い編成でも互角に戦える
            Assert.IsTrue(lost.Success);
            Assert.AreEqual(5, weak.Trials.Charges("arena") + (lost.RewardGranted ? 1 : 0), 1e-9);   // 1日5回
        }
    }
}
