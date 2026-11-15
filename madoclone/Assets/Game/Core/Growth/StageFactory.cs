using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Stats;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum StageKind { Wave, Boss }

    /// <summary>
    /// 難易度（difficulty.json）から敵を作る（docs/01 6.1・6.2節）。敵ごとの専用スキルはまだ無く、
    /// 全員が単体攻撃の通常スキルだけを持つ（フェーズ1の後半で足す）。
    /// </summary>
    public sealed class StageFactory
    {
        private readonly GameData _data;
        private readonly BuffBook _book;

        public StageFactory(GameData data)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _book = new BuffBook(data);
        }

        /// <summary>g(r)：区間ごとに一定、または gFrom → gTo の直線。</summary>
        public double Growth(int rank)
        {
            foreach (GrowthStep s in _data.Difficulty.Growth)
            {
                if (rank < s.FromRank || rank > s.ToRank) { continue; }
                if (s.G.HasValue) { return s.G.Value; }
                double t = s.ToRank == s.FromRank ? 0 : (double)(rank - s.FromRank) / (s.ToRank - s.FromRank);
                return s.GFrom.Value + (s.GTo.Value - s.GFrom.Value) * t;
            }
            throw new ArgumentException("ランクが範囲外: " + rank);
        }

        /// <summary>E(r)：ランク r の開始値。E(1)=e1、E(r+1)=E(r)×g(r)。</summary>
        public double RankStart(int rank)
        {
            double e = _data.Difficulty.E1;
            for (int r = 1; r < rank; r++) { e *= Growth(r); }
            return e;
        }

        /// <summary>推奨戦力。エリアボス（x-10）は ×1.15、ランクボス（10-10）は次のランクの開始値。</summary>
        public double RecommendedPower(int rank, int area, int stage)
        {
            DifficultyConfig d = _data.Difficulty;
            if (rank < 1 || rank > d.Ranks || area < 1 || area > d.AreasPerRank || stage < 1 || stage > d.StagesPerArea)
            {
                throw new ArgumentException("ランク・エリア・ステージが範囲外");
            }
            if (area == d.AreasPerRank && stage == d.StagesPerArea) { return RankStart(rank + 1); }
            double index = d.StagesPerArea * (area - 1) + stage - 1;
            double p = RankStart(rank) * Math.Pow(Growth(rank), index / (d.AreasPerRank * d.StagesPerArea));
            return stage == d.StagesPerArea ? p * d.AreaBossMultiplier : p;
        }

        public double TimeLimitSec(StageKind kind)
        {
            return kind == StageKind.Boss ? _data.System.TimeLimitSec.Boss : _data.System.TimeLimitSec.Stage;
        }

        /// <summary>雑魚ウェーブ：合計戦力 = 推奨 × wavePowerRatio、3体（タンク・アタッカー・回復）。ボス戦：合計 = 推奨 × bossFightPowerRatio、ボス本体が bossShareOfFight、残りを2体で分ける。</summary>
        public List<UnitSetup> Build(int rank, int area, int stage, StageKind kind)
        {
            DifficultyConfig d = _data.Difficulty;
            double rec = RecommendedPower(rank, area, stage);
            double total = rec * (kind == StageKind.Wave ? d.WavePowerRatio : d.BossFightPowerRatio);
            return BuildWithPower(rank, total, kind);
        }

        /// <summary>敵の合計戦力を直接決めて作る（ゴールデンや、味方の戦力に合わせたシミュレーション用）。</summary>
        public List<UnitSetup> BuildWithPower(int rank, double totalPower, StageKind kind)
        {
            DifficultyConfig d = _data.Difficulty;
            var units = new List<UnitSetup>();
            if (kind == StageKind.Wave)
            {
                double each = totalPower / 3.0;
                units.Add(Enemy(rank, "tank", each, 0));
                units.Add(Enemy(rank, "attacker", each, 1));
                units.Add(Enemy(rank, "healer", each, 2));
            }
            else
            {
                double boss = totalPower * d.BossShareOfFight;
                double rest = (totalPower - boss) / 2.0;
                units.Add(Enemy(rank, "attacker", boss, 0));
                units.Add(Enemy(rank, "tank", rest, 1));
                units.Add(Enemy(rank, "healer", rest, 2));
            }
            return units;
        }

        private UnitSetup Enemy(int rank, string type, double power, int index)
        {
            DifficultyConfig d = _data.Difficulty;
            EnemyTypeMultiplier m = d.EnemyTypes[type];
            EnemyScaleRow scale = null;
            foreach (EnemyScaleRow row in d.EnemyScale) { if (row.Rank == rank) { scale = row; } }
            double hpScale = scale != null ? scale.Hp : 1.0;
            double atkScale = scale != null ? scale.Atk : 1.0;
            EnemySubstatFormulas f = d.EnemySubstats;
            Role role = type == "tank" ? Role.Defense : (type == "healer" ? Role.Heal : (type == "disrupt" ? Role.Disrupt : Role.Ranged));
            var normal = new ResolvedSkill
            {
                Id = "enemy_normal",
                Trigger = new ResolvedTrigger { Type = TriggerType.AttackInterval },
                Effects = new List<ResolvedEffect> { new ResolvedEffect { Type = EffectType.Damage, Target = TargetType.EnemySingle, MultiplierPct = 100 } },
            };
            return new UnitSetup
            {
                Id = "enemy_" + type + "_" + index,
                Element = _data.System.ElementCycle[index % _data.System.ElementCycle.Count],
                Role = role,
                Row = FormationRules.RowFor(role),
                Stats = new BattleStats
                {
                    Hp = power * d.EnemyStatShare.Hp * m.Hp * hpScale,
                    Atk = power * d.EnemyStatShare.Atk * m.Atk * atkScale,
                    Def = power * d.EnemyStatShare.Def * m.Def,
                    AccuracyPct = Linear(f.AccuracyPct, rank),
                    EvasionPct = Linear(f.EvasionPct, rank),
                    CritRatePct = Linear(f.CritRatePct, rank),
                    CritDamagePct = Linear(f.CritDamagePct, rank),
                    CritResistPct = Linear(f.CritResistPct, rank),
                    CritDefensePct = Linear(f.CritDefensePct, rank),
                    AttackSpeed = _data.System.EnemyAttackSpeed,
                },
                Normal = normal,
            };
        }

        private static double Linear(LinearCoefficient c, int rank)
        {
            double v = c.A + c.B * rank;
            return c.Min.HasValue && v < c.Min.Value ? c.Min.Value : v;
        }
    }
}
