using System.Collections.Generic;
using System.IO;
using Mado.Core.Battle;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests.Golden
{
    /// <summary>
    /// 解決済みの BattleSetup（setup_*.json）を走らせ、イベント列のハッシュ・勝敗・終了刻みが期待値と一致すること。
    /// 落ちたら、BattleSim・DamageCalc・乱数の順番のどれかを変えている。意図した変更なら
    /// `dotnet run --project tools/Mado.Sim -- golden --update` で期待値を書き直し、変えた理由をコミットに書く。
    /// </summary>
    public class GoldenTests
    {
        private static string Dir() { return TestData.FindUp("Assets", "Game", "Tests", "Core", "Golden"); }

        private static string[] SetupFiles()
        {
            string[] files = Directory.GetFiles(Dir(), "setup_*.json");
            System.Array.Sort(files, System.StringComparer.Ordinal);
            return files;
        }

        [Test]
        public void TenSetupsExist()
        {
            Assert.AreEqual(10, SetupFiles().Length);
        }

        [Test]
        public void EverySetup_MatchesItsExpectedHashOutcomeAndEndTick()
        {
            SortedDictionary<string, GoldenExpectation> expected = GoldenIO.Read<GoldenExpectation>(Path.Combine(Dir(), GoldenIO.ExpectedFile));
            foreach (string file in SetupFiles())
            {
                string key = Path.GetFileNameWithoutExtension(file);
                Assert.IsTrue(expected.ContainsKey(key), key + " の期待値が無い");
                GoldenExpectation want = expected[key];
                GoldenExpectation got = GoldenIO.Run(GoldenIO.LoadSetup(file));
                Assert.AreEqual(want.Hash, got.Hash, key + " のイベント列のハッシュ");
                Assert.AreEqual(want.Outcome, got.Outcome, key + " の勝敗");
                Assert.AreEqual(want.EndTick, got.EndTick, key + " の終了刻み");
            }
        }

        [Test]
        public void EverySetup_IsDeterministic()
        {
            foreach (string file in SetupFiles())
            {
                Assert.AreEqual(GoldenIO.Run(GoldenIO.LoadSetup(file)).Hash, GoldenIO.Run(GoldenIO.LoadSetup(file)).Hash, file);
            }
        }

        [Test]
        public void TheSetupsCoverOutcomesAndMostEventKinds()
        {
            var outcomes = new HashSet<string>();
            var kinds = new HashSet<BattleEventType>();
            foreach (string file in SetupFiles())
            {
                var log = new EventLog();
                BattleResult r = new BattleSim(GoldenIO.LoadSetup(file)).RunToEnd(log);
                outcomes.Add(r.Outcome.ToString());
                foreach (BattleEvent e in log.All) { kinds.Add(e.Type); }
            }
            CollectionAssert.IsSupersetOf(outcomes, new[] { "Win", "Lose", "TimeUp" });
            foreach (BattleEventType t in new[]
            {
                BattleEventType.Damage, BattleEventType.Miss, BattleEventType.Heal, BattleEventType.BuffApplied,
                BattleEventType.BuffRemoved, BattleEventType.SkillFired, BattleEventType.Death, BattleEventType.BattleEnd,
            })
            {
                Assert.IsTrue(kinds.Contains(t), "ゴールデンにこの種類のイベントが出てこない: " + t);
            }
        }

        /// <summary>マスタから組み立てた代表10戦。データを変えたら変わってよく、差分を人が読む（golden --update で更新）。</summary>
        [Test]
        public void MasterBuiltSnapshots_AreUnchanged()
        {
            SortedDictionary<string, SnapshotExpectation> want = GoldenIO.Read<SnapshotExpectation>(Path.Combine(Dir(), GoldenIO.SnapshotFile));
            var diffs = new List<string>();
            foreach (GoldenCase c in GoldenCases.All())
            {
                SnapshotExpectation got = GoldenIO.Snapshot(GoldenCases.Build(TestData.Data, c));
                if (!want.TryGetValue(c.Name, out SnapshotExpectation w)) { diffs.Add(c.Name + ": 期待値が無い"); continue; }
                if (w.Outcome != got.Outcome || w.EndSec != got.EndSec || w.AllyDamage != got.AllyDamage)
                {
                    diffs.Add(c.Name + ": 期待 " + w.Outcome + "/" + w.EndSec + "秒/" + w.AllyDamage + "  実際 " + got.Outcome + "/" + got.EndSec + "秒/" + got.AllyDamage);
                }
            }
            Assert.IsEmpty(diffs, string.Join("\n", diffs));
        }
    }
}
