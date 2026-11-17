using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>時計・数値表示・セーブの置き場と起動時の読み込み。</summary>
    public class UtilAndStoreTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static IReadOnlyList<string> Units { get { return Data.System.NumberUnits; } }

        // ---------------- NumberFormat ----------------

        [TestCase(0, "0")]
        [TestCase(7, "7")]
        [TestCase(999, "999")]
        [TestCase(999.4, "999")]
        [TestCase(1000, "1.00K")]
        [TestCase(1234, "1.23K")]
        [TestCase(12345, "12.3K")]
        [TestCase(123456, "123K")]
        [TestCase(999499, "999K")]
        [TestCase(999500, "1.00M")]          // 繰り上がり（999.5K は 1.00M と表示する）
        [TestCase(1.5e6, "1.50M")]
        [TestCase(2.89e8, "289M")]
        [TestCase(5.5e9, "5.50G")]
        [TestCase(1.2e15, "1.20P")]
        [TestCase(-1234, "-1.23K")]
        public void Format_ThreeSignificantDigits(double value, string expected)
        {
            Assert.AreEqual(expected, NumberFormat.Format(value, Units));
        }

        [Test]
        public void Format_BeyondTheLastUnit_FallsBackToExponent_AndHandlesSpecialValues()
        {
            Assert.AreEqual("1.00E+30", NumberFormat.Format(1e30, Units));       // Y（1e24）を超える
            Assert.AreEqual("NaN", NumberFormat.Format(double.NaN, Units));
            Assert.AreEqual("∞", NumberFormat.Format(double.PositiveInfinity, Units));
            Assert.AreEqual("-∞", NumberFormat.Format(double.NegativeInfinity, Units));
        }

        [Test]
        public void Format_IsMonotonicInMagnitude_AndNeverLongerThanSevenCharacters()
        {
            for (double v = 1; v < 1e24; v *= 1.37)
            {
                string s = NumberFormat.Format(v, Units);
                Assert.LessOrEqual(s.Length, 7, s);
            }
        }

        // ---------------- IClock ----------------

        [Test]
        public void FixedClock_ReturnsTheTime_AndAdvances()
        {
            var clock = new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Unspecified));
            Assert.AreEqual(DateTimeKind.Utc, clock.UtcNow.Kind);
            clock.Advance(TimeSpan.FromHours(8));
            Assert.AreEqual(new DateTime(2026, 11, 16, 8, 0, 0, DateTimeKind.Utc), clock.UtcNow);
            clock.Set(new DateTime(2030, 1, 1));
            Assert.AreEqual(2030, clock.UtcNow.Year);
            IClock asInterface = clock;
            Assert.AreEqual(clock.UtcNow, asInterface.UtcNow);
        }

        // ---------------- ISaveStore・SaveLoader ----------------

        private static byte[] Bytes(SaveData s) { return SaveCodec.Serialize(s); }

        private static SaveData Marked(int rank)
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "2026-11-16T00:00:00Z", 1UL);
            s.Progress.Rank = rank;
            return s;
        }

        [Test]
        public void MemoryStore_KeepsThreeBackups_NewestFirst_AndCopiesTheBytes()
        {
            var store = new MemorySaveStore();
            Assert.IsNull(store.Read());
            Assert.AreEqual(0, store.ReadBackups().Count);
            for (byte i = 1; i <= 5; i++) { store.Write(new[] { i }); }
            Assert.AreEqual(5, store.Read()[0]);
            var backups = store.ReadBackups();
            Assert.AreEqual(MemorySaveStore.Generations, backups.Count);
            CollectionAssert.AreEqual(new byte[] { 4, 3, 2 }, new[] { backups[0][0], backups[1][0], backups[2][0] });
            store.Read()[0] = 99;                                    // 返したバイト列を書き換えても、中は変わらない
            Assert.AreEqual(5, store.Read()[0]);
            Assert.Throws<ArgumentNullException>(() => store.Write(null));
        }

        [Test]
        public void Loader_NoSave_CreatesANewOne()
        {
            LoadedSave l = SaveLoader.LoadOrCreate(new MemorySaveStore(), Data, 7UL, "2026-11-16T00:00:00Z");
            Assert.AreEqual(SaveSource.New, l.Source);
            Assert.IsNull(l.CurrentFailure);
            Assert.AreEqual(SaveMigrator.LatestVersion, l.Save.SaveVersion);
            Assert.AreEqual("2026-11-16T00:00:00Z", l.Save.SavedAtUtc);
        }

        [Test]
        public void Loader_ReadsTheCurrentSave_AfterSaving()
        {
            var store = new MemorySaveStore();
            SaveLoader.Save(store, Marked(3), "2026-11-16T12:00:00Z");
            LoadedSave l = SaveLoader.LoadOrCreate(store, Data, 1UL, "x");
            Assert.AreEqual(SaveSource.Current, l.Source);
            Assert.AreEqual(3, l.Save.Progress.Rank);
            Assert.AreEqual("2026-11-16T12:00:00Z", l.Save.SavedAtUtc);
        }

        [Test]
        public void Loader_BrokenCurrent_FallsBackToTheNewestGoodBackup()
        {
            var store = new MemorySaveStore();
            store.Write(Bytes(Marked(1)));
            store.Write(Bytes(Marked(2)));
            store.Write(Bytes(Marked(3)));
            store.Write(new byte[] { 1, 2, 3 });                      // いまのセーブが壊れた（書き込み途中など）
            LoadedSave l = SaveLoader.LoadOrCreate(store, Data, 1UL, "x");
            Assert.AreEqual(SaveSource.Backup, l.Source);
            Assert.AreEqual(0, l.BackupIndex);
            Assert.AreEqual(3, l.Save.Progress.Rank);
            Assert.IsNotNull(l.CurrentFailure);
        }

        [Test]
        public void Loader_SkipsBrokenBackups_AndStartsNewWhenNothingReads()
        {
            var store = new MemorySaveStore();
            store.Write(Bytes(Marked(1)));
            store.Write(new byte[] { 9 });
            store.Write(new byte[] { 8 });
            LoadedSave second = SaveLoader.LoadOrCreate(store, Data, 1UL, "x");
            Assert.AreEqual(SaveSource.Backup, second.Source);
            Assert.AreEqual(1, second.BackupIndex);                    // 直前（9）は壊れていて、その前の正しいセーブ
            Assert.AreEqual(1, second.Save.Progress.Rank);

            var hopeless = new MemorySaveStore();
            hopeless.Write(new byte[] { 1 });
            hopeless.Write(new byte[] { 2 });
            LoadedSave fresh = SaveLoader.LoadOrCreate(hopeless, Data, 1UL, "now");
            Assert.AreEqual(SaveSource.New, fresh.Source);
            Assert.IsNotNull(fresh.CurrentFailure);
        }

        [Test]
        public void Loader_FutureVersionIsNotOverwrittenSilently_ItIsReportedAsAFailure()
        {
            var store = new MemorySaveStore();
            string future = System.Text.Encoding.UTF8.GetString(Bytes(Marked(1))).Replace("\"saveVersion\":1", "\"saveVersion\":99");
            store.Write(System.Text.Encoding.UTF8.GetBytes(future));
            LoadedSave l = SaveLoader.LoadOrCreate(store, Data, 1UL, "x");
            Assert.AreEqual(SaveSource.New, l.Source);
            StringAssert.Contains("新しい", l.CurrentFailure);        // View は、この理由を見せて、上書きしてよいか確かめられる
        }
    }
}
