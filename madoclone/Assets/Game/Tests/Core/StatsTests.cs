using System;
using System.Collections.Generic;
using System.IO;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    public class StatsTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static StatResolver Plain() { return new StatResolver(Data); }

        private sealed class FixedSource : IModifierSource
        {
            private readonly Modifier[] _mods;
            public FixedSource(params Modifier[] mods) { _mods = mods; }
            public void Collect(List<Modifier> sink, StatQuery query) { sink.AddRange(_mods); }
        }

        [Test]
        public void Ranged_Star0_Lv1_MatchesTable()
        {
            BattleStats s = Plain().Resolve(Data.Character("chr_102"), 0, 1, false); // 素・遠距離
            Assert.AreEqual(225, s.Atk, 1e-9);
            Assert.AreEqual(8500, s.Hp, 1e-9);
            Assert.AreEqual(60, s.Def, 1e-9);
        }

        [Test]
        public void Melee_UsesRoleMultipliers()
        {
            RoleMultiplier m = Data.Stats.ForRole(Role.Melee);
            BattleStats s = Plain().Resolve(Data.Character("chr_103"), 0, 1, false);
            Assert.AreEqual(225 * m.Atk, s.Atk, 1e-9);
            Assert.AreEqual(8500 * m.Hp, s.Hp, 1e-9);
            Assert.AreEqual(60 * m.Def, s.Def, 1e-9);
        }

        [Test]
        public void LrTier_Multiplies_ByTierMultiplier()
        {
            CharacterDef lr = Data.Character("chr_001");
            RoleMultiplier m = Data.Stats.ForRole(lr.Role);
            BattleStats s = Plain().Resolve(lr, 0, 1, false);
            Assert.AreEqual(225 * m.Atk * 1.1, s.Atk, 1e-9);
        }

        [Test]
        public void StarAndLv_ScaleTheBase_AndRangeIsChecked()
        {
            CharacterDef c = Data.Character("chr_102");
            LevelRow row = Data.Stats.LevelTable[59];
            BattleStats s = Plain().Resolve(c, 4, 60, false);
            Assert.AreEqual(row.Atk * Data.Stats.StarMultipliers[4], s.Atk, 1e-6);
            Assert.Throws<ArgumentException>(() => Plain().Resolve(c, 0, 51, false)); // ★0 の最大は50
            Assert.Throws<ArgumentException>(() => Plain().Resolve(c, 0, 0, false));
            Assert.Throws<ArgumentException>(() => Plain().Resolve(c, 12, 1, false));
            Assert.Throws<ArgumentException>(() => Plain().Resolve(c, -1, 1, false));
        }

        [Test]
        public void Substats_BaseAndBonusesUpToStar()
        {
            CharacterDef c = Data.Character("chr_101"); // ★2 critRate+3, ★4 critDamage+50, ★8 critDefense+30, ★10 critResist+5
            BaseSubstats b = Data.System.BaseSubstats;
            BattleStats s0 = Plain().Resolve(c, 0, 1, false);
            Assert.AreEqual(b.CritRatePct, s0.CritRatePct);
            Assert.AreEqual(b.AccuracyPct, s0.AccuracyPct);
            BattleStats s3 = Plain().Resolve(c, 3, 1, false);
            Assert.AreEqual(b.CritRatePct + 3, s3.CritRatePct);
            Assert.AreEqual(b.CritDamagePct, s3.CritDamagePct); // ★4 の分はまだ
            BattleStats s10 = Plain().Resolve(c, 10, 1, false);
            Assert.AreEqual(b.CritDamagePct + 50, s10.CritDamagePct);
            Assert.AreEqual(b.CritDefensePct + 30, s10.CritDefensePct);
            Assert.AreEqual(b.CritResistPct + 5, s10.CritResistPct);
        }

        [Test]
        public void Pools_ComposeByMultiplication_AndLeaderLvOnlyForLeader()
        {
            var src = new FixedSource(
                new Modifier(StatId.Atk, ModifierPool.Global, 100),
                new Modifier(StatId.Atk, ModifierPool.DragonNest, 50),
                new Modifier(StatId.Atk, ModifierPool.LeaderLv, 20));
            var r = new StatResolver(Data, new IModifierSource[] { src });
            CharacterDef c = Data.Character("chr_102");
            BattleStats member = r.Resolve(c, 0, 1, false);
            BattleStats leader = r.Resolve(c, 0, 1, true);
            Assert.AreEqual(225 * 2.0 * 1.5, member.Atk, 1e-9);
            Assert.AreEqual(225 * 2.0 * 1.5 * 1.2, leader.Atk, 1e-9);
            Assert.AreEqual(8500, member.Hp, 1e-9); // Hp には効かない
        }

        [Test]
        public void SamePool_Adds_BeforeMultiplying()
        {
            var src = new FixedSource(
                new Modifier(StatId.Atk, ModifierPool.Global, 100),
                new Modifier(StatId.Atk, ModifierPool.Global, 50));
            BattleStats s = new StatResolver(Data, new IModifierSource[] { src }).Resolve(Data.Character("chr_102"), 0, 1, false);
            Assert.AreEqual(225 * 2.5, s.Atk, 1e-9);
        }

        [Test]
        public void FlatModifiers_AddToSubstats_AndAttackSpeedIsCapped()
        {
            var src = new FixedSource(
                new Modifier(StatId.CritRate, ModifierPool.Flat, 7),
                new Modifier(StatId.AttackSpeed, ModifierPool.Flat, 50));
            var r = new StatResolver(Data, new IModifierSource[] { src });
            BattleStats s = r.Resolve(Data.Character("chr_102"), 0, 1, false);
            Assert.AreEqual(Data.System.BaseSubstats.CritRatePct + 7, s.CritRatePct);
            Assert.AreEqual(1.5, s.AttackSpeed, 1e-12);
            var huge = new StatResolver(Data, new IModifierSource[] { new FixedSource(new Modifier(StatId.AttackSpeed, ModifierPool.Flat, 100000)) });
            Assert.AreEqual(Data.System.AttackSpeedMax, huge.Resolve(Data.Character("chr_102"), 0, 1, false).AttackSpeed);
            Assert.AreEqual(1.0, Plain().Resolve(Data.Character("chr_102"), 0, 1, false).AttackSpeed);
        }

        [Test]
        public void Power_IsHpPlusThreeTimesAtkPlusDef_9355ForBaseRanged()
        {
            BattleStats s = Plain().Resolve(Data.Character("chr_102"), 0, 1, false);
            Assert.AreEqual(9355, s.Power, 1e-9);
        }

        [Test]
        public void ProfileModifierSource_MultipliesGlobalOnly_ZeroMeansNone()
        {
            var profile = new SimProfileDef
            {
                Rank = 1, Star = 0, Lv = 1, PartyCharacterIds = new string[0],
                GlobalMultiplier = new GlobalMultiplier { Atk = 1000, Hp = 1000, Def = 1000 },
            };
            var r = new StatResolver(Data, new IModifierSource[] { new ProfileModifierSource(profile) });
            BattleStats s = r.Resolve(Data.Character("chr_102"), 0, 1, true);
            Assert.AreEqual(9355 * 1000, s.Power, 1e-3);
            Assert.AreEqual(Data.System.BaseSubstats.CritRatePct, s.CritRatePct); // 副ステータスには入らない

            var none = new SimProfileDef { Rank = 1, Star = 0, Lv = 1, PartyCharacterIds = new string[0], GlobalMultiplier = new GlobalMultiplier() };
            var r0 = new StatResolver(Data, new IModifierSource[] { new ProfileModifierSource(none) });
            Assert.AreEqual(9355, r0.Resolve(Data.Character("chr_102"), 0, 1, true).Power, 1e-9);
        }

        [Test]
        public void ProfileModifierSource_AddsStandardSubstats_OnlyAboveTheBaseValue()
        {
            SimProfilesFile file = SimProfiles.LoadFile(new FileDataSource(TestData.FindDataDir()));
            BaseSubstats b = Data.System.BaseSubstats;
            Func<int, BattleStats> at = rank =>
            {
                var profile = new SimProfileDef { Rank = rank, Star = 0, Lv = 1, PartyCharacterIds = new string[0], GlobalMultiplier = new GlobalMultiplier() };
                var r = new StatResolver(Data, new IModifierSource[] { new ProfileModifierSource(profile, file.AllySubstats, b) });
                return r.Resolve(Data.Character("chr_102"), 0, 1, false);
            };
            BattleStats r10 = at(10);
            Assert.AreEqual(5 + 2.5 * 10, r10.EvasionPct, 1e-9);          // 標準値 A + B×r が基本値 5 を上回る分
            Assert.AreEqual(100 + 1.5 * 10, r10.AccuracyPct, 1e-9);
            Assert.AreEqual(600 * 10, r10.CritDamagePct, 1e-9);
            Assert.AreEqual(250 * 10, r10.CritDefensePct, 1e-9);
            BattleStats r1 = at(1);
            Assert.AreEqual(b.CritResistPct, r1.CritResistPct, 1e-9);     // 標準値 2 は基本値 10 より小さいので足さない
            Assert.AreEqual(b.CritDamagePct, r1.CritDamagePct, 1e-9);     // 600 < 1000
        }

        [Test]
        public void Resolve_IsPure_SameInputSameOutput()
        {
            CharacterDef c = Data.Character("chr_001");
            BattleStats a = Plain().Resolve(c, 7, 80, true);
            BattleStats b = Plain().Resolve(c, 7, 80, true);
            Assert.AreEqual(a.Atk, b.Atk);
            Assert.AreEqual(a.Power, b.Power);
        }

        [Test]
        public void SimProfiles_FileLoads()
        {
            IReadOnlyList<SimProfileDef> p = SimProfiles.Load(new FileDataSource(TestData.FindDataDir()));
            Assert.IsNotNull(p);
        }
    }
}
