using System;
using System.Collections.Generic;

namespace Mado.Core.Battle
{
    public enum FloatKind { Damage, Crit, Dot, Reflect, Heal, Miss, Immune }

    /// <summary>画面に出す数字（ダメージ・回復・ミス）。</summary>
    public readonly struct FloatText
    {
        public readonly int Tick;
        public readonly int Unit;
        public readonly double Value;
        public readonly FloatKind Kind;

        public FloatText(int tick, int unit, double value, FloatKind kind) { Tick = tick; Unit = unit; Value = value; Kind = kind; }
    }

    public sealed class ReplayUnit
    {
        public int Index { get; set; }
        public string Id { get; set; }
        public Side Side { get; set; }
        public bool IsSupport { get; set; }
        public double MaxHp { get; set; }
        public double Hp { get; set; }
        public double Shield { get; set; }
        public bool Alive { get; set; }
    }

    /// <summary>
    /// 戦闘の再生用の記録（docs/02 3.3節）。戦闘は Core で最後まで一気に進め、出てきた BattleEvent を貯める。
    /// View は AdvanceTo で好きな刻みまで進めて、各ユニットの HP と、画面に出す数字（FloatText）を読む。再生速度は進める刻みの数だけの違いで、結果は変わらない。
    /// スキップは SkipToEnd。シールドは「付与で増え、ダメージで先に減る」だけを追う（期限切れの消滅は事件にならないので、表示用の近似）。
    /// </summary>
    public sealed class BattleReplay : IBattleEventSink
    {
        private readonly List<BattleEvent> _events = new List<BattleEvent>();
        private readonly List<ReplayUnit> _units = new List<ReplayUnit>();
        private int _cursor;
        private int _applied = -1;

        public IReadOnlyList<ReplayUnit> Units { get { return _units; } }
        public IReadOnlyList<BattleEvent> Events { get { return _events; } }
        public BattleResult Result { get; private set; }

        /// <summary>この刻みまで再生した（まだなら -1）。</summary>
        public int CurrentTick { get { return _applied; } }

        public bool Finished { get { return Result != null && _cursor >= _events.Count; } }

        /// <summary>戦闘を最後まで進めて、記録を作る。</summary>
        public static BattleReplay Record(BattleSetup setup)
        {
            if (setup == null) { throw new ArgumentNullException(nameof(setup)); }
            var replay = new BattleReplay();
            for (int i = 0; i < setup.Allies.Count; i++) { replay.AddUnit(i, setup.Allies[i], Side.Ally, false); }
            for (int i = 0; i < setup.Enemies.Count; i++) { replay.AddUnit(setup.Allies.Count + i, setup.Enemies[i], Side.Enemy, false); }
            int n = setup.Allies.Count + setup.Enemies.Count;
            for (int i = 0; i < setup.Supports.Count; i++) { replay.AddUnit(n + i, setup.Supports[i], Side.Ally, true); }
            replay.Result = new BattleSim(setup).RunToEnd(replay);
            return replay;
        }

        private void AddUnit(int index, UnitSetup setup, Side side, bool support)
        {
            double hp = setup.Stats.Hp;
            _units.Add(new ReplayUnit { Index = index, Id = setup.Id, Side = side, IsSupport = support, MaxHp = hp, Hp = hp, Alive = true });
        }

        public void OnEvent(in BattleEvent e) { _events.Add(e); }

        /// <summary>tick（含む）までの出来事を反映する。画面に出す数字を floats に足す（null なら捨てる）。</summary>
        public void AdvanceTo(int tick, List<FloatText> floats = null)
        {
            while (_cursor < _events.Count && _events[_cursor].Tick <= tick)
            {
                Apply(_events[_cursor], floats);
                _cursor++;
            }
            if (tick > _applied) { _applied = tick; }
        }

        /// <summary>スキップ：最後まで反映する。</summary>
        public void SkipToEnd(List<FloatText> floats = null)
        {
            while (_cursor < _events.Count) { Apply(_events[_cursor], floats); _cursor++; }
            _applied = Result != null ? Result.EndTick : _applied;
        }

        private void Apply(BattleEvent e, List<FloatText> floats)
        {
            switch (e.Type)
            {
                case BattleEventType.Damage:
                {
                    ReplayUnit u = Unit(e.Target);
                    if (u == null) { return; }
                    double remaining = e.Value;
                    double absorbed = Math.Min(u.Shield, remaining);
                    u.Shield -= absorbed;
                    remaining -= absorbed;
                    u.Hp = Math.Max(0, u.Hp - remaining);
                    FloatKind kind = (e.Aux & DamageFlags.Reflect) != 0 ? FloatKind.Reflect
                        : (e.Aux & DamageFlags.Dot) != 0 ? FloatKind.Dot
                        : (e.Aux & DamageFlags.Crit) != 0 ? FloatKind.Crit : FloatKind.Damage;
                    if (floats != null) { floats.Add(new FloatText(e.Tick, e.Target, e.Value, kind)); }
                    break;
                }
                case BattleEventType.Heal:
                {
                    ReplayUnit u = Unit(e.Target);
                    if (u == null) { return; }
                    u.Hp = Math.Min(u.MaxHp, u.Hp + e.Value);
                    if (floats != null) { floats.Add(new FloatText(e.Tick, e.Target, e.Value, FloatKind.Heal)); }
                    break;
                }
                case BattleEventType.Shield:
                {
                    ReplayUnit u = Unit(e.Target);
                    if (u != null) { u.Shield += e.Value; }
                    break;
                }
                case BattleEventType.Miss:
                    if (floats != null) { floats.Add(new FloatText(e.Tick, e.Target, 0, FloatKind.Miss)); }
                    break;
                case BattleEventType.Immune:
                    if (floats != null) { floats.Add(new FloatText(e.Tick, e.Target, 0, FloatKind.Immune)); }
                    break;
                case BattleEventType.Death:
                {
                    ReplayUnit u = Unit(e.Target);
                    if (u != null) { u.Alive = false; u.Hp = 0; }
                    break;
                }
            }
        }

        private ReplayUnit Unit(int index)
        {
            return index >= 0 && index < _units.Count ? _units[index] : null;
        }

        /// <summary>HP の割合（0〜1）。</summary>
        public static double HpRatio(ReplayUnit u) { return u.MaxHp > 0 ? Math.Max(0, Math.Min(1, u.Hp / u.MaxHp)) : 0; }
    }
}
