using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Stats;
using Mado.Data;
using Newtonsoft.Json;

namespace Mado.Core.Tests.Golden
{
    /// <summary>ゴールデンの1ケース：編成7体（最後がリーダー）と敵の作り方（docs/04 10節）。</summary>
    public sealed class GoldenCase
    {
        public string Name;
        public string[] Party;           // キャラ ID。最後の1体がリーダー
        public int Star;
        public int Rank = 1;
        public StageKind Kind = StageKind.Wave;
        public double EnemyPowerFactor;  // 敵の合計戦力 ÷ 味方の合計戦力
        public bool CrystalsAtStar6;     // ★6以上の固有魔晶を枠2に付ける
        public bool ToughHarmlessEnemies; // 攻撃力 0・HP 巨大（時間切れの確認用）
        public double TimeLimitSec = 60;
        public ulong Seed = 1;
    }

    public static class GoldenCases
    {
        private static GoldenCase C(string name, string ids, int star, double factor, StageKind kind = StageKind.Wave, ulong seed = 1)
        {
            return new GoldenCase { Name = name, Party = ids.Split(','), Star = star, EnemyPowerFactor = factor, Kind = kind, Seed = seed };
        }

        /// <summary>敵の戦力倍率は、味方が基礎値のまま（全体強化なし）でも勝率が五分前後〜勝ち寄りで、10〜30秒ほど続く値にした（必殺・魔晶が発動する長さ）。
        /// 近接中心／遠距離中心／回復あり／妨害あり／LR入り／ボス戦／制限時間切れ／状態異常が多い／魔晶つき／デバフ数・属性人数の補正あり。</summary>
        public static IReadOnlyList<GoldenCase> All()
        {
            var timeout = C("timeout", "003,004,006,007,012,013,020", 3, 1.0, StageKind.Boss, 7);
            timeout.ToughHarmlessEnemies = true;
            timeout.TimeLimitSec = 30;
            var crystals = C("crystals", "003,004,006,007,008,009,010", 6, 5.0, StageKind.Wave, 9);
            crystals.CrystalsAtStar6 = true;
            return new List<GoldenCase>
            {
                C("melee_focus", "003,004,006,007,012,013,020", 3, 3.0, StageKind.Wave, 1),
                C("ranged_focus", "008,009,010,011,015,019,022", 3, 3.5, StageKind.Wave, 2),
                C("with_heal", "003,014,018,023,008,012,028", 3, 2.5, StageKind.Wave, 3),
                C("disrupt", "016,017,021,026,031,032,040", 3, 3.5, StageKind.Wave, 4),
                C("lr_party", "001,002,005,003,008,014,009", 5, 2.5, StageKind.Boss, 5),
                C("boss_fight", "003,005,008,014,009,016,022", 4, 3.5, StageKind.Boss, 6),
                timeout,
                C("status_heavy", "003,007,008,009,012,013,016", 3, 3.5, StageKind.Wave, 8),
                crystals,
                C("count_bonus", "009,010,011,012,032,014,008", 4, 3.0, StageKind.Boss, 10),
            };
        }

        public static BattleSetup Build(GameData data, GoldenCase c)
        {
            var builder = new BattleSetupBuilder(data, new StatResolver(data));
            int lv = data.Stats.StarMaxLv[c.Star];
            var allies = new List<UnitSetup>();
            double power = 0;
            for (int i = 0; i < c.Party.Length; i++)
            {
                string id = "chr_" + c.Party[i];
                IReadOnlyList<string> crystals = null;
                if (c.CrystalsAtStar6 && c.Star >= data.System.CrystalSlotStars[2])
                {
                    crystals = new[] { null, null, data.Character(id).CrystalId, null, null };
                }
                UnitSetup u = builder.BuildAlly(id, c.Star, lv, crystals, i == c.Party.Length - 1);
                allies.Add(u);
                power += u.Stats.Power;
            }
            var factory = new StageFactory(data);
            List<UnitSetup> enemies = factory.BuildWithPower(c.Rank, power * c.EnemyPowerFactor, c.Kind);
            if (c.ToughHarmlessEnemies)
            {
                foreach (UnitSetup e in enemies)
                {
                    BattleStats s = e.Stats;
                    s.Atk = 0;
                    s.Hp = 1e15;
                    e.Stats = s;
                }
            }
            return builder.Assemble(allies, enemies, c.Seed, c.TimeLimitSec);
        }
    }

    public sealed class GoldenExpectation
    {
        public string Hash { get; set; }
        public string Outcome { get; set; }
        public int EndTick { get; set; }
    }

    public sealed class SnapshotExpectation
    {
        public string Outcome { get; set; }
        public double EndSec { get; set; }

        /// <summary>味方の与ダメージの合計（上3桁）。</summary>
        public string AllyDamage { get; set; }
    }

    public static class GoldenIO
    {
        public const string ExpectedFile = "golden_expected.json";
        public const string SnapshotFile = "snapshot_expected.json";

        public static string SetupFileName(int index, string name) { return "setup_" + (index + 1).ToString("00", CultureInfo.InvariantCulture) + "_" + name + ".json"; }

        public static BattleSetup LoadSetup(string path)
        {
            return JsonConvert.DeserializeObject<BattleSetup>(File.ReadAllText(path));
        }

        public static void SaveSetup(string path, BattleSetup s)
        {
            File.WriteAllText(path, JsonConvert.SerializeObject(s));
        }

        public static GoldenExpectation Run(BattleSetup s)
        {
            BattleResult r = new BattleSim(s).RunToEnd(null);
            return new GoldenExpectation { Hash = r.EventHash.ToString("x16", CultureInfo.InvariantCulture), Outcome = r.Outcome.ToString(), EndTick = r.EndTick };
        }

        public static SnapshotExpectation Snapshot(BattleSetup s)
        {
            BattleResult r = new BattleSim(s).RunToEnd(null);
            double dealt = 0;
            for (int i = 0; i < s.Allies.Count; i++) { dealt += r.DamageDealt[i]; }
            return new SnapshotExpectation
            {
                Outcome = r.Outcome.ToString(),
                EndSec = Math.Round(r.EndTick * s.Constants.TickSec, 1),
                AllyDamage = dealt.ToString("0.00E+0", CultureInfo.InvariantCulture),
            };
        }

        public static SortedDictionary<string, T> Read<T>(string path)
        {
            return JsonConvert.DeserializeObject<SortedDictionary<string, T>>(File.ReadAllText(path));
        }

        public static void Write<T>(string path, SortedDictionary<string, T> value)
        {
            File.WriteAllText(path, JsonConvert.SerializeObject(value, Formatting.Indented) + "\n");
        }
    }
}
