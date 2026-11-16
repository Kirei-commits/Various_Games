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

        internal GameState(SaveData save, Wallet.Wallet wallet, IdleService idle, Metrics.MetricCounter metrics)
        {
            _save = save; _wallet = wallet; _idle = idle; _metrics = metrics;
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
