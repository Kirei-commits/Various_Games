using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Stats;
using Mado.Data;

namespace Mado.Core.Tests
{
    /// <summary>戦闘のテスト用に、手で組んだ BattleSetup を作る道具。</summary>
    internal static class Kit
    {
        // バフの索引（Buffs() の並びと一致）
        public const int AtkDown = 0, Burn = 1, Freeze = 2, Silence = 3, Taunt = 4, Shield = 5, Invincible = 6, HealBlock = 7,
            CcBarrier = 8, ReflectShield = 9, CritShield = 10, AtkUp = 11, Regen = 12;

        public static List<ResolvedBuff> Buffs()
        {
            ResolvedBuff B(string id, BuffPolarity pol, ResolvedBuffTier t) =>
                new ResolvedBuff { Id = id, Category = BuffCategory.Status, Polarity = pol, Tiers = new[] { t, null, null, null } };
            var list = new List<ResolvedBuff>
            {
                B("atk_down", BuffPolarity.Debuff, new ResolvedBuffTier { StatMods = { new ResolvedStatMod { Stat = StatKey.Atk, Op = StatOp.Pct, Value = -50 } } }),
                B("burn", BuffPolarity.Debuff, new ResolvedBuffTier { DotAtkPct = 10 }),
                B("freeze", BuffPolarity.Debuff, new ResolvedBuffTier { CannotAct = true }),
                B("silence", BuffPolarity.Debuff, new ResolvedBuffTier { UltimateGaugeStopped = true }),
                B("taunt", BuffPolarity.Debuff, new ResolvedBuffTier { ForceTargetCaster = true }),
                B("shield", BuffPolarity.Buff, new ResolvedBuffTier { ShieldMaxHpPct = 50 }),
                B("invincible", BuffPolarity.Buff, new ResolvedBuffTier { DamageImmune = true }),
                B("heal_block", BuffPolarity.Debuff, new ResolvedBuffTier { HealBlocked = true }),
                B("cc_barrier", BuffPolarity.Buff, new ResolvedBuffTier { ImmuneToMask = 1u << Freeze }),
                B("reflect_shield", BuffPolarity.Buff, new ResolvedBuffTier { ReflectPct = 30 }),
                B("crit_shield", BuffPolarity.Buff, new ResolvedBuffTier { CritDamageImmune = true }),
                new ResolvedBuff
                {
                    Id = "atk_up", Category = BuffCategory.Buff, Polarity = BuffPolarity.Buff,
                    Tiers = new[]
                    {
                        new ResolvedBuffTier { StatMods = { new ResolvedStatMod { Stat = StatKey.Atk, Op = StatOp.Pct, Value = 50 } } },
                        new ResolvedBuffTier { StatMods = { new ResolvedStatMod { Stat = StatKey.Atk, Op = StatOp.Pct, Value = 30 } } },
                        new ResolvedBuffTier { StatMods = { new ResolvedStatMod { Stat = StatKey.Atk, Op = StatOp.Pct, Value = 10 } } },
                        null,
                    },
                },
                B("regen", BuffPolarity.Buff, new ResolvedBuffTier { HotAtkPct = 10 }),
            };
            return list;
        }

        public static UnitSetup U(string id, double atk = 100, double hp = 1000, double def = 0, Row row = Row.Front, Element el = Element.Valor)
        {
            return new UnitSetup
            {
                Id = id, Element = el, Role = Role.Ranged, Row = row,
                Stats = new BattleStats
                {
                    Atk = atk, Hp = hp, Def = def, AccuracyPct = 100, EvasionPct = 0, CritRatePct = 0, CritResistPct = 0,
                    CritDamagePct = 1000, CritDefensePct = 1000, AttackSpeed = 1.0,
                },
            };
        }

        public static ResolvedEffect Dmg(double mult, TargetType t = TargetType.EnemySingle)
        {
            return new ResolvedEffect { Type = EffectType.Damage, Target = t, MultiplierPct = mult };
        }

        public static ResolvedEffect Buff(int idx, TargetType t, int ticks, TierLevel? tier = null)
        {
            return new ResolvedEffect { Type = EffectType.ApplyBuff, Target = t, BuffIndex = idx, DurationTicks = ticks, Tier = tier };
        }

        public static ResolvedSkill Skill(string id, TriggerType type, params ResolvedEffect[] fx)
        {
            return new ResolvedSkill { Id = id, Trigger = new ResolvedTrigger { Type = type }, Effects = new List<ResolvedEffect>(fx) };
        }

        public static ResolvedSkill Interval(int everyTicks, params ResolvedEffect[] fx)
        {
            var s = Skill("i", TriggerType.Interval, fx);
            s.Trigger.EveryTicks = everyTicks;
            return s;
        }

        public static ResolvedSkill Cooldown(int ticks, params ResolvedEffect[] fx)
        {
            var s = Skill("u", TriggerType.Cooldown, fx);
            s.Trigger.CooldownTicks = ticks;
            return s;
        }

        public static ResolvedSkill Attack(double mult = 100, params ResolvedEffect[] extra)
        {
            var fx = new List<ResolvedEffect> { Dmg(mult) };
            fx.AddRange(extra);
            return Skill("n", TriggerType.AttackInterval, fx.ToArray());
        }

        public static BattleSetup S(UnitSetup[] allies, UnitSetup[] enemies, ulong seed = 1, int limit = 600)
        {
            return new BattleSetup
            {
                Seed = seed, Rules = new BattleRules { TimeLimitTicks = limit },
                Allies = new List<UnitSetup>(allies), Enemies = new List<UnitSetup>(enemies), Buffs = Buffs(),
            };
        }

        public static BattleSetup S(UnitSetup ally, UnitSetup enemy, ulong seed = 1, int limit = 600)
        {
            return S(new[] { ally }, new[] { enemy }, seed, limit);
        }
    }

    internal sealed class EventLog : IBattleEventSink
    {
        public readonly List<BattleEvent> All = new List<BattleEvent>();
        public void OnEvent(in BattleEvent e) { All.Add(e); }

        public List<BattleEvent> Of(BattleEventType type)
        {
            return All.FindAll(e => e.Type == type);
        }
    }

    /// <summary>乱数の代わり：呼ばれた確率を記録し、決めた値を返す。</summary>
    internal sealed class ScriptedChance : IChanceSource
    {
        public readonly List<double> Calls = new List<double>();
        public Queue<bool> Script = new Queue<bool>();
        public bool Default;

        public bool Chance(double percent)
        {
            Calls.Add(percent);
            return Script.Count > 0 ? Script.Dequeue() : Default;
        }
    }
}
