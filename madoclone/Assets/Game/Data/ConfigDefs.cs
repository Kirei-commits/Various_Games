using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>制限時間（秒）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TimeLimits
    {
        public double Stage { get; init; }
        public double Boss { get; init; }
        public double FinalBoss { get; init; }
        public double Trial { get; init; }
        public double TrialLong { get; init; }
        public double Pvp { get; init; }
    }

    /// <summary>全キャラ共通の副ステータスの基本値（％）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class BaseSubstats
    {
        public double EvasionPct { get; init; }
        public double AccuracyPct { get; init; }
        public double CritRatePct { get; init; }
        public double CritResistPct { get; init; }
        public double CritDamagePct { get; init; }
        public double CritDefensePct { get; init; }

        public double Get(SubstatKey key)
        {
            switch (key)
            {
                case SubstatKey.EvasionPct: return EvasionPct;
                case SubstatKey.AccuracyPct: return AccuracyPct;
                case SubstatKey.CritRatePct: return CritRatePct;
                case SubstatKey.CritResistPct: return CritResistPct;
                case SubstatKey.CritDamagePct: return CritDamagePct;
                default: return CritDefensePct;
            }
        }
    }

    /// <summary>戦力の式の係数：戦力 = Hp×HP + Atk×攻撃力 + Def×防御力。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class PowerFormula
    {
        public double Hp { get; init; }
        public double Atk { get; init; }
        public double Def { get; init; }
    }

    /// <summary>system.json：戦闘と成長の全体の定数。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class SystemConfig
    {
        public int SchemaVersion { get; init; }

        /// <summary>戦闘の1刻み（秒）。</summary>
        public double TickSec { get; init; }

        /// <summary>攻撃スピード1のときの通常攻撃の間隔（秒）。</summary>
        public double BaseAttackIntervalSec { get; init; }

        public double EnemyAttackSpeed { get; init; }
        public double AttackSpeedMax { get; init; }

        /// <summary>属性の強弱の並び（前の属性が次の属性に強い）。</summary>
        public IReadOnlyList<Element> ElementCycle { get; init; }

        public double ElementAdvantagePct { get; init; }
        public double ElementDisadvantagePct { get; init; }
        public double HitChanceMinPct { get; init; }
        public double HitChanceMaxPct { get; init; }
        public double CritMultiplierMin { get; init; }
        public double MinDamage { get; init; }
        public bool DefenseBuffAppliesBeforeSubtract { get; init; }
        public TimeLimits TimeLimitSec { get; init; }
        public double SkipAvailableAfterSec { get; init; }

        /// <summary>1回のきっかけから連鎖して起きる発動の上限。</summary>
        public int ChainLimit { get; init; }

        public BaseSubstats BaseSubstats { get; init; }
        public PowerFormula PowerFormula { get; init; }
        public int PartySlots { get; init; }
        public int LeaderMinStar { get; init; }

        /// <summary>魔晶の枠が解放される★（5つ）。</summary>
        public IReadOnlyList<int> CrystalSlotStars { get; init; }

        public IReadOnlyList<string> StarterCharacters { get; init; }
        public double IdleCapHours { get; init; }

        /// <summary>数の桁の単位（K・M・G…）。先頭は "" （単位なし）。</summary>
        public IReadOnlyList<string> NumberUnits { get; init; }

        /// <summary>開発者モードのコードの SHA-256（小文字の16進）。コードそのものはどこにも置かない。</summary>
        public string DevModeCodeSha256 { get; init; }
    }

    /// <summary>レベル表の1行（役割が基準のキャラの全体強化前の値）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class LevelRow
    {
        public int Lv { get; init; }
        public double Atk { get; init; }
        public double Hp { get; init; }
        public double Def { get; init; }

        /// <summary>次のレベルまでの経験値。最大レベルは null。</summary>
        [JsonProperty(Required = Required.AllowNull)]
        public double? ExpToNext { get; init; }

        /// <summary>実測の値か、補間か。</summary>
        public bool Measured { get; init; }
    }

    /// <summary>役割ごとの倍率。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class RoleMultiplier
    {
        public double Atk { get; init; }
        public double Hp { get; init; }
        public double Def { get; init; }
        public bool Provisional { get; init; }
    }

    /// <summary>スキルのランクが上がる★（[1つ目の境目, 2つ目の境目]）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class SkillRankStars
    {
        public IReadOnlyList<int> Normal { get; init; }
        public IReadOnlyList<int> Special { get; init; }
        public IReadOnlyList<int> Ultimate { get; init; }

        public IReadOnlyList<int> Get(SkillKind kind)
        {
            switch (kind)
            {
                case SkillKind.Normal: return Normal;
                case SkillKind.Special: return Special;
                default: return Ultimate;
            }
        }
    }

    /// <summary>stat_tables.json：レベルと★によるステータスの表。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class StatTables
    {
        public int SchemaVersion { get; init; }
        public Role BaseRole { get; init; }
        public IReadOnlyList<LevelRow> LevelTable { get; init; }

        /// <summary>キーは役割の綴り（ranged・melee・defense・heal・disrupt）。</summary>
        public IReadOnlyDictionary<string, RoleMultiplier> RoleMultipliers { get; init; }

        /// <summary>★0〜11 の倍率（12個）。</summary>
        public IReadOnlyList<double> StarMultipliers { get; init; }

        /// <summary>★0〜11 の最大レベル（12個）。</summary>
        public IReadOnlyList<int> StarMaxLv { get; init; }

        /// <summary>★0〜11 に上げるのに要る覚醒のかけら（12個）。</summary>
        public IReadOnlyList<int> AwakenCost { get; init; }

        public SkillRankStars SkillRankStars { get; init; }

        public RoleMultiplier ForRole(Role role)
        {
            RoleMultiplier m;
            if (!RoleMultipliers.TryGetValue(EnumStringConverter.Text(role), out m))
            {
                throw new DataException("役割の倍率が無い: " + EnumStringConverter.Text(role));
            }
            return m;
        }
    }

    /// <summary>難易度の伸び方（g）の区間。g が1つなら一定、gFrom と gTo なら interp で補間。</summary>
    public sealed class GrowthStep
    {
        [JsonProperty(Required = Required.Always)]
        public int FromRank { get; init; }

        [JsonProperty(Required = Required.Always)]
        public int ToRank { get; init; }

        public double? G { get; init; }
        public double? GFrom { get; init; }
        public double? GTo { get; init; }

        /// <summary>"linear" のみ。</summary>
        public string Interp { get; init; }
    }

    /// <summary>敵のステータスの配分（味方の戦力に対する割合）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class EnemyStatShare
    {
        public double Hp { get; init; }
        public double Atk { get; init; }
        public double Def { get; init; }
    }

    /// <summary>敵の種類ごとの倍率。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class EnemyTypeMultiplier
    {
        public double Hp { get; init; }
        public double Atk { get; init; }
        public double Def { get; init; }
    }

    /// <summary>敵の副ステータスの式：値 = A + B×（ランクの伸び）。Min があれば下限。</summary>
    public sealed class LinearCoefficient
    {
        [JsonProperty(Required = Required.Always)]
        public double A { get; init; }

        [JsonProperty(Required = Required.Always)]
        public double B { get; init; }

        public double? Min { get; init; }
    }

    /// <summary>敵の副ステータスの式（副ステータスごと）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class EnemySubstatFormulas
    {
        public LinearCoefficient AccuracyPct { get; init; }
        public LinearCoefficient EvasionPct { get; init; }
        public LinearCoefficient CritRatePct { get; init; }
        public LinearCoefficient CritDamagePct { get; init; }
        public LinearCoefficient CritResistPct { get; init; }
        public LinearCoefficient CritDefensePct { get; init; }
    }

    /// <summary>ランクごとの敵の強さの補正（calibrate が書き込む。手で書かない）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class EnemyScaleRow
    {
        public int Rank { get; init; }
        public double Hp { get; init; }
        public double Atk { get; init; }
    }

    /// <summary>バランスの合格ライン。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class BalanceTarget
    {
        public double WinRatePct { get; init; }

        /// <summary>ボス戦の決着までの秒数の範囲 [最短, 最長]。</summary>
        public IReadOnlyList<double> BossFightSec { get; init; }

        public IReadOnlyList<double> WaveSec { get; init; }
    }

    /// <summary>difficulty.json：ステージの難しさ（推奨戦力の式と敵の作り方）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class DifficultyConfig
    {
        public int SchemaVersion { get; init; }

        /// <summary>ランク1のボスの推奨戦力の元になる値。</summary>
        public double E1 { get; init; }

        public int Ranks { get; init; }
        public int AreasPerRank { get; init; }
        public int StagesPerArea { get; init; }
        public int WavesPerStage { get; init; }
        public double AreaBossMultiplier { get; init; }
        public IReadOnlyList<GrowthStep> Growth { get; init; }
        public double WavePowerRatio { get; init; }
        public double BossFightPowerRatio { get; init; }
        public double BossShareOfFight { get; init; }
        public EnemyStatShare EnemyStatShare { get; init; }

        /// <summary>キーは敵の種類（attacker・tank・disrupt・healer）。</summary>
        public IReadOnlyDictionary<string, EnemyTypeMultiplier> EnemyTypes { get; init; }

        public EnemySubstatFormulas EnemySubstats { get; init; }
        public IReadOnlyList<EnemyScaleRow> EnemyScale { get; init; }
        public BalanceTarget BalanceTarget { get; init; }
    }
}
