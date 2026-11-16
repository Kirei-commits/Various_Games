using System.Collections.Generic;
using Mado.Core.Stats;
using Mado.Data;

namespace Mado.Core.Battle
{
    public enum Side { Ally, Enemy }

    [Newtonsoft.Json.JsonConverter(typeof(Newtonsoft.Json.Converters.StringEnumConverter))]
    public enum Row { Front, Mid, Back }

    /// <summary>TimeUp は時間切れ（敗北として扱う）。</summary>
    public enum BattleOutcome { Win, Lose, TimeUp }

    public enum BattleEventType
    {
        Damage, Miss, Immune, Heal, Shield, BuffApplied, BuffRemoved, SkillFired, GaugeShifted, Death, Warning, BattleEnd,
    }

    /// <summary>Warning イベントの Aux。</summary>
    public static class WarningCode
    {
        public const int ChainLimit = 1;
        public const int StatusCapacity = 2;
        public const int EventLimit = 3;
    }

    /// <summary>Damage イベントの Aux のビット。</summary>
    public static class DamageFlags
    {
        public const int Crit = 1;
        public const int Dot = 2;
        public const int Reflect = 4;
    }

    // ---------------- 入力（解決済み。JSON にそのまま書き出せる） ----------------

    public sealed class BattleRules
    {
        public int TimeLimitTicks { get; set; }
        public int SkipAvailableAfterTicks { get; set; }
    }

    /// <summary>system.json から戦闘に要る値の写し。</summary>
    public sealed class BattleConstants
    {
        public double TickSec { get; set; } = 0.1;
        public double BaseAttackIntervalSec { get; set; } = 1.0;
        public List<Element> ElementCycle { get; set; } = new List<Element> { Element.Valor, Element.Skill, Element.Heart, Element.Wisdom };
        public double ElementAdvantagePct { get; set; } = 120;
        public double ElementDisadvantagePct { get; set; } = 80;
        public double HitChanceMinPct { get; set; } = 5;
        public double HitChanceMaxPct { get; set; } = 100;
        public double CritMultiplierMin { get; set; } = 1.0;
        public double MinDamage { get; set; } = 1;
        public int ChainLimit { get; set; } = 64;
    }

    public sealed class BattleSetup
    {
        public ulong Seed { get; set; }
        public BattleRules Rules { get; set; } = new BattleRules { TimeLimitTicks = 600 };
        public BattleConstants Constants { get; set; } = new BattleConstants();

        /// <summary>味方は編成スロット順、最後にリーダー。</summary>
        public List<UnitSetup> Allies { get; set; } = new List<UnitSetup>();
        public List<UnitSetup> Enemies { get; set; } = new List<UnitSetup>();

        /// <summary>この戦闘で使うバフの定義の写し（buffs.json の変更にゴールデンが引きずられないように）。</summary>
        public List<ResolvedBuff> Buffs { get; set; } = new List<ResolvedBuff>();
    }

    public sealed class UnitSetup
    {
        public string Id { get; set; }
        public Element Element { get; set; }
        public Role Role { get; set; }
        public Row Row { get; set; }
        public bool IsLeader { get; set; }
        public BattleStats Stats { get; set; }

        /// <summary>敵は null でもよい。</summary>
        public ResolvedSkill Normal { get; set; }
        public ResolvedSkill Special { get; set; }
        public ResolvedSkill Ultimate { get; set; }

        /// <summary>枠の順。付けているキャラのスキルとして働く。</summary>
        public List<ResolvedSkill> Crystals { get; set; } = new List<ResolvedSkill>();
    }

    public sealed class ResolvedSkill
    {
        public string Id { get; set; }
        public ResolvedTrigger Trigger { get; set; } = new ResolvedTrigger();
        public List<ResolvedEffect> Effects { get; set; } = new List<ResolvedEffect>();
    }

    public sealed class ResolvedTrigger
    {
        public TriggerType Type { get; set; }
        public int EveryTicks { get; set; }
        public int CooldownTicks { get; set; }
        public double ChancePct { get; set; } = 100;
        public double Pct { get; set; }
        public bool Once { get; set; }

        /// <summary>0 なら条件なし。立っているビット = buffs の索引。</summary>
        public uint IfAnyStatusMask { get; set; }
    }

    public sealed class ResolvedEffect
    {
        public EffectType Type { get; set; }
        public TargetType Target { get; set; }
        public Element? Element { get; set; }
        public double MultiplierPct { get; set; }
        public double BonusSelfLostHpPct { get; set; }
        public bool Bonus { get; set; }
        public int BuffIndex { get; set; } = -1;

        /// <summary>null は段階なし（索引 0）。</summary>
        public TierLevel? Tier { get; set; }
        public int DurationTicks { get; set; }

        /// <summary>100 以上は「判定しない」。</summary>
        public double ChancePct { get; set; } = 100;
        public EffectWhen? When { get; set; }
        public uint IfAnyStatusMask { get; set; }

        /// <summary>gaugeShift：正で進める（残りを減らす）、負で戻す。</summary>
        public int ShiftTicks { get; set; }
        public CountUnit CountUnit { get; set; }

        /// <summary>1人（または1つ）あたりの補正量。pct なら％、sec なら秒。</summary>
        public double CountPerUnit { get; set; }
        public double CountMax { get; set; }
        public CountScope CountScope { get; set; }

        /// <summary>親のトリガーとは別に、通常スキルの命中時（OnHit）／クリティカル時（OnCrit）に出す効果。</summary>
        public TriggerType? OnTrigger { get; set; }

        /// <summary>0 なら絞らない。立っているビット = Element の値。</summary>
        public uint TargetElementMask { get; set; }
    }

    public sealed class ResolvedBuff
    {
        public string Id { get; set; }
        public BuffCategory Category { get; set; }
        public BuffPolarity Polarity { get; set; }

        /// <summary>索引 = TierLevel の値。無い段階は null。段階なしは [0] だけ。</summary>
        public ResolvedBuffTier[] Tiers { get; set; } = new ResolvedBuffTier[4];
    }

    public sealed class ResolvedStatMod
    {
        public StatKey Stat { get; set; }
        public StatOp Op { get; set; }
        public double Value { get; set; }
    }

    public sealed class ResolvedBuffTier
    {
        public List<ResolvedStatMod> StatMods { get; set; } = new List<ResolvedStatMod>();
        public double DotAtkPct { get; set; }
        public double HotAtkPct { get; set; }
        public double ShieldMaxHpPct { get; set; }
        public bool CannotAct { get; set; }
        public bool UltimateGaugeStopped { get; set; }
        public bool ForceTargetCaster { get; set; }
        public bool HealBlocked { get; set; }
        public bool DamageImmune { get; set; }
        public bool CritDamageImmune { get; set; }

        /// <summary>この状態にならなくなる buffs の索引のビット。</summary>
        public uint ImmuneToMask { get; set; }
        public double ReflectPct { get; set; }
    }

    // ---------------- 出力 ----------------

    public readonly struct BattleEvent
    {
        public readonly int Tick;
        public readonly BattleEventType Type;
        public readonly short Source, Target;
        public readonly double Value;
        public readonly int Aux;

        public BattleEvent(int tick, BattleEventType type, short source, short target, double value, int aux)
        {
            Tick = tick; Type = type; Source = source; Target = target; Value = value; Aux = aux;
        }
    }

    public interface IBattleEventSink
    {
        void OnEvent(in BattleEvent e);
    }

    public sealed class BattleResult
    {
        public BattleOutcome Outcome { get; set; }
        public int EndTick { get; set; }
        public double[] DamageDealt { get; set; }
        public double[] DamageTaken { get; set; }
        public double[] Healed { get; set; }
        public ulong EventHash { get; set; }
        public int EventCount { get; set; }

        /// <summary>倒した敵の数と、倒された味方の数（経験値などのドロップ・実績の数えに使う）。</summary>
        public int EnemiesDefeated { get; set; }
        public int AlliesLost { get; set; }
    }
}
