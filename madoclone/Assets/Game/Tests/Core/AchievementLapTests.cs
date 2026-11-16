using System.Linq;
using Mado.Core.Metrics;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>周回する実績（レース）：全部の段を受け取ると次の周に進み、目標が LapScale 倍になる。</summary>
    public class AchievementLapTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 3UL);
            public Wallet.Wallet Wallet;
            public MetricCounter Metrics;
            public AchievementService Ach;

            public Env()
            {
                Wallet = new Wallet.Wallet(Data.Currencies, new WalletState(), () => false);
                Metrics = new MetricCounter(Save);
                Ach = new AchievementService(Data, Save, Wallet, Metrics);
            }
        }

        private static AchievementDef Race { get { return Data.Economy.Achievements.First(a => a.Id == "race_familiar"); } }

        [Test]
        public void FinishingEveryTier_StartsTheNextLap_WithScaledTargets()
        {
            var e = new Env();
            AchievementDef a = Race;
            double last = a.Tiers[a.Tiers.Count - 1].Target;
            e.Metrics.Add(a.Metric, last);
            Assert.AreEqual(a.Tiers.Count, e.Ach.Reached(a));
            Assert.AreEqual(AchievementFailure.None, e.Ach.Claim(a.Id, out int n));
            Assert.AreEqual(a.Tiers.Count, n);
            Assert.AreEqual(1, e.Ach.Lap(a));
            Assert.AreEqual(0, e.Ach.Claimed(a.Id));
            Assert.AreEqual(0, e.Ach.Reached(a), "新しい周は 0 から");
            Assert.AreEqual(System.Math.Ceiling(a.Tiers[0].Target * a.LapScale.Value), e.Ach.TargetOf(a, 0));
        }

        [Test]
        public void ProgressBeyondTheLastTarget_CarriesOverToTheNextLap()
        {
            var e = new Env();
            AchievementDef a = Race;
            double last = a.Tiers[a.Tiers.Count - 1].Target;
            e.Metrics.Add(a.Metric, last + 50);
            e.Ach.Claim(a.Id, out _);
            Assert.AreEqual(50, e.Ach.Progress(a), 1e-9);
        }

        [Test]
        public void ASecondLapUsesTheSecondScale_AndEndsAtThePreviousTotal()
        {
            var e = new Env();
            AchievementDef a = Race;
            double last = a.Tiers[a.Tiers.Count - 1].Target;
            e.Metrics.Add(a.Metric, last);
            e.Ach.Claim(a.Id, out _);
            double lap1Last = System.Math.Ceiling(last * a.LapScale.Value);
            e.Metrics.Add(a.Metric, lap1Last);
            Assert.AreEqual(a.Tiers.Count, e.Ach.Reached(a));
            e.Ach.Claim(a.Id, out _);
            Assert.AreEqual(2, e.Ach.Lap(a));
            Assert.AreEqual(0, e.Ach.Progress(a), 1e-9);
        }

        [Test]
        public void AnAchievementWithoutLapScale_NeverLaps()
        {
            var e = new Env();
            AchievementDef a = Data.Economy.Achievements.First(x => !x.LapScale.HasValue);
            e.Metrics.Add(a.Metric, a.Tiers[a.Tiers.Count - 1].Target);
            e.Ach.Claim(a.Id, out _);
            Assert.AreEqual(0, e.Ach.Lap(a));
            Assert.AreEqual(a.Tiers.Count, e.Ach.Claimed(a.Id));
        }

        [Test]
        public void Laps_RoundTripThroughTheSave_AndAreValidatedAndRepaired()
        {
            SaveData s = SaveData.CreateNew(1, "", 3UL);
            s.Achievements.Laps["race_familiar"] = 3;
            LoadResult r = SaveCodec.Load(SaveCodec.Serialize(s), Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(3, r.Save.Achievements.Laps["race_familiar"]);

            s.Achievements.Laps["pulls"] = 2;                       // 周回しない実績に周がある
            Assert.IsTrue(SaveValidator.Validate(s, Data).Any(i => i.Code == "ACHIEVEMENT_LAP" && i.Severity == SaveSeverity.Error));
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(0, s.Achievements.Laps["pulls"]);
            s.Achievements.Laps["race_familiar"] = -1;
            Assert.IsTrue(SaveValidator.Validate(s, Data).Any(i => i.Code == "ACHIEVEMENT_LAP"));
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(0, s.Achievements.Laps["race_familiar"]);
            s.Achievements.Laps["gone"] = 1;
            Assert.IsTrue(SaveValidator.Validate(s, Data).Any(i => i.Code == "ACHIEVEMENT_UNKNOWN"));
        }
    }
}
