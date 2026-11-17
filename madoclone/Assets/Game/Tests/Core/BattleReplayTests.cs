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
    /// <summary>BattleReplay：記録した出来事から、刻みごとの HP・生死・画面に出す数字を作る。</summary>
    public class BattleReplayTests
    {
        private static BattleSetup Duel()
        {
            UnitSetup a = U("a", atk: 300, hp: 2000); a.Normal = Attack(100);
            UnitSetup e = U("e", atk: 100, hp: 5000); e.Normal = Attack(100);
            return S(a, e, limit: 200);
        }

        [Test]
        public void Record_BuildsUnitsInTheSimOrder_AndKeepsTheResult()
        {
            BattleSetup s = Duel();
            s.Supports.Add(U("sup", atk: 0, hp: 1));
            BattleReplay r = BattleReplay.Record(s);
            Assert.AreEqual(3, r.Units.Count);
            Assert.AreEqual(new[] { "a", "e", "sup" }, r.Units.Select(u => u.Id).ToArray());
            Assert.AreEqual(Side.Ally, r.Units[0].Side);
            Assert.AreEqual(Side.Enemy, r.Units[1].Side);
            Assert.IsTrue(r.Units[2].IsSupport);
            Assert.IsNotNull(r.Result);
            Assert.AreEqual(new BattleSim(s).RunToEnd(null).EventHash, r.Result.EventHash);   // 記録しても結果は同じ
            Assert.Throws<System.ArgumentNullException>(() => BattleReplay.Record(null));
        }

        [Test]
        public void AdvanceTo_AppliesEventsUpToTheTick_AndTheFinalStateMatchesTheSim()
        {
            BattleSetup s = Duel();
            var sim = new BattleSim(s);
            sim.RunToEnd(null);
            BattleReplay r = BattleReplay.Record(s);
            Assert.AreEqual(-1, r.CurrentTick);
            Assert.AreEqual(2000, r.Units[0].Hp);
            var floats = new List<FloatText>();
            r.AdvanceTo(15, floats);
            Assert.AreEqual(15, r.CurrentTick);
            Assert.Less(r.Units[1].Hp, 5000);                                         // 最初の攻撃は当たっている
            Assert.IsTrue(floats.All(f => f.Tick <= 15));
            double midHp = r.Units[1].Hp;
            r.AdvanceTo(15);
            Assert.AreEqual(midHp, r.Units[1].Hp);                                    // 同じ刻みをもう一度進めても変わらない
            r.AdvanceTo(r.Result.EndTick, floats);
            Assert.IsTrue(r.Finished);
            for (int i = 0; i < 2; i++)
            {
                Assert.AreEqual(sim.Hp(i), r.Units[i].Hp, 1e-6, "ユニット" + i);
                Assert.AreEqual(sim.IsAlive(i), r.Units[i].Alive, "ユニット" + i);
            }
        }

        [Test]
        public void SkipToEnd_GivesTheSameFinalStateAsPlayingTickByTick()
        {
            BattleSetup s = Duel();
            BattleReplay a = BattleReplay.Record(s), b = BattleReplay.Record(s);
            for (int t = 0; t <= a.Result.EndTick; t++) { a.AdvanceTo(t); }
            b.SkipToEnd();
            for (int i = 0; i < a.Units.Count; i++)
            {
                Assert.AreEqual(a.Units[i].Hp, b.Units[i].Hp, 1e-9);
                Assert.AreEqual(a.Units[i].Alive, b.Units[i].Alive);
            }
            Assert.AreEqual(a.Result.EndTick, b.CurrentTick);
            Assert.IsTrue(b.Finished);
        }

        [Test]
        public void FloatTexts_CarryDamageCritHealAndMiss()
        {
            UnitSetup a = U("a", atk: 100, hp: 1e6); a.Normal = Attack(100);
            a.Stats = new BattleStats { Atk = 100, Hp = 1e6, AccuracyPct = 100, CritRatePct = 100, CritDamagePct = 1000, CritDefensePct = 0, AttackSpeed = 1 };
            UnitSetup e = U("e", atk: 0, hp: 1e6);
            e.Stats = new BattleStats { Atk = 0, Hp = 1e6, EvasionPct = 0, CritResistPct = 0, AttackSpeed = 1 };
            BattleReplay r = BattleReplay.Record(S(a, e, limit: 30));
            var floats = new List<FloatText>();
            r.SkipToEnd(floats);
            Assert.IsTrue(floats.Any(f => f.Kind == FloatKind.Crit && f.Unit == 1 && f.Value > 0));

            UnitSetup healer = U("h", atk: 100, hp: 1000);
            healer.Special = Interval(10, new ResolvedEffect { Type = EffectType.Heal, Target = TargetType.AllyLowestHp, MultiplierPct = 100 });
            UnitSetup foe = U("f", atk: 50, hp: 1e6); foe.Normal = Attack(100);
            var hr = BattleReplay.Record(S(healer, foe, limit: 60));
            var hf = new List<FloatText>();
            hr.SkipToEnd(hf);
            Assert.IsTrue(hf.Any(f => f.Kind == FloatKind.Heal));
            Assert.LessOrEqual(hr.Units[0].Hp, hr.Units[0].MaxHp);
        }

        [Test]
        public void Shields_AbsorbDamageFirst_AndDeathZeroesTheHp()
        {
            UnitSetup a = U("a", atk: 10, hp: 100);
            UnitSetup e = U("e", atk: 1000, hp: 1e9); e.Normal = Attack(100);
            BattleReplay r = BattleReplay.Record(S(a, e, limit: 100));
            r.SkipToEnd();
            Assert.IsFalse(r.Units[0].Alive);
            Assert.AreEqual(0, r.Units[0].Hp);
            Assert.AreEqual(0, BattleReplay.HpRatio(r.Units[0]));
            Assert.AreEqual(1.0, BattleReplay.HpRatio(r.Units[1]), 0.01);

            // シールドの記録だけを直接流して、ダメージが先に削ることを確かめる
            var replay = BattleReplay.Record(S(U("x", hp: 100), U("y", hp: 100), limit: 1));
            replay.OnEvent(new BattleEvent(5, BattleEventType.Shield, 0, 0, 50, 0));
            replay.OnEvent(new BattleEvent(6, BattleEventType.Damage, 1, 0, 70, 0));
            replay.AdvanceTo(10);
            Assert.AreEqual(80, replay.Units[0].Hp, 1e-9);                           // 70 のうち 50 をシールドが受け、HP は 20 減る
            Assert.AreEqual(0, replay.Units[0].Shield, 1e-9);
            Assert.AreEqual(0, BattleReplay.HpRatio(new ReplayUnit { MaxHp = 0 }));
        }

        [Test]
        public void ARealMasterBuiltBattle_ReplaysToTheSimFinalAliveFlags()
        {
            var builder = new BattleSetupBuilder(TestData.Data, new StatResolver(TestData.Data));
            List<UnitSetup> allies = new List<UnitSetup> { builder.BuildAlly("chr_001", 0, 50, null, false), builder.BuildAlly("chr_002", 0, 50, null, false) };
            List<UnitSetup> enemies = new StageFactory(TestData.Data).BuildWithPower(1, 1e8, StageKind.Wave, 1.0, 1.0);
            BattleSetup s = builder.Assemble(allies, enemies, 3, 30);
            var sim = new BattleSim(s);
            sim.RunToEnd(null);
            BattleReplay r = BattleReplay.Record(s);
            r.SkipToEnd();
            for (int i = 0; i < sim.UnitCount; i++) { Assert.AreEqual(sim.IsAlive(i), r.Units[i].Alive, "ユニット" + i); }
        }
    }
}
