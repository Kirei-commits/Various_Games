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
    }
}
