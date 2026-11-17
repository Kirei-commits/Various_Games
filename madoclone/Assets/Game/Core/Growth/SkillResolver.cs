using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Data;

namespace Mado.Core.Growth
{
    /// <summary>buffs.json → 戦闘用のバフの写し（docs/04 9.1節）。索引は buffs.json の並び。状態の種類は 32 以下。</summary>
    public sealed class BuffBook
    {
        public IReadOnlyList<ResolvedBuff> Buffs { get; }
        private readonly Dictionary<string, int> _index = new Dictionary<string, int>();

        public BuffBook(GameData data)
        {
            if (data.Buffs.Items.Count > 32) { throw new DataException("バフの種類が 32 を超えた（状態のビットマスクは 32 ビット）"); }
            var list = new List<ResolvedBuff>();
            for (int i = 0; i < data.Buffs.Items.Count; i++) { _index[data.Buffs.Items[i].Id] = i; }
            foreach (BuffDef def in data.Buffs.Items)
            {
                var rb = new ResolvedBuff { Id = def.Id, Category = def.Category, Polarity = def.Polarity, Tiers = new ResolvedBuffTier[4] };
                foreach (KeyValuePair<string, BuffTierDef> kv in def.Tiers)
                {
                    int slot = kv.Key == BuffDef.NoTierKey ? 0 : (int)EnumStringConverter.Parse<TierLevel>(kv.Key);
                    rb.Tiers[slot] = ResolveTier(kv.Value);
                }
                list.Add(rb);
            }
            Buffs = list;
        }

        public int IndexOf(string buffId)
        {
            if (!_index.TryGetValue(buffId ?? "", out int i)) { throw new DataException("バフが無い: " + buffId); }
            return i;
        }

        public uint MaskOf(IReadOnlyList<string> ids)
        {
            uint m = 0;
            if (ids != null) { foreach (string id in ids) { m |= 1u << IndexOf(id); } }
            return m;
        }

        private ResolvedBuffTier ResolveTier(BuffTierDef t)
        {
            var r = new ResolvedBuffTier
            {
                DotAtkPct = t.DotAtkPct ?? 0, HotAtkPct = t.HotAtkPct ?? 0, ShieldMaxHpPct = t.ShieldMaxHpPct ?? 0,
                CannotAct = t.CannotAct, UltimateGaugeStopped = t.UltimateGaugeStopped, ForceTargetCaster = t.ForceTargetCaster,
                HealBlocked = t.HealBlocked, DamageImmune = t.DamageImmune, CritDamageImmune = t.CritDamageImmune,
                ReflectPct = t.ReflectPct ?? 0, ImmuneToMask = MaskOf(t.ImmuneTo),
            };
            foreach (StatMod m in t.StatMods) { r.StatMods.Add(new ResolvedStatMod { Stat = m.Stat, Op = m.Op, Value = m.Value }); }
            return r;
        }
    }

    /// <summary>スキルのランク選択・秒→刻み・ID→索引（docs/04 9.1節）。ここまでが育成側の仕事で、BattleSim は ID も JSON も知らない。</summary>
    public sealed class SkillResolver
    {
        private readonly GameData _data;
        private readonly BuffBook _book;

        public SkillResolver(GameData data, BuffBook book)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _book = book ?? throw new ArgumentNullException(nameof(book));
        }

        /// <summary>★からスキルのランク（0〜2）。境目は stat_tables の skillRankStars。</summary>
        public static int RankFor(GameData data, SkillKind kind, int star)
        {
            IReadOnlyList<int> b = data.Stats.SkillRankStars.Get(kind);
            return star < b[0] ? 0 : (star < b[1] ? 1 : 2);
        }

        /// <summary>秒 → 刻み。変換はここ1か所。</summary>
        public static int ToTicks(double sec, double tickSec)
        {
            return (int)Math.Round(sec / tickSec, MidpointRounding.AwayFromZero);
        }

        public ResolvedSkill Resolve(SkillDefBase def, int rank)
        {
            double tick = _data.System.TickSec;
            TriggerDef t = def.Trigger;
            var r = new ResolvedSkill
            {
                Id = def.Id,
                Trigger = new ResolvedTrigger
                {
                    Type = t.Type,
                    EveryTicks = t.EverySec.HasValue ? ToTicks(t.EverySec.Value, tick) : 0,
                    CooldownTicks = t.CooldownSec.HasValue ? ToTicks(t.CooldownSec.Value, tick) : 0,
                    ChancePct = t.ChancePct ?? 100,
                    Pct = t.Pct ?? 0,
                    Once = t.Once,
                    IfAnyStatusMask = t.If != null ? _book.MaskOf(t.If.TargetHasAnyStatus) : 0,
                },
            };
            foreach (EffectDef e in def.Effects)
            {
                if (e.MinRank.HasValue && rank < e.MinRank.Value) { continue; }   // 凸が足りない効果は除く
                if (e.Type == EffectType.Reflect) { continue; }                    // 今のデータには無い。実装しない
                r.Effects.Add(ResolveEffect(e, rank, tick));
            }
            return r;
        }

        private ResolvedEffect ResolveEffect(EffectDef e, int rank, double tick)
        {
            var r = new ResolvedEffect
            {
                Type = e.Type,
                Target = e.Target ?? TargetType.Self,
                Element = e.Element,
                MultiplierPct = e.MultiplierPct != null ? e.MultiplierPct.Pick(rank) : 0,
                BonusSelfLostHpPct = e.BonusSelfLostHpPct != null ? e.BonusSelfLostHpPct.Pick(rank) : 0,
                Bonus = e.Bonus,
                ChancePct = e.ChancePct ?? 100,
                When = e.When,
                IfAnyStatusMask = e.If != null ? _book.MaskOf(e.If.TargetHasAnyStatus) : 0,
                OnTrigger = e.OnTrigger,
            };
            if (e.BuffId != null) { r.BuffIndex = _book.IndexOf(e.BuffId); }
            if (e.Tier != null) { r.Tier = e.Tier.Pick(rank); }
            if (e.DurationSec != null) { r.DurationTicks = ToTicks(e.DurationSec.Pick(rank), tick); }
            if (e.TargetElements != null)
            {
                uint mask = 0;
                foreach (Element el in e.TargetElements.Pick(rank)) { mask |= 1u << (int)el; }
                r.TargetElementMask = mask;
            }
            switch (e.Type)
            {
                case EffectType.GaugeShift:
                    r.ShiftTicks = e.Sec != null ? ToTicks(e.Sec.Pick(rank), tick) : 0;
                    break;
                case EffectType.ElementCountBonus:
                case EffectType.DebuffCountBonus:
                    r.CountUnit = e.Unit ?? CountUnit.Pct;
                    r.CountScope = e.Scope ?? CountScope.Target;
                    r.CountMax = e.Max ?? 0;
                    r.CountPerUnit = r.CountUnit == CountUnit.Sec ? (e.Sec != null ? e.Sec.Pick(rank) : 0) : (e.Pct ?? 0);
                    break;
            }
            return r;
        }
    }

    /// <summary>前列・中列・後列の既定の割り当て（docs/04 9.1節 [仮]）：近距離・防御→前、回復→中、遠距離・妨害→後。</summary>
    public static class FormationRules
    {
        public static Row RowFor(Role role)
        {
            switch (role)
            {
                case Role.Melee:
                case Role.Defense: return Row.Front;
                case Role.Heal: return Row.Mid;
                default: return Row.Back;
            }
        }
    }
}
