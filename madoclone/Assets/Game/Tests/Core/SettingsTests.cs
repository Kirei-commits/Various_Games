using System.Collections.Generic;
using Mado.Core.Session;
using Mado.Core.Save;
using Mado.Core.Util;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>設定（戦闘速度・自動ボス・演出スキップ）と、自動周回の1歩。</summary>
    public class SettingsTests
    {
        private static GameSession New(MemorySaveStore store = null)
        {
            return GameSession.LoadOrCreate(TestData.Data, store ?? new MemorySaveStore(), new FixedClock(new System.DateTime(2026, 11, 16, 0, 0, 0, System.DateTimeKind.Utc)), 5UL, null);
        }

        [Test]
        public void SetSettings_StoresValues_AndEmitsEvent()
        {
            GameSession s = New();
            Assert.AreEqual(1, s.State.BattleSpeed);
            Assert.IsFalse(s.State.AutoBoss);
            Assert.IsTrue(s.SetSettings(3, true, false).Success);
            Assert.AreEqual(3, s.State.BattleSpeed);
            Assert.IsTrue(s.State.AutoBoss);
            Assert.IsFalse(s.State.SkipGachaAnim);
            Assert.AreEqual(GameEventKind.SettingsChanged, s.DrainEvents()[0].Kind);
        }

        [TestCase(0.5)]
        [TestCase(5.5)]
        [TestCase(double.NaN)]
        public void SetSettings_RejectsOutOfRangeSpeed(double v)
        {
            GameSession s = New();
            CommandResult r = s.SetSettings(v, true, true);
            Assert.IsFalse(r.Success);
            Assert.AreEqual("InvalidSpeed", r.Failure);
            Assert.AreEqual(1, s.State.BattleSpeed);
        }

        [Test]
        public void AutoStep_WithoutParty_FailsLikeFight()
        {
            GameSession s = New();
            Assert.IsFalse(s.AutoStep().Command.Success);
        }

        private static GameSession NewAt(FixedClock clock) { return GameSession.LoadOrCreate(TestData.Data, new MemorySaveStore(), clock, 5UL, null); }
        private static readonly System.DateTime T0 = new System.DateTime(2026, 11, 16, 0, 0, 0, System.DateTimeKind.Utc);

        [Test]
        public void GrowthSpeed_MultipliesIdleRewards_ButNotTheTimeCap()
        {
            var clock = new FixedClock(T0);
            GameSession a = NewAt(clock), b = NewAt(clock);
            Assert.IsTrue(b.SetGrowthSpeed(5).Success);
            clock.Advance(System.TimeSpan.FromHours(2));
            Assert.AreEqual(a.State.PendingIdle.Exp * 5, b.State.PendingIdle.Exp, 1e-6);
            Assert.AreEqual(a.State.PendingIdle.Elapsed, b.State.PendingIdle.Elapsed);
        }

        [Test]
        public void GrowthSpeed_MultipliesTheGateCharges()
        {
            var clock = new FixedClock(T0);
            GameSession a = NewAt(clock), b = NewAt(clock);
            b.SetGrowthSpeed(4);
            double a0 = a.State.TrialCharges("battle_rush"), b0 = b.State.TrialCharges("battle_rush");
            clock.Advance(System.TimeSpan.FromDays(1));
            double da = a.State.TrialCharges("battle_rush") - a0, db = b.State.TrialCharges("battle_rush") - b0;
            Assert.Greater(da, 0);
            Assert.AreEqual(da * 4, db, 1e-6);
        }

        [Test]
        public void ChangingTheSpeedDoesNotMultiplyThePast()
        {
            var clock = new FixedClock(T0);
            GameSession a = NewAt(clock), b = NewAt(clock);
            clock.Advance(System.TimeSpan.FromHours(10));
            double before = a.State.TrialCharges("battle_rush");
            Assert.IsTrue(b.SetGrowthSpeed(5).Success);                    // 10時間たってから変える：それまでの分は元の速さ
            Assert.AreEqual(before, b.State.TrialCharges("battle_rush"), 1e-6);
            Assert.IsTrue(b.State.PendingIdle.IsEmpty || b.State.PendingIdle.Exp < 1e-6, "変える前の放置報酬は受け取り済み");
        }

        [TestCase(0)]
        [TestCase(6)]
        public void GrowthSpeed_RejectsOutOfRange(int v)
        {
            GameSession s = New();
            Assert.AreEqual("InvalidSpeed", s.SetGrowthSpeed(v).Failure);
            Assert.AreEqual(1, s.State.GrowthSpeed);
        }

        [Test]
        public void GrowthSpeed_SurvivesSaveAndLoad()
        {
            var store = new MemorySaveStore();
            GameSession s = New(store);
            s.SetGrowthSpeed(3);
            s.Save();
            Assert.AreEqual(3, New(store).State.GrowthSpeed);
        }
    }
}
