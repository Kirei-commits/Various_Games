using System;
using System.Globalization;
using Mado.Core.Progress;
using Mado.Data;

namespace Mado.Sim
{
    /// <summary>
    /// 敵1体あたりの経験値（rewards.json の expPerEnemy）の決め方。
    /// そのランクで標準編成が「想定★／Lv」まで育つのに要る経験値を、ランクをクリアするまでに倒す敵の数で割り、余裕（paceSlack）を掛ける。
    ///   育つ量 ＝ （同じ★が続く最後のランクの人数）×（その★の最大 Lv までの累計 − 前の★の最大 Lv までの累計）÷ 同じ★が続くランクの数
    ///           ＋ （同じ★の期間に新しく編成に入った人数 ×  前の★の最大 Lv までの累計）÷ 期間のランク数（新メンバーの追いつき。人数は、前のランクの標準編成にいなかった人）
    /// </summary>
    public static class RewardsPlan
    {
        /// <summary>Lv1 から Lv までの累計経験値。</summary>
        public static double CumulativeExp(GameData data, int lv)
        {
            double sum = 0;
            for (int i = 1; i < lv; i++) { sum += data.Stats.LevelTable[i - 1].ExpToNext.Value; }
            return sum;
        }

        public static double[] ExpPerEnemy(GameData data)
        {
            int ranks = data.Difficulty.Ranks;
            var calc = new RewardCalculator(data);
            int kills = calc.KillsPerRankClear;
            var result = new double[ranks];
            for (int rank = 1; rank <= ranks; rank++)
            {
                int star = SimPolicy.StarFor(rank);
                int groupFirst = rank, groupLast = rank, groupSize = 0;
                while (groupFirst > 1 && SimPolicy.StarFor(groupFirst - 1) == star) { groupFirst--; }
                for (int r = groupFirst; r <= ranks && SimPolicy.StarFor(r) == star; r++) { groupSize++; groupLast = r; }

                int capLv = data.Stats.StarMaxLv[star];
                int prevCapLv = star == 0 ? 1 : data.Stats.StarMaxLv[star - 1];
                int members = SimPolicy.PartyCount(groupLast);   // 途中で増える人数も、最終的に全員がその★の上限まで育つ前提
                // 新しく編成に入る人（前のランクの標準編成にいなかった人）。解禁された格が変わると、人数が同じでも顔ぶれが入れ替わる。
                // 経験値は貯めておけるので、同じ★が続く期間の追いつきの合計を、期間のランクで均す（解禁のランクだけ跳ねるのを避ける）。
                int newMembersInGroup = 0;
                for (int r = Math.Max(groupFirst, 2); r <= groupLast; r++)
                {
                    var before = SimPolicy.Party(data, r - 1);
                    foreach (string id in SimPolicy.Party(data, r)) { if (!before.Contains(id)) { newMembersInGroup++; } }
                }
                double growth = members * (CumulativeExp(data, capLv) - CumulativeExp(data, prevCapLv)) / groupSize;
                double catchUp = newMembersInGroup * CumulativeExp(data, prevCapLv) / groupSize;
                double perEnemy = (growth + catchUp) * data.Rewards.PaceSlack / kills;
                result[rank - 1] = double.Parse(perEnemy.ToString("G3", CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
            }
            return result;
        }
    }
}
