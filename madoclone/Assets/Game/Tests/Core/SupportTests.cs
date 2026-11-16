using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>サポート（使い魔・契約霊・竜）：持っているか・セット・戦闘用ユニット・戦闘での発動・セーブ。</summary>
    public class SupportTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static readonly DateTime T0 = new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc);

        private sealed class Boost : IModifierSource
        {
            public void Collect(List<Modifier> sink, StatQuery q)
            {
                foreach (StatId st in new[] { StatId.Atk, StatId.Hp, StatId.Def }) { sink.Add(new Modifier(st, ModifierPool.Global, 1e12)); }
            }
        }

        private static (SupportService Service, SaveData Save) New()
        {
            SaveData save = SaveData.CreateNew(1, "", 1UL);
            var builder = new BattleSetupBuilder(Data, new StatResolver(Data));
            return (new SupportService(Data, save, builder.Skills), save);
        }

        private static void Unlock(SaveData save, string trial, int lv)
        {
            save.Trials[trial] = new TrialState { ClearedLv = lv };
        }

        [Test]
        public void TheDataFollowsTheSpec_PeriodsAndSlotCounts()
        {
            foreach (SupportDef d in Data.Supports.Supports)
            {
                double expected = d.Kind == SupportKind.Familiar ? 6 : d.Kind == SupportKind.Spirit ? 12 : 15;
                Assert.AreEqual(expected, d.IntervalSec, d.Id);
            }
            Assert.AreEqual(5, Data.Supports.Supports.Count(s => s.Kind == SupportKind.Familiar));   // 使い魔A〜E
            Assert.AreEqual(6, Data.Supports.Supports.Count(s => s.Kind == SupportKind.Spirit));     // 契約霊A〜F
            Assert.AreEqual(3, Data.Supports.Supports.Count(s => s.Kind == SupportKind.Dragon));     // 竜A〜C
            // 使い魔は試練のレベル5・10・15・20・25で1体ずつ仲間になる
            CollectionAssert.AreEqual(new[] { 5, 10, 15, 20, 25 }, Data.Supports.Supports.Where(s => s.Kind == SupportKind.Familiar).Select(s => s.UnlockLv));
        }

        [Test]
        public void Ownership_FollowsTheUnlockTrialLevel()
        {
            var (svc, save) = New();
            Assert.IsFalse(svc.IsOwned("familiar_a"));
            Unlock(save, "edrasu", 4);
            Assert.IsFalse(svc.IsOwned("familiar_a"));
            Unlock(save, "edrasu", 12);
            Assert.IsTrue(svc.IsOwned("familiar_a"));
            Assert.IsTrue(svc.IsOwned("familiar_b"));
            Assert.IsFalse(svc.IsOwned("familiar_c"));
            CollectionAssert.AreEqual(new[] { "familiar_a", "familiar_b" }, svc.Owned(SupportKind.Familiar));
            Assert.IsEmpty(svc.Owned(SupportKind.Dragon));
            Assert.IsFalse(svc.IsOwned("nope"));
        }

        [Test]
        public void Set_NeedsOwnership_PicksTheSlotByKind_AndClearWorks()
        {
            var (svc, save) = New();
            Assert.AreEqual(SupportFailure.NotOwned, svc.Set("default", "familiar_a"));
            Assert.AreEqual(SupportFailure.UnknownSupport, svc.Set("default", "nope"));
            Unlock(save, "edrasu", 5); Unlock(save, "spirit_king", 5); Unlock(save, "dragon", 5);
            Assert.AreEqual(SupportFailure.None, svc.Set("default", "familiar_a"));
            Assert.AreEqual(SupportFailure.None, svc.Set("default", "spirit_a"));
            Assert.AreEqual(SupportFailure.None, svc.Set("default", "dragon_a"));
            PartyState p = save.Parties["default"];
            Assert.AreEqual("familiar_a", p.Familiar);
            Assert.AreEqual("spirit_a", p.Spirit);
            Assert.AreEqual("dragon_a", p.Dragon);
            Assert.AreEqual(SupportFailure.None, svc.Clear("default", SupportKind.Spirit));
            Assert.IsNull(p.Spirit);
            Assert.AreEqual(SupportFailure.None, svc.Clear("default", SupportKind.Familiar));
            Assert.AreEqual(SupportFailure.None, svc.Clear("default", SupportKind.Dragon));
            Assert.AreEqual(SupportFailure.UnknownParty, svc.Clear("other", SupportKind.Dragon));
        }

        [Test]
        public void BuildUnits_ReturnsOnlyOwnedEquippedSupports_InTheOrderFamiliarSpiritDragon()
        {
            var (svc, save) = New();
            Assert.IsEmpty(svc.BuildUnits("default"));
            Unlock(save, "edrasu", 5); Unlock(save, "spirit_king", 5); Unlock(save, "dragon", 5);
            svc.Set("default", "dragon_a"); svc.Set("default", "familiar_a"); svc.Set("default", "spirit_a");
            List<UnitSetup> units = svc.BuildUnits("default");
            CollectionAssert.AreEqual(new[] { "familiar_a", "spirit_a", "dragon_a" }, units.Select(u => u.Id));
            Assert.AreEqual(60, units[0].Special.Trigger.EveryTicks);       // 使い魔：6秒
            Assert.AreEqual(120, units[1].Special.Trigger.EveryTicks);      // 契約霊：12秒
            Assert.AreEqual(150, units[2].Special.Trigger.EveryTicks);      // 竜：15秒
            Save("x");
            save.Trials["dragon"].ClearedLv = 0;                             // 試練の記録が消えたら、持っていない扱いで出てこない
            Assert.AreEqual(2, svc.BuildUnits("default").Count);
            Assert.IsEmpty(svc.BuildUnits("nope"));
        }

        private static void Save(string _) { }

        [Test]
        public void FamiliarStars_ExtendTheEffectDurationByOneSecondEach()
        {
            var (svc, save) = New();
            Unlock(save, "edrasu", 5);
            int baseTicks = svc.Build("familiar_a").Special.Effects[0].DurationTicks;
            Assert.AreEqual(20, baseTicks);                                   // 2秒
            save.Supports.Stars["familiar_a"] = 3;
            Assert.AreEqual(50, svc.Build("familiar_a").Special.Effects[0].DurationTicks);   // ★3 で +3秒
            Assert.AreEqual(3, svc.Star("familiar_a"));
            Assert.AreEqual(0, svc.Star("familiar_b"));
            Unlock(save, "spirit_king", 5);
            save.Supports.Stars["spirit_a"] = 5;
            Assert.AreEqual(30, svc.Build("spirit_a").Special.Effects[1].DurationTicks);     // 契約霊は★で延びない
            Assert.Throws<ArgumentException>(() => svc.Build("nope"));
        }

        // ---------------- 戦闘での効果 ----------------

        [Test]
        public void ASpiritSupport_DealsDamageToTheEnemiesInARealBattle()
        {
            var (svc, save) = New();
            Unlock(save, "spirit_king", 5);
            svc.Set("default", "spirit_a");
            var builder = new BattleSetupBuilder(Data, new StatResolver(Data));
            List<UnitSetup> allies = new List<UnitSetup> { builder.BuildAlly("chr_001", 0, 50, null, false) };
            // 敵は倒れず（HP を極端に大きく）、味方も倒れない（攻撃を極端に小さく）：60秒のあいだ契約霊が何回か発動する
            List<UnitSetup> enemies = new StageFactory(Data).BuildWithPower(1, 1e7, StageKind.Wave, 1e9, 1e-9);
            BattleSetup withSupport = builder.Assemble(allies, enemies, 1, 60, svc.BuildUnits("default"));
            var log = new EventLog();
            BattleResult r = new BattleSim(withSupport).RunToEnd(log);
            int supportIndex = allies.Count + enemies.Count;
            Assert.IsTrue(log.Of(BattleEventType.Damage).Any(e => e.Source == supportIndex), "契約霊のダメージが出ていない：" + r.Outcome + " 終了 " + r.EndTick + " 刻み、スキル発動 " + string.Join(",", log.Of(BattleEventType.SkillFired).Take(6).Select(e => e.Source + "@" + e.Tick)) + " 支援index " + supportIndex);
            Assert.IsTrue(log.Of(BattleEventType.BuffApplied).Any(e => e.Source == supportIndex), "出血・防御ダウンが付いていない");
            Assert.AreEqual(0, new BattleSim(builder.Assemble(allies, enemies, 1, 60)).RunToEnd(null).DamageDealt.Skip(allies.Count + enemies.Count).Sum());
            Assert.Greater(r.DamageDealt[supportIndex], 0);
        }

        // ---------------- セーブ・GameSession ----------------

        [Test]
        public void Stars_RoundTrip_AreValidated_AndRepaired_AndABadSlotIsCleared()
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            s.Supports.Stars["familiar_a"] = 4;
            s.Supports.Stars["ghost"] = 2;
            s.Parties["default"] = new PartyState { Familiar = "familiar_a", Spirit = "ghost_spirit" };
            byte[] bytes = SaveCodec.Serialize(s);
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(4, r.Save.Supports.Stars["familiar_a"]);
            Assert.IsTrue(r.Issues.Count(i => i.Code == "SUPPORT_UNKNOWN") >= 2);
            CollectionAssert.AreEqual(bytes, SaveCodec.Serialize(r.Save));

            s.Supports.Stars["familiar_a"] = 99;
            s.Parties["default"].Dragon = "familiar_b";                          // 種類違い
            var issues = SaveValidator.Validate(s, Data);
            Assert.IsTrue(issues.Any(i => i.Code == "SUPPORT_STAR" && i.Severity == SaveSeverity.Error));
            Assert.IsTrue(issues.Any(i => i.Code == "SUPPORT_KIND" && i.Severity == SaveSeverity.Error));
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(SupportService.MaxStar, s.Supports.Stars["familiar_a"]);
            Assert.IsNull(s.Parties["default"].Dragon);
            Assert.AreEqual("ghost_spirit", s.Parties["default"].Spirit);        // 知らないものは触らない
            Assert.IsEmpty(SaveValidator.Validate(s, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());

            string bad = System.Text.Encoding.UTF8.GetString(bytes).Replace("\"familiar_a\":4", "\"familiar_a\":\"x\"");
            Assert.IsFalse(SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(bad), Data).Success);
        }

        [Test]
        public void Session_SetsSupports_OnceTheTrialIsCleared_AndFightsUseThem()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(T0), 7UL, new IModifierSource[] { new Boost() });
            Assert.AreEqual("NotOwned", s.SetSupport("familiar_a").Failure);
            Assert.AreEqual("UnknownSupport", s.SetSupport("nope").Failure);
            Assert.AreEqual("UnknownParty", s.ClearSupport(SupportKind.Dragon).Failure);
            s.Debug.GrantCharacter("chr_001");
            s.Debug.SetParty(new[] { "chr_001" });
            // 試練を5回クリアして使い魔Aを仲間にする（edrasu は Lv5 で解放）
            for (int i = 0; i < 5; i++) { Assert.IsTrue(s.ChallengeTrial("edrasu").Cleared, "Lv" + (i + 1)); }
            Assert.IsTrue(s.State.OwnsSupport("familiar_a"));
            CollectionAssert.AreEqual(new[] { "familiar_a" }, s.State.OwnedSupports(SupportKind.Familiar));
            s.DrainEvents();
            Assert.IsTrue(s.SetSupport("familiar_a").Success);
            Assert.IsTrue(s.DrainEvents().Any(e => e.Kind == GameEventKind.SupportChanged && e.Id == "familiar_a"));
            CollectionAssert.AreEqual(new[] { "familiar_a", null, null }, s.State.EquippedSupports);
            Assert.IsTrue(s.Debug.SetSupportStar("familiar_a", 2).Success);
            Assert.AreEqual(2, s.State.SupportStar("familiar_a"));
            Assert.AreEqual("InvalidStar", s.Debug.SetSupportStar("familiar_a", 99).Failure);
            Assert.AreEqual("UnknownSupport", s.Debug.SetSupportStar("nope", 1).Failure);
            Assert.IsTrue(s.Fight(StageKind.Wave).Command.Success);             // サポート付きでも戦える
            Assert.IsTrue(s.ChallengeTrial("phantom").Success);
            Assert.IsTrue(s.ClearSupport(SupportKind.Familiar).Success);
            CollectionAssert.AreEqual(new string[3], s.State.EquippedSupports);
        }
    }
}
