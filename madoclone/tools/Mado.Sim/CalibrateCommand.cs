using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Stats;
using Mado.Data;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Mado.Sim
{
    /// <summary>
    /// 戦闘バランスの自動合わせ（docs/02 6.5節、docs/04 10節）。ランクごとに
    ///   1) 標準編成の共通倍率 globalMultiplier：編成7体の戦力 ＝ ランクボスの推奨戦力 になる倍率 → sim_profiles.json
    ///   2) 敵の倍率 enemyScale（hp・atk）：推奨ちょうどのボス戦で「勝率 80％、勝った戦闘の決着が 30 秒前後」 → difficulty.json
    /// を求める。手で書かない。--write を付けたときだけファイルを書き換える。
    /// </summary>
    public static class CalibrateCommand
    {
        private const double TargetWinPct = 80;
        private const double TargetWinSec = 30;   // 合格ライン 20〜40 秒の真ん中

        private sealed class Row
        {
            public int Rank, Star, Lv;
            public List<string> Party;
            public double Multiplier, HpScale, AtkScale;
            public double Win, WinSec, Win70, WaveWin, WaveSec;
        }

        public static int Run(Options o)
        {
            int from = 1, to = 32;
            string rankArg = o.Get("--rank");
            if (rankArg != null)
            {
                string[] parts = rankArg.Split(new[] { ".." }, StringSplitOptions.None);
                from = int.Parse(parts[0], CultureInfo.InvariantCulture);
                to = parts.Length > 1 ? int.Parse(parts[1], CultureInfo.InvariantCulture) : from;
            }
            int runs = o.GetInt("--runs", 200);
            if (o.Get("--probe") != null) { return Probe(o, from, runs); }
            string dataDir = Paths.Data();
            GameData data = DataLoader.Load(new FileDataSource(dataDir));
            var results = new Row[to - from + 1];
            Parallel.For(from, to + 1, r => results[r - from] = CalibrateRank(data, r, runs));

            Console.WriteLine("rank ★/Lv   倍率(戦力→推奨)  敵hp倍  敵atk倍   ボス勝率 決着秒  70%勝率  雑魚勝率 雑魚秒");
            foreach (Row r in results)
            {
                Console.WriteLine(string.Format(CultureInfo.InvariantCulture,
                    "{0,4} {1,2}/{2,-4} {3,14:0.###E+0} {4,8:0.####} {5,8:0.####} {6,8:0.0}% {7,6:0.0} {8,8:0.0}% {9,8:0.0}% {10,6:0.0}",
                    r.Rank, r.Star, r.Lv, r.Multiplier, r.HpScale, r.AtkScale, r.Win, r.WinSec, r.Win70, r.WaveWin, r.WaveSec));
            }
            if (o.Has("--write")) { Write(dataDir, results); Console.WriteLine("sim_profiles.json と difficulty.json の enemyScale を書き換えた"); }
            else { Console.WriteLine("（書き換えていない。--write を付けると sim_profiles.json と difficulty.json に書く）"); }
            return 0;
        }

        /// <summary>--probe HP倍,ATK倍（--ratio で味方の戦力比）：指定した敵の倍率で、推奨ちょうどのボス戦を runs 戦して結果を出す（原因の切り分け用）。</summary>
        private static int Probe(Options o, int rank, int runs)
        {
            string[] p = o.Get("--probe").Split(',');
            double hp = double.Parse(p[0], CultureInfo.InvariantCulture), atk = double.Parse(p[1], CultureInfo.InvariantCulture);
            GameData data = DataLoader.Load(new FileDataSource(Paths.Data()));
            var factory = new StageFactory(data);
            int star = SimPolicy.StarFor(rank);
            int lv = data.Stats.StarMaxLv[star];
            List<string> party = SimPolicy.Party(data, rank);
            double rec = factory.RecommendedPower(rank, data.Difficulty.AreasPerRank, data.Difficulty.StagesPerArea);
            double p0 = 0;
            foreach (UnitSetup u in BuildParty(data, rank, star, lv, party, 0)) { p0 += u.Stats.Power; }
            double ratio = o.Get("--ratio") != null ? double.Parse(o.Get("--ratio"), CultureInfo.InvariantCulture) : 1.0;
            List<UnitSetup> allies = BuildParty(data, rank, star, lv, party, rec / p0 * ratio);
            var builder = new BattleSetupBuilder(data, new StatResolver(data));
            List<UnitSetup> enemies = factory.BuildWithPower(rank, rec * data.Difficulty.BossFightPowerRatio, StageKind.Boss, hp, atk);
            Console.WriteLine("編成 " + string.Join(",", party) + "  味方の戦力 " + (rec).ToString("0.###E+0", CultureInfo.InvariantCulture));
            foreach (UnitSetup u in allies) { Console.WriteLine("  味方 " + u.Id + " Atk " + u.Stats.Atk.ToString("0.##E+0", CultureInfo.InvariantCulture) + " Hp " + u.Stats.Hp.ToString("0.##E+0", CultureInfo.InvariantCulture) + " Def " + u.Stats.Def.ToString("0.##E+0", CultureInfo.InvariantCulture) + " 命中 " + u.Stats.AccuracyPct + " クリ率 " + u.Stats.CritRatePct); }
            foreach (UnitSetup u in enemies) { Console.WriteLine("  敵   " + u.Id + " Atk " + u.Stats.Atk.ToString("0.##E+0", CultureInfo.InvariantCulture) + " Hp " + u.Stats.Hp.ToString("0.##E+0", CultureInfo.InvariantCulture) + " Def " + u.Stats.Def.ToString("0.##E+0", CultureInfo.InvariantCulture) + " 命中 " + u.Stats.AccuracyPct + " 回避 " + u.Stats.EvasionPct + " クリ率 " + u.Stats.CritRatePct + " クリ耐性 " + u.Stats.CritResistPct); }
            double[] r = Fight(builder, allies, enemies, data.System.TimeLimitSec.Boss, runs);
            Console.WriteLine("勝率 " + r[0].ToString("0.0", CultureInfo.InvariantCulture) + "%  勝った戦闘の決着(秒) " + r[1].ToString("0.0", CultureInfo.InvariantCulture));
            return 0;
        }

        private static Row CalibrateRank(GameData data, int rank, int runs)
        {
            var factory = new StageFactory(data);
            int star = SimPolicy.StarFor(rank);
            int lv = data.Stats.StarMaxLv[star];
            List<string> party = SimPolicy.Party(data, rank);
            double rec = factory.RecommendedPower(rank, data.Difficulty.AreasPerRank, data.Difficulty.StagesPerArea);

            // 1) 共通倍率：基礎値のままの戦力 P0 から、推奨ちょうどになる倍率。
            double p0 = 0;
            foreach (UnitSetup u in BuildParty(data, rank, star, lv, party, 0)) { p0 += u.Stats.Power; }
            double multiplier = rec / p0;

            double limit = rank == data.Difficulty.Ranks ? data.System.TimeLimitSec.FinalBoss : data.System.TimeLimitSec.Boss;
            List<UnitSetup> allies = BuildParty(data, rank, star, lv, party, multiplier);
            List<UnitSetup> allies70 = BuildParty(data, rank, star, lv, party, multiplier * 0.7);
            var builder = new BattleSetupBuilder(data, new StatResolver(data));

            Func<List<UnitSetup>, double, double, double[]> boss = (a, hp, atk) =>
                Fight(builder, a, factory.BuildWithPower(rank, rec * data.Difficulty.BossFightPowerRatio, StageKind.Boss, hp, atk), limit, runs);

            // 2) 敵の倍率：atk で勝率 80％ → hp で決着 30 秒、を数回くり返す。
            double hpS = 1, atkS = 1;
            for (int round = 0; round < 4; round++)
            {
                atkS = BisectLog(1e-6, 1e4, 12, x => boss(allies, hpS, x)[0], TargetWinPct, false);
                hpS = BisectLog(1e-6, 1e4, 12, x => boss(allies, x, atkS)[1], TargetWinSec, true);
            }
            hpS = Round(hpS); atkS = Round(atkS);
            double[] fin = boss(allies, hpS, atkS);
            double[] f70 = boss(allies70, hpS, atkS);
            double[] wave = Fight(builder, allies, factory.BuildWithPower(rank, rec * data.Difficulty.WavePowerRatio, StageKind.Wave, hpS, atkS), data.System.TimeLimitSec.Stage, runs);
            return new Row
            {
                Rank = rank, Star = star, Lv = lv, Party = party, Multiplier = multiplier, HpScale = hpS, AtkScale = atkS,
                Win = fin[0], WinSec = fin[1], Win70 = f70[0], WaveWin = wave[0], WaveSec = wave[1],
            };
        }

        private static List<UnitSetup> BuildParty(GameData data, int rank, int star, int lv, List<string> party, double multiplier)
        {
            var profile = new SimProfileDef
            {
                Rank = rank, Star = star, Lv = lv, PartyCharacterIds = party,
                GlobalMultiplier = new GlobalMultiplier { Atk = multiplier, Hp = multiplier, Def = multiplier },
            };
            var sources = new IModifierSource[] { new ProfileModifierSource(profile) };
            var b = new BattleSetupBuilder(data, new StatResolver(data, sources));
            var list = new List<UnitSetup>();
            for (int i = 0; i < party.Count; i++)
            {
                string id = party[i];
                IReadOnlyList<string> crystals = star >= data.System.CrystalSlotStars[2]
                    ? new[] { null, null, data.Character(id).CrystalId, null, null } : null;
                list.Add(b.BuildAlly(id, star, lv, crystals, rank >= 4 && i == party.Count - 1));
            }
            return list;
        }

        /// <summary>runs 戦して { 勝率(％)、勝った戦闘の決着秒の中央値 } を返す。</summary>
        private static double[] Fight(BattleSetupBuilder b, List<UnitSetup> allies, List<UnitSetup> enemies, double limitSec, int runs)
        {
            BattleSetup s = b.Assemble(allies, enemies, 1, limitSec);
            int wins = 0;
            var winTicks = new List<int>();
            for (int i = 0; i < runs; i++)
            {
                s.Seed = (ulong)(i + 1);
                BattleResult r = new BattleSim(s).RunToEnd(null);
                if (r.Outcome == BattleOutcome.Win) { wins++; winTicks.Add(r.EndTick); }
            }
            winTicks.Sort();
            // 勝てなかったときの決着時間は「無限に長い」として扱う（0 にすると、探索が敵をもっと硬くする向きに進んでしまう）。
            double sec = winTicks.Count == 0 ? double.PositiveInfinity : winTicks[winTicks.Count / 2] * s.Constants.TickSec;
            return new[] { 100.0 * wins / runs, sec };
        }

        /// <summary>対数目盛りの二分探索。f が x について増加（increasing）か減少かで向きを決める。</summary>
        private static double BisectLog(double lo, double hi, int iters, Func<double, double> f, double target, bool increasing)
        {
            for (int i = 0; i < iters; i++)
            {
                double mid = Math.Sqrt(lo * hi);
                double v = f(mid);
                bool tooLow = increasing ? v < target : v > target;
                if (tooLow) { lo = mid; } else { hi = mid; }
            }
            return Math.Sqrt(lo * hi);
        }

        private static double Round(double v)
        {
            return double.Parse(v.ToString("G4", CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
        }

        private static void Write(string dataDir, Row[] rows)
        {
            var settings = new JsonSerializerSettings { DateParseHandling = DateParseHandling.None };
            // difficulty.json：enemyScale だけ書き換える。
            string diffPath = Path.Combine(dataDir, "difficulty.json");
            JObject diff = JsonConvert.DeserializeObject<JObject>(File.ReadAllText(diffPath), settings);
            foreach (Row r in rows)
            {
                foreach (JToken t in (JArray)diff["enemyScale"])
                {
                    if ((int)t["rank"] == r.Rank) { t["hp"] = r.HpScale; t["atk"] = r.AtkScale; }
                }
            }
            File.WriteAllText(diffPath, diff.ToString(Formatting.Indented) + "\n");

            // sim_profiles.json：ランクごとの標準編成と共通倍率（既存の行は、他のランクの分を残す）。
            string profPath = Path.Combine(dataDir, "sim_profiles.json");
            JObject prof = JsonConvert.DeserializeObject<JObject>(File.ReadAllText(profPath), settings);
            var items = new SortedDictionary<int, JToken>();
            foreach (JToken t in (JArray)prof["items"]) { items[(int)t["rank"]] = t; }
            foreach (Row r in rows)
            {
                double m = double.Parse(r.Multiplier.ToString("G6", CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
                items[r.Rank] = new JObject
                {
                    ["rank"] = r.Rank, ["star"] = r.Star, ["lv"] = r.Lv,
                    ["partyCharacterIds"] = new JArray(r.Party),
                    ["globalMultiplier"] = new JObject { ["atk"] = m, ["hp"] = m, ["def"] = m },
                };
            }
            prof["items"] = new JArray(items.Values);
            File.WriteAllText(profPath, prof.ToString(Formatting.Indented) + "\n");
        }
    }
}
