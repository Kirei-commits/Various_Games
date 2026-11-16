using System;
using System.Globalization;
using System.IO;
using Mado.Core.Progress;
using Mado.Data;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Mado.Sim
{
    /// <summary>rewards [--write]：敵1体あたりの経験値の表を計算して表示し、--write で rewards.json の expPerEnemy に書く。</summary>
    public static class RewardsCommand
    {
        public static int Run(Options o)
        {
            string dataDir = Paths.Data();
            GameData data = DataLoader.Load(new FileDataSource(dataDir));
            double[] table = RewardsPlan.ExpPerEnemy(data);
            var calc = new RewardCalculator(data);
            Console.WriteLine("rank ★/Lv   人数  敵1体の経験値  1ランクの総量(クリアのみ)");
            for (int r = 1; r <= table.Length; r++)
            {
                Console.WriteLine(string.Format(CultureInfo.InvariantCulture, "{0,4} {1,2}/{2,-4} {3,4} {4,14:0.##E+0} {5,18:0.##E+0}",
                    r, Mado.Sim.SimPolicy.StarFor(r), data.Stats.StarMaxLv[Mado.Sim.SimPolicy.StarFor(r)], Mado.Sim.SimPolicy.PartyCount(r), table[r - 1], table[r - 1] * calc.KillsPerRankClear));
            }
            if (!o.Has("--write")) { Console.WriteLine("（書き換えていない。--write で rewards.json に書く）"); return 0; }
            string path = Path.Combine(dataDir, DataLoader.RewardsFile);
            JObject root = JsonConvert.DeserializeObject<JObject>(File.ReadAllText(path), new JsonSerializerSettings { DateParseHandling = DateParseHandling.None });
            root["expPerEnemy"] = new JArray(table);
            File.WriteAllText(path, root.ToString(Formatting.Indented) + "\n");
            Console.WriteLine("rewards.json の expPerEnemy を書き換えた");
            return 0;
        }
    }
}
