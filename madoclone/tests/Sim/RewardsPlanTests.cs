using System;
using System.Collections.Generic;
using Mado.Core.Growth;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Tests;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Sim.Tests
{
    /// <summary>敵のドロップ（経験値）が、標準編成の育ちに合っているか。</summary>
    public class RewardsPlanTests
    {
        private static GameData Data { get { return TestData.Data; } }

        [Test]
        public void SavedTable_MatchesThePlan()
        {
            // rewards.json は Mado.Sim rewards が書く。育ちの決め方を変えたら、rewards --write で合わせ直す。
            double[] plan = RewardsPlan.ExpPerEnemy(Data);
            Assert.AreEqual(Data.Difficulty.Ranks, plan.Length);
            for (int i = 0; i < plan.Length; i++) { Assert.AreEqual(plan[i], Data.Rewards.ExpPerEnemy[i], plan[i] * 1e-9, "ランク" + (i + 1)); }
        }

        /// <summary>
        /// 独立の確かめ：ランクを1つずつクリアして敵を倒し、集めた経験値で（低いレベルのキャラから）レベルを上げていく。
        /// 同じ★が続く最後のランクを終えたとき、全員がその★の最大 Lv に着いていること。
        /// </summary>
        [Test]
        public void ClearingEveryRank_RaisesTheStandardPartyToItsCapLevels()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            var wallet = new Mado.Core.Wallet.Wallet(Data.Currencies, null, null);
            var crystals = new CrystalService(Data, save);
            var roster = new RosterService(Data, save, crystals);
            var level = new LevelService(Data, save, wallet);
            var calc = new RewardCalculator(Data);
            int ranks = Data.Difficulty.Ranks;

            for (int rank = 1; rank <= ranks; rank++)
            {
                int star = SimPolicy.StarFor(rank);
                foreach (string id in SimPolicy.Party(Data, rank))
                {
                    roster.TryGrant(id);
                    if (save.Characters[id].Star < star) { Assert.IsTrue(roster.TrySetStar(id, star)); }   // 標準の★になっているものとする
                }
                wallet.Grant(new Reward(CurrencyIds.Exp, calc.ExpPerEnemy(rank) * calc.KillsPerRankClear), new GrantReason(WalletReasons.BattleDrop));

                // 低いレベルから順に1つずつ上げる（払える限り）
                while (true)
                {
                    string lowest = null;
                    foreach (string id in SimPolicy.Party(Data, rank))
                    {
                        CharacterState c = save.Characters[id];
                        if (c.Lv >= level.MaxLevel(c)) { continue; }
                        if (lowest == null || c.Lv < save.Characters[lowest].Lv) { lowest = id; }
                    }
                    if (lowest == null || !level.LevelUp(lowest).Success) { break; }
                }

                bool lastOfGroup = rank == ranks || SimPolicy.StarFor(rank + 1) != star;
                if (!lastOfGroup) { continue; }
                foreach (string id in SimPolicy.Party(Data, rank))
                {
                    Assert.AreEqual(level.MaxLevel(save.Characters[id]), save.Characters[id].Lv, "ランク" + rank + " を終えても " + id + " が上限に届いていない");
                }
            }
        }

        [Test]
        public void Table_IsPositive_AndTheTotalIsWithinAnOrderOfMagnitudeOfTheLevelCosts()
        {
            double[] plan = RewardsPlan.ExpPerEnemy(Data);
            var calc = new RewardCalculator(Data);
            double total = 0;
            foreach (double v in plan) { Assert.Greater(v, 0); total += v * calc.KillsPerRankClear; }
            // 7体を★0の上限（Lv50）から最大（Lv120）まで育てる累計の、1〜10 倍に収まる（放り過ぎず、足りなくもない）
            double cost = 7 * (RewardsPlan.CumulativeExp(Data, 120));
            Assert.That(total / cost, Is.InRange(0.5, 10.0), "総量 " + total + "／7体を Lv120 にする費用 " + cost);
        }
    }
}
