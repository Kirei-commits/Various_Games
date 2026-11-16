using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Util;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>機能の解放：ランクで開く（docs/01 6.1節）。</summary>
    public class UnlockTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private static GameSession Locked()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 1UL, null, unlockAll: false);
            s.Debug.GrantCharacter("chr_001");
            s.Debug.GrantCurrency("gem", 1);
            s.DrainEvents();
            return s;
        }

        [Test]
        public void TheTable_FollowsTheDesign()
        {
            Assert.AreEqual(2, Data.Unlocks.RankOf("memory_card"));      // ランク2：記憶カード・図鑑
            Assert.AreEqual(2, Data.Unlocks.RankOf("zukan"));
            Assert.AreEqual(3, Data.Unlocks.RankOf("plaza_familiar"));   // ランク3：使い魔の里
            Assert.AreEqual(4, Data.Unlocks.RankOf("leader_temple"));    // ランク4：リーダー神殿
            Assert.AreEqual(5, Data.Unlocks.RankOf("plaza_spirit"));     // ランク5：霊界
            Assert.AreEqual(6, Data.Unlocks.RankOf("research"));         // ランク6：研究ツリー・霊石版
            Assert.AreEqual(6, Data.Unlocks.RankOf("stones"));
            Assert.AreEqual(7, Data.Unlocks.RankOf("dragon_nest"));      // ランク7：竜の巣
            Assert.AreEqual(9, Data.Unlocks.RankOf("leader_tree"));      // ランク9：リーダー特殊ツリー
            Assert.AreEqual(1, Data.Unlocks.RankOf("something_unlisted"));   // 表に無い機能は最初から
        }

        [Test]
        public void EveryGatedCommand_IsLockedAtRank1_AndOpensAtItsRank()
        {
            GameSession s = Locked();
            Assert.IsFalse(s.IsUnlocked("memory_card"));
            Assert.IsFalse(s.State.IsUnlocked("memory_card"));
            Assert.IsTrue(s.State.IsUnlocked("trial_battle_rush"));     // ランク1から
            var locked = new List<string>
            {
                s.PullMemoryCard(out _).Failure, s.SellMemoryCard("x").Failure, s.AutoPullMemoryCard(new AutoGachaSettings(), 1, out _).Failure,
                s.RaiseMemoryGachaLevel().Failure, s.EquipMemoryCard("x", 0).Failure, s.UnequipMemoryCard(0).Failure,
                s.SetLeader("chr_001").Failure, s.SetLeaderElement(null).Failure, s.LevelUpLeader().Failure,
                s.LevelUpPlaza("familiar").Failure, s.LevelUpPlazaMax("spirit").Failure,
                s.LevelUpDragonNode("valor.1.t1.atk").Failure, s.ResetDragonNest(Element.Valor).Failure,
                s.EquipStone(0, 0, "x").Failure, s.UnequipStone(0, 0).Failure, s.LevelUpStone("x").Failure, s.DismantleStone("x").Failure,
                s.DismantleStonesUpTo(0, out _).Failure,
                s.LevelUpTreeNode("lab", "lab_atk_01").Failure, s.LevelUpTreeNode("leader", "leader_atk").Failure,
                s.SetTarot(0, "hp", "N").Failure, s.ClearTarot(0).Failure, s.RaiseCollectionSet("silver").Failure, s.SyncZukan(out _).Failure,
            };
            Assert.IsTrue(locked.All(f => f == "Locked"), string.Join(",", locked));
            Assert.AreEqual(TrialFailure.Locked, s.ChallengeTrial("dragon").Failure);
            Assert.AreEqual(TrialFailure.Locked, s.SweepTrial("dragon").Failure);
            Assert.IsEmpty(s.DrainEvents(), "解放前のコマンドは何も起こさない");
        }

        [Test]
        public void ReachingTheRank_OpensTheFeature()
        {
            GameSession s = Locked();
            Assert.AreEqual("Locked", s.SetLeader("chr_001").Failure);
            s.Debug.SetProgress(4, 1, 1);
            Assert.IsTrue(s.IsUnlocked("leader_temple"));
            Assert.AreNotEqual("Locked", s.SetLeader("chr_001").Failure);     // ★不足など別の理由で断られる
            Assert.AreEqual("Locked", s.LevelUpPlazaMax("spirit").Failure);   // 霊界はランク5
            s.Debug.SetProgress(5, 1, 1);
            Assert.AreNotEqual("Locked", s.LevelUpPlazaMax("spirit").Failure);
            Assert.AreEqual("Locked", s.LevelUpDragonNode("valor.1.t1.atk").Failure);
            s.Debug.SetProgress(7, 1, 1);
            Assert.AreNotEqual("Locked", s.LevelUpDragonNode("valor.1.t1.atk").Failure);
            Assert.AreNotEqual(TrialFailure.Locked, s.ChallengeTrial("dragon").Failure);
        }

        [Test]
        public void DevMode_OpensEverything()
        {
            GameSession s = Locked();
            s.Debug.SetDevMode(true);
            Assert.IsTrue(s.IsUnlocked("dragon_nest"));
            Assert.AreNotEqual("Locked", s.LevelUpDragonNode("valor.1.t1.atk").Failure);
        }

        [Test]
        public void TheLockedState_SurvivesNothing_ItIsRecomputedFromTheRank()
        {
            var store = new MemorySaveStore();
            var clock = new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc));
            GameSession a = GameSession.LoadOrCreate(Data, store, clock, 1UL, null, unlockAll: false);
            a.Debug.SetProgress(6, 1, 1);
            a.Save();
            GameSession b = GameSession.LoadOrCreate(Data, store, clock, 1UL, null, unlockAll: false);
            Assert.IsTrue(b.IsUnlocked("research"));
            Assert.IsFalse(b.IsUnlocked("dragon_nest"));
        }
    }
}
