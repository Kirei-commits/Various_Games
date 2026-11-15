using System;
using Mado.Data;

namespace Mado.Core.Battle
{
    public sealed partial class BattleSim
    {
        // スキル1回の実行で使う作業領域（構築時に確保して使い回す）
        private readonly int[] _targets;
        private readonly uint[] _snapMask;
        private readonly int[] _snapDebuffs;
        private readonly bool[] _hitRec, _critRec;
        private readonly int[] _grp;
        private readonly double[] _dbgBonus;
        private bool _anyHit, _anyCrit;
        private double _mulBonus;
        private int _durBonusTicks;

        private static bool Included(ResolvedEffect e, bool onTriggerOnly, TriggerType cause)
        {
            if (e.OnTrigger.HasValue) { return onTriggerOnly && e.OnTrigger.Value == cause; }
            return !onTriggerOnly;
        }

        private bool IsEnemyOf(int caster, int unit) { return _u[caster].Side != _u[unit].Side; }

        private int CountDebuffs(int unit)
        {
            Unit u = _u[unit];
            int n = 0;
            for (int i = 0; i < u.StCount; i++) { if (_buffs[u.St[i].Buff].Polarity == BuffPolarity.Debuff) { n++; } }
            return n;
        }

        /// <summary>主対象：前列 → 中列 → 後列の最初の空でない列から1体（複数なら乱数）。挑発されていれば挑発した相手。</summary>
        private int SelectPrimary(Unit c)
        {
            Refresh(c);
            if (c.TauntCaster >= 0 && _u[c.TauntCaster].Alive && _u[c.TauntCaster].Side != c.Side) { return c.TauntCaster; }
            for (int row = 0; row <= 2; row++)
            {
                int n = 0;
                for (int i = 0; i < _n; i++)
                {
                    Unit o = _u[i];
                    if (o.Alive && o.Side != c.Side && (int)o.Row == row) { _targets[n++] = i; }
                }
                if (n == 0) { continue; }
                return n == 1 ? _targets[0] : _targets[_rng.NextInt(n)];
            }
            return -1;
        }

        private int GetTargets(Unit c, ResolvedEffect e, int primary, int ctxTarget, int ctxAttacker)
        {
            int n = 0;
            switch (e.Target)
            {
                case TargetType.EnemySingle:
                    if (primary >= 0 && _u[primary].Alive) { _targets[n++] = primary; }
                    break;
                case TargetType.EnemyArea:
                    if (primary >= 0)
                    {
                        Row row = _u[primary].Row;
                        for (int i = 0; i < _n; i++) { if (_u[i].Alive && _u[i].Side != c.Side && _u[i].Row == row) { _targets[n++] = i; } }
                    }
                    break;
                case TargetType.EnemyAll:
                    for (int i = 0; i < _n; i++) { if (_u[i].Alive && _u[i].Side != c.Side) { _targets[n++] = i; } }
                    break;
                case TargetType.AllyLowestHp:
                {
                    int best = -1; double ratio = double.MaxValue;
                    for (int i = 0; i < _n; i++)
                    {
                        Unit o = _u[i];
                        if (!o.Alive || o.Side != c.Side) { continue; }
                        double r = o.Hp / o.MaxHp;
                        if (r < ratio) { ratio = r; best = i; }
                    }
                    if (best >= 0) { _targets[n++] = best; }
                    break;
                }
                case TargetType.AllyElement:
                    for (int i = 0; i < _n; i++)
                    {
                        Unit o = _u[i];
                        if (!o.Alive || o.Side != c.Side) { continue; }
                        bool ok = e.TargetElementMask != 0 ? (e.TargetElementMask & (1u << (int)o.Element)) != 0 : (e.Element.HasValue && o.Element == e.Element.Value);
                        if (ok) { _targets[n++] = i; }
                    }
                    break;
                case TargetType.AllyAll:
                    for (int i = 0; i < _n; i++) { if (_u[i].Alive && _u[i].Side == c.Side) { _targets[n++] = i; } }
                    break;
                case TargetType.Self:
                    _targets[n++] = c.Index;
                    break;
                case TargetType.Attacker:
                    if (ctxAttacker >= 0 && _u[ctxAttacker].Alive) { _targets[n++] = ctxAttacker; }
                    break;
                case TargetType.Target:
                {
                    int t = ctxTarget >= 0 ? ctxTarget : primary;
                    if (t >= 0 && _u[t].Alive) { _targets[n++] = t; }
                    break;
                }
            }
            // targetElements：敵・味方どちらでも、属性で絞る（ally_element は上で済み）
            if (e.TargetElementMask != 0 && e.Target != TargetType.AllyElement)
            {
                int m = 0;
                for (int i = 0; i < n; i++) { if ((e.TargetElementMask & (1u << (int)_u[_targets[i]].Element)) != 0) { _targets[m++] = _targets[i]; } }
                n = m;
            }
            return n;
        }

        private static bool UsesEnemy(TargetType t)
        {
            return t == TargetType.EnemySingle || t == TargetType.EnemyArea || t == TargetType.EnemyAll;
        }

        private static bool HasChanceRoll(ResolvedEffect e) { return e.ChancePct < 100; }

        private static bool IsChanceKind(ResolvedEffect e)
        {
            return e.Type == EffectType.ApplyBuff || e.Type == EffectType.Heal || e.Type == EffectType.GaugeShift;
        }

        /// <summary>スキル1回の発動（docs/04 9.3節）。準備 → 効果を並びの順に。</summary>
        private void RunSkill(int caster, int slot, ResolvedSkill sk, int ctxTarget, int ctxAttacker, TriggerType cause, bool onTriggerOnly)
        {
            Unit c = _u[caster];
            Emit(BattleEventType.SkillFired, caster, ctxTarget, 0, slot);
            bool isNormal = slot == 0;
            bool permanent = sk.Trigger.Type == TriggerType.Always;
            var effects = sk.Effects;

            // 準備1：主対象（enemy_* を使うなら1回だけ選ぶ）
            bool needPrimary = false;
            for (int i = 0; i < effects.Count; i++)
            {
                ResolvedEffect e = effects[i];
                if (!Included(e, onTriggerOnly, cause)) { continue; }
                if (UsesEnemy(e.Target) || (e.Target == TargetType.Target && ctxTarget < 0)) { needPrimary = true; break; }
            }
            int primary = needPrimary ? SelectPrimary(c) : -1;

            // 準備2：状態のスナップショット
            for (int i = 0; i < _n; i++) { _snapMask[i] = CurrentMask(i); _snapDebuffs[i] = CountDebuffs(i); }

            // 準備3：人数補正
            _mulBonus = 0; _durBonusTicks = 0;
            Array.Clear(_dbgBonus, 0, _dbgBonus.Length);
            for (int i = 0; i < effects.Count; i++)
            {
                ResolvedEffect e = effects[i];
                if (!Included(e, onTriggerOnly, cause)) { continue; }
                if (e.Type == EffectType.ElementCountBonus)
                {
                    int count = 0;
                    for (int j = 0; j < _n; j++) { if (_u[j].Alive && _u[j].Side == c.Side && e.Element.HasValue && _u[j].Element == e.Element.Value) { count++; } }
                    double bonus = Math.Min(e.CountMax, count * e.CountPerUnit);
                    if (e.CountUnit == CountUnit.Pct) { _mulBonus += bonus; }
                    else { _durBonusTicks += (int)Math.Round(bonus / _k.TickSec, MidpointRounding.AwayFromZero); }
                }
                else if (e.Type == EffectType.DebuffCountBonus)
                {
                    if (e.CountScope == CountScope.EnemyAll)
                    {
                        int total = 0;
                        for (int j = 0; j < _n; j++) { if (_u[j].Side != c.Side) { total += _snapDebuffs[j]; } }
                        double bonus = Math.Min(e.CountMax, total * e.CountPerUnit);
                        for (int j = 0; j < _n; j++) { if (_u[j].Side != c.Side) { _dbgBonus[j] += bonus; } }
                    }
                    else
                    {
                        for (int j = 0; j < _n; j++) { if (_u[j].Side != c.Side) { _dbgBonus[j] += Math.Min(e.CountMax, _snapDebuffs[j] * e.CountPerUnit); } }
                    }
                }
            }

            // 準備4：命中の記録
            Array.Clear(_hitRec, 0, _hitRec.Length);
            Array.Clear(_critRec, 0, _critRec.Length);
            _anyHit = false; _anyCrit = false;
            if ((cause == TriggerType.OnHit || cause == TriggerType.OnCrit) && ctxTarget >= 0)
            {
                _hitRec[ctxTarget] = true; _anyHit = true;
                if (cause == TriggerType.OnCrit) { _critRec[ctxTarget] = true; _anyCrit = true; }
            }

            // 実行
            ResolvedEffect prev = null;
            for (int i = 0; i < effects.Count; i++)
            {
                ResolvedEffect e = effects[i];
                if (!Included(e, onTriggerOnly, cause)) { continue; }
                switch (e.Type)
                {
                    case EffectType.Damage:
                        DoDamage(c, e, primary, ctxTarget, ctxAttacker, isNormal);
                        break;
                    case EffectType.Heal:
                    case EffectType.ApplyBuff:
                    case EffectType.GaugeShift:
                    {
                        bool sameGroup = prev != null && IsChanceKind(prev) && prev.Target == e.Target && prev.ChancePct == e.ChancePct && prev.When == e.When;
                        if (!sameGroup) { Array.Fill(_grp, -1); }
                        DoChanceEffect(c, e, primary, ctxTarget, ctxAttacker, permanent);
                        break;
                    }
                    case EffectType.Cleanse:
                    {
                        int n = GetTargets(c, e, primary, ctxTarget, ctxAttacker);
                        for (int t = 0; t < n; t++) { RemoveByPolarity(_u[_targets[t]], BuffPolarity.Debuff); }
                        break;
                    }
                    case EffectType.Dispel:
                    {
                        int n = GetTargets(c, e, primary, ctxTarget, ctxAttacker);
                        for (int t = 0; t < n; t++) { RemoveByPolarity(_u[_targets[t]], BuffPolarity.Buff); }
                        break;
                    }
                    default:
                        break; // reflect は実装しない／人数補正は準備で処理済み
                }
                prev = e;
            }
        }

        private void RemoveByPolarity(Unit u, BuffPolarity polarity)
        {
            for (int i = 0; i < u.StCount;)
            {
                if (_buffs[u.St[i].Buff].Polarity == polarity) { RemoveStatusAt(u, i); } else { i++; }
            }
        }

        private void DoDamage(Unit c, ResolvedEffect e, int primary, int ctxTarget, int ctxAttacker, bool isNormal)
        {
            int n = GetTargets(c, e, primary, ctxTarget, ctxAttacker);
            // _targets は DealDamage 中に書き換わらない（作業領域は GetTargets だけが使う）。ただし念のため手元に写す。
            for (int ti = 0; ti < n; ti++)
            {
                int t = _targets[ti];
                Unit target = _u[t];
                if (!target.Alive) { continue; }
                if (e.IfAnyStatusMask != 0 && (_snapMask[t] & e.IfAnyStatusMask) == 0) { continue; }
                Refresh(target);
                Refresh(c);
                if (target.DamageImmune)
                {
                    Emit(BattleEventType.Immune, c.Index, t, 0, 0);
                    _hitRec[t] = false; _critRec[t] = false;
                    continue;
                }
                bool hit, crit;
                if (e.Bonus)
                {
                    hit = _hitRec[t]; crit = _critRec[t];
                    if (!hit) { continue; }
                }
                else
                {
                    hit = DamageCalc.Roll(_chance, _k, c.Eff.AccuracyPct, target.Eff.EvasionPct, c.Eff.CritRatePct, target.Eff.CritResistPct, target.CritImmune, out crit);
                    _hitRec[t] = hit; _critRec[t] = crit;
                    if (!hit) { Emit(BattleEventType.Miss, c.Index, t, 0, 0); continue; }
                    _anyHit = true;
                    if (crit) { _anyCrit = true; }
                }
                double dmg = DamageCalc.Damage(_k, c.Eff.Atk, target.Eff.Def, e.MultiplierPct, _mulBonus + _dbgBonus[t],
                    c.MaxHp - c.Hp, e.BonusSelfLostHpPct, DamageCalc.ElementMultiplier(_k, c.Element, target.Element),
                    crit, DamageCalc.CritMultiplier(_k, c.Eff.CritDamagePct, target.Eff.CritDefensePct));
                DealDamage(c.Index, t, dmg, crit ? DamageFlags.Crit : 0, true);
                if (isNormal && !e.Bonus && c.Alive)
                {
                    EnqueueHitTriggers(c, t, crit);
                }
            }
        }

        private void EnqueueHitTriggers(Unit c, int target, bool crit)
        {
            for (int s = 1; s < c.Slots.Length; s++)
            {
                ResolvedSkill sk = c.Slots[s];
                if (sk == null) { continue; }
                TriggerType tt = sk.Trigger.Type;
                if (tt == TriggerType.OnHit) { Enqueue(c.Index, s, TriggerType.OnHit, target, -1, false); }
                else if (tt == TriggerType.OnCrit && crit) { Enqueue(c.Index, s, TriggerType.OnCrit, target, -1, false); }
                if (c.OnTrigHit[s]) { Enqueue(c.Index, s, TriggerType.OnHit, target, -1, true); }
                if (crit && c.OnTrigCrit[s]) { Enqueue(c.Index, s, TriggerType.OnCrit, target, -1, true); }
            }
        }

        private void DoChanceEffect(Unit c, ResolvedEffect e, int primary, int ctxTarget, int ctxAttacker, bool permanent)
        {
            int n = GetTargets(c, e, primary, ctxTarget, ctxAttacker);
            for (int ti = 0; ti < n; ti++)
            {
                int t = _targets[ti];
                Unit target = _u[t];
                if (e.Type != EffectType.GaugeShift && !target.Alive && !(e.Target == TargetType.Self)) { continue; }
                // 前提（when・if）。成り立たなければ乱数を引かない。
                if (e.When == EffectWhen.AfterHit)
                {
                    bool ok = IsEnemyOf(c.Index, t) ? _hitRec[t] : _anyHit;
                    if (!ok) { continue; }
                }
                else if (e.When == EffectWhen.OnCrit)
                {
                    bool ok = IsEnemyOf(c.Index, t) ? _critRec[t] : _anyCrit;
                    if (!ok) { continue; }
                }
                if (e.IfAnyStatusMask != 0 && (_snapMask[t] & e.IfAnyStatusMask) == 0) { continue; }
                if (HasChanceRoll(e))
                {
                    if (_grp[t] < 0) { _grp[t] = _chance.Chance(e.ChancePct) ? 1 : 0; }
                    if (_grp[t] == 0) { continue; }
                }
                switch (e.Type)
                {
                    case EffectType.ApplyBuff:
                        ApplyStatus(c.Index, target, e.BuffIndex, e.Tier, e.DurationTicks + _durBonusTicks, permanent);
                        break;
                    case EffectType.Heal:
                        HealUnit(c.Index, target, EffAtk(c.Index) * (e.MultiplierPct + _mulBonus) / 100.0);
                        break;
                    case EffectType.GaugeShift:
                        ShiftGauge(c.Index, target, e.ShiftTicks);
                        break;
                }
            }
        }

        private void ShiftGauge(int source, Unit target, int shiftTicks)
        {
            if (!target.Alive || target.CooldownSlot < 0) { return; }
            int s = target.CooldownSlot;
            int cap = target.Slots[s].Trigger.CooldownTicks;
            int next = target.Remaining[s] - shiftTicks;
            if (next < 0) { next = 0; }
            if (next > cap) { next = cap; }
            target.Remaining[s] = next;
            Emit(BattleEventType.GaugeShifted, source, target.Index, shiftTicks, s);
        }

        private void HealUnit(int healer, Unit target, double amount)
        {
            if (!target.Alive || amount <= 0) { return; }
            Refresh(target);
            if (target.HealBlocked) { return; }
            double actual = Math.Min(amount, target.MaxHp - target.Hp);
            if (actual <= 0) { return; }
            target.Hp += actual;
            if (healer >= 0) { _result.Healed[healer] += actual; }
            Emit(BattleEventType.Heal, healer, target.Index, actual, 0);
        }

        /// <summary>ダメージを与える（シールドが先に減る）。allowReact が false なら反射・被ダメージのきっかけを起こさない。</summary>
        private void DealDamage(int src, int tgt, double dmg, int aux, bool allowReact)
        {
            Unit t = _u[tgt];
            if (!t.Alive) { return; }
            Refresh(t);
            double reflectPct = t.ReflectPct;
            double remaining = dmg;
            for (int i = 0; i < t.StCount && remaining > 0; i++)
            {
                if (t.St[i].Shield > 0)
                {
                    double take = Math.Min(t.St[i].Shield, remaining);
                    t.St[i].Shield -= take;
                    remaining -= take;
                }
            }
            t.Hp -= remaining;
            if (src >= 0) { _result.DamageDealt[src] += dmg; }
            _result.DamageTaken[tgt] += dmg;
            Emit(BattleEventType.Damage, src, tgt, dmg, aux);
            if (t.Hp <= 0) { t.Hp = 0; Kill(t, src); }
            if (allowReact && reflectPct > 0 && src >= 0 && src != tgt && _u[src].Alive)
            {
                DealDamage(tgt, src, dmg * reflectPct / 100.0, DamageFlags.Reflect, false);
            }
            if (!t.Alive) { return; }
            if (allowReact && src >= 0)
            {
                for (int s = 1; s < t.Slots.Length; s++)
                {
                    ResolvedSkill sk = t.Slots[s];
                    if (sk != null && sk.Trigger.Type == TriggerType.OnDamaged) { Enqueue(tgt, s, TriggerType.OnDamaged, -1, src, false); }
                }
            }
            CheckHpBelow(t);
        }

        private void Kill(Unit t, int killer)
        {
            t.Alive = false;
            Emit(BattleEventType.Death, killer, t.Index, 0, 0);
            // 期限なしの効果は、発動者が戦闘不能になった刻みに外す
            for (int v = 0; v < _n; v++)
            {
                Unit o = _u[v];
                for (int i = 0; i < o.StCount;)
                {
                    if (o.St[i].Expire == int.MaxValue && o.St[i].Caster == t.Index) { RemoveStatusAt(o, i); } else { i++; }
                }
            }
            for (int s = 1; s < t.Slots.Length; s++)
            {
                ResolvedSkill sk = t.Slots[s];
                if (sk != null && sk.Trigger.Type == TriggerType.OnDeath) { Enqueue(t.Index, s, TriggerType.OnDeath, -1, killer, false); }
            }
            if (killer >= 0 && _u[killer].Alive && _u[killer].Side != t.Side)
            {
                Unit k = _u[killer];
                for (int s = 1; s < k.Slots.Length; s++)
                {
                    ResolvedSkill sk = k.Slots[s];
                    if (sk != null && sk.Trigger.Type == TriggerType.OnKill) { Enqueue(killer, s, TriggerType.OnKill, t.Index, -1, false); }
                }
            }
        }
    }
}
