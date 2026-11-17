using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Data;
using NUnit.Framework;
using static Mado.Core.Tests.Kit;

namespace Mado.Core.Tests
{
    public class BattleSimTests
    {
        private static BattleResult Run(BattleSetup s, out EventLog log, IChanceSource chance = null)
        {
            log = new EventLog();
            var sim = chance == null ? new BattleSim(s) : new BattleSim(s, chance);
            return sim.RunToEnd(log);
        }

        private static List<BattleEvent> Hits(EventLog log, int source, int flagsMask = 0)
        {
            return log.Of(BattleEventType.Damage).FindAll(e => e.Source == source && (e.Aux & 7) == flagsMask);
        }

        // ---------------- 基本の進行 ----------------

        [Test]
        public void BasicFight_AttacksEveryTenTicks_AndWinsOnTheKillingTick()
        {
            var a = U("a"); a.Normal = Attack(100);
            var e = U("e", hp: 250);
            BattleResult r = Run(S(a, e), out EventLog log);
            Assert.AreEqual(BattleOutcome.Win, r.Outcome);
            Assert.AreEqual(30, r.EndTick);
            List<BattleEvent> hits = Hits(log, 0);
            Assert.AreEqual(3, hits.Count);
            Assert.AreEqual(10, hits[0].Tick);
            Assert.AreEqual(20, hits[1].Tick);
            Assert.AreEqual(100, hits[0].Value, 1e-9);
            Assert.AreEqual(1, log.Of(BattleEventType.Death).Count);
        }

        [Test]
        public void TimeLimit_EndsAsTimeUp()
        {
            var a = U("a"); a.Normal = Attack(1);
            var e = U("e", hp: 1e9);
            BattleResult r = Run(S(a, e, limit: 100), out _);
            Assert.AreEqual(BattleOutcome.TimeUp, r.Outcome);
            Assert.AreEqual(100, r.EndTick);
        }

        [Test]
        public void AllyActsFirst_SoAnEnemyKilledOnTheSameTickNeverActs()
        {
            var a = U("a", atk: 1000, hp: 100); a.Normal = Attack(100);
            var e = U("e", atk: 1000, hp: 100); e.Normal = Attack(100);
            BattleResult r = Run(S(a, e), out EventLog log);
            Assert.AreEqual(BattleOutcome.Win, r.Outcome);
            Assert.AreEqual(0, Hits(log, 1).Count);
        }

        [Test]
        public void Lose_WhenAllAlliesDie()
        {
            var a = U("a", hp: 50);
            var e = U("e", atk: 100); e.Normal = Attack(100);
            BattleResult r = Run(S(a, e), out _);
            Assert.AreEqual(BattleOutcome.Lose, r.Outcome);
            Assert.AreEqual(10, r.EndTick);
        }

        [Test]
        public void Element_AdvantageMultipliesDamage()
        {
            var a = U("a", el: Element.Valor); a.Normal = Attack(100);
            var e = U("e", hp: 1e6, el: Element.Skill);
            Run(S(a, e, limit: 15), out EventLog log);
            Assert.AreEqual(120, Hits(log, 0)[0].Value, 1e-9);
        }

        // ---------------- 狙い ----------------

        [Test]
        public void Targeting_FrontRowFirst_ThenNextRow()
        {
            var a = U("a", atk: 100); a.Normal = Attack(100);
            var front = U("f", hp: 100, row: Row.Front);
            var back = U("b", hp: 100, row: Row.Back);
            Run(S(new[] { a }, new[] { front, back }), out EventLog log);
            List<BattleEvent> hits = Hits(log, 0);
            Assert.AreEqual(1, hits[0].Target);   // 前列（敵の最初）
            Assert.AreEqual(2, hits[1].Target);   // 前列が倒れたので後列
        }

        [Test]
        public void EnemyArea_HitsSameRow_EnemyAll_HitsEveryone()
        {
            var a = U("a");
            a.Special = Skill("s", TriggerType.Interval, Dmg(50, TargetType.EnemyArea));
            a.Special.Trigger.EveryTicks = 10;
            a.Ultimate = Cooldown(10, Dmg(30, TargetType.EnemyAll));
            var f1 = U("f1", hp: 1e6, row: Row.Front);
            var f2 = U("f2", hp: 1e6, row: Row.Front);
            var back = U("b", hp: 1e6, row: Row.Back);
            Run(S(new[] { a }, new[] { f1, f2, back }, limit: 12), out EventLog log);
            List<BattleEvent> hits = Hits(log, 0);
            var area = hits.FindAll(h => h.Value == 50);
            var all = hits.FindAll(h => h.Value == 30);
            Assert.AreEqual(2, area.Count);
            Assert.IsTrue(area.TrueForAll(h => h.Target == 1 || h.Target == 2));
            Assert.AreEqual(3, all.Count);
        }

        // ---------------- 状態・バフ ----------------

        [Test]
        public void AtkDown_HalvesTheEnemyDamage()
        {
            var a = U("a", hp: 1e6);
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(AtkDown, TargetType.EnemySingle, 1000));
            var e = U("e", atk: 100); e.Normal = Attack(100);
            Run(S(a, e, limit: 15), out EventLog log);
            Assert.AreEqual(50, Hits(log, 1)[0].Value, 1e-9);
        }

        [Test]
        public void Buff_ExpiresAfterItsDuration()
        {
            var a = U("a");
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(AtkUp, TargetType.Self, 30, TierLevel.Supreme));
            var e = U("e", hp: 1e6);
            Run(S(a, e, limit: 50), out EventLog log);
            Assert.AreEqual(1, log.Of(BattleEventType.BuffApplied).Count);
            BattleEvent removed = log.Of(BattleEventType.BuffRemoved)[0];
            Assert.AreEqual(30, removed.Tick);
        }

        [Test]
        public void StackRule_LowerTierIgnored_HigherTierReplaces_DifferentIdsAdd()
        {
            var a = U("a"); a.Normal = Attack(100);
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(AtkUp, TargetType.Self, 100, TierLevel.High));
            a.Crystals.Add(Skill("c1", TriggerType.OnBattleStart, Buff(AtkUp, TargetType.Self, 200, TierLevel.Mid)));       // 低い段階：無視
            a.Crystals.Add(Skill("c2", TriggerType.OnBattleStart, Buff(AtkUp, TargetType.Self, 50, TierLevel.Supreme)));    // 高い段階：置き換え
            a.Crystals.Add(Skill("c3", TriggerType.OnBattleStart, Buff(AtkDown, TargetType.Self, 500)));                   // 違う ID：加算
            var e = U("e", hp: 1e6);
            Run(S(a, e, limit: 15), out EventLog log);
            Assert.AreEqual(3, log.Of(BattleEventType.BuffApplied).Count); // High, Supreme, AtkDown（Mid は付かない）
            // Supreme(+50%) と atk_down(-50%) は同じ Atk の増減として合計 → 1.0 倍
            Assert.AreEqual(100, Hits(log, 0)[0].Value, 1e-9);
        }

        [Test]
        public void StackRule_HigherTierReplace_UsesTheHigherValue()
        {
            var a = U("a"); a.Normal = Attack(100);
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(AtkUp, TargetType.Self, 100, TierLevel.High));
            a.Crystals.Add(Skill("c2", TriggerType.OnBattleStart, Buff(AtkUp, TargetType.Self, 100, TierLevel.Supreme)));
            var e = U("e", hp: 1e6);
            Run(S(a, e, limit: 15), out EventLog log);
            Assert.AreEqual(150, Hits(log, 0)[0].Value, 1e-9);
        }

        [Test]
        public void Dot_UsesTheAttackAtApplyTime_IgnoresDefense()
        {
            var a = U("a", atk: 100);
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(Burn, TargetType.EnemySingle, 50));
            a.Crystals.Add(Skill("later", TriggerType.Interval, Buff(AtkUp, TargetType.Self, 1000, TierLevel.Supreme)));
            a.Crystals[0].Trigger.EveryTicks = 5; // 付与後に攻撃力が上がる。DOT は付与時の 100 のまま
            var e = U("e", hp: 1e6, def: 99999);
            Run(S(a, e, limit: 60), out EventLog log);
            List<BattleEvent> dots = Hits(log, 0, DamageFlags.Dot);
            Assert.AreEqual(5, dots.Count);
            Assert.IsTrue(dots.TrueForAll(d => Math.Abs(d.Value - 10) < 1e-9));
            Assert.AreEqual(10, dots[0].Tick);
        }

        [Test]
        public void Silence_StopsTheUltimateGauge()
        {
            var a = U("a"); a.Ultimate = Cooldown(50, Dmg(100));
            var e = U("e", hp: 1e6);
            Run(S(a, e, limit: 120), out EventLog logPlain);
            Assert.AreEqual(2, logPlain.Of(BattleEventType.SkillFired).FindAll(x => x.Source == 0).Count); // 50 と 100

            var silencer = U("sil", hp: 1e6);
            silencer.Special = Skill("s", TriggerType.OnBattleStart, Buff(Silence, TargetType.EnemySingle, 1000));
            var a2 = U("a"); a2.Ultimate = Cooldown(50, Dmg(100));
            Run(S(a2, silencer, limit: 120), out EventLog logSilenced);
            Assert.AreEqual(0, logSilenced.Of(BattleEventType.SkillFired).FindAll(x => x.Source == 0).Count);
        }

        [Test]
        public void Freeze_SkipsActions_AndProgressResumesAfterwards()
        {
            var a = U("a"); a.Normal = Attack(100);
            var e = U("e", hp: 1e6);
            e.Special = Skill("s", TriggerType.OnBattleStart, Buff(Freeze, TargetType.EnemySingle, 25));
            Run(S(a, e, limit: 80), out EventLog log);
            Assert.AreEqual(34, Hits(log, 0)[0].Tick); // 25 で解けて、進行度 0 から 9 刻み
        }

        [Test]
        public void HealBlock_PreventsHealing()
        {
            var a = U("a", hp: 1000);
            a.Special = Skill("heal", TriggerType.Interval, new ResolvedEffect { Type = EffectType.Heal, Target = TargetType.Self, MultiplierPct = 100 });
            a.Special.Trigger.EveryTicks = 10;
            var e = U("e", atk: 100); e.Normal = Attack(100);
            Run(S(a, e, limit: 35), out EventLog log);
            Assert.AreEqual(2, log.Of(BattleEventType.Heal).Count); // tick10 は満タンで0、20・30 で回復

            var a2 = U("a", hp: 1000);
            a2.Special = Skill("heal", TriggerType.Interval, new ResolvedEffect { Type = EffectType.Heal, Target = TargetType.Self, MultiplierPct = 100 });
            a2.Special.Trigger.EveryTicks = 10;
            a2.Crystals.Add(Skill("c", TriggerType.OnBattleStart, Buff(HealBlock, TargetType.Self, 1000)));
            var e2 = U("e", atk: 100); e2.Normal = Attack(100);
            Run(S(a2, e2, limit: 35), out EventLog blocked);
            Assert.AreEqual(0, blocked.Of(BattleEventType.Heal).Count);
        }

        [Test]
        public void CcBarrier_BlocksFreeze()
        {
            var a = U("a");
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(CcBarrier, TargetType.Self, 1000));
            var e = U("e", hp: 1e6);
            e.Special = Skill("s", TriggerType.OnBattleStart, Buff(Freeze, TargetType.EnemySingle, 100));
            Run(S(a, e, limit: 20), out EventLog log);
            Assert.AreEqual(1, log.Of(BattleEventType.BuffApplied).Count); // 結界だけ。氷結は付かない
        }

        [Test]
        public void Taunt_ForcesTheEnemyToTargetTheCaster()
        {
            var front = U("front", hp: 1e6, row: Row.Front);
            var back = U("back", hp: 1e6, row: Row.Back);
            back.Special = Skill("t", TriggerType.OnBattleStart, Buff(Taunt, TargetType.EnemyAll, 1000));
            var e = U("e"); e.Normal = Attack(1);
            Run(S(new[] { front, back }, new[] { e }, limit: 60), out EventLog log);
            List<BattleEvent> hits = Hits(log, 2);
            Assert.IsNotEmpty(hits);
            Assert.IsTrue(hits.TrueForAll(h => h.Target == 1));
        }

        [Test]
        public void AlwaysEffect_IsRemovedWhenTheCasterDies()
        {
            var a = U("a", hp: 50);
            a.Special = Skill("aura", TriggerType.Always, Buff(AtkUp, TargetType.AllyAll, 0, TierLevel.Supreme));
            var b = U("b", hp: 1e6);
            var e = U("e", atk: 100); e.Normal = Attack(100);
            Run(S(new[] { a, b }, new[] { e }, limit: 40), out EventLog log);
            BattleEvent death = log.Of(BattleEventType.Death)[0];
            Assert.AreEqual(0, death.Target);
            var removed = log.Of(BattleEventType.BuffRemoved).FindAll(x => x.Target == 1);
            Assert.AreEqual(1, removed.Count);
            Assert.AreEqual(death.Tick, removed[0].Tick);
        }

        [Test]
        public void Shield_AbsorbsDamageBeforeHp()
        {
            var a = U("a", hp: 1000);
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(Shield, TargetType.Self, 1000));
            var e = U("e", atk: 100); e.Normal = Attack(100);
            var sim = new BattleSim(S(a, e, limit: 100));
            sim.Start();
            for (int i = 0; i < 40; i++) { sim.Step(null); }   // 4 回被弾 = 400 < シールド 500
            Assert.AreEqual(1000, sim.Hp(0), 1e-9);
            for (int i = 0; i < 20; i++) { sim.Step(null); }   // さらに 2 回 → 600 − 500 = 100 が HP に
            Assert.AreEqual(900, sim.Hp(0), 1e-9);
        }

        [Test]
        public void Invincible_BlocksDamage_ButEmitsImmune()
        {
            var a = U("a", hp: 100);
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(Invincible, TargetType.Self, 1000));
            var e = U("e", atk: 100); e.Normal = Attack(100);
            Run(S(a, e, limit: 35), out EventLog log);
            Assert.AreEqual(0, Hits(log, 1).Count);
            Assert.AreEqual(3, log.Of(BattleEventType.Immune).Count);
        }

        [Test]
        public void ReflectShield_ReturnsAPartOfTheDamage()
        {
            var a = U("a", hp: 1e6);
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(ReflectShield, TargetType.Self, 1000));
            var e = U("e", atk: 100, hp: 1e6); e.Normal = Attack(100);
            Run(S(a, e, limit: 15), out EventLog log);
            List<BattleEvent> reflected = Hits(log, 0, DamageFlags.Reflect);
            Assert.AreEqual(1, reflected.Count);
            Assert.AreEqual(30, reflected[0].Value, 1e-9);
        }

        [Test]
        public void StatusCapacity_OverflowIsIgnoredWithAWarning()
        {
            var setup = S(U("a"), U("e", hp: 1e6), limit: 5);
            for (int i = 0; i < 30; i++)
            {
                setup.Buffs.Add(new ResolvedBuff { Id = "dummy" + i, Category = BuffCategory.Buff, Polarity = BuffPolarity.Buff, Tiers = new[] { new ResolvedBuffTier(), null, null, null } });
            }
            var effects = new List<ResolvedEffect>();
            for (int i = 0; i < 26; i++) { effects.Add(Buff(13 + i, TargetType.Self, 100)); }
            setup.Allies[0].Special = Skill("s", TriggerType.OnBattleStart, effects.ToArray());
            Run(setup, out EventLog log);
            Assert.AreEqual(BattleSim.StatusCapacity, log.Of(BattleEventType.BuffApplied).Count);
            var warn = log.Of(BattleEventType.Warning);
            Assert.AreEqual(2, warn.Count);
            Assert.AreEqual(WarningCode.StatusCapacity, warn[0].Aux);
        }

        // ---------------- 効果の評価 ----------------

        [Test]
        public void If_TargetHasAnyStatus_UsesTheSnapshot_NotStatusesAddedBySameSkill()
        {
            var a = U("a");
            var onlyBurned = new ResolvedEffect { Type = EffectType.Damage, Target = TargetType.EnemyAll, MultiplierPct = 100, IfAnyStatusMask = 1u << Burn };
            a.Special = Skill("s", TriggerType.Interval, Buff(Burn, TargetType.EnemyAll, 1000), onlyBurned);
            a.Special.Trigger.EveryTicks = 10;
            var e1 = U("e1", hp: 1e6, row: Row.Front);
            var e2 = U("e2", hp: 1e6, row: Row.Front);
            Run(S(new[] { a }, new[] { e1, e2 }, limit: 25), out EventLog log);
            // tick10：付けたばかり（スナップショットに無い）→ ダメージなし。tick20：2体とも燃えている → 2回。
            var direct = Hits(log, 0);
            Assert.AreEqual(2, direct.Count);
            Assert.IsTrue(direct.TrueForAll(d => d.Tick == 20));
        }

        [Test]
        public void Bonus_ReusesTheMainHit_AndNeedsNoNewRolls()
        {
            var a = U("a");
            a.Normal = Skill("n", TriggerType.AttackInterval, Dmg(100), new ResolvedEffect { Type = EffectType.Damage, Target = TargetType.EnemySingle, MultiplierPct = 50, Bonus = true });
            var e = U("e", hp: 1e6);

            var hit = new ScriptedChance { Default = false };
            hit.Script.Enqueue(true);   // 命中
            hit.Script.Enqueue(false);  // クリティカルなし
            Run(S(a, e, limit: 12), out EventLog log, hit);
            Assert.AreEqual(2, Hits(log, 0).Count);
            Assert.AreEqual(2, hit.Calls.Count);    // 命中と、クリティカルの2回だけ

            // 外れたとき：追加ダメージも出ず、引くのは命中の1回だけ。
            var a3 = U("a3");
            a3.Normal = a.Normal;
            var missing = new ScriptedChance { Default = false };
            Run(S(a3, e, limit: 12), out EventLog log2, missing);
            Assert.AreEqual(0, Hits(log2, 0).Count);
            Assert.AreEqual(1, log2.Of(BattleEventType.Miss).Count);
            Assert.AreEqual(1, missing.Calls.Count);
        }

        private static ResolvedEffect ElementCount(Element el, double perUnit, double max, CountUnit unit)
        {
            return new ResolvedEffect { Type = EffectType.ElementCountBonus, Element = el, CountPerUnit = perUnit, CountMax = max, CountUnit = unit };
        }

        [Test]
        public void ElementCountBonus_Pct_AddsToDamage_WithCapAndOnlyLivingAlliesCountingSelf()
        {
            double Damage(int valorAllies)
            {
                var caster = U("c", el: Element.Valor);
                caster.Special = Interval(10, ElementCount(Element.Valor, 50, 100, CountUnit.Pct), Dmg(100));
                var allies = new List<UnitSetup> { caster };
                for (int i = 0; i < valorAllies; i++) { allies.Add(U("v" + i, el: Element.Valor, hp: 1e6)); }
                var e = U("e", hp: 1e9, el: Element.Heart);
                Run(S(allies.ToArray(), new[] { e }, limit: 12), out EventLog log);
                return Hits(log, 0)[0].Value;
            }
            Assert.AreEqual(150, Damage(0), 1e-9);   // 自分だけ = 1 人
            Assert.AreEqual(200, Damage(1), 1e-9);   // 2 人 = 100
            Assert.AreEqual(200, Damage(4), 1e-9);   // 上限
        }

        [Test]
        public void ElementCountBonus_Sec_ExtendsBuffDuration()
        {
            var caster = U("c", el: Element.Valor);
            caster.Special = Skill("s", TriggerType.OnBattleStart, ElementCount(Element.Valor, 0.5, 3, CountUnit.Sec), Buff(AtkUp, TargetType.Self, 20, TierLevel.Supreme));
            var ally = U("v", el: Element.Valor, hp: 1e6);
            Run(S(new[] { caster, ally }, new[] { U("e", hp: 1e9) }, limit: 40), out EventLog log);
            Assert.AreEqual(30, log.Of(BattleEventType.BuffRemoved)[0].Tick); // 20 + 2 人 × 0.5 秒 = 30
        }

        [Test]
        public void DebuffCountBonus_Target_IsPerEnemy()
        {
            var a = U("a");
            a.Special = Skill("s", TriggerType.OnBattleStart, Buff(Burn, TargetType.EnemySingle, 1000), Buff(AtkDown, TargetType.EnemySingle, 1000));
            a.Ultimate = Cooldown(10, new ResolvedEffect { Type = EffectType.DebuffCountBonus, CountScope = CountScope.Target, CountPerUnit = 5, CountMax = 300 }, Dmg(100, TargetType.EnemyAll));
            var e1 = U("e1", hp: 1e9, row: Row.Front);
            var e2 = U("e2", hp: 1e9, row: Row.Mid);
            Run(S(new[] { a }, new[] { e1, e2 }, limit: 12), out EventLog log);
            var hits = Hits(log, 0);
            Assert.AreEqual(110, hits.Find(h => h.Target == 1).Value, 1e-9);  // デバフ2つ → +10
            Assert.AreEqual(100, hits.Find(h => h.Target == 2).Value, 1e-9);  // 0 → 補正なし
        }

        private static ResolvedEffect HealAllyChance(double chance)
        {
            return new ResolvedEffect { Type = EffectType.ApplyBuff, Target = TargetType.AllyAll, BuffIndex = AtkUp, Tier = TierLevel.Supreme, DurationTicks = 100, ChancePct = chance };
        }

        [Test]
        public void EffectChance_IsRolledPerTarget()
        {
            var a = U("a", hp: 1e6); var b = U("b", hp: 1e6); var c = U("c", hp: 1e6);
            a.Special = Interval(10, HealAllyChance(50));
            var chance = new ScriptedChance();
            chance.Script.Enqueue(true); chance.Script.Enqueue(false); chance.Script.Enqueue(true);
            Run(S(new[] { a, b, c }, new[] { U("e", hp: 1e9) }, limit: 12), out EventLog log, chance);
            Assert.AreEqual(3, chance.Calls.Count);
            var applied = log.Of(BattleEventType.BuffApplied).ConvertAll(x => (int)x.Target);
            CollectionAssert.AreEqual(new[] { 0, 2 }, applied);
        }

        [Test]
        public void ConsecutiveEffects_WithSameTargetAndChance_ShareOneRollPerTarget()
        {
            var a = U("a", hp: 1e6); var b = U("b", hp: 1e6);
            a.Special = Interval(10, HealAllyChance(50), new ResolvedEffect
            {
                Type = EffectType.ApplyBuff, Target = TargetType.AllyAll, BuffIndex = Regen, DurationTicks = 100, ChancePct = 50,
            });
            var chance = new ScriptedChance();
            chance.Script.Enqueue(true); chance.Script.Enqueue(false);
            Run(S(new[] { a, b }, new[] { U("e", hp: 1e9) }, limit: 12), out EventLog log, chance);
            Assert.AreEqual(2, chance.Calls.Count);                    // 味方ごとに1回（2効果で共有）
            Assert.AreEqual(2, log.Of(BattleEventType.BuffApplied).Count); // a にだけ2つ
        }

        [Test]
        public void EffectChance_IsNotRolled_WhenThePrerequisiteFails()
        {
            var a = U("a");
            var afterHit = new ResolvedEffect { Type = EffectType.ApplyBuff, Target = TargetType.EnemySingle, BuffIndex = Silence, DurationTicks = 20, ChancePct = 50, When = EffectWhen.AfterHit };
            a.Normal = Attack(100, afterHit);
            var chance = new ScriptedChance { Default = false };   // 命中しない
            Run(S(a, U("e", hp: 1e9), limit: 12), out _, chance);
            Assert.AreEqual(1, chance.Calls.Count);                // 命中判定だけ。効果の確率は引かない
        }

        // ---------------- トリガー ----------------

        [Test]
        public void OnHit_FiresOncePerHit_AndRespectsTheStatusCondition()
        {
            var a = U("a"); a.Normal = Attack(1);
            a.Special = Skill("s", TriggerType.OnHit, Buff(AtkUp, TargetType.Self, 5, TierLevel.Supreme));
            Run(S(a, U("e", hp: 1e9), limit: 35), out EventLog log);
            Assert.AreEqual(3, log.Of(BattleEventType.SkillFired).FindAll(x => x.Source == 0 && x.Aux == 1).Count);

            var b = U("b"); b.Normal = Attack(1);
            b.Special = Skill("s", TriggerType.OnHit, Buff(AtkUp, TargetType.Self, 5, TierLevel.Supreme));
            b.Special.Trigger.IfAnyStatusMask = 1u << Burn;
            Run(S(b, U("e", hp: 1e9), limit: 35), out EventLog none);
            Assert.AreEqual(0, none.Of(BattleEventType.SkillFired).FindAll(x => x.Source == 0 && x.Aux == 1).Count);
        }

        [Test]
        public void OnHit_AlwaysDrawsTheTriggerChance()
        {
            var a = U("a"); a.Normal = Attack(1);
            a.Special = Skill("s", TriggerType.OnHit, Buff(AtkUp, TargetType.Self, 5, TierLevel.Supreme));
            a.Special.Trigger.ChancePct = 100;
            var chance = new ScriptedChance { Default = true };
            Run(S(a, U("e", hp: 1e9), limit: 12), out _, chance);
            // 命中・クリティカル・トリガーの確率の順に3回
            Assert.AreEqual(3, chance.Calls.Count);
            Assert.AreEqual(100, chance.Calls[2], 1e-9);
        }

        [Test]
        public void OnCrit_FiresOnlyWhenCritical_AndCritShieldPreventsIt()
        {
            var a = U("a"); a.Normal = Attack(1);
            a.Stats = new Mado.Core.Stats.BattleStats { Atk = 100, Hp = 1000, AccuracyPct = 100, CritRatePct = 100, CritDamagePct = 1000, CritDefensePct = 1000, AttackSpeed = 1 };
            a.Special = Skill("s", TriggerType.OnCrit, Buff(AtkUp, TargetType.Self, 5, TierLevel.Supreme));
            Run(S(a, U("e", hp: 1e9), limit: 12), out EventLog log);
            Assert.AreEqual(1, log.Of(BattleEventType.SkillFired).FindAll(x => x.Source == 0 && x.Aux == 1).Count);

            var shielded = U("e", hp: 1e9);
            shielded.Special = Skill("c", TriggerType.OnBattleStart, Buff(CritShield, TargetType.Self, 1000));
            var a2 = U("a"); a2.Normal = Attack(1); a2.Stats = a.Stats;
            a2.Special = a.Special;
            Run(S(a2, shielded, limit: 12), out EventLog log2);
            Assert.AreEqual(0, log2.Of(BattleEventType.SkillFired).FindAll(x => x.Source == 0 && x.Aux == 1).Count);
        }

        [Test]
        public void OnDamaged_CanTargetTheAttacker()
        {
            var a = U("a", hp: 1e6);
            a.Special = Skill("s", TriggerType.OnDamaged, Buff(AtkDown, TargetType.Attacker, 1000));
            var e = U("e"); e.Normal = Attack(1);
            Run(S(a, e, limit: 12), out EventLog log);
            var applied = log.Of(BattleEventType.BuffApplied);
            Assert.AreEqual(1, applied.Count);
            Assert.AreEqual(1, applied[0].Target);
        }

        [Test]
        public void OnDeath_RunsEvenThoughTheUnitIsDead_AndOnKillRewardsTheKiller()
        {
            var a = U("a", hp: 50);
            a.Crystals.Add(Skill("c", TriggerType.OnDeath, Buff(Burn, TargetType.EnemyAll, 100)));
            var e = U("e", atk: 100); e.Normal = Attack(100);
            e.Special = Skill("k", TriggerType.OnKill, Buff(AtkUp, TargetType.Self, 100, TierLevel.Supreme));
            Run(S(a, e, limit: 40), out EventLog log);
            BattleEvent death = log.Of(BattleEventType.Death)[0];
            var applied = log.Of(BattleEventType.BuffApplied);
            Assert.IsTrue(applied.Exists(x => x.Target == 1 && x.Aux / 8 == Burn && x.Tick == death.Tick));      // 死んだ味方が敵に火傷
            Assert.IsTrue(applied.Exists(x => x.Target == 1 && x.Aux / 8 == AtkUp && x.Tick == death.Tick));     // 倒した敵が攻撃アップ
        }

        [Test]
        public void OnHpBelow_Once_FiresOnlyOnce()
        {
            var a = U("a", hp: 1000);
            a.Special = Skill("s", TriggerType.OnHpBelow, Buff(AtkUp, TargetType.Self, 5, TierLevel.Supreme));
            a.Special.Trigger.Pct = 50; a.Special.Trigger.Once = true;
            var e = U("e", atk: 300); e.Normal = Attack(100);
            Run(S(a, e, limit: 45), out EventLog log);    // 700, 400(≤50%), 100 と3回被弾
            Assert.AreEqual(1, log.Of(BattleEventType.SkillFired).FindAll(x => x.Source == 0 && x.Aux == 1).Count);
        }

        [Test]
        public void Interval_FirstFiresAfterNSeconds_Cooldown_StartsFull()
        {
            var a = U("a");
            a.Special = Interval(20, Dmg(1));
            a.Ultimate = Cooldown(50, Dmg(1));
            Run(S(a, U("e", hp: 1e9), limit: 105), out EventLog log);
            var fired = log.Of(BattleEventType.SkillFired).FindAll(x => x.Source == 0);
            CollectionAssert.AreEqual(new[] { 20, 40, 60, 80, 100 }, fired.FindAll(x => x.Aux == 1).ConvertAll(x => x.Tick));
            CollectionAssert.AreEqual(new[] { 50, 100 }, fired.FindAll(x => x.Aux == 2).ConvertAll(x => x.Tick));
        }

        [Test]
        public void GaugeShift_AdvancesOrDelaysTheUltimate_ClampedToTheCooldown()
        {
            ResolvedEffect Shift(int ticks) => new ResolvedEffect { Type = EffectType.GaugeShift, Target = TargetType.Self, ShiftTicks = ticks };
            var a = U("a");
            a.Special = Skill("s", TriggerType.OnBattleStart, Shift(30));
            a.Ultimate = Cooldown(100, Dmg(1));
            Run(S(a, U("e", hp: 1e9), limit: 80), out EventLog log);
            Assert.AreEqual(70, log.Of(BattleEventType.SkillFired).Find(x => x.Source == 0 && x.Aux == 2).Tick);

            var b = U("b");
            b.Special = Skill("s", TriggerType.OnBattleStart, Shift(-500));  // 戻しすぎてもクールタイムの上限で止まる
            b.Ultimate = Cooldown(100, Dmg(1));
            Run(S(b, U("e", hp: 1e9), limit: 120), out EventLog log2);
            Assert.AreEqual(100, log2.Of(BattleEventType.SkillFired).Find(x => x.Source == 0 && x.Aux == 2).Tick);
        }

        [Test]
        public void OnTrigger_Effect_FiresOnNormalHitRegardlessOfTheParentTrigger()
        {
            var a = U("a"); a.Normal = Attack(1);
            // 親は onCrit（クリティカルしないので出ない）。onTrigger: onHit の効果だけ、通常スキルの命中ごとに出る。
            a.Special = Skill("p", TriggerType.OnCrit,
                Buff(AtkUp, TargetType.Self, 5, TierLevel.Supreme),
                new ResolvedEffect { Type = EffectType.ApplyBuff, Target = TargetType.Target, BuffIndex = Freeze, DurationTicks = 3, OnTrigger = TriggerType.OnHit });
            Run(S(a, U("e", hp: 1e9), limit: 12), out EventLog log);
            var applied = log.Of(BattleEventType.BuffApplied);
            Assert.AreEqual(1, applied.Count);
            Assert.AreEqual(Freeze, applied[0].Aux / 8);
        }

        [Test]
        public void ChainLimit_StopsRunawayChains_WithAWarning()
        {
            var a = U("a", hp: 1e12); var e = U("e", hp: 1e12);
            a.Normal = Attack(1);
            a.Special = Skill("pa", TriggerType.OnDamaged, Dmg(1));
            e.Special = Skill("pe", TriggerType.OnDamaged, Dmg(1));
            Run(S(a, e, limit: 15), out EventLog log);
            var warn = log.Of(BattleEventType.Warning).FindAll(w => w.Aux == WarningCode.ChainLimit);
            Assert.AreEqual(1, warn.Count);
            Assert.LessOrEqual(log.Of(BattleEventType.SkillFired).Count, new BattleConstants().ChainLimit + 4);
        }

        // ---------------- 決定性 ----------------

        private static BattleSetup RandomFight(ulong seed)
        {
            var a = U("a", atk: 300, hp: 5000); a.Normal = Attack(100);
            a.Stats = new Mado.Core.Stats.BattleStats { Atk = 300, Hp = 5000, AccuracyPct = 60, CritRatePct = 50, CritDamagePct = 1500, CritDefensePct = 1000, EvasionPct = 5, AttackSpeed = 1 };
            a.Special = Skill("s", TriggerType.OnHit, Buff(Burn, TargetType.Target, 30));
            a.Special.Trigger.ChancePct = 30;
            var e = U("e", atk: 100, hp: 8000); e.Normal = Attack(100);
            e.Stats = new Mado.Core.Stats.BattleStats { Atk = 100, Hp = 8000, AccuracyPct = 70, CritRatePct = 10, CritDamagePct = 1200, CritDefensePct = 1000, EvasionPct = 20, AttackSpeed = 1 };
            return S(a, e, seed);
        }

        [Test]
        public void Deterministic_SameSetupSameHash_DifferentSeedDifferentHash()
        {
            ulong h1 = Run(RandomFight(7), out _).EventHash;
            ulong h2 = Run(RandomFight(7), out _).EventHash;
            ulong h3 = Run(RandomFight(8), out _).EventHash;
            Assert.AreEqual(h1, h2);
            Assert.AreNotEqual(h1, h3);
        }

        [Test]
        public void RunToEnd_AndSteppingGiveTheSameResult()
        {
            BattleResult whole = Run(RandomFight(11), out _);
            var sim = new BattleSim(RandomFight(11));
            sim.Start();
            while (sim.Step(null)) { }
            Assert.AreEqual(whole.EventHash, sim.Result.EventHash);
            Assert.AreEqual(whole.EndTick, sim.Result.EndTick);
            Assert.AreEqual(whole.Outcome, sim.Result.Outcome);
        }

        [Test]
        public void StepsDoNotAllocate_AfterWarmUp()
        {
            var a = U("a", hp: 1e15); a.Normal = Attack(1);
            a.Special = Skill("s", TriggerType.OnHit, Buff(AtkUp, TargetType.Self, 20, TierLevel.Supreme));
            a.Ultimate = Cooldown(30, Dmg(1, TargetType.EnemyAll));
            var e = U("e", hp: 1e15); e.Normal = Attack(1);
            e.Special = Skill("s", TriggerType.Interval, Buff(Burn, TargetType.EnemySingle, 20));
            e.Special.Trigger.EveryTicks = 15;
            var sim = new BattleSim(S(a, e, limit: 100000));
            sim.Start();
            for (int i = 0; i < 300; i++) { sim.Step(null); }
            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 1000; i++) { sim.Step(null); }
            long used = GC.GetAllocatedBytesForCurrentThread() - before;
            Assert.AreEqual(0, used, "1000 刻みで確保したバイト数");
        }
    }
}
