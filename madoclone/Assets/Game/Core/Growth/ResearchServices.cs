using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum ResearchFailure { None, Unknown, Locked, AtMax, NotEnough, InvalidChoice }

    /// <summary>育成ツリー（研究所・リーダー特殊ツリー）：ノードのLv上げ。requires の全ノードが最大Lv で解放。</summary>
    public sealed class TreeService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public TreeService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        public static string Key(string treeId, string nodeId) { return treeId + "/" + nodeId; }

        public int Lv(string treeId, string nodeId) { return _save.Research.Nodes.TryGetValue(Key(treeId ?? "", nodeId ?? ""), out int v) ? v : 0; }

        private bool TryFind(string treeId, string nodeId, out TreeDef tree, out TreeNodeDef node)
        {
            node = null;
            if (!_data.Research.TryTree(treeId, out tree)) { return false; }
            foreach (TreeNodeDef n in tree.Nodes) { if (n.Id == nodeId) { node = n; return true; } }
            return false;
        }

        public bool IsUnlocked(string treeId, string nodeId)
        {
            if (!TryFind(treeId, nodeId, out TreeDef tree, out TreeNodeDef node)) { return false; }
            foreach (string req in node.Requires)
            {
                foreach (TreeNodeDef r in tree.Nodes) { if (r.Id == req && Lv(treeId, req) < r.MaxLv) { return false; } }
            }
            return true;
        }

        public double CostToNext(TreeNodeDef node, int lv)
        {
            if (lv < 0 || lv >= node.MaxLv) { throw new ArgumentException("Lv が範囲外: " + lv); }
            return node.CostBase + node.CostStep * lv;
        }

        public ResearchFailure LevelUp(string treeId, string nodeId)
        {
            if (!TryFind(treeId, nodeId, out TreeDef tree, out TreeNodeDef node)) { return ResearchFailure.Unknown; }
            if (!IsUnlocked(treeId, nodeId)) { return ResearchFailure.Locked; }
            int lv = Lv(treeId, nodeId);
            if (lv >= node.MaxLv) { return ResearchFailure.AtMax; }
            PayResult pay = _wallet.Pay(new Cost(tree.CurrencyId, CostToNext(node, lv)), new PayReason(WalletReasons.ResearchNode));
            if (!pay.Success) { return ResearchFailure.NotEnough; }
            _save.Research.Nodes[Key(treeId, nodeId)] = lv + 1;
            return ResearchFailure.None;
        }
    }

    /// <summary>タロット（自作版：効果とレアを選んで、ワインを払う。出来は100％固定）。枠を変えるたびに新しいレアの費用を払う（返金なし）。</summary>
    public sealed class TarotService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public TarotService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
            EnsureSlots();
        }

        private void EnsureSlots()
        {
            List<TarotSlotState> t = _save.Research.Tarot;
            while (t.Count < _data.Research.Tarot.Slots) { t.Add(new TarotSlotState()); }
        }

        public TarotRarityDef Rarity(string id)
        {
            foreach (TarotRarityDef r in _data.Research.Tarot.Rarities) { if (r.Id == id) { return r; } }
            return null;
        }

        private static bool HasEffect(TarotConfig c, string effect)
        {
            foreach (string e in c.Effects) { if (e == effect) { return true; } }
            return false;
        }

        /// <summary>いま入れ替えるときのワイン ＝ レアの基準 ×（1 ＋ これまでの入れ替え回数 × changeCostStep）。</summary>
        public double Cost(TarotRarityDef rarity) { return CostOf(_data, _save.Research.TarotChanges, rarity); }

        public static double CostOf(GameData data, int changes, TarotRarityDef rarity)
        {
            return rarity.WineCost * (1.0 + changes * data.Research.Tarot.ChangeCostStep);
        }

        public ResearchFailure Set(int slot, string effect, string rarityId)
        {
            TarotConfig c = _data.Research.Tarot;
            TarotRarityDef rarity = Rarity(rarityId);
            if (slot < 0 || slot >= c.Slots || rarity == null || !HasEffect(c, effect)) { return ResearchFailure.InvalidChoice; }
            TarotSlotState s = _save.Research.Tarot[slot];
            if (s.Effect == effect && s.Rarity == rarityId) { return ResearchFailure.None; }     // 同じなら払わない
            PayResult pay = _wallet.Pay(new Cost(CurrencyIds.Wine, Cost(rarity)), new PayReason(WalletReasons.TarotSet));
            if (!pay.Success) { return ResearchFailure.NotEnough; }
            _save.Research.TarotChanges++;
            s.Effect = effect; s.Rarity = rarityId;
            return ResearchFailure.None;
        }

        public ResearchFailure Clear(int slot)
        {
            if (slot < 0 || slot >= _data.Research.Tarot.Slots) { return ResearchFailure.InvalidChoice; }
            _save.Research.Tarot[slot] = new TarotSlotState();
            return ResearchFailure.None;
        }
    }

    /// <summary>コレクション：セットの★をコレクションメダルで上げる（★0 は効果なし）。</summary>
    public sealed class CollectionService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public CollectionService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        public int Star(string setId) { return _save.Research.Collection.TryGetValue(setId ?? "", out int v) ? v : 0; }

        public CollectionSetDef Set(string id)
        {
            foreach (CollectionSetDef s in _data.Research.Collection.Sets) { if (s.Id == id) { return s; } }
            return null;
        }

        public ResearchFailure Raise(string setId)
        {
            CollectionSetDef set = Set(setId);
            if (set == null) { return ResearchFailure.Unknown; }
            int star = Star(setId);
            if (star >= set.Values.Count) { return ResearchFailure.AtMax; }
            PayResult pay = _wallet.Pay(new Cost(_data.Research.Collection.CurrencyId, set.StarCost[star]), new PayReason(WalletReasons.CollectionStar));
            if (!pay.Success) { return ResearchFailure.NotEnough; }
            _save.Research.Collection[setId] = star + 1;
            return ResearchFailure.None;
        }
    }

    /// <summary>
    /// 図鑑：キャラごとの目標（Lv の節目、★1〜最大★）を達成すると、チーム全体の攻撃・HP・防御のどれかが perGoalPct 上がり、ジェムがもらえる。
    /// Sync で、いまの育成状態から新しく達成した目標を拾う（報酬は自動で受け取る）。攻撃・HP・防御は目標の並びで順に割り当てる。
    /// </summary>
    public sealed class ZukanService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public ZukanService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        public int MaxStar { get { return _data.Stats.StarMaxLv.Count - 1; } }

        /// <summary>1キャラあたりの目標の数。</summary>
        public int GoalsPerCharacter { get { return _data.Research.Zukan.LevelGoals.Count + MaxStar; } }

        public static string LvGoal(string characterId, int lv) { return characterId + ".lv" + lv; }
        public static string StarGoal(string characterId, int star) { return characterId + ".star" + star; }

        /// <summary>目標が割り当てられたステータス：Lv の節目は 0 番目から、★は 1 番目から順に atk→hp→def。</summary>
        public static string StatOf(bool isStar, int indexInKind)
        {
            string[] stats = { "atk", "hp", "def" };
            return stats[(indexInKind + (isStar ? 1 : 0)) % 3];
        }

        /// <summary>新しく達成した目標の数を返す（報酬のジェムは自動で受け取る）。</summary>
        public int Sync()
        {
            var have = new HashSet<string>(_save.Research.Zukan);
            int gained = 0;
            IReadOnlyList<int> lvGoals = _data.Research.Zukan.LevelGoals;
            foreach (KeyValuePair<string, CharacterState> kv in _save.Characters)
            {
                for (int i = 0; i < lvGoals.Count; i++)
                {
                    if (kv.Value.Lv >= lvGoals[i] && have.Add(LvGoal(kv.Key, lvGoals[i]))) { gained++; }
                }
                for (int star = 1; star <= MaxStar; star++)
                {
                    if (kv.Value.Star >= star && have.Add(StarGoal(kv.Key, star))) { gained++; }
                }
            }
            if (gained == 0) { return 0; }
            var list = new List<string>(have);
            list.Sort(StringComparer.Ordinal);
            _save.Research.Zukan = list;
            double gem = _data.Research.Zukan.GemReward * gained;
            if (gem > 0) { _wallet.Grant(new Reward(CurrencyIds.Gem, gem), new GrantReason(WalletReasons.ZukanReward)); }
            return gained;
        }

        public bool IsAchieved(string goal) { return _save.Research.Zukan.Contains(goal); }
    }

    /// <summary>研究ツリー・リーダー特殊ツリー・タロット・コレクション・図鑑の効果（全キャラ共通）。％は Global の輪、副ステータスは Flat。</summary>
    public sealed class ResearchSource : IModifierSource
    {
        private readonly GameData _data;
        private readonly SaveData _save;

        public ResearchSource(GameData data, SaveData save)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
        }

        public void Collect(List<Modifier> sink, StatQuery query)
        {
            ResearchConfig r = _data.Research;
            foreach (TreeDef tree in r.Trees)
            {
                foreach (TreeNodeDef n in tree.Nodes)
                {
                    int lv = Math.Min(_save.Research.Nodes.TryGetValue(TreeService.Key(tree.Id, n.Id), out int v) ? v : 0, n.MaxLv);
                    if (lv > 0) { Add(sink, n.Stat, n.PerLv * lv); }
                }
            }
            foreach (TarotSlotState t in _save.Research.Tarot)
            {
                if (t.Effect == null || t.Rarity == null) { continue; }
                foreach (TarotRarityDef rar in r.Tarot.Rarities) { if (rar.Id == t.Rarity) { Add(sink, t.Effect, rar.MaxPct); } }
            }
            foreach (CollectionSetDef s in r.Collection.Sets)
            {
                int star = Math.Min(_save.Research.Collection.TryGetValue(s.Id, out int v) ? v : 0, s.Values.Count);
                if (star > 0) { Add(sink, s.Stat, s.Values[star - 1]); }
            }
            AddZukan(sink);
        }

        // 図鑑の達成済み目標は多い（最大 105体×約24）ので、文字列の解析は目標の一覧が変わったときだけ行う。
        private List<string> _zukanKey;
        private int _zukanKeyCount = -1;
        private double[] _zukanPct = new double[3];

        private void AddZukan(List<Modifier> sink)
        {
            List<string> goals = _save.Research.Zukan;
            if (!ReferenceEquals(goals, _zukanKey) || goals.Count != _zukanKeyCount)
            {
                _zukanPct = ComputeZukanPct();
                _zukanKey = goals;
                _zukanKeyCount = goals.Count;
            }
            double[] pct = _zukanPct;
            if (pct[0] > 0) { sink.Add(new Modifier(StatId.Atk, ModifierPool.Global, pct[0])); }
            if (pct[1] > 0) { sink.Add(new Modifier(StatId.Hp, ModifierPool.Global, pct[1])); }
            if (pct[2] > 0) { sink.Add(new Modifier(StatId.Def, ModifierPool.Global, pct[2])); }
        }

        private double[] ComputeZukanPct()
        {
            double[] pct = new double[3];
            IReadOnlyList<int> lvGoals = _data.Research.Zukan.LevelGoals;
            int maxStar = _data.Stats.StarMaxLv.Count - 1;
            foreach (string goal in _save.Research.Zukan)
            {
                int dot = goal.LastIndexOf('.');
                if (dot < 0) { continue; }
                string kind = goal.Substring(dot + 1);
                bool star = kind.StartsWith("star", StringComparison.Ordinal);
                int index = -1;
                if (star && int.TryParse(kind.Substring(4), out int st) && st >= 1 && st <= maxStar) { index = st - 1; }
                else if (!star && kind.StartsWith("lv", StringComparison.Ordinal) && int.TryParse(kind.Substring(2), out int lv))
                {
                    for (int i = 0; i < lvGoals.Count; i++) { if (lvGoals[i] == lv) { index = i; } }
                }
                if (index < 0) { continue; }
                string stat = ZukanService.StatOf(star, index);
                pct[stat == "atk" ? 0 : (stat == "hp" ? 1 : 2)] += _data.Research.Zukan.PerGoalPct;
            }
            return pct;
        }

        private static void Add(List<Modifier> sink, string stat, double value)
        {
            switch (stat)
            {
                case "atk": sink.Add(new Modifier(StatId.Atk, ModifierPool.Global, value)); break;
                case "hp": sink.Add(new Modifier(StatId.Hp, ModifierPool.Global, value)); break;
                case "def": sink.Add(new Modifier(StatId.Def, ModifierPool.Global, value)); break;
                case "critRatePct": sink.Add(new Modifier(StatId.CritRate, ModifierPool.Flat, value)); break;
                case "accuracyPct": sink.Add(new Modifier(StatId.Accuracy, ModifierPool.Flat, value)); break;
                case "evasionPct": sink.Add(new Modifier(StatId.Evasion, ModifierPool.Flat, value)); break;
                case "critResistPct": sink.Add(new Modifier(StatId.CritResist, ModifierPool.Flat, value)); break;
                case "attackSpeedPct": sink.Add(new Modifier(StatId.AttackSpeed, ModifierPool.Flat, value)); break;
                case "critDamagePct": sink.Add(new Modifier(StatId.CritDamage, ModifierPool.Flat, value)); break;
                default: sink.Add(new Modifier(StatId.CritDefense, ModifierPool.Flat, value)); break;
            }
        }
    }
}
