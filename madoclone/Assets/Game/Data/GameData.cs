using System.Collections.Generic;

namespace Mado.Data
{
    /// <summary>全マスタのルート。読み込んだら書き換えない。ID での引き方は無ければ DataException。</summary>
    public sealed class GameData
    {
        private readonly Dictionary<string, CharacterDef> _characters = new Dictionary<string, CharacterDef>();
        private readonly Dictionary<string, SkillDef> _skills = new Dictionary<string, SkillDef>();
        private readonly Dictionary<string, CrystalDef> _crystals = new Dictionary<string, CrystalDef>();
        private readonly Dictionary<string, BuffDef> _buffs = new Dictionary<string, BuffDef>();
        private readonly Dictionary<string, CurrencyDef> _currencies = new Dictionary<string, CurrencyDef>();
        private readonly Dictionary<CharTier, TierDef> _tiers = new Dictionary<CharTier, TierDef>();

        public SystemConfig System { get; }
        public StatTables Stats { get; }
        public DifficultyConfig Difficulty { get; }
        public RewardsConfig Rewards { get; }
        public MemoryCardsConfig MemoryCards { get; }
        public LeaderTempleConfig LeaderTemple { get; }
        public EnemyKitsConfig EnemyKits { get; }
        public PlazasConfig Plazas { get; }
        public TrialsConfig Trials { get; }
        public SupportsConfig Supports { get; }
        public DragonNestConfig DragonNest { get; }
        public SpiritStonesConfig SpiritStones { get; }
        public ResearchConfig Research { get; }
        public UnlocksConfig Unlocks { get; }
        public GachaConfig Gacha { get; }
        public EconomyConfig Economy { get; }
        public BuffTable Buffs { get; }
        public TextTable Text { get; }

        /// <summary>JSON の並びのまま。</summary>
        public IReadOnlyList<TierDef> Tiers { get; }
        public IReadOnlyList<CharacterDef> Characters { get; }
        public IReadOnlyList<SkillDef> Skills { get; }
        public IReadOnlyList<CrystalDef> Crystals { get; }
        public IReadOnlyList<CurrencyDef> Currencies { get; }

        /// <summary>
        /// 同じ ID が2つあっても例外にしない（後ろが勝つ）。重複は DataValidator が ID_DUPLICATE で報告する。
        /// </summary>
        public GameData(
            SystemConfig system,
            StatTables stats,
            DifficultyConfig difficulty,
            RewardsConfig rewards,
            MemoryCardsConfig memoryCards,
            LeaderTempleConfig leaderTemple,
            EnemyKitsConfig enemyKits,
            PlazasConfig plazas,
            TrialsConfig trials,
            SupportsConfig supports,
            DragonNestConfig dragonNest,
            SpiritStonesConfig spiritStones,
            ResearchConfig research,
            UnlocksConfig unlocks,
            GachaConfig gacha,
            EconomyConfig economy,
            BuffTable buffs,
            IReadOnlyList<TierDef> tiers,
            IReadOnlyList<CharacterDef> characters,
            IReadOnlyList<SkillDef> skills,
            IReadOnlyList<CrystalDef> crystals,
            IReadOnlyList<CurrencyDef> currencies,
            TextTable text)
        {
            System = system;
            Stats = stats;
            Difficulty = difficulty;
            Rewards = rewards;
            MemoryCards = memoryCards;
            LeaderTemple = leaderTemple;
            EnemyKits = enemyKits;
            Plazas = plazas;
            Trials = trials;
            Supports = supports;
            DragonNest = dragonNest;
            SpiritStones = spiritStones;
            Research = research;
            Unlocks = unlocks;
            Gacha = gacha;
            Economy = economy;
            Buffs = buffs;
            Tiers = tiers;
            Characters = characters;
            Skills = skills;
            Crystals = crystals;
            Currencies = currencies;
            Text = text;

            foreach (CharacterDef c in characters) { _characters[c.Id] = c; }
            foreach (SkillDef s in skills) { _skills[s.Id] = s; }
            foreach (CrystalDef c in crystals) { _crystals[c.Id] = c; }
            foreach (BuffDef b in buffs.Items) { _buffs[b.Id] = b; }
            foreach (CurrencyDef c in currencies) { _currencies[c.Id] = c; }
            foreach (TierDef t in tiers) { _tiers[t.Id] = t; }
        }

        public CharacterDef Character(string id) { return Find(_characters, id, "キャラ"); }
        public SkillDef Skill(string id) { return Find(_skills, id, "スキル"); }
        public CrystalDef Crystal(string id) { return Find(_crystals, id, "魔晶"); }
        public BuffDef Buff(string id) { return Find(_buffs, id, "バフ"); }
        public CurrencyDef Currency(string id) { return Find(_currencies, id, "通貨"); }

        public bool TryCharacter(string id, out CharacterDef value) { return _characters.TryGetValue(id ?? "", out value); }
        public bool TrySkill(string id, out SkillDef value) { return _skills.TryGetValue(id ?? "", out value); }
        public bool TryCrystal(string id, out CrystalDef value) { return _crystals.TryGetValue(id ?? "", out value); }
        public bool TryBuff(string id, out BuffDef value) { return _buffs.TryGetValue(id ?? "", out value); }
        public bool TryEnemySkill(string id, out EnemySkillDef value)
        {
            foreach (EnemySkillDef s in EnemyKits.Skills) { if (s.Id == id) { value = s; return true; } }
            value = null;
            return false;
        }

        public bool TryCurrency(string id, out CurrencyDef value) { return _currencies.TryGetValue(id ?? "", out value); }

        public TierDef Tier(CharTier id)
        {
            TierDef t;
            if (!_tiers.TryGetValue(id, out t))
            {
                throw new DataException("格が無い: " + id);
            }
            return t;
        }

        private static T Find<T>(Dictionary<string, T> map, string id, string label)
        {
            T value;
            if (id == null || !map.TryGetValue(id, out value))
            {
                throw new DataException(label + "が無い: " + (id ?? "(null)"));
            }
            return value;
        }
    }
}
