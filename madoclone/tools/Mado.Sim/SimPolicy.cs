using System;
using System.Collections.Generic;
using Mado.Data;

namespace Mado.Sim
{
    /// <summary>
    /// 「そのランクで普通に組める7体」を自動で選ぶ（docs/02 6.5節の SimPolicy の最小形）。
    /// 解放済み（tiers.json の unlockRank 以下）のキャラから、役割をばらして、格の倍率が高い順・ID の順に選ぶ。
    /// </summary>
    public static class SimPolicy
    {
        // 役割の並び：前列・前列・後列・回復・妨害…を欠かさないように（足りなければ遠距離で埋める）。
        private static readonly Role[] Order = { Role.Defense, Role.Melee, Role.Ranged, Role.Heal, Role.Disrupt, Role.Melee, Role.Ranged };

        /// <summary>編成枠の数（ランク1：3、2：4、3：5、4以降：6＋リーダー）。リーダーが付くのは4以降。</summary>
        public static int PartyCount(int rank)
        {
            return rank >= 4 ? 7 : rank + 2;
        }

        /// <summary>01 6.1節の「想定★」。ランクごとの標準的な育ち具合（Lv は★の最大 Lv）。</summary>
        public static int StarFor(int rank)
        {
            int[] upper = { 2, 4, 7, 10, 12, 15, 18, 20, 23, 26, 28, 32 }; // 各★の最後のランク
            for (int star = 0; star < upper.Length; star++) { if (rank <= upper[star]) { return star; } }
            return upper.Length;
        }

        public static List<string> Party(GameData data, int rank)
        {
            var pool = new List<CharacterDef>();
            foreach (CharacterDef c in data.Characters)
            {
                if (c.Enabled && data.Tier(c.Tier).UnlockRank <= rank) { pool.Add(c); }
            }
            pool.Sort((a, b) =>
            {
                int t = data.Tier(b.Tier).StatMultiplier.CompareTo(data.Tier(a.Tier).StatMultiplier);
                return t != 0 ? t : string.CompareOrdinal(a.Id, b.Id);
            });
            var chosen = new List<string>();
            int count = PartyCount(rank);
            for (int i = 0; i < count; i++)
            {
                Role want = Order[i % Order.Length];
                CharacterDef pick = pool.Find(c => c.Role == want && !chosen.Contains(c.Id))
                    ?? pool.Find(c => c.Role == Role.Ranged && !chosen.Contains(c.Id))
                    ?? pool.Find(c => !chosen.Contains(c.Id));
                if (pick == null) { throw new ArgumentException("ランク" + rank + " で組めるキャラが足りない"); }
                chosen.Add(pick.Id);
            }
            return chosen;
        }
    }
}
