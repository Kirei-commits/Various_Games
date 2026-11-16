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
        private readonly Wallet.Wallet _wallet;
        private readonly IdleService _idle;
        private readonly Metrics.MetricCounter _metrics;
        private readonly Growth.TrialService _trials;
        private readonly Growth.SupportService _supports;
        private readonly Growth.DragonNestService _nest;

        internal GameState(SaveData save, Wallet.Wallet wallet, IdleService idle, Metrics.MetricCounter metrics, Growth.TrialService trials, Growth.SupportService supports, Growth.DragonNestService nest)
        {
            _nest = nest;
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

        public ProgressView Progress { get { return new ProgressView(_save.Progress); } }
        public string Leader { get { return _save.Leader; } }
        public int LeaderLv { get { return _save.Temple.LeaderLv; } }
        public Element? LeaderElement { get { return _save.Temple.LeaderElement; } }
        public int PlazaLv(string plazaId) { return _save.Plazas.Levels.TryGetValue(plazaId ?? "", out int lv) ? lv : 1; }
        public int TrialClearedLv(string trialId) { return _trials.ClearedLv(trialId); }

        /// <summary>貯まっている報酬の回数（歯止めのない試練は PositiveInfinity）。</summary>
        public double TrialCharges(string trialId) { return _trials.Charges(trialId); }

        public int DragonNodeLv(string nodeId) { return _nest.Lv(nodeId); }
        public bool IsDragonNodeUnlocked(string nodeId) { return _nest.TryNode(nodeId, out Growth.NestNode n) && _nest.IsUnlocked(n); }
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
