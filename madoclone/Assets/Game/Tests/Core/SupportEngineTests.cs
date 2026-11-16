using System.Collections.Generic;
using System.Linq;
using Mado.Core.Battle;
using Mado.Data;
using NUnit.Framework;
using static Mado.Core.Tests.Kit;

namespace Mado.Core.Tests
{
    /// <summary>サポート（使い魔・契約霊・竜）のエンジン側：周期・平均攻撃力・狙われない・勝敗に数えない。</summary>
    public class SupportEngineTests
    {
        private static UnitSetup Support(ResolvedSkill special)
        {
            UnitSetup u = U("sup", atk: 0, hp: 1);
            u.Stats = new Mado.Core.Stats.BattleStats { Atk = 0, Hp = 1, Def = 0, AccuracyPct = 1000, AttackSpeed = 1.0, CritDamagePct = 1000, CritDefensePct = 1000 };
            u.Special = special;
            return u;
        }

        [Test]
        public void ASupport_FiresOnItsInterval_WithTheAverageAttackOfTheAllies()
        {
            UnitSetup a1 = U("a1", atk: 100, hp: 1e9), a2 = U("a2", atk: 300, hp: 1e9);
            UnitSetup enemy = U("e", atk: 0, hp: 1e9, def: 0);
            BattleSetup s = S(new[] { a1, a2 }, new[] { enemy }, limit: 100);
            s.Supports.Add(Support(Interval(30, Dmg(300, TargetType.EnemyAll))));
            var log = new EventLog();
            new BattleSim(s).RunToEnd(log);
            int supportIndex = 2 + 1;                                             // 味方2＋敵1 の次
            List<BattleEvent> hits = log.Of(BattleEventType.Damage).Where(e => e.Source == supportIndex).ToList();
            Assert.AreEqual(new[] { 30, 60, 90 }, hits.Select(h => h.Tick).ToArray());   // 3秒ごと
            Assert.AreEqual(200 * 3.0, hits[0].Value, 1e-6);                      // 平均攻撃力 200 × 300％（防御 0）
        }

        [Test]
        public void TheAverageIgnoresDeadAllies()
        {
            UnitSetup strong = U("s", atk: 400, hp: 1e9), frail = U("f", atk: 100, hp: 1);
            UnitSetup enemy = U("e", atk: 1000, hp: 1e12);
            enemy.Normal = Attack(100);
            BattleSetup s = S(new[] { strong, frail }, new[] { enemy }, limit: 300);
            s.Supports.Add(Support(Interval(250, Dmg(100, TargetType.EnemyAll))));
            var log = new EventLog();
            new BattleSim(s).RunToEnd(log);
            List<BattleEvent> hits = log.Of(BattleEventType.Damage).Where(e => e.Source == 3).ToList();
            Assert.AreEqual(1, hits.Count);
            Assert.AreEqual(400.0, hits[0].Value, 1e-6, "frail が先に倒れていれば、平均は strong だけの 400");
        }

        [Test]
        public void ASupportIsNeverTargeted_AndNeverCountsForTheOutcome()
        {
            UnitSetup ally = U("a", atk: 0, hp: 50);
            UnitSetup enemy = U("e", atk: 1000, hp: 1e9);
            enemy.Normal = Attack(100);
            BattleSetup s = S(ally, enemy, limit: 600);
            s.Supports.Add(Support(Interval(600, Dmg(100, TargetType.EnemyAll))));
            var log = new EventLog();
            BattleResult r = new BattleSim(s).RunToEnd(log);
            Assert.AreEqual(BattleOutcome.Lose, r.Outcome, "味方が全滅すれば、サポートが残っていても負け");
            Assert.IsTrue(log.Of(BattleEventType.Damage).All(e => e.Target != 2), "サポートが攻撃されている");
        }

        [Test]
        public void TheWinIsDecidedByTheEnemiesOnly()
        {
            UnitSetup ally = U("a", atk: 1e6, hp: 1e9);
            ally.Normal = Attack(100);
            UnitSetup enemy = U("e", atk: 0, hp: 100);
            BattleSetup s = S(ally, enemy, limit: 600);
            s.Supports.Add(Support(Interval(600, Dmg(100, TargetType.EnemyAll))));
            Assert.AreEqual(BattleOutcome.Win, new BattleSim(s).RunToEnd(null).Outcome);
        }

        [Test]
        public void ASupportHeal_HealsTheLowestHpAlly_ByTheAverageAttack()
        {
            UnitSetup healthy = U("h", atk: 100, hp: 1000), hurt = U("u", atk: 300, hp: 1000);
            UnitSetup enemy = U("e", atk: 300, hp: 1e12);
            enemy.Normal = Attack(100);
            enemy.Stats = new Mado.Core.Stats.BattleStats { Atk = 300, Hp = 1e12, Def = 0, AccuracyPct = 1000, AttackSpeed = 1.0, CritDamagePct = 1000, CritDefensePct = 1000 };
            BattleSetup s = S(new[] { healthy, hurt }, new[] { enemy }, limit: 60);
            var heal = new ResolvedEffect { Type = EffectType.Heal, Target = TargetType.AllyLowestHp, MultiplierPct = 200 };
            s.Supports.Add(Support(Interval(25, heal)));
            var log = new EventLog();
            new BattleSim(s).RunToEnd(log);
            List<BattleEvent> heals = log.Of(BattleEventType.Heal).Where(e => e.Source == 3).ToList();
            Assert.IsNotEmpty(heals, "サポートの回復が一度も出ていない");
            Assert.LessOrEqual(heals[0].Value, 200 * 2.0 + 1e-6);               // 平均攻撃力 200 × 200％ が上限（HP の欠けが小さければもっと小さい）
            Assert.Less(heals[0].Target, 2);
        }

        [Test]
        public void ASupportIgnoresElementAdvantage()
        {
            double Damage(Element enemyElement)
            {
                UnitSetup ally = U("a", atk: 100, hp: 1e9, el: Element.Valor);
                UnitSetup enemy = U("e", atk: 0, hp: 1e9, el: enemyElement);
                BattleSetup s = S(ally, enemy, limit: 40);
                s.Supports.Add(Support(Interval(30, Dmg(100, TargetType.EnemyAll))));
                var log = new EventLog();
                new BattleSim(s).RunToEnd(log);
                return log.Of(BattleEventType.Damage).First(e => e.Source == 2).Value;
            }
            // 勇に有利・不利・どちらでもない属性の敵でも、同じダメージ
            double d0 = Damage(Element.Valor), d1 = Damage(Element.Skill), d2 = Damage(Element.Heart), d3 = Damage(Element.Wisdom);
            Assert.AreEqual(d0, d1, 1e-9);
            Assert.AreEqual(d0, d2, 1e-9);
            Assert.AreEqual(d0, d3, 1e-9);
        }

        [Test]
        public void SupportsAreDeterministic_AndDontChangeBattlesWithoutThem()
        {
            UnitSetup Ally() { var a = U("a", atk: 200, hp: 5000); a.Normal = Attack(100); return a; }
            UnitSetup Enemy() { var e = U("e", atk: 100, hp: 8000); e.Normal = Attack(100); return e; }
            ulong without = new BattleSim(S(Ally(), Enemy())).RunToEnd(null).EventHash;
            BattleSetup a1 = S(Ally(), Enemy()); a1.Supports.Add(Support(Interval(30, Dmg(300, TargetType.EnemyAll))));
            BattleSetup a2 = S(Ally(), Enemy()); a2.Supports.Add(Support(Interval(30, Dmg(300, TargetType.EnemyAll))));
            Assert.AreEqual(new BattleSim(a1).RunToEnd(null).EventHash, new BattleSim(a2).RunToEnd(null).EventHash);
            Assert.AreNotEqual(without, new BattleSim(a1).RunToEnd(null).EventHash);
            Assert.AreEqual(without, new BattleSim(S(Ally(), Enemy())).RunToEnd(null).EventHash);   // サポートなしは変わらない
        }

        [Test]
        public void TheSetupIsNotMutated_SoRunningTwiceGivesTheSameResult()
        {
            UnitSetup ally = U("a", atk: 250, hp: 1e9);
            UnitSetup enemy = U("e", atk: 0, hp: 1e9);
            BattleSetup s = S(ally, enemy, limit: 100);
            UnitSetup sup = Support(Interval(30, Dmg(100, TargetType.EnemyAll)));
            s.Supports.Add(sup);
            ulong first = new BattleSim(s).RunToEnd(null).EventHash;
            Assert.AreEqual(0, sup.Stats.Atk);                                   // 共有している Setup の攻撃力は書き換えない
            Assert.AreEqual(first, new BattleSim(s).RunToEnd(null).EventHash);
        }
    }
}
