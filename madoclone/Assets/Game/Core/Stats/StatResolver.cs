using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Data;

namespace Mado.Core.Stats
{
    /// <summary>育成状態からステータスの実数を求める純粋関数（docs/04 8.2節）。乱数・時刻を使わない。</summary>
    public sealed class StatResolver
    {
        private readonly GameData _data;
        private readonly IReadOnlyList<IModifierSource> _sources;

        public StatResolver(GameData data, IReadOnlyList<IModifierSource> sources = null)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _sources = sources ?? new IModifierSource[0];
        }

        public BattleStats Resolve(CharacterDef c, CharacterState s, bool isLeader)
        {
            return Resolve(c, s.Star, s.Lv, isLeader);
        }

        public BattleStats Resolve(CharacterDef c, int star, int lv, bool isLeader)
        {
            StatTables t = _data.Stats;
            if (star < 0 || star >= t.StarMaxLv.Count) { throw new ArgumentException("★が範囲外: " + star); }
            if (lv < 1 || lv > t.StarMaxLv[star] || lv > t.LevelTable.Count) { throw new ArgumentException("Lv が範囲外: ★" + star + " Lv" + lv); }

            LevelRow row = t.LevelTable[lv - 1];
            RoleMultiplier role = t.ForRole(c.Role);
            double k = t.StarMultipliers[star] * _data.Tier(c.Tier).StatMultiplier;
            double atk = row.Atk * role.Atk * k;
            double hp = row.Hp * role.Hp * k;
            double def = row.Def * role.Def * k;

            var mods = new List<Modifier>();
            var query = new StatQuery(c.Id, star, lv, c.Element, isLeader);
            foreach (IModifierSource src in _sources) { src.Collect(mods, query); }

            double[] pool = new double[3 * 3]; // [輪 × Atk/Hp/Def] の増加％の合計
            double[] flat = new double[10];
            foreach (Modifier m in mods)
            {
                if (m.Pool == ModifierPool.Flat) { flat[(int)m.Stat] += m.Value; continue; }
                if (m.Stat != StatId.Atk && m.Stat != StatId.Hp && m.Stat != StatId.Def) { continue; }
                if (m.Pool == ModifierPool.LeaderLv && !isLeader) { continue; } // リーダー本人にだけ
                pool[(int)m.Pool * 3 + (int)m.Stat] += m.Value;
            }

            BaseSubstats b = _data.System.BaseSubstats;
            double evasion = b.EvasionPct, accuracy = b.AccuracyPct, critRate = b.CritRatePct;
            double critResist = b.CritResistPct, critDamage = b.CritDamagePct, critDefense = b.CritDefensePct;
            foreach (SubstatBonus bonus in c.SubstatBonuses)
            {
                if (bonus.Star > star) { continue; }
                switch (bonus.Stat)
                {
                    case SubstatKey.EvasionPct: evasion += bonus.Value; break;
                    case SubstatKey.AccuracyPct: accuracy += bonus.Value; break;
                    case SubstatKey.CritRatePct: critRate += bonus.Value; break;
                    case SubstatKey.CritResistPct: critResist += bonus.Value; break;
                    case SubstatKey.CritDamagePct: critDamage += bonus.Value; break;
                    default: critDefense += bonus.Value; break;
                }
            }

            double speed = 1.0 + flat[(int)StatId.AttackSpeed] / 100.0;
            return new BattleStats
            {
                // Atk・Hp・Def の Flat は「固定値」（基礎の単位）。基礎に足してから輪を掛ける。
                Atk = (atk + flat[(int)StatId.Atk]) * Mult(pool, StatId.Atk),
                Hp = (hp + flat[(int)StatId.Hp]) * Mult(pool, StatId.Hp),
                Def = (def + flat[(int)StatId.Def]) * Mult(pool, StatId.Def),
                EvasionPct = evasion + flat[(int)StatId.Evasion],
                AccuracyPct = accuracy + flat[(int)StatId.Accuracy],
                CritRatePct = critRate + flat[(int)StatId.CritRate],
                CritResistPct = critResist + flat[(int)StatId.CritResist],
                CritDamagePct = critDamage + flat[(int)StatId.CritDamage],
                CritDefensePct = critDefense + flat[(int)StatId.CritDefense],
                AttackSpeed = Math.Min(speed, _data.System.AttackSpeedMax),
            };
        }

        private static double Mult(double[] pool, StatId stat)
        {
            double r = 1.0;
            for (int p = 0; p < 3; p++) { r *= 1.0 + pool[p * 3 + (int)stat] / 100.0; }
            return r;
        }
    }
}
