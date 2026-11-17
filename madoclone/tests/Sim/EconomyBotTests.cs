using System.Collections.Generic;
using System.Linq;
using Mado.Core.Tests;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Sim.Tests
{
    /// <summary>経済シミュレーション：遊び手に遊ばせて、「1〜2時間で★6魔晶まで届く」（docs/01 第10章 フェーズ2の完了条件）を確かめる。</summary>
    public class EconomyBotTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private static List<EconomyPoint> Play(int minutes, ulong seed)
        {
            var source = new FileDataSource(TestData.FindDataDir());
            SimProfilesFile profiles = SimProfiles.LoadFile(source);
            return new EconomyBot(Data, profiles.Items, profiles.AllySubstats, seed).Run(minutes);
        }

        [Test]
        public void AStarSixCharacter_IsReachedWithinTwoHours_AndNotInTheFirstTenMinutes()
        {
            List<EconomyPoint> pts = Play(120, 1);
            Assert.AreEqual(12, pts.Count);
            Assert.Less(pts[0].MaxStar, 6, "10分で★6は早すぎる");
            Assert.GreaterOrEqual(pts[pts.Count - 1].MaxStar, 6, "2時間で★6に届かない（経済の校正：rewards.json の awakenShardPerEnemy など）");
        }

        [Test]
        public void TheGrowthOnlyGoesUp_AndTheRunIsDeterministic()
        {
            List<EconomyPoint> a = Play(60, 3), b = Play(60, 3);
            for (int i = 1; i < a.Count; i++)
            {
                Assert.GreaterOrEqual(a[i].MaxStar, a[i - 1].MaxStar);
                Assert.GreaterOrEqual(a[i].Rank, a[i - 1].Rank);
                Assert.GreaterOrEqual(a[i].GachaPulls, a[i - 1].GachaPulls);
            }
            for (int i = 0; i < a.Count; i++)
            {
                Assert.AreEqual(a[i].MaxStar, b[i].MaxStar);
                Assert.AreEqual(a[i].PartyAvgLv, b[i].PartyAvgLv);
                Assert.AreEqual(a[i].Exp, b[i].Exp);
            }
        }

        [Test]
        public void TheBotStartsWithTheSameTicketsAsTheGame()
        {
            Assert.AreEqual(30, EconomyBot.StarterTickets);
            List<EconomyPoint> pts = Play(10, 1);
            Assert.AreEqual(30, pts[0].GachaPulls);                    // 最初のチケット30枚ぶんだけ引く
            Assert.GreaterOrEqual(pts[0].Owned, 6);
        }

        private static EconomyBot Bot(bool real)
        {
            var source = new FileDataSource(TestData.FindDataDir());
            SimProfilesFile profiles = SimProfiles.LoadFile(source);
            return new EconomyBot(Data, profiles.Items, profiles.AllySubstats, 2UL, real);
        }

        [Test]
        public void RunDays_RecordsEachDay_AndTheIdleHoursPayOut()
        {
            EconomyBot bot = Bot(false);
            var seen = new List<int>();
            bot.OnDay = p => seen.Add(p.Day);
            List<DayPoint> days = bot.RunDays(2, 0.2);
            CollectionAssert.AreEqual(new[] { 1, 2 }, seen);
            Assert.AreEqual(2, days.Count);
            Assert.GreaterOrEqual(days[1].Rank, days[0].Rank);
            Assert.IsTrue(days[0].Balances.ContainsKey("gem"));
            Assert.Greater(bot.Flow("exp").Key, 0, "経験値が入っている（戦闘・放置）");
        }

        [Test]
        public void TheRealGrowthBot_UsesTheGrowthSystems_InsteadOfTheStandInProfile()
        {
            EconomyBot bot = Bot(true);
            bot.RunDays(2, 2.0);
            Assert.Greater(bot.Flow("coin").Value, 0, "育成にコインを使っている（記憶カード・竜の巣など）");
        }
    }
}
