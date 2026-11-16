using System;
using System.Collections.Generic;
using System.Globalization;
using Mado.Core.Util;
using Mado.Data;

namespace Mado.Sim
{
    /// <summary>economy [--minutes 120] [--seed 1]：遊び手（EconomyBot）に N 分遊ばせて、10分ごとの育ち具合を表示する。「1〜2時間で★6」の確かめ。</summary>
    public static class EconomyCommand
    {
        public static int Run(Options o)
        {
            string dataDir = Paths.Data();
            var source = new FileDataSource(dataDir);
            GameData data = DataLoader.Load(source);
            SimProfilesFile profiles = SimProfiles.LoadFile(source);
            int minutes = o.GetInt("--minutes", 120);
            ulong seed = (ulong)o.GetInt("--seed", 1);
            var bot = new EconomyBot(data, profiles.Items, profiles.AllySubstats, seed);
            List<EconomyPoint> points = bot.Run(minutes);
            Console.WriteLine("分   ランク 最大★ 編成平均Lv  ガチャ  所持  経験値       欠片      ジェム");
            foreach (EconomyPoint p in points)
            {
                Console.WriteLine(string.Format(CultureInfo.InvariantCulture, "{0,4} {1,5} {2,5} {3,10} {4,7} {5,5}  {6,-11} {7,-9} {8}",
                    p.Minute, p.Rank, p.MaxStar, p.PartyAvgLv, p.GachaPulls, p.Owned,
                    NumberFormat.Format(p.Exp, data.System.NumberUnits), NumberFormat.Format(p.Shards, data.System.NumberUnits), NumberFormat.Format(p.Gems, data.System.NumberUnits)));
            }
            EconomyPoint last = points[points.Count - 1];
            Console.WriteLine(string.Format("{0} 分：最大★{1}（目標：1〜2時間で★6魔晶＝★6）", last.Minute, last.MaxStar));
            return 0;
        }
    }
}
