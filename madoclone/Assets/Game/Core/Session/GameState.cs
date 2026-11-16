using System;
using System.Collections.Generic;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Data;

namespace Mado.Core.Session
{
    public readonly struct CharacterView
    {
        public readonly string Id;
        public readonly int Star, Lv, Copies;
        public readonly double Exp;

        /// <summary>長さ5のコピー（書き換えても状態は変わらない）。</summary>
        public readonly string[] Crystals;

        public CharacterView(string id, CharacterState s)
        {
            Id = id; Star = s.Star; Lv = s.Lv; Copies = s.Copies; Exp = s.Exp; Crystals = (string[])s.Crystals.Clone();
        }
    }

    public readonly struct MemoryCardView
    {
        public readonly string Id, Rarity;
        public readonly MemoryKind Kind;
        public readonly int Lv;

        public MemoryCardView(MemoryCardState c) { Id = c.Id; Rarity = c.Rarity; Kind = c.Kind; Lv = c.Lv; }
    }

    public readonly struct StoneView
    {
        public readonly string Id, Rarity, Constellation;
        public readonly int Lv;
        public readonly bool Equipped;

        public StoneView(StoneState s, bool equipped) { Id = s.Id; Rarity = s.Rarity; Constellation = s.Constellation; Lv = s.Lv; Equipped = equipped; }
    }

    public readonly struct ProgressView
    {
        public readonly int Rank, Area, Stage;
        public ProgressView(ProgressState p) { Rank = p.Rank; Area = p.Area; Stage = p.Stage; }
    }

    /// <summary>
    /// 画面を開いたときに読む、読み取り専用の窓（docs/02 3.2節）。書き換えるメソッドは持たない。
    /// 返すのは写し（struct・コピー）だけで、Core の状態そのものは渡さない。
    /// </summary>
    public sealed class GameState
    {
        private readonly SaveData _save;
        private readonly GameData _data;
        private readonly Wallet.Wallet _wallet;
        private readonly IdleService _idle;
        private readonly Metrics.MetricCounter _metrics;
        private readonly Growth.TrialService _trials;
        private readonly Growth.SupportService _supports;
        private readonly Growth.DragonNestService _nest;
        private readonly Growth.SpiritStoneService _stones;
        private readonly Growth.TreeService _trees;
        private readonly Growth.CollectionService _collection;
        private readonly Growth.ZukanService _zukan;
        private readonly Growth.GachaService _gacha;
        private readonly Progress.AchievementService _achievements;
        private readonly Progress.ArenaService _arena;
        private readonly Func<string, bool> _isUnlocked;

        internal GameState(Mado.Data.GameData data, SaveData save, Wallet.Wallet wallet, IdleService idle, Metrics.MetricCounter metrics, Growth.TrialService trials, Growth.SupportService supports, Growth.DragonNestService nest, Growth.SpiritStoneService stones, Growth.TreeService trees, Growth.CollectionService collection, Growth.ZukanService zukan, Growth.GachaService gacha, Progress.AchievementService achievements, Progress.ArenaService arena, Func<string, bool> isUnlocked)
        {
            _data = data;
            _achievements = achievements;
            _arena = arena;
            _gacha = gacha;
            _isUnlocked = isUnlocked;
            _nest = nest; _stones = stones; _trees = trees; _collection = collection; _zukan = zukan;
            _save = save; _wallet = wallet; _idle = idle; _metrics = metrics; _trials = trials; _supports = supports;
        }

        public bool DevMode { get { return _save.DevMode; } }
        public double Balance(string currencyId) { return _wallet.Balance(currencyId); }
        public double Metric(string key) { return _metrics.Get(key); }

        public IReadOnlyList<string> OwnedCharacterIds
        {
            get
            {
                var ids = new List<string>(_save.Characters.Keys);
                ids.Sort(StringComparer.Ordinal);
                return ids;
            }
        }

        public bool TryCharacter(string id, out CharacterView view)
        {
            view = default(CharacterView);
            if (id == null || !_save.Characters.TryGetValue(id, out CharacterState s)) { return false; }
            view = new CharacterView(id, s);
            return true;
        }

        /// <summary>機能が使えるか（unlocks.json。例："memory_card"、"trial_dragon"、"plaza_spirit"）。</summary>
        /// <summary>実績の進み具合：（いまの値、目標に達した段の数、受け取り済みの段の数）。</summary>
        public (double Value, int Reached, int Claimed) AchievementOf(string achievementId)
        {
            if (!_data.Economy.TryAchievement(achievementId, out AchievementDef a)) { return (0, 0, 0); }
            return (_achievements.Progress(a), _achievements.Reached(a), _achievements.Claimed(achievementId));
        }

        /// <summary>周回する実績の、終わった周の数（周回しないものは 0）。</summary>
        public int AchievementLap(string achievementId)
        {
            return _data.Economy.TryAchievement(achievementId, out AchievementDef a) ? _achievements.Lap(a) : 0;
        }

        /// <summary>NPCギルドのメンバー（名前と見せかけの戦力）。戦力は、渡した「自分の戦力」に対する割合で、毎回同じ（名前から決まる）。ギルドLvはランクに合わせて自動で上がる。</summary>
        public IReadOnlyList<(string Name, double Power)> GuildMembers(double ownPower)
        {
            var list = new List<(string, double)>();
            GuildConfig g = _data.Guild;
            for (int i = 0; i < g.MemberCount; i++)
            {
                double t = g.MemberCount == 1 ? 1.0 : (double)((i * 7) % g.MemberCount) / (g.MemberCount - 1);    // 7 は人数（30）と互いに素な並び替え
                list.Add((g.Names[i], ownPower * (g.PowerMin + (g.PowerMax - g.PowerMin) * t)));
            }
            return list;
        }

        /// <summary>ギルドLv（ランクに合わせて自動で上がる）。</summary>
        public int GuildLv { get { return Math.Max(1, _save.Progress.Rank); } }

        public int GachaTotalPulls { get { return _gacha.TotalPulls; } }

        /// <summary>ピックアップの天井までの残り回数。</summary>
        public int GachaPityLeft { get { return _gacha.PityLeft; } }
        public string GachaPickup { get { return _gacha.PickupId; } }

        public bool IsUnlocked(string featureId) { return _isUnlocked(featureId); }

        public ProgressView Progress { get { return new ProgressView(_save.Progress); } }
        public double BattleSpeed { get { return _save.Settings.BattleSpeed; } }
        public double GrowthSpeed { get { return _save.Settings.GrowthSpeed; } }
        public int ArenaSeason { get { return _save.Arena.Season; } }
        public int ArenaBattles { get { return _save.Arena.Battles; } }
        public int ArenaPoints { get { return _save.Arena.Points; } }
        public int ArenaPendingRank { get { return _save.Arena.PendingRank; } }
        public int ArenaSeasonBattles { get { return _data.Guild.Arena.SeasonBattles; } }
        public IReadOnlyList<Progress.ArenaStanding> ArenaStandings { get { return _arena.Standings(); } }
        public int ArenaRank { get { return _arena.PlayerRank(); } }
        public IReadOnlyList<Mado.Core.Wallet.Money> ArenaRewardForRank(int rank) { return _arena.RewardForRank(rank); }
        public bool AutoBoss { get { return _save.Settings.AutoBoss; } }
        public bool SkipGachaAnim { get { return _save.Settings.SkipGachaAnim; } }
        public string Leader { get { return _save.Leader; } }
        public int LeaderLv { get { return _save.Temple.LeaderLv; } }
        public Element? LeaderElement { get { return _save.Temple.LeaderElement; } }
        public int PlazaLv(string plazaId) { return _save.Plazas.Levels.TryGetValue(plazaId ?? "", out int lv) ? lv : 1; }
        public int TrialClearedLv(string trialId) { return _trials.ClearedLv(trialId); }

        /// <summary>貯まっている報酬の回数（歯止めのない試練は PositiveInfinity）。</summary>
        public double TrialCharges(string trialId) { return _trials.Charges(trialId); }

        public int DragonNodeLv(string nodeId) { return _nest.Lv(nodeId); }
        public bool IsDragonNodeUnlocked(string nodeId) { return _nest.TryNode(nodeId, out Growth.NestNode n) && _nest.IsUnlocked(n); }
        /// <summary>ツリーで次に強化できるノード（解放済みで最大Lv でない最初のもの）。無ければ null。View の「おまかせ強化」が使う。</summary>
        public string NextTreeNode(string treeId)
        {
            if (!_data.Research.TryTree(treeId, out TreeDef tree)) { return null; }
            foreach (TreeNodeDef n in tree.Nodes)
            {
                if (_trees.Lv(treeId, n.Id) < n.MaxLv && _trees.IsUnlocked(treeId, n.Id)) { return n.Id; }
            }
            return null;
        }

        /// <summary>竜の巣のその属性で、次に強化できるノード。無ければ null。</summary>
        public string NextDragonNode(Element element)
        {
            foreach (Growth.NestNode n in _nest.Nodes)
            {
                if (n.Element == element && _nest.Lv(n.Id) < n.Tier.MaxLv && _nest.IsUnlocked(n)) { return n.Id; }
            }
            return null;
        }

        public int TreeNodeLv(string treeId, string nodeId) { return _trees.Lv(treeId, nodeId); }
        public bool IsTreeNodeUnlocked(string treeId, string nodeId) { return _trees.IsUnlocked(treeId, nodeId); }
        public int CollectionStar(string setId) { return _collection.Star(setId); }
        public bool ZukanAchieved(string goal) { return _zukan.IsAchieved(goal); }

        /// <summary>タロットの枠（効果・レア。空は null）。</summary>
        public (string Effect, string Rarity) TarotAt(int slot)
        {
            TarotSlotState t = _save.Research.Tarot.Count > slot && slot >= 0 ? _save.Research.Tarot[slot] : null;
            return t == null ? (null, null) : (t.Effect, t.Rarity);
        }

        public int StoneCount { get { return _stones.Count; } }

        /// <summary>持っている石（写し）。</summary>
        public IReadOnlyList<StoneView> Stones
        {
            get
            {
                var list = new List<StoneView>();
                foreach (StoneState s in _save.SpiritStones.Stones) { list.Add(new StoneView(s, _stones.IsEquipped(s.Id))); }
                return list;
            }
        }

        /// <summary>円盤の枠にはまっている石の ID（空は null）。</summary>
        public string StoneAt(int page, int slot) { return _save.SpiritStones.Equipped[_stones.Slot(page, slot)]; }

        /// <summary>編成の6枠（空は null）。</summary>
        public IReadOnlyList<string> Party
        {
            get
            {
                _save.Parties.TryGetValue(Session.GameSession.DefaultParty, out PartyState p);
                return p == null ? new string[6] : (string[])p.Slots.Clone();
            }
        }

        public bool OwnsSupport(string supportId) { return _supports.IsOwned(supportId); }
        public IReadOnlyList<string> OwnedSupports(SupportKind kind) { return _supports.Owned(kind); }
        public int SupportStar(string supportId) { return _supports.Star(supportId); }

        /// <summary>いまの編成にセットされているサポート（使い魔・契約霊・竜の順。無ければ null）。</summary>
        public IReadOnlyList<string> EquippedSupports
        {
            get
            {
                _save.Parties.TryGetValue(Session.GameSession.DefaultParty, out PartyState p);
                return p == null ? new string[3] : new[] { p.Familiar, p.Spirit, p.Dragon };
            }
        }

        public int MemoryGachaLv { get { return _save.Memory.GachaLv; } }

        public IReadOnlyList<MemoryCardView> MemoryCards
        {
            get
            {
                var list = new List<MemoryCardView>();
                foreach (MemoryCardState c in _save.Memory.Cards) { list.Add(new MemoryCardView(c)); }
                return list;
            }
        }

        /// <summary>長さ8（種類 × 2）。空の枠は null。</summary>
        public IReadOnlyList<string> EquippedMemoryCards { get { return (string[])_save.Memory.Equipped.Clone(); } }

        /// <summary>いま受け取るといくらか（受け取らない）。</summary>
        public IdleReport PendingIdle { get { return _idle.Pending(); } }
    }
}
