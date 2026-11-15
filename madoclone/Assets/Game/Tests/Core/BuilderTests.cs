using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    public class BuilderTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static SkillResolver Resolver() { return new SkillResolver(Data, new BuffBook(Data)); }

        [Test]
        public void RankFor_UsesTheStarBoundaries()
        {
            Assert.AreEqual(0, SkillResolver.RankFor(Data, SkillKind.Normal, 0));
            Assert.AreEqual(1, SkillResolver.RankFor(Data, SkillKind.Normal, 1));
            Assert.AreEqual(1, SkillResolver.RankFor(Data, SkillKind.Normal, 6));
            Assert.AreEqual(2, SkillResolver.RankFor(Data, SkillKind.Normal, 7));
            Assert.AreEqual(0, SkillResolver.RankFor(Data, SkillKind.Special, 2));
            Assert.AreEqual(1, SkillResolver.RankFor(Data, SkillKind.Special, 3));
            Assert.AreEqual(2, SkillResolver.RankFor(Data, SkillKind.Ultimate, 11));
        }

        [Test]
        public void ToTicks_RoundsHalfAwayFromZero()
        {
            Assert.AreEqual(15, SkillResolver.ToTicks(1.5, 0.1));
            Assert.AreEqual(3, SkillResolver.ToTicks(0.25, 0.1));
            Assert.AreEqual(-5, SkillResolver.ToTicks(-0.5, 0.1));
        }

        [Test]
        public void BuffBook_CoversEveryBuff_WithTierSlots()
        {
            var book = new BuffBook(Data);
            Assert.AreEqual(Data.Buffs.Items.Count, book.Buffs.Count);
            ResolvedBuff atkDown = book.Buffs[book.IndexOf("atk_down")];
            Assert.IsNotNull(atkDown.Tiers[(int)TierLevel.Supreme]);
            ResolvedBuff barrier = book.Buffs[book.IndexOf("cc_barrier")];
            uint mask = barrier.Tiers[0].ImmuneToMask;
            Assert.AreNotEqual(0u, mask);
            Assert.IsTrue((mask & (1u << book.IndexOf("freeze"))) != 0);
            Assert.IsTrue((mask & (1u << book.IndexOf("bind"))) != 0);
            Assert.Throws<DataException>(() => book.IndexOf("nope"));
        }

        [Test]
        public void EveryRealSkillAndCrystal_ResolvesForEveryRank()
        {
            SkillResolver r = Resolver();
            int count = 0;
            foreach (SkillDef s in Data.Skills) { for (int rank = 0; rank < 3; rank++) { Assert.IsNotNull(r.Resolve(s, rank)); count++; } }
            foreach (CrystalDef c in Data.Crystals) { Assert.IsNotNull(r.Resolve(c, 0)); count++; }
            Assert.AreEqual(315 * 3 + 105, count);
        }

        [Test]
        public void Resolve_PicksRankedValues_AndConvertsSecondsToTicks()
        {
            SkillResolver r = Resolver();
            SkillDef u = Data.Skill("skl_chr_009_u");
            ResolvedSkill r0 = r.Resolve(u, 0), r2 = r.Resolve(u, 2);
            Assert.AreEqual(100, r0.Trigger.CooldownTicks);
            ResolvedEffect dmg0 = r0.Effects.Find(e => e.Type == EffectType.Damage);
            ResolvedEffect dmg2 = r2.Effects.Find(e => e.Type == EffectType.Damage);
            Assert.AreEqual(800, dmg0.MultiplierPct);
            Assert.AreEqual(1000, dmg2.MultiplierPct);
            Assert.AreEqual(30, r0.Effects.Find(e => e.Type == EffectType.ApplyBuff).DurationTicks);
            Assert.AreEqual(50, r2.Effects.Find(e => e.Type == EffectType.ApplyBuff).DurationTicks);
            ResolvedEffect count = r0.Effects.Find(e => e.Type == EffectType.ElementCountBonus);
            Assert.AreEqual(50, count.CountPerUnit);
            Assert.AreEqual(350, count.CountMax);
            Assert.AreEqual(CountUnit.Pct, count.CountUnit);
        }

        [Test]
        public void Resolve_SecondsCountBonus_UsesSecAsThePerUnitValue()
        {
            ResolvedSkill s = Resolver().Resolve(Data.Skill("skl_chr_010_u"), 0);
            ResolvedEffect sec = s.Effects.Find(e => e.Type == EffectType.ElementCountBonus && e.CountUnit == CountUnit.Sec);
            Assert.AreEqual(0.5, sec.CountPerUnit, 1e-9);
            Assert.AreEqual(3, sec.CountMax);
        }

        [Test]
        public void Resolve_DropsEffectsBelowMinRank_AndKeepsOnTrigger()
        {
            SkillResolver r = Resolver();
            SkillDef s = Data.Skill("skl_chr_064_s");
            Assert.IsFalse(r.Resolve(s, 0).Effects.Exists(e => e.OnTrigger.HasValue));
            Assert.IsTrue(r.Resolve(s, 1).Effects.Exists(e => e.OnTrigger == TriggerType.OnHit));
        }

        [Test]
        public void Resolve_TargetElements_BecomeAMaskPerRank()
        {
            SkillResolver r = Resolver();
            SkillDef s = Data.Skill("skl_chr_066_s");
            uint m0 = r.Resolve(s, 0).Effects[0].TargetElementMask;
            uint m2 = r.Resolve(s, 2).Effects[0].TargetElementMask;
            Assert.AreEqual((1u << (int)Element.Valor) | (1u << (int)Element.Wisdom), m0);
            Assert.AreEqual(15u, m2);
        }

        [Test]
        public void Resolve_StatusConditions_BecomeBuffMasks()
        {
            var book = new BuffBook(Data);
            var r = new SkillResolver(Data, book);
            foreach (SkillDef s in Data.Skills)
            {
                foreach (EffectDef e in s.Effects)
                {
                    if (e.If == null) { continue; }
                    ResolvedSkill rs = r.Resolve(s, 2);
                    Assert.IsTrue(rs.Effects.Exists(x => x.IfAnyStatusMask != 0));
                    return;
                }
            }
            Assert.Fail("条件つきの効果が見つからない");
        }

        // ---------------- 編成 ----------------

        [Test]
        public void FormationRules_FollowRole()
        {
            Assert.AreEqual(Row.Front, FormationRules.RowFor(Role.Melee));
            Assert.AreEqual(Row.Front, FormationRules.RowFor(Role.Defense));
            Assert.AreEqual(Row.Mid, FormationRules.RowFor(Role.Heal));
            Assert.AreEqual(Row.Back, FormationRules.RowFor(Role.Ranged));
            Assert.AreEqual(Row.Back, FormationRules.RowFor(Role.Disrupt));
        }

        private static BattleSetupBuilder Builder()
        {
            return new BattleSetupBuilder(Data, new StatResolver(Data));
        }

        [Test]
        public void BuildAlly_ResolvesStatsSkillsAndCrystals()
        {
            UnitSetup u = Builder().BuildAlly("chr_001", 6, 60, new[] { null, null, "cry_chr_001", null, null }, false);
            Assert.AreEqual("chr_001", u.Id);
            Assert.AreEqual(Data.Character("chr_001").Element, u.Element);
            Assert.IsNotNull(u.Normal);
            Assert.IsNotNull(u.Ultimate);
            Assert.AreEqual(1, u.Crystals.Count);
            Assert.Greater(u.Stats.Hp, 0);
        }

        [Test]
        public void BuildParty_PutsSlotsFirstThenTheLeader()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            var crystals = new CrystalService(Data, save);
            var roster = new RosterService(Data, save, crystals);
            foreach (string id in new[] { "chr_101", "chr_102", "chr_103" }) { roster.TryGrant(id); }
            roster.TrySetStar("chr_103", 5);
            save.Leader = "chr_103";
            save.Parties["default"] = new PartyState { Slots = new[] { "chr_101", "chr_102", null, null, null, null } };
            List<UnitSetup> party = Builder().BuildParty(save, "default");
            CollectionAssert.AreEqual(new[] { "chr_101", "chr_102", "chr_103" }, party.ConvertAll(x => x.Id));
            Assert.IsTrue(party[2].IsLeader);
            Assert.IsFalse(party[0].IsLeader);
        }

        [Test]
        public void MasterBuiltBattle_RunsToTheEnd_AndIsDeterministic()
        {
            BattleSetupBuilder b = Builder();
            var allies = new List<UnitSetup>
            {
                b.BuildAlly("chr_101", 0, 50, null, false), b.BuildAlly("chr_102", 0, 50, null, false), b.BuildAlly("chr_103", 0, 50, null, true),
            };
            var factory = new StageFactory(Data);
            BattleSetup s = b.Assemble(allies, factory.Build(1, 1, 1, StageKind.Wave), 5UL, factory.TimeLimitSec(StageKind.Wave));
            BattleResult r1 = new BattleSim(s).RunToEnd(null);
            BattleResult r2 = new BattleSim(s).RunToEnd(null);
            Assert.AreEqual(r1.EventHash, r2.EventHash);
            Assert.AreNotEqual(0UL, r1.EventHash);
            Assert.Greater(r1.EndTick, 0);
        }

        [Test]
        public void BattleSetup_RoundTripsThroughJson_WithTheSameHash()
        {
            BattleSetupBuilder b = Builder();
            var allies = new List<UnitSetup> { b.BuildAlly("chr_101", 3, 60, null, false), b.BuildAlly("chr_064", 5, 70, null, true) };
            var factory = new StageFactory(Data);
            BattleSetup s = b.Assemble(allies, factory.Build(2, 3, 4, StageKind.Boss), 9UL, 60);
            string json = Newtonsoft.Json.JsonConvert.SerializeObject(s);
            BattleSetup back = Newtonsoft.Json.JsonConvert.DeserializeObject<BattleSetup>(json);
            Assert.AreEqual(new BattleSim(s).RunToEnd(null).EventHash, new BattleSim(back).RunToEnd(null).EventHash);
        }

        // ---------------- 敵の生成 ----------------

        [Test]
        public void StageFactory_RecommendedPower_MatchesTheDesignTable()
        {
            var f = new StageFactory(Data);
            Assert.AreEqual(45e6, f.RecommendedPower(1, 10, 10), 45e6 * 1e-9);
            Assert.AreEqual(135e6, f.RecommendedPower(2, 10, 10), 135e6 * 1e-9);
            Assert.AreEqual(1.2e9, f.RecommendedPower(4, 10, 10), 1.2e9 * 0.02);
            Assert.AreEqual(32.8e9, f.RecommendedPower(7, 10, 10), 32.8e9 * 0.01);
            Assert.AreEqual(55.1e9, f.RecommendedPower(8, 10, 10), 55.1e9 * 0.01);
        }

        [Test]
        public void StageFactory_PowerGrowsWithinARank_AndAreaBossIsBoosted()
        {
            var f = new StageFactory(Data);
            Assert.AreEqual(15e6, f.RecommendedPower(1, 1, 1), 1e-3);
            Assert.Greater(f.RecommendedPower(1, 1, 2), f.RecommendedPower(1, 1, 1));
            Assert.AreEqual(f.RecommendedPower(1, 5, 9) * 1.0, f.RecommendedPower(1, 5, 9), 0);
            double normal = f.RankStart(1) * Math.Pow(3.0, (10.0 * 4 + 9) / 100.0);
            Assert.AreEqual(normal * 1.15, f.RecommendedPower(1, 5, 10), normal * 1e-9);
            Assert.Throws<ArgumentException>(() => f.RecommendedPower(33, 1, 1));
        }

        [Test]
        public void StageFactory_WaveAndBossHaveTheExpectedShape()
        {
            var f = new StageFactory(Data);
            List<UnitSetup> wave = f.Build(5, 2, 3, StageKind.Wave);
            List<UnitSetup> boss = f.Build(5, 2, 3, StageKind.Boss);
            Assert.AreEqual(3, wave.Count);
            Assert.AreEqual(3, boss.Count);
            Assert.Greater(boss[0].Stats.Hp, wave[1].Stats.Hp);          // ボス本体は雑魚より強い
            Assert.AreEqual(Data.System.EnemyAttackSpeed, wave[0].Stats.AttackSpeed);
            Assert.IsTrue(wave.TrueForAll(e => e.Normal != null && e.Stats.AccuracyPct > 0));
        }
    }
}
