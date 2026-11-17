using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum NestFailure { None, UnknownNode, Locked, AtMaxLv, NotEnough }

    /// <summary>ツリーのノード1つ（属性 × ブロック × 段 × ステータス）。</summary>
    public sealed class NestNode
    {
        public string Id { get; set; }
        public Element Element { get; set; }
        public int Block { get; set; }          // 1〜
        public int TierIndex { get; set; }
        public DragonTierDef Tier { get; set; }
        public string Stat { get; set; }
    }

    /// <summary>
    /// 竜の巣の特殊能力ツリー（docs/01 5.3節）：属性ごとに別々のツリー。竜の炎で強化し、「1つ前の段の全ノードが unlockLv（その段の最大Lvが小さければ最大Lv）以上」で解放。
    /// 振り直しは無料で、使った竜の炎は全額戻る（開発者モードでは減らしていないので戻さない）。
    /// </summary>
    public sealed class DragonNestService
    {
        private static readonly Element[] Elements = { Element.Valor, Element.Skill, Element.Heart, Element.Wisdom };

        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;
        private readonly List<NestNode> _nodes = new List<NestNode>();
        private readonly Dictionary<string, NestNode> _byId = new Dictionary<string, NestNode>();

        public DragonNestService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
            DragonNestConfig n = data.DragonNest;
            foreach (Element el in Elements)
            {
                for (int b = 1; b <= n.Blocks; b++)
                {
                    for (int t = 0; t < n.Tiers.Count; t++)
                    {
                        foreach (string stat in n.Tiers[t].Stats)
                        {
                            var node = new NestNode
                            {
                                Id = Text(el) + "." + b + "." + n.Tiers[t].Id + "." + stat,
                                Element = el, Block = b, TierIndex = t, Tier = n.Tiers[t], Stat = stat,
                            };
                            _nodes.Add(node);
                            _byId[node.Id] = node;
                        }
                    }
                }
            }
        }

        public static string Text(Element e) { return EnumStringConverter.Text(e); }

        public IReadOnlyList<NestNode> Nodes { get { return _nodes; } }

        public bool TryNode(string id, out NestNode node) { return _byId.TryGetValue(id ?? "", out node); }

        public int Lv(string id) { return _save.DragonNest.Levels.TryGetValue(id ?? "", out int lv) ? lv : 0; }

        /// <summary>最初の段は常に解放。それ以外は、1つ前の段（ブロックの最初の段なら、前のブロックの最後の段）の全ノードが unlockLv 以上。</summary>
        public bool IsUnlocked(NestNode node)
        {
            DragonNestConfig n = _data.DragonNest;
            int prevBlock = node.Block, prevTier = node.TierIndex - 1;
            if (prevTier < 0) { prevBlock--; prevTier = n.Tiers.Count - 1; }
            if (prevBlock < 1) { return true; }
            foreach (NestNode o in _nodes)
            {
                if (o.Element == node.Element && o.Block == prevBlock && o.TierIndex == prevTier && Lv(o.Id) < Math.Min(n.UnlockLv, o.Tier.MaxLv)) { return false; }
            }
            return true;
        }

        private double BlockMult(NestNode node) { return Math.Pow(_data.DragonNest.BlockMultiplier, node.Block - 1); }

        /// <summary>Lv lv → lv+1 の費用（竜の炎）。</summary>
        public double CostToNext(NestNode node, int lv)
        {
            if (lv < 0 || lv >= node.Tier.MaxLv) { throw new ArgumentException("Lv が範囲外: " + lv); }
            return (node.Tier.CostBase + node.Tier.CostStep * lv) * BlockMult(node);
        }

        /// <summary>Lv lv のときの効果の値（％または副ステータスのポイント）。</summary>
        public double Value(NestNode node, int lv)
        {
            if (lv <= 0) { return 0; }
            DragonTierDef t = node.Tier;
            double raw;
            if (node.Tier.Kind == "pct")
            {
                raw = t.FirstLv.HasValue ? t.FirstLv.Value + t.PerLv * (lv - 1) : t.PerLv * lv;
            }
            else
            {
                raw = _data.DragonNest.SubPerLv[node.Stat] * t.PerLv * lv;
            }
            return raw * BlockMult(node);
        }

        public NestFailure LevelUp(string id)
        {
            if (!TryNode(id, out NestNode node)) { return NestFailure.UnknownNode; }
            if (!IsUnlocked(node)) { return NestFailure.Locked; }
            int lv = Lv(id);
            if (lv >= node.Tier.MaxLv) { return NestFailure.AtMaxLv; }
            PayResult pay = _wallet.Pay(new Cost(CurrencyIds.DragonFlame, CostToNext(node, lv)), new PayReason(WalletReasons.DragonNestLevelUp));
            if (!pay.Success) { return NestFailure.NotEnough; }
            _save.DragonNest.Levels[id] = lv + 1;
            return NestFailure.None;
        }

        /// <summary>その属性のツリーを振り直す。使った竜の炎を全額返す（返した量を refunded に）。</summary>
        public void Reset(Element element, out double refunded)
        {
            refunded = 0;
            foreach (NestNode node in _nodes)
            {
                if (node.Element != element) { continue; }
                int lv = Lv(node.Id);
                for (int l = 0; l < lv; l++) { refunded += CostToNext(node, l); }
                _save.DragonNest.Levels.Remove(node.Id);
            }
            if (_wallet.Unlimited) { refunded = 0; return; }     // 開発者モードでは減らしていないので、戻さない
            if (refunded > 0) { _wallet.Grant(new Reward(CurrencyIds.DragonFlame, refunded), new GrantReason(WalletReasons.DragonNestRefund)); }
        }

        /// <summary>その属性に使った竜の炎の合計。</summary>
        public double Spent(Element element)
        {
            double sum = 0;
            foreach (NestNode node in _nodes)
            {
                if (node.Element != element) { continue; }
                for (int l = 0; l < Lv(node.Id); l++) { sum += CostToNext(node, l); }
            }
            return sum;
        }
    }

    /// <summary>竜の巣の効果：その属性のキャラ全員に、％は DragonNest の輪、副ステータスは Flat で足す。</summary>
    public sealed class DragonNestSource : IModifierSource
    {
        private readonly DragonNestService _service;
        private readonly SaveData _save;

        public DragonNestSource(DragonNestService service, SaveData save)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _save = save ?? throw new ArgumentNullException(nameof(save));
        }

        public void Collect(List<Modifier> sink, StatQuery query)
        {
            // ノードの並び（固定）で集める：辞書の並びに依存しない。
            foreach (NestNode node in _service.Nodes)
            {
                if (node.Element != query.Element) { continue; }
                int lv = Math.Min(_service.Lv(node.Id), node.Tier.MaxLv);
                if (lv <= 0) { continue; }
                double v = _service.Value(node, lv);
                if (node.Tier.Kind == "pct") { sink.Add(new Modifier(Stat(node.Stat), ModifierPool.DragonNest, v)); }
                else { sink.Add(new Modifier(Stat(node.Stat), ModifierPool.Flat, v)); }
            }
        }

        private static StatId Stat(string key)
        {
            switch (key)
            {
                case "atk": return StatId.Atk;
                case "hp": return StatId.Hp;
                case "def": return StatId.Def;
                case "critRatePct": return StatId.CritRate;
                case "accuracyPct": return StatId.Accuracy;
                case "evasionPct": return StatId.Evasion;
                case "critResistPct": return StatId.CritResist;
                case "critDamagePct": return StatId.CritDamage;
                default: return StatId.CritDefense;
            }
        }
    }
}
