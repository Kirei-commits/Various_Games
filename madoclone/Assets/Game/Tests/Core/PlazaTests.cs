using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>広場（使い魔の里・霊界）：実測との一致、費用、効果、セーブ。</summary>
    public class PlazaTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 1UL);
            public Wallet.Wallet Wallet;
            public PlazaService Plazas;
            public bool Dev;

            public Env(double familiar = 0, double spirit = 0)
            {
                var state = new WalletState();
                state.Balances["familiar_power"] = familiar;
                state.Balances["spirit_power"] = spirit;
                Wallet = new Wallet.Wallet(Data.Currencies, state, () => Dev);
                Plazas = new PlazaService(Data, Save, Wallet);
            }
        }

        [Test]
        public void Pct_MatchesTheMeasuredPlazaValues()
        {
            var e = new Env();
            Assert.AreEqual(5538.0, e.Plazas.Pct("familiar", 51), 1e-9);                                 // 実測：Lv51 で +5,538％
            Assert.AreEqual(5668.0, e.Plazas.Pct("familiar", 52), 1e-9);                                 // Lv52 で +5,668％（1Lv あたり +130％）
            Assert.AreEqual(0.0, e.Plazas.Pct("familiar", 1), 1e-9);
            Assert.AreEqual(6574.0, e.Plazas.Pct("spirit", 40), 1e-9);                                   // 実測：Lv40 で +6,574％
            Assert.AreEqual(6774.0, e.Plazas.Pct("spirit", 41), 1e-9);                                   // Lv41 で +6,774％
            Assert.AreEqual(5538.0 + 130.0 * 149, e.Plazas.Pct("familiar", 200), 1e-9);                  // 上限 Lv200：24,908％（6.4節の 26,000％の約96％）
            Assert.AreEqual(6574.0 + 200.0 * 110, e.Plazas.Pct("spirit", 150), 1e-9);                    // 上限 Lv150：28,574％（30,000％の約95％）
            for (int lv = 2; lv <= 200; lv++) { Assert.Greater(e.Plazas.Pct("familiar", lv), e.Plazas.Pct("familiar", lv - 1)); }
            Assert.Throws<ArgumentException>(() => e.Plazas.Pct("familiar", 0));
            Assert.Throws<ArgumentException>(() => e.Plazas.Pct("familiar", 201));
            Assert.Throws<ArgumentException>(() => e.Plazas.Pct("nope", 1));
        }

        [Test]
        public void CostToNext_MatchesTheMeasuredCosts()
        {
            var e = new Env();
            Assert.AreEqual(2522.0, e.Plazas.CostToNext("familiar", 51), 1e-9);   // Lv51→52
            Assert.AreEqual(2264.0, e.Plazas.CostToNext("spirit", 40), 1e-9);     // Lv40→41
            Assert.Greater(e.Plazas.CostToNext("familiar", 52), e.Plazas.CostToNext("familiar", 51));
            Assert.Throws<ArgumentException>(() => e.Plazas.CostToNext("familiar", 200));
            Assert.Throws<ArgumentException>(() => e.Plazas.CostToNext("familiar", 0));
        }

        [Test]
        public void LevelUp_Pays_AndLevelsAreIndependentPerPlaza()
        {
            var e = new Env(familiar: 1e6);
            double cost = e.Plazas.CostToNext("familiar", 1);
            PlazaResult r = e.Plazas.LevelUp("familiar");
            Assert.IsTrue(r.Success);
            Assert.AreEqual(2, r.NewLv);
            Assert.AreEqual(cost, r.Spent);
            Assert.AreEqual(1e6 - cost, e.Wallet.Balance("familiar_power"), 1e-6);
            Assert.AreEqual(2, e.Plazas.Lv("familiar"));
            Assert.AreEqual(1, e.Plazas.Lv("spirit"));
            Assert.AreEqual(PlazaFailure.UnknownPlaza, e.Plazas.LevelUp("nope").Failure);
        }

        [Test]
        public void LevelUp_WithoutMaterial_ChangesNothing()
        {
            var e = new Env(familiar: 1);
            PlazaResult r = e.Plazas.LevelUp("familiar");
            Assert.AreEqual(PlazaFailure.NotEnough, r.Failure);
            Assert.AreEqual(1, e.Plazas.Lv("familiar"));
            Assert.AreEqual(1, e.Wallet.Balance("familiar_power"));
        }

        [Test]
        public void LevelUpMax_SpendsWhatItCan_AndStopsAtTheCap()
        {
            var e = new Env(familiar: 5000);
            PlazaResult r = e.Plazas.LevelUpMax("familiar");
            Assert.IsTrue(r.Success);
            Assert.Greater(r.LevelsGained, 1);
            double left = e.Wallet.Balance("familiar_power");
            Assert.Less(left, e.Plazas.CostToNext("familiar", r.NewLv));        // もう1つ上げる分は残っていない
            Assert.AreEqual(PlazaFailure.NotEnough, new Env(familiar: 0).Plazas.LevelUpMax("familiar").Failure);

            var dev = new Env { Dev = true };
            Assert.AreEqual(200, dev.Plazas.LevelUpMax("familiar").NewLv);
            Assert.AreEqual(PlazaFailure.AtMaxLv, dev.Plazas.LevelUpMax("familiar").Failure);
            Assert.AreEqual(PlazaFailure.AtMaxLv, dev.Plazas.LevelUp("familiar").Failure);
            Assert.AreEqual(PlazaFailure.UnknownPlaza, dev.Plazas.LevelUpMax("nope").Failure);
        }

        [Test]
        public void Source_AddsBothPlazasToTheGlobalRing_ForEveryCharacter()
        {
            var e = new Env();
            e.Save.Plazas.Levels["familiar"] = 51;
            e.Save.Plazas.Levels["spirit"] = 40;
            var sink = new List<Modifier>();
            new PlazaSource(Data, e.Save).Collect(sink, default(StatQuery));
            double expected = 5538.0 + 6574.0;
            foreach (StatId stat in new[] { StatId.Atk, StatId.Hp, StatId.Def })
            {
                Assert.AreEqual(expected, sink.Where(m => m.Stat == stat && m.Pool == ModifierPool.Global).Sum(m => m.Value), 1e-9);
            }
            // まだ上げていない広場（Lv1）は 0％
            var fresh = new List<Modifier>();
            new PlazaSource(Data, SaveData.CreateNew(1, "", 1UL)).Collect(fresh, default(StatQuery));
            Assert.AreEqual(0.0, fresh.Where(m => m.Stat == StatId.Hp).Sum(m => m.Value), 1e-9);
        }

        [Test]
        public void Source_ClampsALevelOutsideTheRange()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            save.Plazas.Levels["familiar"] = 9999;
            save.Plazas.Levels["spirit"] = -5;
            save.Plazas.Levels["unknown"] = 3;
            var sink = new List<Modifier>();
            new PlazaSource(Data, save).Collect(sink, default(StatQuery));
            Assert.AreEqual(5538.0 + 130.0 * 149 + 0.0, sink.Where(m => m.Stat == StatId.Atk).Sum(m => m.Value), 1e-9);
        }

        [Test]
        public void Save_RoundTripsLevels_KeepsUnknownPlazasWithAWarning_AndRepairsBadLevels()
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            s.Plazas.Levels["familiar"] = 12;
            s.Plazas.Levels["ghost"] = 3;
            byte[] bytes = SaveCodec.Serialize(s);
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(12, r.Save.Plazas.Levels["familiar"]);
            Assert.IsTrue(r.Issues.Any(i => i.Code == "PLAZA_UNKNOWN" && i.Severity == SaveSeverity.Warning));
            CollectionAssert.AreEqual(bytes, SaveCodec.Serialize(r.Save));

            s.Plazas.Levels["familiar"] = 500;
            Assert.IsTrue(SaveValidator.Validate(s, Data).Any(i => i.Code == "PLAZA_LV" && i.Severity == SaveSeverity.Error));
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(200, s.Plazas.Levels["familiar"]);
            s.Plazas.Levels["familiar"] = 0;
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(1, s.Plazas.Levels["familiar"]);
            Assert.AreEqual(3, s.Plazas.Levels["ghost"]);                      // 知らない広場は触らない

            string bad = System.Text.Encoding.UTF8.GetString(bytes).Replace("\"familiar\":12", "\"familiar\":\"x\"");
            Assert.IsFalse(SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(bad), Data).Success);
        }

        [Test]
        public void Session_LevelsPlazas_AndTheBattleStatsFollow()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 3UL);
            s.Debug.GrantCurrency("familiar_power", 50000);
            s.Debug.GrantCurrency("spirit_power", 50000);
            s.DrainEvents();
            Assert.AreEqual("NotEnough", NewPoor().LevelUpPlaza("familiar").Failure);
            Assert.IsTrue(s.LevelUpPlaza("familiar").Success);
            Assert.IsTrue(s.LevelUpPlazaMax("spirit").Success);
            Assert.AreEqual(2, s.State.PlazaLv("familiar"));
            Assert.Greater(s.State.PlazaLv("spirit"), 2);
            Assert.AreEqual(1, s.State.PlazaLv("nope"));
            IReadOnlyList<GameEvent> evs = s.DrainEvents();
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.PlazaLevelUp && x.Id == "familiar" && x.Value == 2));
            Assert.AreEqual("UnknownPlaza", s.LevelUpPlaza("nope").Failure);
        }

        private static GameSession NewPoor()
        {
            return GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 3UL);
        }
    }
}
