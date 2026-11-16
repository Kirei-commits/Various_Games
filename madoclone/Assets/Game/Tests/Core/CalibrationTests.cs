using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Stats;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>
    /// `Mado.Sim calibrate --write` が書いた sim_profiles.json と enemyScale が、いまの戦闘ルールに合っているか。
    /// 戦闘のルール・スキル・難易度を変えて落ちたら、`dotnet run --project tools/Mado.Sim -- calibrate --write` で合わせ直す。
    /// </summary>
    public class CalibrationTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private static IReadOnlyList<SimProfileDef> Profiles()
        {
            return SimProfiles.Load(new FileDataSource(TestData.FindDataDir()));
        }

        private static ProfilePartyFactory Parties()
        {
            return new ProfilePartyFactory(Data, SimProfiles.LoadFile(new FileDataSource(TestData.FindDataDir())).AllySubstats);
        }

        private static List<UnitSetup> Party(SimProfileDef p, double ratio)
        {
            return Parties().Build(p, ratio);
        }

        private static double WinRate(SimProfileDef p, int runs)
        {
            var factory = new StageFactory(Data);
            double rec = factory.RecommendedPower(p.Rank, Data.Difficulty.AreasPerRank, Data.Difficulty.StagesPerArea);
            var builder = new BattleSetupBuilder(Data, new StatResolver(Data));
            double limit = p.Rank == Data.Difficulty.Ranks ? Data.System.TimeLimitSec.FinalBoss : Data.System.TimeLimitSec.Boss;
            BattleSetup s = builder.Assemble(Party(p, 1.0), factory.Build(p.Rank, Data.Difficulty.AreasPerRank, Data.Difficulty.StagesPerArea, StageKind.Boss), 1, limit);
            int wins = 0;
            for (int i = 0; i < runs; i++)
            {
                s.Seed = (ulong)(i + 1);
                if (new BattleSim(s).RunToEnd(null).Outcome == BattleOutcome.Win) { wins++; }
            }
            return 100.0 * wins / runs;
        }

        [Test]
        public void SimProfiles_CoverEveryRank_WithPositiveMultipliers()
        {
            IReadOnlyList<SimProfileDef> p = Profiles();
            Assert.AreEqual(Data.Difficulty.Ranks, p.Count);
            for (int i = 0; i < p.Count; i++)
            {
                Assert.AreEqual(i + 1, p[i].Rank);
                Assert.Greater(p[i].GlobalMultiplier.Atk, 0);
                Assert.AreEqual(p[i].GlobalMultiplier.Atk, p[i].GlobalMultiplier.Hp);
                Assert.LessOrEqual(p[i].Lv, Data.Stats.StarMaxLv[p[i].Star]);
                foreach (string id in p[i].PartyCharacterIds) { Assert.IsTrue(Data.TryCharacter(id, out _), id); }
            }
        }

        [Test]
        public void StandardParty_PowerEqualsTheRankBossRecommendedPower()
        {
            var factory = new StageFactory(Data);
            foreach (SimProfileDef p in Profiles())
            {
                double rec = factory.RecommendedPower(p.Rank, Data.Difficulty.AreasPerRank, Data.Difficulty.StagesPerArea);
                double power = 0;
                foreach (UnitSetup u in Party(p, 1.0)) { power += u.Stats.Power; }
                Assert.AreEqual(rec, power, rec * 1e-4, "ランク" + p.Rank);
            }
        }

        [Test]
        public void EnemyScale_IsPositiveForEveryRank()
        {
            foreach (EnemyScaleRow r in Data.Difficulty.EnemyScale)
            {
                Assert.Greater(r.Hp, 0, "ランク" + r.Rank);
                Assert.Greater(r.Atk, 0, "ランク" + r.Rank);
            }
        }

        [TestCase(1)]
        [TestCase(8)]
        [TestCase(16)]
        [TestCase(32)]
        public void BossAtRecommendedPower_IsWonAboutEightyPercentOfTheTime(int rank)
        {
            SimProfileDef p = Profiles()[rank - 1];
            double win = WinRate(p, 150);
            Assert.That(win, Is.InRange(65.0, 95.0), "ランク" + rank + " のボス勝率。戦闘ルールを変えたなら calibrate --write で合わせ直す");
        }
    }
}
