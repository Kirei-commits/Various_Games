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
        // difficulty.json の enemyTypes のキー
        private const string Attacker = "attacker", Tank = "tank", Healer = "healer", Disrupt = "disrupt";

        private readonly GameData _data;
        private readonly SkillResolver _skills;

        public StageFactory(GameData data)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _skills = new SkillResolver(data, new BuffBook(data));
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

        /// <summary>最終ボス（最後のランクの 10-10）は専用の制限時間。</summary>
        public double TimeLimitSec(StageKind kind, int rank, int area, int stage)
        {
            return kind == StageKind.Boss && IsFinalBoss(rank, area, stage) ? _data.System.TimeLimitSec.FinalBoss : TimeLimitSec(kind);
        }

        public bool IsFinalBoss(int rank, int area, int stage)
        {
            DifficultyConfig d = _data.Difficulty;
            return rank == d.Ranks && area == d.AreasPerRank && stage == d.StagesPerArea;
        }

        /// <summary>雑魚ウェーブ：合計戦力 = 推奨 × wavePowerRatio、3体（タンク・アタッカー・回復）。ボス戦：合計 = 推奨 × bossFightPowerRatio、ボス本体が bossShareOfFight、残りを2体で分ける。</summary>
        public List<UnitSetup> Build(int rank, int area, int stage, StageKind kind)
        {
            DifficultyConfig d = _data.Difficulty;
            double rec = RecommendedPower(rank, area, stage);
            double total = rec * (kind == StageKind.Wave ? d.WavePowerRatio : d.BossFightPowerRatio);
            EnemyScaleRow row = ScaleRow(rank);
            return BuildWithPower(rank, total, kind, row != null ? row.Hp : 1.0, row != null ? row.Atk : 1.0, kind == StageKind.Boss && IsFinalBoss(rank, area, stage));
        }

        /// <summary>敵の合計戦力を直接決めて作る（ゴールデンや、味方の戦力に合わせたシミュレーション用）。</summary>
        public List<UnitSetup> BuildWithPower(int rank, double totalPower, StageKind kind)
        {
            EnemyScaleRow row = ScaleRow(rank);
            return BuildWithPower(rank, totalPower, kind, row != null ? row.Hp : 1.0, row != null ? row.Atk : 1.0);
        }

        private EnemyScaleRow ScaleRow(int rank)
        {
            foreach (EnemyScaleRow r in _data.Difficulty.EnemyScale) { if (r.Rank == rank) { return r; } }
            return null;
        }

        /// <summary>enemyScale の代わりに、HP・攻撃の倍率を直接渡す（calibrate が倍率を探すのに使う）。</summary>
        public List<UnitSetup> BuildWithPower(int rank, double totalPower, StageKind kind, double hpScale, double atkScale)
        {
            return BuildWithPower(rank, totalPower, kind, hpScale, atkScale, false);
        }

        /// <summary>finalBoss が true なら、ボス本体に最終ボスの特徴も付ける。</summary>
        public List<UnitSetup> BuildWithPower(int rank, double totalPower, StageKind kind, double hpScale, double atkScale, bool finalBoss)
        {
            DifficultyConfig d = _data.Difficulty;
            var units = new List<UnitSetup>();
            if (kind == StageKind.Wave)
            {
                double each = totalPower / 3.0;
                units.Add(Enemy(rank, Tank, each, 0, hpScale, atkScale));
                units.Add(Enemy(rank, Attacker, each, 1, hpScale, atkScale));
                units.Add(Enemy(rank, Healer, each, 2, hpScale, atkScale));
            }
            else
            {
                double boss = totalPower * d.BossShareOfFight;
                double rest = (totalPower - boss) / 2.0;
                UnitSetup body = Enemy(rank, Attacker, boss, 0, hpScale, atkScale);
                ApplyBossTraits(body, rank, finalBoss);
                units.Add(body);
                units.Add(Enemy(rank, Tank, rest, 1, hpScale, atkScale));
                units.Add(Enemy(rank, Healer, rest, 2, hpScale, atkScale));
            }
            return units;
        }

        private UnitSetup Enemy(int rank, string type, double power, int index, double hpScale, double atkScale)
        {
            DifficultyConfig d = _data.Difficulty;
            EnemyTypeMultiplier m = d.EnemyTypes[type];
            EnemySubstatFormulas f = d.EnemySubstats;
            Role role = type == Tank ? Role.Defense : (type == Healer ? Role.Heal : (type == Disrupt ? Role.Disrupt : Role.Ranged));
            var normal = new ResolvedSkill
            {
                Id = "enemy_normal",
                Trigger = new ResolvedTrigger { Type = TriggerType.AttackInterval },
                Effects = new List<ResolvedEffect> { new ResolvedEffect { Type = EffectType.Damage, Target = TargetType.EnemySingle, MultiplierPct = 100 } },
            };
            var unit = new UnitSetup
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
            AddRoleSkills(unit, type);
            return unit;
        }

        /// <summary>型ごとの専用スキル（挑発・回復・範囲攻撃など）を、魔晶の枠に足す（敵は魔晶を持たないので枠が空いている）。</summary>
        private void AddRoleSkills(UnitSetup unit, string type)
        {
            if (!_data.EnemyKits.RoleSkills.TryGetValue(type, out IReadOnlyList<string> ids)) { return; }
            foreach (string id in ids) { unit.Crystals.Add(ResolveEnemySkill(id)); }
        }

        private ResolvedSkill ResolveEnemySkill(string id)
        {
            _data.TryEnemySkill(id, out EnemySkillDef def);
            return _skills.Resolve(def, 0);
        }

        /// <summary>ボス本体にランクの特徴（docs/01 6.1節）を付ける。最終ボスは専用の特徴も。</summary>
        private void ApplyBossTraits(UnitSetup body, int rank, bool finalBoss)
        {
            EnemyKitsConfig k = _data.EnemyKits;
            foreach (BossPlanRow row in k.BossPlan)
            {
                if (rank < row.FromRank || rank > row.ToRank) { continue; }
                foreach (string id in row.Traits) { ApplyTrait(body, id); }
            }
            if (finalBoss) { foreach (string id in k.FinalBossTraits) { ApplyTrait(body, id); } }
        }

        private void ApplyTrait(UnitSetup body, string traitId)
        {
            foreach (BossTraitDef t in _data.EnemyKits.Traits)
            {
                if (t.Id != traitId) { continue; }
                BattleStats s = body.Stats;
                s.AccuracyPct += t.AccuracyPt;
                s.EvasionPct += t.EvasionPt;
                s.CritRatePct += t.CritRatePt;
                if (t.CritDamageMultiplier.HasValue) { s.CritDamagePct *= t.CritDamageMultiplier.Value; }
                if (t.AtkMultiplier.HasValue) { s.Atk *= t.AtkMultiplier.Value; }
                if (t.ResistElement.HasValue) { body.ResistElement = t.ResistElement; body.ResistMultiplier = t.ResistMultiplier.Value; }
                if (t.Skills != null) { foreach (string id in t.Skills) { body.Crystals.Add(ResolveEnemySkill(id)); } }
            }
        }

        private static double Linear(LinearCoefficient c, int rank)
        {
            double v = c.A + c.B * rank;
            return c.Min.HasValue && v < c.Min.Value ? c.Min.Value : v;
        }
    }
}
