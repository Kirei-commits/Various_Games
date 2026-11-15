using System;
using System.Security.Cryptography;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Data;

namespace Mado.Core.Battle
{
    /// <summary>
    /// 0.1 秒刻みで決定的に進む戦闘（docs/04 9節）。入力は解決済みの BattleSetup だけ。ID も JSON も知らない。
    /// Step の中では new しない（配列は構築時に確保する）。
    /// </summary>
    public sealed partial class BattleSim
    {
        public const int StatusCapacity = 24;
        public const int DotIntervalTicks = 10;
        public const int EventLimit = 200000;

        /// <summary>0.1 を10回足しても 1.0 に届かない誤差を吸収する（攻撃は10刻み目に出る）。</summary>
        private const double ProgressEpsilon = 1e-9;
        private const int QueueCapacity = 4096;

        private struct Status
        {
            public int Buff, Tier, Caster;
            public double CasterAtk, Shield;
            public int Expire, NextAt;
        }

        private sealed class Unit
        {
            public int Index;
            public Side Side;
            public UnitSetup Setup;
            public Element Element;
            public Row Row;
            public bool Alive;
            public double Hp, MaxHp;
            public BattleStats Eff;
            public bool Dirty;
            public Status[] St = new Status[StatusCapacity];
            public int StCount;
            public double AttackProgress;

            // 枠：0 通常、1 特殊、2 必殺、3.. 魔晶
            public ResolvedSkill[] Slots;
            public int[] Remaining;
            public bool[] Fired;
            public bool[] OnTrigHit, OnTrigCrit;
            public int CooldownSlot = -1;

            // 状態から計算した値
            public bool CannotAct, GaugeStopped, HealBlocked, DamageImmune, CritImmune;
            public double ReflectPct;
            public int TauntCaster;
            public uint ImmuneMask;
        }

        private struct Pending
        {
            public int Unit, Slot, CtxTarget, CtxAttacker;
            public TriggerType Kind;
            public bool OnTriggerOnly;
        }

        private readonly BattleSetup _setup;
        private readonly BattleConstants _k;
        private readonly ResolvedBuff[] _buffs;
        private readonly Unit[] _u;
        private readonly int _nA, _n;
        private readonly Rng _rng;
        private readonly IChanceSource _chance;
        private readonly Pending[] _queue = new Pending[QueueCapacity];
        private int _qHead, _qTail;
        private IBattleEventSink _sink;
        private readonly IncrementalHash _hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        private readonly byte[] _hb = new byte[21];
        private int _eventCount;
        private bool _eventLimitWarned;
        private int _tick;
        private bool _started, _ended;
        private readonly BattleResult _result = new BattleResult();

        private sealed class RngChance : IChanceSource
        {
            private readonly Rng _r;
            public RngChance(Rng r) { _r = r; }
            public bool Chance(double percent) { return _r.Chance(percent); }
        }

        public BattleSim(BattleSetup setup) : this(setup, null) { }

        /// <summary>chance を渡すと乱数の代わりに使う（テスト用）。</summary>
        public BattleSim(BattleSetup setup, IChanceSource chance)
        {
            _setup = setup ?? throw new ArgumentNullException(nameof(setup));
            _k = setup.Constants;
            _buffs = setup.Buffs.ToArray();
            _rng = Rng.Create(setup.Seed, RngStream.Battle);
            _chance = chance ?? new RngChance(_rng);
            _nA = setup.Allies.Count;
            _n = _nA + setup.Enemies.Count;
            _u = new Unit[_n];
            for (int i = 0; i < _n; i++)
            {
                UnitSetup us = i < _nA ? setup.Allies[i] : setup.Enemies[i - _nA];
                var u = new Unit
                {
                    Index = i, Side = i < _nA ? Side.Ally : Side.Enemy, Setup = us, Element = us.Element, Row = us.Row,
                    TauntCaster = -1,
                };
                int slots = 3 + us.Crystals.Count;
                u.Slots = new ResolvedSkill[slots];
                u.Remaining = new int[slots];
                u.Fired = new bool[slots];
                u.OnTrigHit = new bool[slots];
                u.OnTrigCrit = new bool[slots];
                u.Slots[0] = us.Normal;
                u.Slots[1] = us.Special;
                u.Slots[2] = us.Ultimate;
                for (int c = 0; c < us.Crystals.Count; c++) { u.Slots[3 + c] = us.Crystals[c]; }
                for (int s = 0; s < slots; s++)
                {
                    ResolvedSkill sk = u.Slots[s];
                    if (sk == null) { continue; }
                    foreach (ResolvedEffect e in sk.Effects)
                    {
                        if (e.OnTrigger == TriggerType.OnHit) { u.OnTrigHit[s] = true; }
                        if (e.OnTrigger == TriggerType.OnCrit) { u.OnTrigCrit[s] = true; }
                    }
                    if (sk.Trigger.Type == TriggerType.Cooldown && u.CooldownSlot < 0) { u.CooldownSlot = s; }
                }
                _u[i] = u;
            }
            int nn = Math.Max(_n, 1);
            _result.DamageDealt = new double[nn];
            _result.DamageTaken = new double[nn];
            _result.Healed = new double[nn];
            _targets = new int[nn];
            _snapMask = new uint[nn];
            _snapDebuffs = new int[nn];
            _hitRec = new bool[nn];
            _critRec = new bool[nn];
            _grp = new int[nn];
            _dbgBonus = new double[nn];
        }

        public int Tick { get { return _tick; } }
        public bool Ended { get { return _ended; } }
        public int UnitCount { get { return _n; } }
        public int AllyCount { get { return _nA; } }
        public bool IsAlive(int unit) { return _u[unit].Alive; }
        public double Hp(int unit) { return _u[unit].Hp; }

        // ---------------- 開始・進行 ----------------

        public void Start() { Start(null); }

        public void Start(IBattleEventSink sink)
        {
            if (_started) { throw new InvalidOperationException("Start は1回だけ"); }
            _started = true;
            _sink = sink;
            _tick = 0;
            for (int i = 0; i < _n; i++)
            {
                Unit u = _u[i];
                u.Alive = true;
                u.MaxHp = u.Setup.Stats.Hp;
                u.Hp = u.MaxHp;
                u.Dirty = true;
                u.AttackProgress = 0;
                for (int s = 1; s < u.Slots.Length; s++)
                {
                    ResolvedSkill sk = u.Slots[s];
                    if (sk == null) { continue; }
                    if (sk.Trigger.Type == TriggerType.Cooldown) { u.Remaining[s] = sk.Trigger.CooldownTicks; }
                    else if (sk.Trigger.Type == TriggerType.Interval) { u.Remaining[s] = sk.Trigger.EveryTicks; }
                }
            }
            // 戦闘開始時の効果 → 期限なしの効果、の順（味方スロット順 → リーダー → 敵）。
            for (int i = 0; i < _n; i++) { FireStartTriggers(i, TriggerType.OnBattleStart); }
            for (int i = 0; i < _n; i++) { FireStartTriggers(i, TriggerType.Always); }
            DrainQueue();
            CheckEnd();
        }

        private void FireStartTriggers(int i, TriggerType type)
        {
            Unit u = _u[i];
            for (int s = 1; s < u.Slots.Length; s++)
            {
                ResolvedSkill sk = u.Slots[s];
                if (sk != null && sk.Trigger.Type == type && u.Alive) { RunSkill(i, s, sk, -1, -1, type, false); }
            }
        }

        /// <summary>1刻み進める。続けるなら true、終わったら false。</summary>
        public bool Step(IBattleEventSink sink)
        {
            if (!_started) { throw new InvalidOperationException("先に Start"); }
            if (_ended) { return false; }
            _sink = sink;
            _tick++;
            if (_tick >= _setup.Rules.TimeLimitTicks) { End(BattleOutcome.TimeUp); return false; }

            for (int i = 0; i < _n; i++) { if (_u[i].Alive) { UpdateStatuses(_u[i]); } }

            for (int i = 0; i < _n; i++)
            {
                Unit u = _u[i];
                if (!u.Alive) { continue; }
                Refresh(u);
                if (u.CannotAct) { continue; }
                ResolvedSkill normal = u.Slots[0];
                if (normal != null)
                {
                    u.AttackProgress += u.Eff.AttackSpeed * _k.TickSec / _k.BaseAttackIntervalSec;
                    while (u.AttackProgress >= 1.0 - ProgressEpsilon && u.Alive)
                    {
                        u.AttackProgress -= 1.0;
                        RunSkill(i, 0, normal, -1, -1, TriggerType.AttackInterval, false);
                        Refresh(u);
                        if (u.CannotAct) { break; }
                    }
                }
                for (int s = 1; s < u.Slots.Length && u.Alive; s++)
                {
                    ResolvedSkill sk = u.Slots[s];
                    if (sk == null) { continue; }
                    TriggerType t = sk.Trigger.Type;
                    if (t == TriggerType.Interval)
                    {
                        u.Remaining[s]--;
                        if (u.Remaining[s] <= 0) { u.Remaining[s] = sk.Trigger.EveryTicks; RunSkill(i, s, sk, -1, -1, t, false); }
                    }
                    else if (t == TriggerType.Cooldown)
                    {
                        Refresh(u);
                        if (!u.GaugeStopped) { u.Remaining[s]--; }
                        if (u.Remaining[s] <= 0) { u.Remaining[s] = sk.Trigger.CooldownTicks; RunSkill(i, s, sk, -1, -1, t, false); }
                    }
                }
            }

            DrainQueue();
            return !CheckEnd();
        }

        public BattleResult RunToEnd(IBattleEventSink sink)
        {
            if (!_started) { Start(sink); }
            while (Step(sink)) { }
            return _result;
        }

        public BattleResult Result { get { return _result; } }

        private bool CheckEnd()
        {
            if (_ended) { return true; }
            bool allyAlive = false, enemyAlive = false;
            for (int i = 0; i < _n; i++)
            {
                if (!_u[i].Alive) { continue; }
                if (i < _nA) { allyAlive = true; } else { enemyAlive = true; }
            }
            if (!enemyAlive) { End(BattleOutcome.Win); return true; }   // 相打ちの刻みは味方の勝ち
            if (!allyAlive) { End(BattleOutcome.Lose); return true; }
            return false;
        }

        private void End(BattleOutcome outcome)
        {
            _ended = true;
            _result.Outcome = outcome;
            _result.EndTick = _tick;
            Emit(BattleEventType.BattleEnd, -1, -1, 0, (int)outcome);
            byte[] h = _hash.GetHashAndReset();
            ulong v = 0;
            for (int i = 7; i >= 0; i--) { v = (v << 8) | h[i]; }
            _result.EventHash = v;
            _result.EventCount = _eventCount;
        }

        // ---------------- イベント ----------------

        private void Emit(BattleEventType type, int source, int target, double value, int aux)
        {
            if (_eventCount >= EventLimit)
            {
                if (!_eventLimitWarned) { _eventLimitWarned = true; }
                return;
            }
            _eventCount++;
            int t = _tick;
            _hb[0] = (byte)t; _hb[1] = (byte)(t >> 8); _hb[2] = (byte)(t >> 16); _hb[3] = (byte)(t >> 24);
            _hb[4] = (byte)type;
            short s = (short)source, g = (short)target;
            _hb[5] = (byte)s; _hb[6] = (byte)(s >> 8);
            _hb[7] = (byte)g; _hb[8] = (byte)(g >> 8);
            long bits = BitConverter.DoubleToInt64Bits(value);
            for (int i = 0; i < 8; i++) { _hb[9 + i] = (byte)(bits >> (8 * i)); }
            _hb[17] = (byte)aux; _hb[18] = (byte)(aux >> 8); _hb[19] = (byte)(aux >> 16); _hb[20] = (byte)(aux >> 24);
            _hash.AppendData(_hb);
            if (_sink != null) { _sink.OnEvent(new BattleEvent(t, type, s, g, value, aux)); }
        }

        // ---------------- キュー ----------------

        private void Enqueue(int unit, int slot, TriggerType kind, int ctxTarget, int ctxAttacker, bool onTriggerOnly)
        {
            if (_qTail >= QueueCapacity) { return; }
            _queue[_qTail++] = new Pending { Unit = unit, Slot = slot, Kind = kind, CtxTarget = ctxTarget, CtxAttacker = ctxAttacker, OnTriggerOnly = onTriggerOnly };
        }

        private void DrainQueue()
        {
            int processed = 0;
            while (_qHead < _qTail)
            {
                if (processed >= _k.ChainLimit)
                {
                    Emit(BattleEventType.Warning, -1, -1, _qTail - _qHead, WarningCode.ChainLimit);
                    break;
                }
                Pending p = _queue[_qHead++];
                processed++;
                Unit u = _u[p.Unit];
                if (!u.Alive && p.Kind != TriggerType.OnDeath) { continue; }
                ResolvedSkill sk = u.Slots[p.Slot];
                if (sk == null) { continue; }
                if (!p.OnTriggerOnly)
                {
                    ResolvedTrigger tr = sk.Trigger;
                    if (tr.IfAnyStatusMask != 0 && (p.CtxTarget < 0 || (CurrentMask(p.CtxTarget) & tr.IfAnyStatusMask) == 0)) { continue; }
                    if (p.Kind == TriggerType.OnHit || p.Kind == TriggerType.OnDamaged)
                    {
                        if (!_chance.Chance(tr.ChancePct)) { continue; }
                    }
                }
                RunSkill(p.Unit, p.Slot, sk, p.CtxTarget, p.CtxAttacker, p.Kind, p.OnTriggerOnly);
            }
            _qHead = 0;
            _qTail = 0;
        }

        /// <summary>HP が減った後に呼ぶ。onHpBelow を積む。</summary>
        private void CheckHpBelow(Unit u)
        {
            if (!u.Alive) { return; }
            double pct = u.MaxHp > 0 ? u.Hp / u.MaxHp * 100.0 : 0;
            for (int s = 1; s < u.Slots.Length; s++)
            {
                ResolvedSkill sk = u.Slots[s];
                if (sk == null || sk.Trigger.Type != TriggerType.OnHpBelow) { continue; }
                if (pct > sk.Trigger.Pct) { continue; }
                if (sk.Trigger.Once && u.Fired[s]) { continue; }
                u.Fired[s] = true;
                Enqueue(u.Index, s, TriggerType.OnHpBelow, -1, -1, false);
            }
        }

        // ---------------- 状態 ----------------

        private uint CurrentMask(int unit)
        {
            Unit u = _u[unit];
            uint m = 0;
            for (int i = 0; i < u.StCount; i++) { m |= 1u << u.St[i].Buff; }
            return m;
        }

        private ResolvedBuffTier TierOf(int buff, int tier)
        {
            ResolvedBuff b = _buffs[buff];
            return tier >= 0 && tier < b.Tiers.Length ? b.Tiers[tier] : null;
        }

        private void Refresh(Unit u)
        {
            if (!u.Dirty) { return; }
            u.Dirty = false;
            BattleStats b = u.Setup.Stats;
            double atkP = 0, defP = 0, cdP = 0, cfP = 0, cr = 0, crs = 0, acc = 0, ev = 0;
            u.CannotAct = false; u.GaugeStopped = false; u.HealBlocked = false; u.DamageImmune = false; u.CritImmune = false;
            u.ReflectPct = 0; u.TauntCaster = -1; u.ImmuneMask = 0;
            for (int i = 0; i < u.StCount; i++)
            {
                ResolvedBuffTier t = TierOf(u.St[i].Buff, u.St[i].Tier);
                if (t == null) { continue; }
                for (int m = 0; m < t.StatMods.Count; m++)
                {
                    ResolvedStatMod sm = t.StatMods[m];
                    switch (sm.Stat)
                    {
                        case StatKey.Atk: atkP += sm.Value; break;
                        case StatKey.Def: defP += sm.Value; break;
                        case StatKey.CritDmg: cdP += sm.Value; break;
                        case StatKey.CritDef: cfP += sm.Value; break;
                        case StatKey.CritRate: cr += sm.Value; break;
                        case StatKey.CritResist: crs += sm.Value; break;
                        case StatKey.Accuracy: acc += sm.Value; break;
                        case StatKey.Evasion: ev += sm.Value; break;
                    }
                }
                if (t.CannotAct) { u.CannotAct = true; }
                if (t.UltimateGaugeStopped) { u.GaugeStopped = true; }
                if (t.HealBlocked) { u.HealBlocked = true; }
                if (t.DamageImmune) { u.DamageImmune = true; }
                if (t.CritDamageImmune) { u.CritImmune = true; }
                if (t.ReflectPct > u.ReflectPct) { u.ReflectPct = t.ReflectPct; }
                if (t.ForceTargetCaster) { u.TauntCaster = u.St[i].Caster; }
                u.ImmuneMask |= t.ImmuneToMask;
            }
            u.Eff = b;
            u.Eff.Atk = b.Atk * Math.Max(0, 1 + atkP / 100.0);
            u.Eff.Def = b.Def * Math.Max(0, 1 + defP / 100.0);
            u.Eff.CritDamagePct = b.CritDamagePct * Math.Max(0, 1 + cdP / 100.0);
            u.Eff.CritDefensePct = b.CritDefensePct * Math.Max(0, 1 + cfP / 100.0);
            u.Eff.CritRatePct = b.CritRatePct + cr;
            u.Eff.CritResistPct = b.CritResistPct + crs;
            u.Eff.AccuracyPct = b.AccuracyPct + acc;
            u.Eff.EvasionPct = b.EvasionPct + ev;
        }

        private void RemoveStatusAt(Unit u, int index)
        {
            Emit(BattleEventType.BuffRemoved, -1, u.Index, 0, u.St[index].Buff * 8 + u.St[index].Tier);
            u.StCount--;
            u.St[index] = u.St[u.StCount];
            u.Dirty = true;
        }

        /// <summary>期限切れを外し、毎秒の継続ダメージ・継続回復を処理する。</summary>
        private void UpdateStatuses(Unit u)
        {
            for (int i = 0; i < u.StCount && u.Alive;)
            {
                ref Status st = ref u.St[i];
                ResolvedBuffTier t = TierOf(st.Buff, st.Tier);
                if (t != null && st.NextAt > 0 && _tick >= st.NextAt)
                {
                    st.NextAt += DotIntervalTicks;
                    if (t.DotAtkPct > 0 && !u.DamageImmune)
                    {
                        double dmg = st.CasterAtk * t.DotAtkPct / 100.0;
                        int caster = st.Caster;
                        DealDamage(caster, u.Index, dmg, DamageFlags.Dot, false);
                        if (!u.Alive) { return; }
                    }
                    else if (t.HotAtkPct > 0)
                    {
                        HealUnit(st.Caster, u, st.CasterAtk * t.HotAtkPct / 100.0);
                    }
                }
                if (_tick >= u.St[i].Expire) { RemoveStatusAt(u, i); continue; }
                i++;
            }
        }

        /// <summary>付与。無効化・重ね掛け・容量の規則は docs/04 9.5節。</summary>
        private void ApplyStatus(int caster, Unit target, int buff, TierLevel? tierLevel, int durationTicks, bool permanent)
        {
            int tier = tierLevel.HasValue ? (int)tierLevel.Value : 0;
            ResolvedBuffTier tdef = TierOf(buff, tier);
            if (tdef == null) { return; }
            Refresh(target);
            // 束縛・氷結を防ぐ状態（immuneTo）
            if ((target.ImmuneMask & (1u << buff)) != 0) { return; }

            int expire = permanent ? int.MaxValue : _tick + durationTicks;
            double casterAtk = caster >= 0 ? EffAtk(caster) : 0;
            int existing = -1;
            for (int i = 0; i < target.StCount; i++) { if (target.St[i].Buff == buff) { existing = i; break; } }
            if (existing >= 0)
            {
                int cur = target.St[existing].Tier;
                if (tier > cur) { return; }      // 低い段階は無視（効果時間も延ばさない）。段階なしは常に 0 なので上書き
                // 同じ段階は上書き、高い段階は置き換え。
                FillStatus(ref target.St[existing], buff, tier, caster, casterAtk, expire, tdef, target);
                target.Dirty = true;
                Emit(BattleEventType.BuffApplied, caster, target.Index, durationTicks, buff * 8 + tier);
                return;
            }
            if (target.StCount >= StatusCapacity)
            {
                Emit(BattleEventType.Warning, caster, target.Index, buff, WarningCode.StatusCapacity);
                return;
            }
            FillStatus(ref target.St[target.StCount], buff, tier, caster, casterAtk, expire, tdef, target);
            target.StCount++;
            target.Dirty = true;
            Emit(BattleEventType.BuffApplied, caster, target.Index, durationTicks, buff * 8 + tier);
        }

        private void FillStatus(ref Status st, int buff, int tier, int caster, double casterAtk, int expire, ResolvedBuffTier tdef, Unit target)
        {
            st.Buff = buff; st.Tier = tier; st.Caster = caster; st.CasterAtk = casterAtk; st.Expire = expire;
            st.NextAt = (tdef.DotAtkPct > 0 || tdef.HotAtkPct > 0) ? _tick + DotIntervalTicks : 0;
            st.Shield = 0;
            if (tdef.ShieldMaxHpPct > 0)
            {
                st.Shield = target.MaxHp * tdef.ShieldMaxHpPct / 100.0;
                Emit(BattleEventType.Shield, caster, target.Index, st.Shield, 1);
            }
        }

        private double EffAtk(int unit)
        {
            Unit u = _u[unit];
            Refresh(u);
            return u.Eff.Atk;
        }
    }
}
