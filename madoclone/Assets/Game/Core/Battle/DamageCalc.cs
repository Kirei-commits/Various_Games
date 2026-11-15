using System;
using Mado.Data;

namespace Mado.Core.Battle
{
    /// <summary>確率の判定の抽象。本番は Rng、テストは固定値を返すモック。</summary>
    public interface IChanceSource
    {
        bool Chance(double percent);
    }

    /// <summary>ダメージの式を書く、ここ1か所（docs/04 9.4節。docs/01 2.1・2.2節）。純粋関数。</summary>
    public static class DamageCalc
    {
        public static double HitChancePct(BattleConstants k, double accuracyPct, double evasionPct)
        {
            return Clamp(accuracyPct - evasionPct, k.HitChanceMinPct, k.HitChanceMaxPct);
        }

        public static double CritChancePct(double critRatePct, double critResistPct)
        {
            return Clamp(critRatePct - critResistPct, 0, 100);
        }

        public static double CritMultiplier(BattleConstants k, double critDamagePct, double critDefensePct)
        {
            return Math.Max(k.CritMultiplierMin, (critDamagePct - critDefensePct) / 100.0);
        }

        /// <summary>属性の倍率（有利 ×1.2、不利 ×0.8）。属性の並びは 前 → 次 に強い（循環）。</summary>
        public static double ElementMultiplier(BattleConstants k, Element attacker, Element defender)
        {
            int n = k.ElementCycle.Count;
            int a = k.ElementCycle.IndexOf(attacker);
            int d = k.ElementCycle.IndexOf(defender);
            if (a < 0 || d < 0 || n == 0) { return 1.0; }
            if ((a + 1) % n == d) { return k.ElementAdvantagePct / 100.0; }
            if ((d + 1) % n == a) { return k.ElementDisadvantagePct / 100.0; }
            return 1.0;
        }

        /// <summary>
        /// 命中 → （命中したときだけ）クリティカルの順に引く。クリティカルシールド（critImmune）でも乱数は引く。
        /// 戻り値は命中したか。crit は最終的にクリティカルになったか。
        /// </summary>
        public static bool Roll(IChanceSource chance, BattleConstants k,
            double accuracyPct, double evasionPct, double critRatePct, double critResistPct, bool critImmune, out bool crit)
        {
            crit = false;
            if (!chance.Chance(HitChancePct(k, accuracyPct, evasionPct))) { return false; }
            bool rolled = chance.Chance(CritChancePct(critRatePct, critResistPct));
            crit = rolled && !critImmune;
            return true;
        }

        /// <summary>
        /// 命中した1回ぶんのダメージ。atk・def は増減を反映した有効値。
        /// 基礎 = atk × (倍率 + 補正)/100 + 失った HP × pct/100（0 未満は 0）。ダメージ = max(最低, (基礎 − 防御) × 属性 × クリ倍率)。
        /// </summary>
        public static double Damage(BattleConstants k, double atk, double def, double multiplierPct, double bonusPct,
            double selfLostHp, double bonusSelfLostHpPct, double elementMultiplier, bool crit, double critMultiplier)
        {
            double basis = atk * (multiplierPct + bonusPct) / 100.0;
            if (bonusSelfLostHpPct > 0) { basis += selfLostHp * bonusSelfLostHpPct / 100.0; }
            if (basis < 0) { basis = 0; }
            double defense = def < 0 ? 0 : def;
            double crit1 = crit ? critMultiplier : 1.0;
            return Math.Max(k.MinDamage, (basis - defense) * elementMultiplier * crit1);
        }

        private static double Clamp(double v, double lo, double hi)
        {
            return v < lo ? lo : (v > hi ? hi : v);
        }
    }
}
