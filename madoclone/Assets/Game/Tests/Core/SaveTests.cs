using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Data;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    public class SaveTests
    {
        private static GameData _data;
        private static GameData Data
        {
            get
            {
                if (_data == null) { _data = DataLoader.Load(new FileDataSource(FindUp("Assets", "Game", "Data", "Json"))); }
                return _data;
            }
        }

        private static string FindUp(params string[] parts)
        {
            foreach (string start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
            {
                DirectoryInfo dir = new DirectoryInfo(start);
                while (dir != null)
                {
                    string candidate = Path.Combine(dir.FullName, Path.Combine(parts));
                    if (Directory.Exists(candidate) || File.Exists(candidate)) { return candidate; }
                    dir = dir.Parent;
                }
            }
            throw new FileNotFoundException(string.Join("/", parts));
        }

        private static SaveData Sample()
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "2026-11-15T00:00:00Z", 42UL);
            s.Wallet.Balances["gem"] = 1e16;            // 桁の大きい値
            s.Wallet.Balances["gacha_ticket"] = 7;
            s.Wallet.Carry["gacha_ticket"] = 0.25;
            s.Characters["chr_002"] = new CharacterState { Star = 5, Lv = 10, Exp = 3.5, Copies = 1 };
            s.Characters["chr_001"] = new CharacterState { Star = 6, Lv = 60, Crystals = new[] { null, null, "cry_chr_001", null, null } };
            s.Leader = "chr_001";
            s.Parties["default"] = new PartyState { Slots = new[] { "chr_001", "chr_002", null, null, null, null } };
            s.Metrics["pull_done"] = 3;
            s.Progress = new ProgressState { Rank = 2, Area = 3, Stage = 4 };
            s.Settings = new SettingsState { BattleSpeed = 2, AutoBoss = true, SkipGachaAnim = false };
            return s;
        }

        private static LoadResult Reload(SaveData s)
        {
            LoadResult r = SaveCodec.Load(SaveCodec.Serialize(s), Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            return r;
        }

        [Test]
        public void RoundTrip_PreservesEverything_AndKeepsBigNumbersNumeric()
        {
            SaveData s = Sample();
            LoadResult r = Reload(s);
            Assert.IsFalse(r.HasErrors, string.Join("\n", r.Issues));
            Assert.AreEqual(Encoding.UTF8.GetString(SaveCodec.Serialize(s)), Encoding.UTF8.GetString(SaveCodec.Serialize(r.Save)));
            Assert.AreEqual(1e16, r.Save.Wallet.Balances["gem"]);
            Assert.AreEqual(6, r.Save.Characters["chr_001"].Star);
            Assert.AreEqual("cry_chr_001", r.Save.Characters["chr_001"].Crystals[2]);
            Assert.AreEqual("chr_002", r.Save.Parties["default"].Slots[1]);
            Assert.IsTrue(r.Save.Settings.AutoBoss);
            Assert.AreEqual(JTokenType.Float, JObject.Parse(Encoding.UTF8.GetString(SaveCodec.Serialize(s)))["wallet"]["gem"].Type);
        }

        [Test]
        public void Output_IsDeterministic_AndSortedById()
        {
            SaveData s = Sample();
            Assert.AreEqual(Encoding.UTF8.GetString(SaveCodec.Serialize(s)), Encoding.UTF8.GetString(SaveCodec.Serialize(s)));
            string json = Encoding.UTF8.GetString(SaveCodec.Serialize(s));
            Assert.Less(json.IndexOf("\"chr_001\"", StringComparison.Ordinal), json.IndexOf("\"chr_002\"", StringComparison.Ordinal));
        }

        [Test]
        public void Fixture_V1_CanBeRead()
        {
            byte[] bytes = File.ReadAllBytes(FindUp("Assets", "Game", "Tests", "Fixtures", "save_v1.json"));
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.IsFalse(r.HasErrors, string.Join("\n", r.Issues));
            Assert.AreEqual(1500.5, r.Save.Wallet.Balances["gem"]);
            Assert.AreEqual(0.25, r.Save.Wallet.Carry["gacha_ticket"]);
            Assert.AreEqual(2, r.Save.Progress.Area);
            Assert.AreEqual(Encoding.UTF8.GetString(bytes), r.OriginalJson);
        }

        [Test]
        public void Migration_AppliesStepsInOrder_AndKeepsOriginal()
        {
            var steps = new Dictionary<int, Func<JObject, JObject>>
            {
                [1] = o => { o["metrics"] = new JObject { ["migrated_1"] = 1 }; return o; },
                [2] = o => { o["metrics"]["migrated_2"] = 1; return o; },
            };
            var migrator = new SaveMigrator(3, steps);
            string v1 = File.ReadAllText(FindUp("Assets", "Game", "Tests", "Fixtures", "save_v1.json"));
            LoadResult r = SaveCodec.LoadJson(v1, Data, migrator);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(3, r.Save.SaveVersion);
            Assert.AreEqual(1, r.Save.Metrics["migrated_1"]);
            Assert.AreEqual(1, r.Save.Metrics["migrated_2"]);
            Assert.AreEqual(v1, r.OriginalJson);
        }

        [Test]
        public void Migration_MissingStepOrThrowingStep_FailsWithoutException()
        {
            string v1 = File.ReadAllText(FindUp("Assets", "Game", "Tests", "Fixtures", "save_v1.json"));
            Assert.IsFalse(SaveCodec.LoadJson(v1, Data, new SaveMigrator(2, new Dictionary<int, Func<JObject, JObject>>())).Success);
            var bad = new Dictionary<int, Func<JObject, JObject>> { [1] = o => throw new InvalidOperationException("boom") };
            LoadResult r = SaveCodec.LoadJson(v1, Data, new SaveMigrator(2, bad));
            Assert.IsFalse(r.Success);
            StringAssert.Contains("boom", r.FailureReason);
        }

        [Test]
        public void BrokenInputs_FailWithoutThrowing()
        {
            string good = Encoding.UTF8.GetString(SaveCodec.Serialize(Sample()));
            Assert.IsFalse(SaveCodec.Load(new byte[0], Data).Success);
            Assert.IsFalse(SaveCodec.Load(null, Data).Success);
            Assert.IsFalse(SaveCodec.Load(Encoding.UTF8.GetBytes(good.Substring(0, good.Length / 2)), Data).Success);
            Assert.IsFalse(SaveCodec.Load(new byte[] { 0xFF, 0xFE, 0xFD }, Data).Success);
            Assert.IsFalse(SaveCodec.LoadJson("[1,2]", Data, new SaveMigrator()).Success);
            Assert.IsFalse(SaveCodec.LoadJson(good.Replace("madoclone-save", "other"), Data, new SaveMigrator()).Success);
            LoadResult future = SaveCodec.LoadJson(good.Replace("\"saveVersion\":1", "\"saveVersion\":99"), Data, new SaveMigrator());
            Assert.IsFalse(future.Success);
            StringAssert.Contains("新しい", future.FailureReason);
            // 形の崩れ：星が文字列、枠の数が違う
            Assert.IsFalse(SaveCodec.LoadJson(good.Replace("\"star\":5", "\"star\":\"x\""), Data, new SaveMigrator()).Success);
            Assert.IsFalse(SaveCodec.LoadJson(good.Replace("[null,null,\"cry_chr_001\",null,null]", "[null]"), Data, new SaveMigrator()).Success);
        }

        [Test]
        public void Orphans_AreKeptAcrossSaves_AndRestoredWhenMasterReturns()
        {
            JObject o = JObject.Parse(Encoding.UTF8.GetString(SaveCodec.Serialize(Sample())));
            o["characters"]["chr_zzz"] = new JObject { ["star"] = 1, ["lv"] = 1, ["exp"] = 0, ["copies"] = 0, ["crystals"] = new JArray(null, null, null, null, null) };
            o["wallet"]["old_coin"] = 5;
            o["trials"] = new JObject { ["trl_rush"] = new JObject { ["level"] = 4 } };

            LoadResult r = SaveCodec.LoadJson(o.ToString(), Data, new SaveMigrator());
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.IsFalse(r.Save.Characters.ContainsKey("chr_zzz"));
            Assert.IsTrue(r.Save.Orphans.ContainsKey("characters/chr_zzz"));
            Assert.IsTrue(r.Save.Orphans.ContainsKey("wallet/old_coin"));
            Assert.IsTrue(r.Save.Orphans.ContainsKey("top/trials"));
            Assert.AreEqual(2, CountCode(r, "ORPHAN")); // キャラと通貨の2件（trials は黙って持ち越す）

            // 保存し直しても残る。
            LoadResult r2 = Reload(r.Save);
            Assert.IsTrue(r2.Save.Orphans.ContainsKey("characters/chr_zzz"));
            JObject out2 = JObject.Parse(Encoding.UTF8.GetString(SaveCodec.Serialize(r2.Save)));
            Assert.AreEqual(4, (int)out2["trials"]["trl_rush"]["level"]);

            // マスタが戻れば復活する（chr_003 を孤児として持っていたセーブ）。
            SaveData withOrphan = Sample();
            withOrphan.Orphans["characters/chr_003"] = new JObject { ["star"] = 2, ["lv"] = 5, ["exp"] = 0, ["copies"] = 0, ["crystals"] = new JArray(null, null, null, null, null) };
            LoadResult r3 = Reload(withOrphan);
            Assert.AreEqual(2, r3.Save.Characters["chr_003"].Star);
            Assert.IsFalse(r3.Save.Orphans.ContainsKey("characters/chr_003"));
        }

        private static int CountCode(LoadResult r, string code)
        {
            int n = 0;
            foreach (SaveIssue i in r.Issues) { if (i.Code == code) { n++; } }
            return n;
        }

        // ---- 検証 ----

        private static List<SaveIssue> Validate(SaveData s) { return SaveValidator.Validate(s, Data); }
        private static bool Has(List<SaveIssue> l, string code) { return l.Exists(i => i.Code == code); }

        [Test]
        public void Validator_AcceptsValidSample()
        {
            Assert.IsEmpty(Validate(Sample()), string.Join("\n", Validate(Sample())));
        }

        [Test]
        public void Validator_DetectsCrystalInvariantViolations()
        {
            SaveData dup = Sample();
            dup.Characters["chr_002"].Star = 8;
            dup.Characters["chr_002"].Crystals[3] = "cry_chr_001"; // 同じ魔晶が2か所
            Assert.IsTrue(Has(Validate(dup), "CRYSTAL_DUP"));

            SaveData locked = Sample();
            locked.Characters["chr_002"].Crystals[3] = "cry_chr_002"; // ★5 に枠3（★8 から）
            Assert.IsTrue(Has(Validate(locked), "SLOT_LOCKED"));

            SaveData missing = Sample();
            missing.Characters["chr_001"].Crystals[2] = null;          // ★6 なのに固有魔晶が無い
            Assert.IsTrue(Has(Validate(missing), "CRYSTAL_MISSING"));

            SaveData unexpected = Sample();
            unexpected.Characters["chr_002"].Crystals[0] = "cry_chr_002"; // 持ち主が★5
            Assert.IsTrue(Has(Validate(unexpected), "CRYSTAL_UNEXPECTED"));

            SaveData unknown = Sample();
            unknown.Characters["chr_002"].Crystals[0] = "cry_nope";
            Assert.IsTrue(Has(Validate(unknown), "CRYSTAL_UNKNOWN"));
        }

        [Test]
        public void Validator_DetectsRangeAndPartyAndLeaderProblems()
        {
            SaveData s = Sample();
            s.Characters["chr_002"].Lv = 999;
            Assert.IsTrue(Has(Validate(s), "LV_RANGE"));
            s.Characters["chr_002"].Star = 12;
            Assert.IsTrue(Has(Validate(s), "STAR_RANGE"));

            SaveData p = Sample();
            p.Parties["default"].Slots[2] = "chr_050";
            p.Leader = "chr_002"; // ★5 は可
            Assert.IsTrue(Has(Validate(p), "PARTY_NOT_OWNED"));
            Assert.IsFalse(Has(Validate(p), "LEADER_STAR"));
            p.Characters["chr_002"].Star = 4;
            Assert.IsTrue(Has(Validate(p), "LEADER_STAR"));
            p.Leader = "chr_050";
            Assert.IsTrue(Has(Validate(p), "LEADER_NOT_OWNED"));
        }

        [Test]
        public void Load_WithInvariantViolation_StillSucceeds_ButReportsError()
        {
            SaveData bad = Sample();
            bad.Characters["chr_001"].Crystals[2] = null;
            LoadResult r = Reload(bad);
            Assert.IsTrue(r.HasErrors);
        }

        // ---- エクスポート／インポート ----

        [Test]
        public void Export_Import_RoundTrips()
        {
            SaveData s = Sample();
            string text = SaveCodec.Export(s);
            StringAssert.StartsWith("MADOSAVE1:", text);
            LoadResult r = SaveCodec.Import(text, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(Encoding.UTF8.GetString(SaveCodec.Serialize(s)), Encoding.UTF8.GetString(SaveCodec.Serialize(r.Save)));
        }

        [Test]
        public void Import_RejectsBadPrefix_BrokenBase64_AndInvariantViolations()
        {
            string text = SaveCodec.Export(Sample());
            Assert.IsFalse(SaveCodec.Import(text.Replace("MADOSAVE1:", "MADOSAVE2:"), Data).Success);
            Assert.IsFalse(SaveCodec.Import("MADOSAVE1:%%%", Data).Success);
            Assert.IsFalse(SaveCodec.Import("MADOSAVE1:" + Convert.ToBase64String(new byte[] { 1, 2, 3 }), Data).Success);
            Assert.IsFalse(SaveCodec.Import(null, Data).Success);

            SaveData bad = Sample();
            bad.Characters["chr_001"].Crystals[2] = null;
            LoadResult r = SaveCodec.Import(SaveCodec.Export(bad), Data);
            Assert.IsFalse(r.Success);
            StringAssert.Contains("CRYSTAL_MISSING", r.FailureReason);
        }

        [Test]
        public void ExportFileName_MarksDevMode()
        {
            SaveData s = Sample();
            Assert.AreEqual("madoclone-save.txt", SaveCodec.ExportFileName(s));
            s.DevMode = true;
            Assert.AreEqual("madoclone-save-dev.txt", SaveCodec.ExportFileName(s));
        }

        // ---- 乱数の状態 ----

        [Test]
        public void RngState_SavedAndRestored_ContinuesTheSameSequence()
        {
            Rng gacha = Rng.Create(7UL, RngStream.Gacha);
            for (int i = 0; i < 10; i++) { gacha.NextUInt(); }
            SaveData s = Sample();
            s.Rng.Gacha = gacha.GetState();
            LoadResult r = Reload(s);
            Rng restored = Rng.FromState(r.Save.Rng.Gacha);
            for (int i = 0; i < 20; i++) { Assert.AreEqual(gacha.NextUInt(), restored.NextUInt()); }
            Assert.Throws<ArgumentException>(() => Rng.FromState(new uint[4]));
            Assert.Throws<ArgumentException>(() => Rng.FromState(new uint[3]));
        }
    }
}
