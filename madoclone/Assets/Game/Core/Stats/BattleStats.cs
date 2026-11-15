namespace Mado.Core.Stats
{
    /// <summary>戦闘に渡す、解決済みの実数（docs/04 8.1節）。</summary>
    public struct BattleStats
    {
        public double Atk, Hp, Def;
        public double EvasionPct, AccuracyPct, CritRatePct, CritResistPct, CritDamagePct, CritDefensePct;

        /// <summary>1.0 から始まる倍率。</summary>
        public double AttackSpeed;

        public double Power { get { return Hp + 3.0 * (Atk + Def); } }
    }
}
