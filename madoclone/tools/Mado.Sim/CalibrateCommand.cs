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
    ///   1) 標準編成の共通倍率 globalMultiplier：編成の戦力 ＝ ランクボスの推奨戦力 になる倍率 → sim_profiles.json
    ///   2) 敵の倍率 enemyScale（hp・atk）：推奨ちょうどのボス戦で「勝率 80％、勝った戦闘の決着が 30 秒前後」 → difficulty.json
    /// を求める。手で書かない。--write を付けたときだけファイルを書き換える。
    /// </summary>
    public static class CalibrateCommand
    {
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
            string dataDir = Paths.Data();
            var source = new FileDataSource(dataDir);
            var calibrator = new Calibrator(DataLoader.Load(source), SimProfiles.LoadFile(source).AllySubstats, o.GetInt("--runs", 200));

            string probe = o.Get("--probe");
            if (probe != null)
            {
                string[] p = probe.Split(',');
                calibrator.Probe(from, Num(p[0]), Num(p[1]), o.Get("--ratio") != null ? Num(o.Get("--ratio")) : 1.0);
                return 0;
            }

            var results = new Calibrator.Result[to - from + 1];
            Parallel.For(from, to + 1, rank => results[rank - from] = calibrator.CalibrateRank(rank));

            Console.WriteLine("rank ★/Lv   倍率(戦力→推奨)  敵hp倍  敵atk倍   ボス勝率 決着秒  70%勝率  雑魚勝率 雑魚秒");
            foreach (Calibrator.Result r in results)
            {
                Console.WriteLine(string.Format(CultureInfo.InvariantCulture,
                    "{0,4} {1,2}/{2,-4} {3,14:0.###E+0} {4,8:0.####} {5,8:0.####} {6,8:0.0}% {7,6:0.0} {8,8:0.0}% {9,8:0.0}% {10,6:0.0}",
                    r.Profile.Rank, r.Profile.Star, r.Profile.Lv, r.Profile.GlobalMultiplier.Atk, r.HpScale, r.AtkScale,
                    r.Boss.WinPct, r.Boss.WinSec, r.BossAt70.WinPct, r.Wave.WinPct, r.Wave.WinSec));
            }
            if (o.Has("--write")) { Write(dataDir, results); Console.WriteLine("sim_profiles.json と difficulty.json の enemyScale を書き換えた"); }
            else { Console.WriteLine("（書き換えていない。--write を付けると sim_profiles.json と difficulty.json に書く）"); }
            return 0;
        }

        private static double Num(string text) { return double.Parse(text, CultureInfo.InvariantCulture); }

        private static void Write(string dataDir, Calibrator.Result[] rows)
        {
            var settings = new JsonSerializerSettings { DateParseHandling = DateParseHandling.None };

            // difficulty.json：enemyScale だけ書き換える。
            string diffPath = Path.Combine(dataDir, DataLoader.DifficultyFile);
            JObject diff = JsonConvert.DeserializeObject<JObject>(File.ReadAllText(diffPath), settings);
            foreach (Calibrator.Result r in rows)
            {
                foreach (JToken t in (JArray)diff["enemyScale"])
                {
                    if ((int)t["rank"] == r.Profile.Rank) { t["hp"] = r.HpScale; t["atk"] = r.AtkScale; }
                }
            }
            File.WriteAllText(diffPath, diff.ToString(Formatting.Indented) + "\n");

            // sim_profiles.json：ランクごとの標準編成と共通倍率（今回求めていないランクの行は残す）。
            string profPath = Path.Combine(dataDir, SimProfiles.FileName);
            JObject prof = JsonConvert.DeserializeObject<JObject>(File.ReadAllText(profPath), settings);
            var items = new SortedDictionary<int, JToken>();
            foreach (JToken t in (JArray)prof["items"]) { items[(int)t["rank"]] = t; }
            foreach (Calibrator.Result r in rows)
            {
                SimProfileDef p = r.Profile;
                items[p.Rank] = new JObject
                {
                    ["rank"] = p.Rank, ["star"] = p.Star, ["lv"] = p.Lv,
                    ["partyCharacterIds"] = new JArray(p.PartyCharacterIds),
                    ["globalMultiplier"] = new JObject { ["atk"] = p.GlobalMultiplier.Atk, ["hp"] = p.GlobalMultiplier.Hp, ["def"] = p.GlobalMultiplier.Def },
                };
            }
            prof["items"] = new JArray(items.Values);
            File.WriteAllText(profPath, prof.ToString(Formatting.Indented) + "\n");
        }
    }

    /// <summary>calibrate の中身（状態を持たない計算。ランクごとに並列で呼べる）。</summary>
    public sealed class Calibrator
    {
        private const double TargetWinPct = 80;
        private const double TargetWinSec = 30;   // 合格ライン 20〜40 秒の真ん中
        private const double ScaleMin = 1e-6, ScaleMax = 1e4;
        private const int BisectSteps = 12;       // 対数目盛りで 10 桁を 2^12 に刻む（約0.6％刻み）
        private const int Rounds = 4;             // atk → hp の合わせ込みをくり返す回数

        /// <summary>runs 戦の結果。WinSec は勝った戦闘の決着秒の中央値（1回も勝てなければ無限大）。</summary>
        public readonly struct Stat
        {
            public readonly double WinPct, WinSec;
            public Stat(double winPct, double winSec) { WinPct = winPct; WinSec = winSec; }
        }

        public sealed class Result
        {
            public SimProfileDef Profile;
            public double HpScale, AtkScale;
            public Stat Boss, BossAt70, Wave;
        }

        private readonly GameData _data;
        private readonly int _runs;
        private readonly StageFactory _stages;
        private readonly ProfilePartyFactory _parties;
        private readonly BattleSetupBuilder _builder;

        public Calibrator(GameData data, EnemySubstatFormulas allySubstats, int runs)
        {
            _data = data;
            _runs = runs;
            _stages = new StageFactory(data);
            _parties = new ProfilePartyFactory(data, allySubstats);
            _builder = new BattleSetupBuilder(data, new StatResolver(data));
        }

        /// <summary>ランクボス（最後のエリアの最後のステージ）の推奨戦力。</summary>
        private double BossPower(int rank)
        {
            return _stages.RecommendedPower(rank, _data.Difficulty.AreasPerRank, _data.Difficulty.StagesPerArea);
        }

        private double BossTimeLimit(int rank)
        {
            return rank == _data.Difficulty.Ranks ? _data.System.TimeLimitSec.FinalBoss : _data.System.TimeLimitSec.Boss;
        }

        /// <summary>標準編成（SimPolicy）と、その戦力が推奨ちょうどになる共通倍率。</summary>
        public SimProfileDef StandardProfile(int rank)
        {
            int star = SimPolicy.StarFor(rank);
            var bare = new SimProfileDef
            {
                Rank = rank, Star = star, Lv = _data.Stats.StarMaxLv[star], PartyCharacterIds = SimPolicy.Party(_data, rank),
                GlobalMultiplier = new GlobalMultiplier { Atk = 1, Hp = 1, Def = 1 },
            };
            double m = RoundTo(BossPower(rank) / _parties.Power(bare), 6);
            return new SimProfileDef
            {
                Rank = rank, Star = bare.Star, Lv = bare.Lv, PartyCharacterIds = bare.PartyCharacterIds,
                GlobalMultiplier = new GlobalMultiplier { Atk = m, Hp = m, Def = m },
            };
        }

        public Result CalibrateRank(int rank)
        {
            SimProfileDef profile = StandardProfile(rank);
            List<UnitSetup> allies = _parties.Build(profile);

            // 敵の攻撃倍率で勝率 80％ → HP 倍率で決着 30 秒、を数回くり返す（片方を動かすと、もう片方もずれるため）。
            double hp = 1, atk = 1;
            for (int round = 0; round < Rounds; round++)
            {
                atk = BisectLog(x => Boss(rank, allies, hp, x).WinPct, TargetWinPct, increasing: false);
                hp = BisectLog(x => Boss(rank, allies, x, atk).WinSec, TargetWinSec, increasing: true);
            }
            hp = RoundTo(hp, 4);
            atk = RoundTo(atk, 4);
            return new Result
            {
                Profile = profile, HpScale = hp, AtkScale = atk,
                Boss = Boss(rank, allies, hp, atk),
                BossAt70 = Boss(rank, _parties.Build(profile, 0.7), hp, atk),
                Wave = Fight(allies, _stages.BuildWithPower(rank, BossPower(rank) * _data.Difficulty.WavePowerRatio, StageKind.Wave, hp, atk), _data.System.TimeLimitSec.Stage),
            };
        }

        /// <summary>指定した敵の倍率と味方の戦力比で、推奨ちょうどのボス戦を流して中身を出す（原因の切り分け用）。</summary>
        public void Probe(int rank, double hpScale, double atkScale, double powerRatio)
        {
            SimProfileDef profile = StandardProfile(rank);
            List<UnitSetup> allies = _parties.Build(profile, powerRatio);
            List<UnitSetup> enemies = BossEnemies(rank, hpScale, atkScale);
            Console.WriteLine("ランク" + rank + "  編成 " + string.Join(",", profile.PartyCharacterIds) + "  推奨戦力 " + Sci(BossPower(rank)) + "  戦力比 " + powerRatio.ToString(CultureInfo.InvariantCulture));
            foreach (UnitSetup u in allies) { Console.WriteLine("  味方 " + Describe(u)); }
            foreach (UnitSetup u in enemies) { Console.WriteLine("  敵   " + Describe(u)); }
            Stat s = Fight(allies, enemies, BossTimeLimit(rank));
            Console.WriteLine("勝率 " + s.WinPct.ToString("0.0", CultureInfo.InvariantCulture) + "%  勝った戦闘の決着(秒) " + s.WinSec.ToString("0.0", CultureInfo.InvariantCulture));
        }

        private static string Sci(double v) { return v.ToString("0.##E+0", CultureInfo.InvariantCulture); }

        private static string Describe(UnitSetup u)
        {
            BattleStats s = u.Stats;
            return u.Id + " Atk " + Sci(s.Atk) + " Hp " + Sci(s.Hp) + " Def " + Sci(s.Def) + " 命中 " + s.AccuracyPct + " 回避 " + s.EvasionPct
                + " クリ率 " + s.CritRatePct + " クリ耐性 " + s.CritResistPct + " クリダメ " + s.CritDamagePct + " クリ防御 " + s.CritDefensePct;
        }

        private List<UnitSetup> BossEnemies(int rank, double hpScale, double atkScale)
        {
            return _stages.BuildWithPower(rank, BossPower(rank) * _data.Difficulty.BossFightPowerRatio, StageKind.Boss, hpScale, atkScale);
        }

        private Stat Boss(int rank, List<UnitSetup> allies, double hpScale, double atkScale)
        {
            return Fight(allies, BossEnemies(rank, hpScale, atkScale), BossTimeLimit(rank));
        }

        private Stat Fight(List<UnitSetup> allies, List<UnitSetup> enemies, double limitSec)
        {
            BattleSetup s = _builder.Assemble(allies, enemies, 1, limitSec);
            var winTicks = new List<int>();
            for (int i = 0; i < _runs; i++)
            {
                s.Seed = (ulong)(i + 1);
                BattleResult r = new BattleSim(s).RunToEnd(null);
                if (r.Outcome == BattleOutcome.Win) { winTicks.Add(r.EndTick); }
            }
            winTicks.Sort();
            // 1回も勝てないときの決着時間は「無限に長い」とする（0 にすると、探索が敵をもっと硬くする向きに進んでしまう）。
            double sec = winTicks.Count == 0 ? double.PositiveInfinity : winTicks[winTicks.Count / 2] * s.Constants.TickSec;
            return new Stat(100.0 * winTicks.Count / _runs, sec);
        }

        /// <summary>対数目盛りの二分探索。f(x) が target になる x を探す。increasing は、f が x について増えるか。</summary>
        private static double BisectLog(Func<double, double> f, double target, bool increasing)
        {
            double lo = ScaleMin, hi = ScaleMax;
            for (int i = 0; i < BisectSteps; i++)
            {
                double mid = Math.Sqrt(lo * hi);
                bool below = increasing ? f(mid) < target : f(mid) > target;
                if (below) { lo = mid; } else { hi = mid; }
            }
            return Math.Sqrt(lo * hi);
        }

        /// <summary>有効数字 digits 桁に丸める（JSON に書く値を読みやすくする）。</summary>
        private static double RoundTo(double v, int digits)
        {
            return double.Parse(v.ToString("G" + digits, CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
        }
    }
}
