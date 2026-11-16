using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
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
            var bot = new EconomyBot(data, profiles.Items, profiles.AllySubstats, seed, o.Has("--real"));
            if (o.GetInt("--days", 0) > 0) { return RunDays(o, data, bot); }
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

        /// <summary>economy --days N [--hours H]：1日 H 時間（既定2）遊ぶのを N 日。ランクの到達日と、通貨ごとの収支を出す。</summary>
        private static int RunDays(Options o, GameData data, EconomyBot bot)
        {
            int days = o.GetInt("--days", 30);
            double hours = o.GetInt("--hours-x10", 20) / 10.0;
            int every = Math.Max(1, o.GetInt("--every", Math.Max(1, days / 20)));
            bot.OnDay = p => { if (p.Day % every == 0) { Console.Error.WriteLine(string.Format(CultureInfo.InvariantCulture, "  [{0} 日] ランク{1} {2} ★{3} Lv{4}", p.Day, p.Rank, p.Stage, p.MaxStar, p.PartyAvgLv)); } };
            List<DayPoint> points = bot.RunDays(days, hours);
            string[] cols = { "gem", "gacha_ticket", "coin", "bond_heart", "wine", "research_memo", "awaken_shard", "guild_coin" };
            Console.WriteLine(string.Format(CultureInfo.InvariantCulture, "1日 {0} 時間、{1} 日", hours, days));
            Console.WriteLine("日   ランク ステージ 最大★ 編成Lv ガチャ  所持  " + string.Join(" ", cols.Select(c => c.PadRight(11))));
            var firstDay = new SortedDictionary<int, int>();
            foreach (DayPoint p in points)
            {
                if (!firstDay.ContainsKey(p.Rank)) { firstDay[p.Rank] = p.Day; }
                if (p.Day % every != 0 && p.Day != days) { continue; }
                Console.WriteLine(string.Format(CultureInfo.InvariantCulture, "{0,3} {1,6} {2,-7} {3,5} {4,6} {5,6} {6,5}  {7}",
                    p.Day, p.Rank, p.Stage, p.MaxStar, p.PartyAvgLv, p.GachaPulls, p.Owned,
                    string.Join(" ", cols.Select(c => NumberFormat.Format(p.Balances[c], data.System.NumberUnits).PadRight(11)))));
            }
            Console.Error.WriteLine("時間(秒): 戦闘 {0:F1}、使い道 {1:F1}（うち育成 {2:F1}）", bot.PlayTicks / (double)System.Diagnostics.Stopwatch.Frequency, bot.SpendTicks / (double)System.Diagnostics.Stopwatch.Frequency, bot.InvestTicks / (double)System.Diagnostics.Stopwatch.Frequency);
            Console.WriteLine();
            Console.WriteLine("ランクに初めて着いた日： " + string.Join("、", firstDay.Where(kv => kv.Key % 4 == 0 || kv.Key == 1 || kv.Key == 32).Select(kv => "ランク" + kv.Key + "＝" + kv.Value + "日")));
            Console.WriteLine(bot.FinalBossDay > 0 ? "最終ボスを倒した日： " + bot.FinalBossDay + " 日目" : "最終ボスは倒していない（" + days + " 日の間）");
            Console.WriteLine();
            Console.WriteLine("通貨        入った量      使った量      残り        使った割合");
            foreach (CurrencyDef c in data.Currencies)
            {
                KeyValuePair<double, double> f = bot.Flow(c.Id);
                double left = points[points.Count - 1].Balances[c.Id];
                if (f.Key <= 0 && left <= 0) { continue; }
                Console.WriteLine(string.Format(CultureInfo.InvariantCulture, "{0,-16} {1,-13} {2,-13} {3,-11} {4,5:F0}%",
                    c.Id, NumberFormat.Format(f.Key, data.System.NumberUnits), NumberFormat.Format(f.Value, data.System.NumberUnits), NumberFormat.Format(left, data.System.NumberUnits), f.Key > 0 ? 100.0 * f.Value / f.Key : 0));
            }
            return 0;
        }
    }
}
