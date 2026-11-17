using System;
using System.IO;
using System.Linq;
using System.Text;
using Mado.Core.Save;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    public class FileSaveStoreTests
    {
        private string _dir;

        [SetUp]
        public void MakeDir() { _dir = Path.Combine(Path.GetTempPath(), "mado_save_" + Guid.NewGuid().ToString("N")); }

        [TearDown]
        public void DeleteDir() { if (Directory.Exists(_dir)) { Directory.Delete(_dir, true); } }

        private static byte[] B(string s) { return Encoding.UTF8.GetBytes(s); }
        private static string S(byte[] b) { return Encoding.UTF8.GetString(b); }

        [Test]
        public void ReadBeforeAnyWrite_IsNull_AndThereAreNoBackups()
        {
            var store = new FileSaveStore(_dir);
            Assert.IsNull(store.Read());
            Assert.IsEmpty(store.ReadBackups());
        }

        [Test]
        public void Write_CreatesTheFolder_AndReadReturnsWhatWasWritten()
        {
            var store = new FileSaveStore(_dir);
            store.Write(B("one"));
            Assert.AreEqual("one", S(store.Read()));
            Assert.IsEmpty(store.ReadBackups());
            Assert.IsFalse(File.Exists(Path.Combine(_dir, FileSaveStore.TempName)), "一時ファイルが残っていない");
        }

        [Test]
        public void EachWrite_PushesThePreviousContentIntoTheBackups_NewestFirst_UpToTheGenerations()
        {
            var store = new FileSaveStore(_dir, 3);
            foreach (string v in new[] { "v1", "v2", "v3", "v4", "v5" }) { store.Write(B(v)); }
            Assert.AreEqual("v5", S(store.Read()));
            CollectionAssert.AreEqual(new[] { "v4", "v3", "v2" }, store.ReadBackups().Select(S).ToArray());   // 3世代だけ
        }

        [Test]
        public void ABrokenLeftoverTempFile_DoesNotAffectTheCurrentSave()
        {
            var store = new FileSaveStore(_dir);
            store.Write(B("good"));
            File.WriteAllText(Path.Combine(_dir, FileSaveStore.TempName), "half-written");   // 書き込み中に落ちた名残
            Assert.AreEqual("good", S(store.Read()));
            store.Write(B("next"));
            Assert.AreEqual("next", S(store.Read()));
            Assert.AreEqual("good", S(store.ReadBackups()[0]));
        }

        [Test]
        public void ItWorksAsTheStoreForSaveLoader_IncludingFallbackToABackup()
        {
            var store = new FileSaveStore(_dir);
            Mado.Data.GameData data = TestData.Data;
            SaveData a = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            a.Progress.Rank = 3;
            SaveLoader.Save(store, a, "t1");
            SaveData b = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            b.Progress.Rank = 4;
            SaveLoader.Save(store, b, "t2");
            Assert.AreEqual(4, SaveLoader.LoadOrCreate(store, data, 1UL, "x").Save.Progress.Rank);
            File.WriteAllBytes(Path.Combine(_dir, FileSaveStore.CurrentName), new byte[] { 1, 2, 3 });   // 現在のセーブを壊す
            LoadedSave l = SaveLoader.LoadOrCreate(store, data, 1UL, "x");
            Assert.AreEqual(SaveSource.Backup, l.Source);
            Assert.AreEqual(3, l.Save.Progress.Rank);
        }

        [Test]
        public void BadArguments_AreRejected()
        {
            Assert.Throws<ArgumentException>(() => new FileSaveStore(""));
            Assert.Throws<ArgumentOutOfRangeException>(() => new FileSaveStore(_dir, 0));
            Assert.Throws<ArgumentNullException>(() => new FileSaveStore(_dir).Write(null));
        }
    }
}
