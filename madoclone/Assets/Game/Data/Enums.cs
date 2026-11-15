using System.Runtime.Serialization;
using Newtonsoft.Json;

namespace Mado.Data
{
    // JSON の文字列と1対1。未知の値は読み込みで DataException になる（EnumStringConverter）。
    // JSON の綴りは EnumMember の Value。付けていないものは、名前の先頭を小文字にした綴りを使う（Valor → "valor"）。

    /// <summary>属性（4すくみ）。valor→skill→heart→wisdom の順に強い（system.json の elementCycle）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum Element
    {
        [EnumMember(Value = "valor")] Valor,
        [EnumMember(Value = "skill")] Skill,
        [EnumMember(Value = "heart")] Heart,
        [EnumMember(Value = "wisdom")] Wisdom,
    }

    /// <summary>キャラの役割（ステータスの倍率が決まる）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum Role
    {
        [EnumMember(Value = "ranged")] Ranged,
        [EnumMember(Value = "melee")] Melee,
        [EnumMember(Value = "defense")] Defense,
        [EnumMember(Value = "heal")] Heal,
        [EnumMember(Value = "disrupt")] Disrupt,
    }

    /// <summary>キャラの種類（画面の表示用。役割とは別の分類）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum CharType
    {
        [EnumMember(Value = "ranged_attacker")] RangedAttacker,
        [EnumMember(Value = "melee_attacker")] MeleeAttacker,
        [EnumMember(Value = "supporter")] Supporter,
        [EnumMember(Value = "tank")] Tank,
        [EnumMember(Value = "healer")] Healer,
    }

    /// <summary>キャラの格（LR・極・天・煌・彩・灯・素）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum CharTier
    {
        [EnumMember(Value = "lr")] Lr,
        [EnumMember(Value = "kyoku")] Kyoku,
        [EnumMember(Value = "ten")] Ten,
        [EnumMember(Value = "kou")] Kou,
        [EnumMember(Value = "sai")] Sai,
        [EnumMember(Value = "tou")] Tou,
        [EnumMember(Value = "so")] So,
    }

    /// <summary>入手の方法。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum ObtainKind
    {
        [EnumMember(Value = "gacha")] Gacha,
        [EnumMember(Value = "boss_first_clear")] BossFirstClear,
    }

    /// <summary>スキルの種類。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum SkillKind
    {
        [EnumMember(Value = "normal")] Normal,
        [EnumMember(Value = "special")] Special,
        [EnumMember(Value = "ultimate")] Ultimate,
    }

    /// <summary>魔晶の枠の見た目（効果は変わらない。docs/01 4.4節）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum CrystalSlot
    {
        [EnumMember(Value = "normal")] Normal,
        [EnumMember(Value = "rainbow")] Rainbow,
    }

    /// <summary>スキルが発動するきっかけ。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum TriggerType
    {
        [EnumMember(Value = "attackInterval")] AttackInterval,
        [EnumMember(Value = "interval")] Interval,
        [EnumMember(Value = "onHit")] OnHit,
        [EnumMember(Value = "onCrit")] OnCrit,
        [EnumMember(Value = "onDamaged")] OnDamaged,
        [EnumMember(Value = "onBattleStart")] OnBattleStart,
        [EnumMember(Value = "onDeath")] OnDeath,
        [EnumMember(Value = "onKill")] OnKill,
        [EnumMember(Value = "onHpBelow")] OnHpBelow,
        [EnumMember(Value = "always")] Always,
        [EnumMember(Value = "cooldown")] Cooldown,
    }

    /// <summary>効果の種類。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum EffectType
    {
        [EnumMember(Value = "damage")] Damage,
        [EnumMember(Value = "heal")] Heal,
        [EnumMember(Value = "applyBuff")] ApplyBuff,
        [EnumMember(Value = "gaugeShift")] GaugeShift,
        [EnumMember(Value = "cleanse")] Cleanse,
        [EnumMember(Value = "dispel")] Dispel,
        [EnumMember(Value = "reflect")] Reflect,
        [EnumMember(Value = "elementCountBonus")] ElementCountBonus,
        [EnumMember(Value = "debuffCountBonus")] DebuffCountBonus,
    }

    /// <summary>効果の対象。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum TargetType
    {
        [EnumMember(Value = "enemy_single")] EnemySingle,
        [EnumMember(Value = "enemy_area")] EnemyArea,
        [EnumMember(Value = "enemy_all")] EnemyAll,
        [EnumMember(Value = "ally_lowest_hp")] AllyLowestHp,
        [EnumMember(Value = "ally_all")] AllyAll,
        [EnumMember(Value = "ally_element")] AllyElement,
        [EnumMember(Value = "self")] Self,
        [EnumMember(Value = "attacker")] Attacker,
        [EnumMember(Value = "target")] Target,
    }

    /// <summary>効果を出すタイミング（ヒットの後、クリティカル時）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum EffectWhen
    {
        [EnumMember(Value = "afterHit")] AfterHit,
        [EnumMember(Value = "onCrit")] OnCrit,
    }

    /// <summary>人数補正の単位（％ポイントか秒）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum CountUnit
    {
        [EnumMember(Value = "pct")] Pct,
        [EnumMember(Value = "sec")] Sec,
    }

    /// <summary>人数補正の数え方。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum CountScope
    {
        [EnumMember(Value = "target")] Target,
        [EnumMember(Value = "enemy_all")] EnemyAll,
    }

    /// <summary>バフの分類。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum BuffCategory
    {
        [EnumMember(Value = "buff")] Buff,
        [EnumMember(Value = "status")] Status,
        [EnumMember(Value = "control")] Control,
    }

    /// <summary>バフか、デバフか。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum BuffPolarity
    {
        [EnumMember(Value = "buff")] Buff,
        [EnumMember(Value = "debuff")] Debuff,
    }

    /// <summary>効果の段階（最上級・上級・中級・下級）。段階を持たないバフは null（JSON では "none"）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum TierLevel
    {
        [EnumMember(Value = "supreme")] Supreme,
        [EnumMember(Value = "high")] High,
        [EnumMember(Value = "mid")] Mid,
        [EnumMember(Value = "low")] Low,
    }

    /// <summary>バフの能力値の変え方。pct は掛ける割合（％）、pt は％ポイントを足す。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum StatOp
    {
        [EnumMember(Value = "pct")] Pct,
        [EnumMember(Value = "pt")] Pt,
    }

    /// <summary>バフが変える能力値。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum StatKey
    {
        [EnumMember(Value = "atk")] Atk,
        [EnumMember(Value = "def")] Def,
        [EnumMember(Value = "crit_rate")] CritRate,
        [EnumMember(Value = "crit_dmg")] CritDmg,
        [EnumMember(Value = "crit_resist")] CritResist,
        [EnumMember(Value = "crit_def")] CritDef,
        [EnumMember(Value = "accuracy")] Accuracy,
        [EnumMember(Value = "evasion")] Evasion,
    }

    /// <summary>副ステータス（system.json の baseSubstats、キャラの凸ボーナス、敵の式で共通の名前）。</summary>
    [JsonConverter(typeof(EnumStringConverter))]
    public enum SubstatKey
    {
        [EnumMember(Value = "evasionPct")] EvasionPct,
        [EnumMember(Value = "accuracyPct")] AccuracyPct,
        [EnumMember(Value = "critRatePct")] CritRatePct,
        [EnumMember(Value = "critResistPct")] CritResistPct,
        [EnumMember(Value = "critDamagePct")] CritDamagePct,
        [EnumMember(Value = "critDefensePct")] CritDefensePct,
    }
}
