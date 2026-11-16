using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Data;
using NUnit.Framework;
using static Mado.Core.Tests.Kit;

namespace Mado.Core.Tests
{
    /// <summary>BattleSimTests の続き：使い方の誤り、上限、効果の細部。</summary>
    public class BattleSimEdgeTests
    {
        private static BattleResult Run(BattleSetup s, out EventLog log)
        {
            log = new EventLog();
            return new BattleSim(s).RunToEnd(log);
        }

        private static List<BattleEvent> Hits(EventLog log, int source, int flags = 0)
        {
            return log.Of(BattleEventType.Damage).FindAll(e => e.Source == source && (e.Aux & 7) == flags);
        }

        // ---------------- 使い方 ----------------

        [Test]
        public void Lifecycle_StartOnce_StepNeedsStart_AndStepAfterEndIsANoOp()
        {
            var sim = new BattleSim(S(U("a"), U("e"), limit: 3));
            Assert.Throws<InvalidOperationException>(() => sim.Step(null));
            sim.Start();
            Assert.Throws<InvalidOperationException>(() => sim.Start());
            while (sim.Step(null)) { }
            Assert.IsTrue(sim.Ended);
            int tick = sim.Tick;
            Assert.IsFalse(sim.Step(null));
            Assert.AreEqual(tick, sim.Tick);
        }

        [Test]
        public void NullSetup_IsRejected()
        {
            Assert.Throws<ArgumentNullException>(() => new BattleSim(null));
        }

        [Test]
        public void NoEnemies_IsAnImmediateWin_AndNoAllies_AnImmediateLoss()
        {
            BattleResult win = Run(S(new[] { U("a") }, new UnitSetup[0]), out EventLog log);
            Assert.AreEqual(BattleOutcome.Win, win.Outcome);
            Assert.AreEqual(0, win.EndTick);
            Assert.AreEqual(1, log.Of(BattleEventType.BattleEnd).Count);
            Assert.AreEqual(BattleOutcome.Lose, Run(S(new UnitSetup[0], new[] { U("e") }), out _).Outcome);
        }

        // ---------------- 上限 ----------------

        [Test]
        public void EventLimit_EmitsOneWarning_KeepsBattleEnd_AndStopsRecording()
        {
            var a = U("a"); a.Normal = Attack(1);
            var st = a.Stats; st.AttackSpeed = 5; a.Stats = st;      // 2 刻みごとに攻撃（SkillFired と Damage の2件）
            var e = U("e", hp: 1e15);
            var sim = new BattleSim(S(a, e, limit: 300000));
            var counter = new CountingSink();
            BattleResult r = sim.RunToEnd(counter);
            Assert.AreEqual(BattleOutcome.TimeUp, r.Outcome);
            Assert.AreEqual(1, counter.Warnings);
            Assert.AreEqual(WarningCode.EventLimit, counter.LastWarningAux);
            Assert.AreEqual(1, counter.Ends);
            Assert.AreEqual(BattleEventType.BattleEnd, counter.Last);
            Assert.AreEqual(BattleSim.EventLimit + 2, counter.Total);   // 上限までの記録 ＋ 警告 ＋ BattleEnd
            Assert.AreEqual(counter.Total, r.EventCount);
        }

        private sealed class CountingSink : IBattleEventSink
        {
            public int Total, Warnings, Ends, LastWarningAux;
            public BattleEventType Last;

            public void OnEvent(in BattleEvent e)
            {
                Total++;
                Last = e.Type;
                if (e.Type == BattleEventType.Warning) { Warnings++; LastWarningAux = e.Aux; }
                if (e.Type == BattleEventType.BattleEnd) { Ends++; }
            }
        }

        // ---------------- 効果の細部 ----------------

        [Test]
        public void Cleanse_RemovesDebuffsOnly_Dispel_RemovesBuffsOnly()
        {
            var a = U("a", hp: 1e6);
            a.Special = Skill("s", TriggerType.OnBattleStart,
                Buff(AtkUp, TargetType.Self, 1000, TierLevel.Supreme), Buff(AtkDown, TargetType.Self, 1000),
                Buff(AtkUp, TargetType.EnemySingle, 1000, TierLevel.Supreme), Buff(Burn, TargetType.EnemySingle, 1000));
            a.Ultimate = Cooldown(5, new ResolvedEffect { Type = EffectType.Cleanse, Target = TargetType.AllyAll },
                new ResolvedEffect { Type = EffectType.Dispel, Target = TargetType.EnemyAll });
            Run(S(a, U("e", hp: 1e9), limit: 8), out EventLog log);
            var removed = log.Of(BattleEventType.BuffRemoved);
            Assert.AreEqual(2, removed.Count);
            Assert.IsTrue(removed.Exists(x => x.Target == 0 && x.Aux / 8 == AtkDown));   // 味方のデバフ
            Assert.IsTrue(removed.Exists(x => x.Target == 1 && x.Aux / 8 == AtkUp));     // 敵の強化
        }

        [Test]
        public void Regen_HealsEverySecond_WithTheAttackAtApplyTime_AndNeverAboveMaxHp()
        {
            var a = U("a", atk: 100, hp: 1000);
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(Regen, TargetType.Self, 100));
            var e = U("e", atk: 25); e.Normal = Attack(100);        // 毎秒 25 ダメージ、回復は毎秒 10（攻撃 100 の 10%）
            // 刻みの中では「状態の更新（回復）→ 行動（被弾）」の順。tick 10 は満タンなので回復なし、20・30・40 で回復。
            Run(S(a, e, limit: 45), out EventLog log);
            var heals = log.Of(BattleEventType.Heal);
            Assert.AreEqual(3, heals.Count);
            Assert.IsTrue(heals.TrueForAll(h => Math.Abs(h.Value - 10) < 1e-9));

            var full = U("full", atk: 1e6, hp: 1000);
            full.Special = Skill("s", TriggerType.OnBattleStart, Buff(Regen, TargetType.Self, 100));
            var weak = U("e", atk: 5); weak.Normal = Attack(100);
            Run(S(full, weak, limit: 25), out EventLog capped);
            Assert.AreEqual(5, capped.Of(BattleEventType.Heal)[0].Value, 1e-9);   // 失った 5 だけ。最大 HP を超えない
        }

        [Test]
        public void AllyLowestHp_PicksTheLowestRatio_AndTheEarlierSlotOnATie()
        {
            ResolvedEffect heal = new ResolvedEffect { Type = EffectType.Heal, Target = TargetType.AllyLowestHp, MultiplierPct = 1 };
            var healer = U("h", atk: 100, hp: 1e6, row: Row.Back);
            healer.Special = Interval(15, heal);
            var x = U("x", hp: 1000, row: Row.Front);
            var y = U("y", hp: 1000, row: Row.Front);
            // 全体攻撃で x・y・h が同じ量を受ける。割合が最小なのは x と y（同率）→ 先のスロットの x。
            var e = U("e", atk: 100); e.Normal = Skill("n", TriggerType.AttackInterval, Dmg(100, TargetType.EnemyAll));
            Run(S(new[] { healer, x, y }, new[] { e }, limit: 17), out EventLog log);
            Assert.AreEqual(1, log.Of(BattleEventType.Heal)[0].Target);
        }

        [Test]
        public void TargetElementMask_FiltersTargetsByElement()
        {
            var a = U("a");
            var burnValorOnly = Buff(Burn, TargetType.EnemyAll, 100);
            burnValorOnly.TargetElementMask = 1u << (int)Element.Valor;
            a.Special = Skill("s", TriggerType.OnBattleStart, burnValorOnly);
            var valor = U("v", hp: 1e6, el: Element.Valor);
            var heart = U("h", hp: 1e6, el: Element.Heart);
            Run(S(new[] { a }, new[] { valor, heart }, limit: 3), out EventLog log);
            var applied = log.Of(BattleEventType.BuffApplied);
            Assert.AreEqual(1, applied.Count);
            Assert.AreEqual(1, applied[0].Target);
        }

        [Test]
        public void DebuffCountBonus_EnemyAllScope_UsesTheTotalForEveryEnemy()
        {
            var a = U("a");
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(Burn, TargetType.EnemySingle, 1000), Buff(AtkDown, TargetType.EnemySingle, 1000));
            a.Ultimate = Cooldown(5, new ResolvedEffect { Type = EffectType.DebuffCountBonus, CountScope = CountScope.EnemyAll, CountPerUnit = 5, CountMax = 300 }, Dmg(100, TargetType.EnemyAll));
            var e1 = U("e1", hp: 1e9, row: Row.Front);
            var e2 = U("e2", hp: 1e9, row: Row.Mid);
            Run(S(new[] { a }, new[] { e1, e2 }, limit: 7), out EventLog log);
            var hits = Hits(log, 0);
            Assert.AreEqual(2, hits.Count);
            Assert.IsTrue(hits.TrueForAll(h => Math.Abs(h.Value - 110) < 1e-9));   // 敵全体でデバフ2つ → 全員 +10
        }

        [Test]
        public void DebuffCountBonus_IsCappedAtTheMaximum()
        {
            var a = U("a");
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(Burn, TargetType.EnemySingle, 1000), Buff(AtkDown, TargetType.EnemySingle, 1000), Buff(Silence, TargetType.EnemySingle, 1000));
            a.Ultimate = Cooldown(5, new ResolvedEffect { Type = EffectType.DebuffCountBonus, CountScope = CountScope.Target, CountPerUnit = 50, CountMax = 80 }, Dmg(100));
            Run(S(a, U("e", hp: 1e9), limit: 7), out EventLog log);
            Assert.AreEqual(180, Hits(log, 0)[0].Value, 1e-9);   // 3 × 50 = 150 → 上限 80
        }

        [Test]
        public void DotKill_CreditsTheCaster_AndFiresOnKill()
        {
            var a = U("a", atk: 1000);
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(Burn, TargetType.EnemySingle, 100));   // 毎秒 100
            a.Crystals.Add(Skill("k", TriggerType.OnKill, Buff(AtkUp, TargetType.Self, 50, TierLevel.Supreme)));
            BattleResult r = Run(S(a, U("e", hp: 150), limit: 40), out EventLog log);
            Assert.AreEqual(BattleOutcome.Win, r.Outcome);
            Assert.AreEqual(20, r.EndTick);
            BattleEvent death = log.Of(BattleEventType.Death)[0];
            Assert.AreEqual(0, death.Source);
            Assert.IsTrue(log.Of(BattleEventType.BuffApplied).Exists(x => x.Target == 0 && x.Aux / 8 == AtkUp));
            Assert.AreEqual(200, r.DamageDealt[0], 1e-9);
        }

        [Test]
        public void Critical_MultipliesDamage_ByTheCritDamageDifference()
        {
            var a = U("a"); a.Normal = Attack(100);
            a.Stats = new Mado.Core.Stats.BattleStats { Atk = 100, Hp = 1000, AccuracyPct = 100, CritRatePct = 100, CritDamagePct = 1300, CritDefensePct = 1000, AttackSpeed = 1 };
            Run(S(a, U("e", hp: 1e9), limit: 12), out EventLog log);
            BattleEvent hit = Hits(log, 0, DamageFlags.Crit)[0];
            Assert.AreEqual(300, hit.Value, 1e-9);   // (1300 − 1000) ÷ 100 = 3 倍
        }

        [Test]
        public void AttackSpeed_Two_AttacksEveryFiveTicks()
        {
            var a = U("a"); a.Normal = Attack(1);
            var st = a.Stats; st.AttackSpeed = 2; a.Stats = st;
            Run(S(a, U("e", hp: 1e9), limit: 21), out EventLog log);
            CollectionAssert.AreEqual(new[] { 5, 10, 15, 20 }, Hits(log, 0).ConvertAll(h => h.Tick));
        }

        [Test]
        public void SameTier_Reapply_RefreshesTheDuration()
        {
            var a = U("a");
            a.Special = Interval(20, Buff(AtkUp, TargetType.Self, 30, TierLevel.Supreme));   // tick 20・40 に付け直す
            Run(S(a, U("e", hp: 1e9), limit: 80), out EventLog log);
            Assert.AreEqual(3, log.Of(BattleEventType.BuffApplied).Count);   // 20, 40, 60
            Assert.AreEqual(0, log.Of(BattleEventType.BuffRemoved).Count);   // 期限（+30）の前に毎回付け直すので、80 までに切れない
        }

        [Test]
        public void GaugeShift_WorksEvenWhileSilenced()
        {
            ResolvedEffect shift = new ResolvedEffect { Type = EffectType.GaugeShift, Target = TargetType.Self, ShiftTicks = 100 };
            var a = U("a");
            a.Special = Interval(10, shift);
            a.Ultimate = Cooldown(100, Dmg(1));
            var silencer = U("e", hp: 1e9);
            silencer.Special = Skill("s", TriggerType.OnBattleStart, Buff(Silence, TargetType.EnemySingle, 1000));
            Run(S(a, silencer, limit: 15), out EventLog log);
            // 沈黙でゲージは進まないが、gaugeShift で 0 になれば必殺は出る。
            Assert.IsTrue(log.Of(BattleEventType.SkillFired).Exists(x => x.Source == 0 && x.Aux == 2));
        }
    }
}
