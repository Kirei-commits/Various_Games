using System;
using System.Collections.Generic;
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
    }

    public enum AutoStop { Found, NotEnough, Limit }

    public sealed class AutoGachaResult
    {
        public int Pulls { get; set; }
        public int Sold { get; set; }
        public double CoinGained { get; set; }

        /// <summary>条件に合ったカード（持ち物に入っている。勝手には装備しない）。Found 以外は null。</summary>
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

        public static double SellPrice(GameData data, MemoryCardState card)
        {
            return data.MemoryCards.SellCoinBase * (MemoryCardEffects.RarityIndex(data, card.Rarity) + 1) * card.Lv;
        }
    }
}
