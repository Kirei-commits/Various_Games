using System;
using System.Collections.Generic;
using System.IO;
using Mado.Core.Battle;
using Mado.Core.Tests.Golden;
using Mado.Data;

namespace Mado.Sim
{
    /// <summary>
    /// ゴールデン（docs/04 10節）。setup_*.json は解決済みの BattleSetup で、マスタが変わっても変わらない。
    /// golden：期待値との一致を確認。--update：期待値を書き直す（更新のコミットには変えた理由を書く）。
    /// --generate：マスタから setup_*.json を作り直す（編成を変えたときだけ。期待値の更新も続けて行う）。
    /// </summary>
    public static class GoldenCommand
    {
        public static int Run(Options o)
        {
            string dir = Paths.Golden();
            Directory.CreateDirectory(dir);
            bool generate = o.Has("--generate");
            bool update = o.Has("--update") || generate;
            GameData data = DataLoader.Load(new FileDataSource(Paths.Data()));
            IReadOnlyList<GoldenCase> cases = GoldenCases.All();

            if (generate)
            {
                foreach (string old in Directory.GetFiles(dir, "setup_*.json")) { File.Delete(old); }
                for (int i = 0; i < cases.Count; i++)
                {
                    GoldenIO.SaveSetup(Path.Combine(dir, GoldenIO.SetupFileName(i, cases[i].Name)), GoldenCases.Build(data, cases[i]));
                }
                Console.WriteLine("setup_*.json を " + cases.Count + " 本作った");
            }

            string[] files = Directory.GetFiles(dir, "setup_*.json");
            Array.Sort(files, StringComparer.Ordinal);
            var expected = new SortedDictionary<string, GoldenExpectation>();
            var actual = new SortedDictionary<string, GoldenExpectation>();
            string expectedPath = Path.Combine(dir, GoldenIO.ExpectedFile);
            if (File.Exists(expectedPath)) { expected = GoldenIO.Read<GoldenExpectation>(expectedPath); }
            foreach (string f in files)
            {
                string key = Path.GetFileNameWithoutExtension(f);
                GoldenExpectation e = GoldenIO.Run(GoldenIO.LoadSetup(f));
                GoldenExpectation e2 = GoldenIO.Run(GoldenIO.LoadSetup(f));
                if (e.Hash != e2.Hash) { Console.WriteLine("エラー: " + key + " は同じ入力で結果が変わる（決定的でない）"); return 1; }
                actual[key] = e;
            }

            var snapshot = new SortedDictionary<string, SnapshotExpectation>();
            for (int i = 0; i < cases.Count; i++)
            {
                snapshot[cases[i].Name] = GoldenIO.Snapshot(GoldenCases.Build(data, cases[i]));
            }

            if (update)
            {
                GoldenIO.Write(expectedPath, actual);
                GoldenIO.Write(Path.Combine(dir, GoldenIO.SnapshotFile), snapshot);
                foreach (var kv in actual) { Console.WriteLine("  " + kv.Key + "  " + kv.Value.Outcome + "  " + kv.Value.EndTick + "刻み  " + kv.Value.Hash); }
                Console.WriteLine("golden: 期待値とスナップショットを書き直した");
                return 0;
            }

            int bad = 0;
            foreach (var kv in actual)
            {
                if (!expected.TryGetValue(kv.Key, out GoldenExpectation want)) { Console.WriteLine("✗ " + kv.Key + ": 期待値が無い"); bad++; continue; }
                bool ok = want.Hash == kv.Value.Hash && want.Outcome == kv.Value.Outcome && want.EndTick == kv.Value.EndTick;
                if (!ok) { bad++; Console.WriteLine("✗ " + kv.Key + ": 期待 " + want.Outcome + "/" + want.EndTick + "/" + want.Hash + "  実際 " + kv.Value.Outcome + "/" + kv.Value.EndTick + "/" + kv.Value.Hash); }
            }
            foreach (string k in expected.Keys) { if (!actual.ContainsKey(k)) { bad++; Console.WriteLine("✗ " + k + ": setup が無い"); } }

            int snapDiff = 0;
            string snapPath = Path.Combine(dir, GoldenIO.SnapshotFile);
            if (File.Exists(snapPath))
            {
                var want = GoldenIO.Read<SnapshotExpectation>(snapPath);
                foreach (var kv in snapshot)
                {
                    if (!want.TryGetValue(kv.Key, out SnapshotExpectation w) || w.Outcome != kv.Value.Outcome || w.EndSec != kv.Value.EndSec || w.AllyDamage != kv.Value.AllyDamage)
                    {
                        snapDiff++;
                        Console.WriteLine("△ snapshot " + kv.Key + ": 期待 " + Show(w) + "  実際 " + Show(kv.Value));
                    }
                }
            }
            Console.WriteLine("golden: " + actual.Count + " 件中 不一致 " + bad + "、スナップショットの差 " + snapDiff);
            return bad > 0 || snapDiff > 0 ? 1 : 0;
        }

        private static string Show(SnapshotExpectation s)
        {
            return s == null ? "(なし)" : s.Outcome + "/" + s.EndSec + "秒/" + s.AllyDamage;
        }
    }
}
