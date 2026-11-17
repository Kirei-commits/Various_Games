using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using Mado.Core.Battle;
using Mado.Core.Tests.Golden;
using Mado.Data;

namespace Mado.Sim
{
    /// <summary>seed0 + i で n 戦して、勝率・決着時間の分布・総ダメージを表示する（docs/04 10節）。</summary>
    public static class BattleCommand
    {
        public static int Run(Options o)
        {
            int n = o.GetInt("--n", 1000);
            ulong seed0 = (ulong)o.GetInt("--seed0", 1);
            BattleSetup setup;
            string file = o.Get("--setup");
            string caseName = o.Get("--case");
            if (file != null) { setup = GoldenIO.LoadSetup(file); }
            else if (caseName != null)
            {
                GameData data = DataLoader.Load(new FileDataSource(Paths.Data()));
                GoldenCase c = new List<GoldenCase>(GoldenCases.All()).Find(x => x.Name == caseName);
                if (c == null) { throw new ArgumentException("ケースが無い: " + caseName); }
                string factor = o.Get("--factor");
                if (factor != null) { c.EnemyPowerFactor = double.Parse(factor, CultureInfo.InvariantCulture); }
                setup = GoldenCases.Build(data, c);
            }
            else { throw new ArgumentException("--setup か --case が要る"); }

            int wins = 0, timeUps = 0;
            var ticks = new List<int>(n);
            double allyDamage = 0, enemyDamage = 0;
            var sw = Stopwatch.StartNew();
            for (int i = 0; i < n; i++)
            {
                setup.Seed = seed0 + (ulong)i;
                BattleResult r = new BattleSim(setup).RunToEnd(null);
                if (r.Outcome == BattleOutcome.Win) { wins++; }
                if (r.Outcome == BattleOutcome.TimeUp) { timeUps++; }
                ticks.Add(r.EndTick);
                for (int u = 0; u < setup.Allies.Count; u++) { allyDamage += r.DamageDealt[u]; }
                for (int u = setup.Allies.Count; u < r.DamageDealt.Length; u++) { enemyDamage += r.DamageDealt[u]; }
            }
            sw.Stop();
            ticks.Sort();
            double tick = setup.Constants.TickSec;
            Console.WriteLine("戦数 " + n + "  勝率 " + (100.0 * wins / n).ToString("0.0", CultureInfo.InvariantCulture) + "%  時間切れ " + timeUps);
            Console.WriteLine("決着(秒) 最短 " + Sec(ticks[0], tick) + "  中央値 " + Sec(ticks[n / 2], tick) + "  90% " + Sec(ticks[(int)(n * 0.9)], tick) + "  最長 " + Sec(ticks[n - 1], tick));
            Console.WriteLine("1戦あたりの与ダメージ 味方 " + (allyDamage / n).ToString("0.###E+0", CultureInfo.InvariantCulture) + "  敵 " + (enemyDamage / n).ToString("0.###E+0", CultureInfo.InvariantCulture));
            Console.WriteLine("所要時間 " + sw.Elapsed.TotalSeconds.ToString("0.00", CultureInfo.InvariantCulture) + " 秒");
            return 0;
        }

        private static string Sec(int ticks, double tickSec)
        {
            return (ticks * tickSec).ToString("0.0", CultureInfo.InvariantCulture);
        }
    }
}
