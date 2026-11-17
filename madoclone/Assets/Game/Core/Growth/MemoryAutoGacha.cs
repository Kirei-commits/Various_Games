using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    /// <summary>自動絆ガチャの設定（docs/01 7.2節）。</summary>
    public sealed class AutoGachaSettings
    {
        /// <summary>true なら、いま付けているカードより強くなるカードだけを残す（空き枠があれば強くなる）。</summary>
        public bool RequirePowerUp { get; set; }

        /// <summary>この順番（memory_cards.json の rarities の並び）以上のレアだけを残す。0 なら制限なし。</summary>
        public int MinRarityIndex { get; set; }

        /// <summary>サブ効果のフィルター。それぞれ最大2つ。空なら条件なし。フィルターのキーを全部持つカードだけが合う。</summary>
        public IReadOnlyList<SubstatKey> Filter1 { get; set; } = new SubstatKey[0];
        public IReadOnlyList<SubstatKey> Filter2 { get; set; } = new SubstatKey[0];

        public static AutoGachaSettings From(MemoryRuleState r)
        {
            return new AutoGachaSettings { RequirePowerUp = r.RequirePowerUp, MinRarityIndex = r.MinRarityIndex, Filter1 = r.Filter1.ToArray(), Filter2 = r.Filter2.ToArray() };
        }
    }

    public enum AutoStop { Found, NotEnough, Limit }

    public sealed class AutoGachaResult
    {
        public int Pulls { get; set; }
        public int Sold { get; set; }

        public double CoinGained { get; set; }
        public double ExpGained { get; set; }

        /// <summary>条件に合って返事待ちになったカード（まだ装備していない）。Found 以外は null。</summary>
        public MemoryCardState Found { get; set; }
        public AutoStop Stop { get; set; }
    }

    /// <summary>カードの価値の見積もりと、自動絆ガチャ・売却の判定。</summary>
    public static class MemoryCardRules
    {
        /// <summary>カードの強さの目安 ＝ メイン効果の％の合計（HP・攻撃・防御の％と、攻撃スピードの％）。[仮]</summary>
        public static double Score(GameData data, MemoryCardState card)
        {
            var sink = new List<Modifier>();
            MemoryCardEffects.Collect(data, card, sink);
            double sum = 0;
            foreach (Modifier m in sink)
            {
                if (m.Pool == ModifierPool.Global) { sum += m.Value; }
                else if (m.Stat == StatId.AttackSpeed) { sum += m.Value; }
            }
            return sum;
        }

        /// <summary>同じ種類の枠2つのうち、空きがあれば 0、なければ付いている2枚のうち弱いほうの強さ。</summary>
        public static double WeakestEquipped(GameData data, MemoryState m, MemoryKind kind)
        {
            double weakest = double.MaxValue;
            for (int i = 0; i < 2; i++)
            {
                string id = m.Equipped[(int)kind * 2 + i];
                MemoryCardState c = id == null ? null : m.Cards.Find(x => x.Id == id);
                weakest = Math.Min(weakest, c == null ? 0 : Score(data, c));
            }
            return weakest;
        }

        public static bool Matches(GameData data, MemoryState m, MemoryCardState card, AutoGachaSettings s)
        {
            if (MemoryCardEffects.RarityIndex(data, card.Rarity) < s.MinRarityIndex) { return false; }
            if (!HasAll(card, s.Filter1) || !HasAll(card, s.Filter2)) { return false; }
            if (s.RequirePowerUp && !(Score(data, card) > WeakestEquipped(data, m, card.Kind))) { return false; }
            return true;
        }

        private static bool HasAll(MemoryCardState card, IReadOnlyList<SubstatKey> keys)
        {
            foreach (SubstatKey k in keys)
            {
                bool has = false;
                foreach (MemorySubState sub in card.Subs) { if (sub.Stat == k) { has = true; } }
                if (!has) { return false; }
            }
            return true;
        }

        /// <summary>確認の条件が範囲内か。</summary>
        public static bool IsRuleValid(GameData data, MemoryRuleState r)
        {
            return r.MinRarityIndex >= 0 && r.MinRarityIndex < data.MemoryCards.Rarities.Count && r.Filter1.Count <= 2 && r.Filter2.Count <= 2;
        }

        /// <summary>カード1枚の形が正しいか（レア・Lv・スピードカードの extra・サブ2つ・ID が空でなく、持ち物と重ならない）。</summary>
        public static bool IsWellFormed(GameData data, MemoryCardState c, IReadOnlyDictionary<string, MemoryCardState> owned)
        {
            int extra = c.Extra == null ? 0 : c.Extra.Length;
            return !string.IsNullOrEmpty(c.Id) && !owned.ContainsKey(c.Id) && MemoryCardEffects.RarityIndex(data, c.Rarity) >= 0
                && c.Lv >= 1 && c.Lv <= data.MemoryCards.MaxCardLv && extra == (c.Kind == MemoryKind.Speed ? 3 : 0)
                && c.Subs != null && c.Subs.Count == 2 && c.Subs[0].Stat != c.Subs[1].Stat;
        }

        public static double SellPrice(GameData data, MemoryCardState card)
        {
            return data.MemoryCards.SellCoinBase * (MemoryCardEffects.RarityIndex(data, card.Rarity) + 1) * card.Lv;
        }
    }
}
