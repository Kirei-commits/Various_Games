using System;
using System.Linq;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>放置報酬：上限・端数・時計の巻き戻し・壊れた時刻・セーブ。</summary>
    public class IdleServiceTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static readonly DateTime T0 = new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc);

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 1UL);
            public Wallet.Wallet Wallet;
            public FixedClock Clock = new FixedClock(T0);
            public IdleService Idle;

            public Env(int rank = 4)
            {
                Save.Progress.Rank = rank;
                Wallet = new Wallet.Wallet(Data.Currencies, new WalletState(), () => false);
                Idle = new IdleService(Data, Save, Wallet, Clock);
            }
        }

        [Test]
        public void Pending_BeforeStarting_IsEmpty_AndClaimStartsTheCount()
        {
            var e = new Env();
            Assert.IsTrue(e.Idle.Pending().IsEmpty);
            e.Clock.Advance(TimeSpan.FromHours(5));
            Assert.IsTrue(e.Idle.Claim().IsEmpty);            // まだ数え始めていないので、過去ぶんは出ない
            Assert.AreEqual(0, e.Wallet.Balance("exp"));
            e.Clock.Advance(TimeSpan.FromMinutes(10));
            Assert.IsFalse(e.Idle.Pending().IsEmpty);          // 受け取りが数え始めになった
        }

        [Test]
        public void Claim_PaysExpCoinAndBondHeart_FromTheRankAndElapsedTime()
        {
            var e = new Env(rank: 4);
            e.Idle.EnsureStarted();
            e.Clock.Advance(TimeSpan.FromHours(2));
            IdleReport r = e.Idle.Claim();
            double perEnemy = Data.Rewards.ExpPerEnemy[3];
            Assert.AreEqual(perEnemy * Data.Rewards.IdleKillsPerMinute * 120, r.Exp, 1e-6);
            Assert.AreEqual(r.Exp * Data.Rewards.IdleCoinPerExp, r.Coin, 1e-6);
            Assert.AreEqual(Data.Rewards.IdleBondHeartPerHour * 2, r.BondHeart, 1e-9);
            Assert.AreEqual(r.Exp, e.Wallet.Balance("exp"), 1e-6);
            Assert.AreEqual(r.Coin, e.Wallet.Balance("coin"), 1e-6);
            Assert.AreEqual(r.BondHeart, e.Wallet.Balance("bond_heart"), 1e-9);
            Assert.IsFalse(r.Capped);
            Assert.IsTrue(e.Idle.Pending().IsEmpty);           // 受け取ったので、また 0 から
            Assert.IsTrue(e.Idle.Claim().IsEmpty);
        }

        [Test]
        public void HigherRanks_PayMoreForTheSameTime()
        {
            double[] exp = new double[2];
            int[] ranks = { 1, 20 };
            for (int i = 0; i < 2; i++)
            {
                var e = new Env(rank: ranks[i]);
                e.Idle.EnsureStarted();
                e.Clock.Advance(TimeSpan.FromHours(1));
                exp[i] = e.Idle.Pending().Exp;
            }
            Assert.Greater(exp[0], 0);
            Assert.Greater(exp[1], exp[0] * 2);
        }

        [Test]
        public void Elapsed_IsCappedAtTheConfiguredHours()
        {
            var e = new Env();
            e.Idle.EnsureStarted();
            e.Clock.Advance(TimeSpan.FromDays(10));
            IdleReport r = e.Idle.Pending();
            Assert.IsTrue(r.Capped);
            Assert.AreEqual(TimeSpan.FromHours(Data.Rewards.IdleCapHours), r.Elapsed);
            Assert.AreEqual(Data.Rewards.IdleBondHeartPerHour * Data.Rewards.IdleCapHours, r.BondHeart, 1e-9);

            var exact = new Env();
            exact.Idle.EnsureStarted();
            exact.Clock.Advance(TimeSpan.FromHours(Data.Rewards.IdleCapHours));
            Assert.IsFalse(exact.Idle.Pending().Capped);       // ちょうど上限は「切った」ではない
        }

        [Test]
        public void ShorterThanOneMinute_IsNotClaimed_AndKeepsTheFraction()
        {
            var e = new Env();
            e.Idle.EnsureStarted();
            e.Clock.Advance(TimeSpan.FromSeconds(59));
            Assert.IsTrue(e.Idle.Claim().IsEmpty);
            e.Clock.Advance(TimeSpan.FromSeconds(61));         // 合わせて 2 分。捨てられていない
            Assert.AreEqual(2.0, e.Idle.Claim().Elapsed.TotalMinutes, 1e-9);
        }

        [Test]
        public void ClockGoingBack_PaysNothing_AndDoesNotMoveTheBase()
        {
            var e = new Env();
            e.Idle.EnsureStarted();
            e.Clock.Advance(TimeSpan.FromHours(3));
            e.Clock.Set(T0 - TimeSpan.FromHours(1));           // 時計を過去へ
            IdleReport back = e.Idle.Claim();
            Assert.IsTrue(back.ClockWentBack);
            Assert.IsTrue(back.IsEmpty);
            Assert.AreEqual(0, e.Wallet.Balance("exp"));
            e.Clock.Set(T0 + TimeSpan.FromHours(1));           // 基準（T0）から1時間：正しく数える
            Assert.AreEqual(1.0, e.Idle.Claim().Elapsed.TotalHours, 1e-9);
        }

        [Test]
        public void BrokenBaseTime_RestartsTheCount_InsteadOfThrowing()
        {
            var e = new Env();
            e.Save.Idle.LastClaimUtc = "not a date";
            Assert.DoesNotThrow(() => e.Idle.Pending());
            Assert.IsTrue(e.Idle.Pending().IsEmpty);
            e.Idle.EnsureStarted();
            StringAssert.StartsWith("2026-11-16", e.Save.Idle.LastClaimUtc);
        }

        [Test]
        public void EnsureStarted_DoesNotOverwriteAnExistingBase()
        {
            var e = new Env();
            e.Idle.EnsureStarted();
            string first = e.Save.Idle.LastClaimUtc;
            e.Clock.Advance(TimeSpan.FromHours(1));
            e.Idle.EnsureStarted();
            Assert.AreEqual(first, e.Save.Idle.LastClaimUtc);
        }

        [Test]
        public void TheBaseTime_SurvivesASaveRoundTrip_AndKeepsCounting()
        {
            var e = new Env();
            e.Idle.EnsureStarted();
            LoadResult r = SaveCodec.Load(SaveCodec.Serialize(e.Save), Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(e.Save.Idle.LastClaimUtc, r.Save.Idle.LastClaimUtc);
            var again = new IdleService(Data, r.Save, e.Wallet, new FixedClock(T0 + TimeSpan.FromHours(4)));
            Assert.AreEqual(4.0, again.Pending().Elapsed.TotalHours, 1e-9);
        }

        [Test]
        public void DayOfIdle_IsWorthAboutOneRankClear()
        {
            // 24時間の放置は、そのランクを1回クリアしたぶんの経験値の1〜2倍の範囲（放置が主役にならず、無視できる量でもない）
            var e = new Env(rank: 10);
            e.Idle.EnsureStarted();
            e.Clock.Advance(TimeSpan.FromHours(24));
            double day = e.Idle.Pending().Exp;
            var calc = new RewardCalculator(Data);
            double clear = calc.ExpPerEnemy(10) * calc.KillsPerRankClear;
            Assert.That(day / clear, Is.InRange(0.5, 2.0));
        }
    }
}
