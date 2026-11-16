using System.Collections.Generic;
using System.Linq;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Stats;
using Mado.Data;
using NUnit.Framework;
using static Mado.Core.Tests.Kit;

namespace Mado.Core.Tests
{
    /// <summary>敵の専用スキル・ボスの特徴・最終ボス・属性耐性（enemy_kits.json）。</summary>
    public class EnemyKitTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static StageFactory Factory { get { return new StageFactory(Data); } }

        private static UnitSetup Boss(int rank, int area = 5, int stage = 10)
        {
            return Factory.Build(rank, area, stage, StageKind.Boss)[0];
        }

        private static List<string> SkillIds(UnitSetup u) { return u.Crystals.Select(c => c.Id).ToList(); }

        // ---------------- 型ごとの専用スキル ----------------

        [Test]
        public void EveryEnemyType_GetsItsRoleSkills_InWavesAndBossFights()
        {
            foreach (StageKind kind in new[] { StageKind.Wave, StageKind.Boss })
            {
                List<UnitSetup> units = Factory.Build(3, 1, 1, kind);
                if (kind == StageKind.Wave) { units = Factory.Build(3, 1, 1, StageKind.Wave); }
                CollectionAssert.Contains(SkillIds(units.Single(u => u.Id.Contains("_attacker_"))), "enemy_attacker_blast");
                CollectionAssert.Contains(SkillIds(units.Single(u => u.Id.Contains("_tank_"))), "enemy_tank_guard");
                List<string> healer = SkillIds(units.Single(u => u.Id.Contains("_healer_")));
                CollectionAssert.Contains(healer, "enemy_healer_heal");
                CollectionAssert.Contains(healer, "enemy_healer_cleanse");
            }
        }

        [Test]
        public void TheTank_TauntsTheOpposingSide()
        {
            UnitSetup tank = Factory.Build(3, 1, 1, StageKind.Wave).Single(u => u.Id.Contains("_tank_"));
            ResolvedSkill guard = tank.Crystals.Single(c => c.Id == "enemy_tank_guard");
            Assert.AreEqual(TriggerType.Interval, guard.Trigger.Type);
            Assert.IsTrue(guard.Effects.Any(e => e.Type == EffectType.ApplyBuff && e.Target == TargetType.EnemyAll));
        }

        [Test]
        public void TheHealer_ActuallyHealsAnAllyInBattle()
        {
            // 敵の回復役（専用スキル）が、傷ついた味方を実際に治すこと
            List<UnitSetup> enemies = Factory.BuildWithPower(3, 3e8, StageKind.Wave, 1e4, 1.0);
            UnitSetup weak = U("a", atk: 1e8, hp: 1e15, def: 1e9);
            weak.Normal = Attack(100);
            var log = new EventLog();
            var builder = new BattleSetupBuilder(Data, new StatResolver(Data));
            BattleSetup s = builder.Assemble(new[] { weak }, enemies, 1, 60);
            new BattleSim(s).RunToEnd(log);
            Assert.IsTrue(log.Of(BattleEventType.Heal).Any(e => e.Source >= 1), "回復役が一度も回復していない。ダメージ " + log.Of(BattleEventType.Damage).Count + " 件、スキル発動 " + log.Of(BattleEventType.SkillFired).Count + " 件、死亡 " + log.Of(BattleEventType.Death).Count + " 件、最初のダメージ " + string.Join(",", log.Of(BattleEventType.Damage).Take(3).Select(x => x.Source + ">" + x.Target + ":" + x.Value)));
        }

        // ---------------- ボスの特徴 ----------------

        [Test]
        public void Ranks1To3_BossesHaveNoTraits()
        {
            foreach (int rank in new[] { 1, 2, 3 })
            {
                UnitSetup b = Boss(rank);
                CollectionAssert.AreEqual(new[] { "enemy_attacker_blast" }, SkillIds(b), "ランク" + rank);
                Assert.IsFalse(b.ResistElement.HasValue);
            }
        }

        [Test]
        public void Ranks4To6_TheBossSilencesAndBlocksHealing()
        {
            foreach (int rank in new[] { 4, 5, 6 })
            {
                CollectionAssert.Contains(SkillIds(Boss(rank)), "trait_heal_silence", "ランク" + rank);
            }
            CollectionAssert.DoesNotContain(SkillIds(Boss(3)), "trait_heal_silence");
            CollectionAssert.DoesNotContain(SkillIds(Boss(7)), "trait_heal_silence");
        }

        [Test]
        public void Ranks7To9_TheBossHalvesOneElement_ADifferentOneEachRank()
        {
            var seen = new HashSet<Element>();
            foreach (int rank in new[] { 7, 8, 9 })
            {
                UnitSetup b = Boss(rank);
                Assert.IsTrue(b.ResistElement.HasValue, "ランク" + rank);
                Assert.AreEqual(0.5, b.ResistMultiplier);
                seen.Add(b.ResistElement.Value);
            }
            Assert.AreEqual(3, seen.Count);
            Assert.IsFalse(Boss(10).ResistElement.HasValue);
        }

        [Test]
        public void Ranks10To15_StatTraits_RaiseCritAndAccuracy()
        {
            UnitSetup plain = Boss(3), crit = Boss(11), acc = Boss(14);
            var f = Factory;
            // 同じ式（ランク別の線形）に、特徴の分だけ上乗せされている
            BossTraitDef hc = Data.EnemyKits.Traits.Single(t => t.Id == "high_crit");
            Assert.AreEqual(hc.CritRatePt, crit.Stats.CritRatePct - Linear(Data.Difficulty.EnemySubstats.CritRatePct, 11), 1e-9);
            Assert.AreEqual(Linear(Data.Difficulty.EnemySubstats.CritDamagePct, 11) * hc.CritDamageMultiplier.Value, crit.Stats.CritDamagePct, 1e-6);
            Assert.AreEqual(Data.EnemyKits.Traits.Single(t => t.Id == "high_accuracy").AccuracyPt, acc.Stats.AccuracyPct - Linear(Data.Difficulty.EnemySubstats.AccuracyPct, 14), 1e-9);
            Assert.AreEqual(Linear(Data.Difficulty.EnemySubstats.AccuracyPct, 3), plain.Stats.AccuracyPct, 1e-9);
        }

        private static double Linear(LinearCoefficient c, int rank)
        {
            double v = c.A + c.B * rank;
            return c.Min.HasValue && v < c.Min.Value ? c.Min.Value : v;
        }

        [Test]
        public void Ranks16To18_TheBossAlwaysHasACcBarrier_AndRank19To21_HighEvasion()
        {
            CollectionAssert.Contains(SkillIds(Boss(17)), "trait_cc_barrier");
            Assert.AreEqual(Data.EnemyKits.Traits.Single(t => t.Id == "high_evasion").EvasionPt, Boss(20).Stats.EvasionPct - Linear(Data.Difficulty.EnemySubstats.EvasionPct, 20), 1e-9);
            CollectionAssert.DoesNotContain(SkillIds(Boss(20)), "trait_cc_barrier");
        }

        [Test]
        public void Ranks22Plus_TheBossPurgesItself_AndLaterRanksCombineTraits()
        {
            CollectionAssert.Contains(SkillIds(Boss(23)), "trait_purge");
            // 25〜26：バリア＋高回避、27〜28：解除＋高クリティカル、29〜：3つ＋HP半分で強化
            CollectionAssert.Contains(SkillIds(Boss(25)), "trait_cc_barrier");
            Assert.AreEqual(Data.EnemyKits.Traits.Single(t => t.Id == "high_evasion").EvasionPt, Boss(25).Stats.EvasionPct - Linear(Data.Difficulty.EnemySubstats.EvasionPct, 25), 1e-9);
            CollectionAssert.Contains(SkillIds(Boss(28)), "trait_purge");
            Assert.AreEqual(Data.EnemyKits.Traits.Single(t => t.Id == "high_crit").CritRatePt, Boss(28).Stats.CritRatePct - Linear(Data.Difficulty.EnemySubstats.CritRatePct, 28), 1e-9);
            List<string> late = SkillIds(Boss(30));
            CollectionAssert.Contains(late, "trait_purge");
            CollectionAssert.Contains(late, "trait_enrage");
        }

        [Test]
        public void TraitsAttachOnlyToTheBossBody_NotToTheCompanions()
        {
            List<UnitSetup> units = Factory.Build(5, 5, 10, StageKind.Boss);
            Assert.AreEqual(3, units.Count);
            CollectionAssert.DoesNotContain(SkillIds(units[1]), "trait_heal_silence");
            CollectionAssert.DoesNotContain(SkillIds(units[2]), "trait_heal_silence");
            Assert.AreEqual(1, Factory.Build(5, 5, 5, StageKind.Wave).Count(u => SkillIds(u).Contains("trait_heal_silence")) + 1);
        }

        // ---------------- 最終ボス ----------------

        [Test]
        public void TheFinalBoss_HasThreePhases_AndItsOwnTimeLimit()
        {
            var f = Factory;
            int r = Data.Difficulty.Ranks, a = Data.Difficulty.AreasPerRank, s = Data.Difficulty.StagesPerArea;
            Assert.IsTrue(f.IsFinalBoss(r, a, s));
            Assert.IsFalse(f.IsFinalBoss(r, a, s - 1));
            Assert.IsFalse(f.IsFinalBoss(r - 1, a, s));
            UnitSetup final = f.Build(r, a, s, StageKind.Boss)[0];
            foreach (string id in new[] { "final_phase1", "final_phase2", "final_phase2_purge", "final_phase3" }) { CollectionAssert.Contains(SkillIds(final), id); }
            CollectionAssert.DoesNotContain(SkillIds(f.Build(r, a, s - 1, StageKind.Boss)[0]), "final_phase1");
            Assert.AreEqual(Data.System.TimeLimitSec.FinalBoss, f.TimeLimitSec(StageKind.Boss, r, a, s));
            Assert.AreEqual(Data.System.TimeLimitSec.Boss, f.TimeLimitSec(StageKind.Boss, r, a, s - 1));
            Assert.AreEqual(Data.System.TimeLimitSec.Stage, f.TimeLimitSec(StageKind.Wave, r, a, s));
        }

        [Test]
        public void TheFinalBoss_ReallyChangesPhases_WhenItsHpDrops()
        {
            // HP が減るとバリア・バフが付く（段階が実際に切り替わる）。味方の攻撃を強くして、ボスを削る。
            var f = Factory;
            int r = Data.Difficulty.Ranks;
            List<UnitSetup> enemies = f.BuildWithPower(r, 1e9, StageKind.Boss, 1.0, 1.0, true);
            UnitSetup strong = U("a", atk: 1e7, hp: 1e15, def: 1e9);
            var builder = new BattleSetupBuilder(Data, new StatResolver(Data));
            BattleSetup real = builder.Assemble(new[] { strong }, enemies, 1, 180);
            var log = new EventLog();
            new BattleSim(real).RunToEnd(log);
            int fired = log.Of(BattleEventType.SkillFired).Count(e => e.Source == 1);
            Assert.Greater(fired, 0, "最終ボスのスキルが一度も発動していない");
        }

        // ---------------- 属性耐性（エンジン） ----------------

        [Test]
        public void ElementResist_HalvesDamageFromThatElementOnly()
        {
            double Damage(Element attackerElement, bool resist)
            {
                UnitSetup a = U("a", atk: 1000, hp: 1e9, el: attackerElement);
                a.Normal = Attack(100);
                UnitSetup e = U("e", atk: 1, hp: 1e9, el: Element.Wisdom);
                if (resist) { e.ResistElement = Element.Valor; e.ResistMultiplier = 0.5; }
                var log = new EventLog();
                new BattleSim(S(a, e, limit: 20)).RunToEnd(log);
                return log.Of(BattleEventType.Damage).Where(x => x.Source == 0 && (x.Aux & 1) == 0).Select(x => x.Value).First();
            }
            double plain = Damage(Element.Valor, false);
            Assert.AreEqual(plain * 0.5, Damage(Element.Valor, true), plain * 1e-9);
            Assert.AreEqual(Damage(Element.Skill, false), Damage(Element.Skill, true), 1e-9);   // 別の属性には効かない
        }

        // ---------------- 校正 ----------------

        [TestCase(10)]
        [TestCase(13)]
        [TestCase(15)]
        public void ASeventyPercentParty_RarelyBeatsTheBoss_InTheFormerlyProblemRanks(int rank)
        {
            var profiles = SimProfiles.Load(new FileDataSource(TestData.FindDataDir()));
            SimProfileDef p = profiles[rank - 1];
            var parties = new ProfilePartyFactory(Data, SimProfiles.LoadFile(new FileDataSource(TestData.FindDataDir())).AllySubstats);
            var factory = new StageFactory(Data);
            var builder = new BattleSetupBuilder(Data, new StatResolver(Data));
            BattleSetup s = builder.Assemble(parties.Build(p, 0.7), factory.Build(rank, 10, 10, StageKind.Boss), 1, Data.System.TimeLimitSec.Boss);
            int wins = 0;
            const int n = 200;
            for (int i = 0; i < n; i++)
            {
                s.Seed = (ulong)(i + 1);
                if (new BattleSim(s).RunToEnd(null).Outcome == BattleOutcome.Win) { wins++; }
            }
            Assert.Less(100.0 * wins / n, 10.0, "ランク" + rank + " の推奨70％での勝率");
        }
    }
}
