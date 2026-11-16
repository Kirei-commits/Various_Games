using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Data;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Mado.Data.Tests
{
    /// <summary>
    /// 実データが読めること、壊したデータが期待する Code で弾かれること（docs/04 3.4節）。
    /// 壊し方は JObject で1か所だけ直す（JSON の字面に頼らない）。
    /// </summary>
    public class DataLoaderTests
    {
        private IDataSource _real;
        private GameData _data;

        [OneTimeSetUp]
        public void LoadRealData()
        {
            _real = TestPaths.RealSource();
            _data = DataLoader.Load(_real);
        }

        // ---- 実データ ----

        [Test]
        public void RealData_HasExpectedCounts()
        {
            Assert.AreEqual(105, _data.Characters.Count);
            Assert.AreEqual(315, _data.Skills.Count);
            Assert.AreEqual(105, _data.Crystals.Count);
            Assert.AreEqual(32, _data.Buffs.Items.Count);
            Assert.AreEqual(7, _data.Tiers.Count);
            Assert.AreEqual(22, _data.Currencies.Count);
        }

        [Test]
        public void RealData_HasNoErrors()
        {
            DataLoadResult result = DataLoader.LoadWithIssues(_real);
            var errors = result.Issues.Where(i => i.Severity == DataSeverity.Error).Select(i => i.ToString()).ToList();
            Assert.IsEmpty(errors, string.Join("\n", errors));
            Assert.IsNotNull(result.Data);
        }

        [Test]
        public void RealData_LookupsWork()
        {
            CharacterDef c = _data.Character("chr_001");
            Assert.AreEqual(CharTier.Lr, c.Tier);
            Assert.AreEqual(ObtainKind.BossFirstClear, c.Obtain);
            Assert.IsTrue(c.Enabled, "enabled を省略したキャラは true");
            Assert.AreEqual("cry_chr_001", c.CrystalId);
            Assert.AreEqual("chr_001", _data.Crystal(c.CrystalId).OwnerId);
            Assert.AreEqual(SkillKind.Ultimate, _data.Skill(c.Skills.Ultimate).Kind);
            Assert.Throws<DataException>(() => _data.Character("chr_nope"));
            Assert.Throws<DataException>(() => _data.Skill(null));
            CharacterDef missing;
            Assert.IsFalse(_data.TryCharacter("chr_nope", out missing));
        }

        [Test]
        public void RealData_ConfigValues()
        {
            Assert.AreEqual(0.1, _data.System.TickSec, 1e-12);
            Assert.AreEqual(64, _data.System.ChainLimit);
            Assert.AreEqual(64, _data.System.DevModeCodeSha256.Length);
            Assert.AreEqual(new[] { 2, 4, 6, 8, 10 }, _data.System.CrystalSlotStars.ToArray());
            Assert.AreEqual(200, _data.Stats.LevelTable.Count);
            Assert.AreEqual(225.0, _data.Stats.LevelTable[0].Atk, 1e-9);
            Assert.AreEqual(8500.0, _data.Stats.LevelTable[0].Hp, 1e-9);
            Assert.AreEqual(60.0, _data.Stats.LevelTable[0].Def, 1e-9);
            Assert.IsNull(_data.Stats.LevelTable[199].ExpToNext, "最大レベル（Lv200）の expToNext は null");
            Assert.AreEqual(0.865, _data.Stats.ForRole(Role.Melee).Atk, 1e-12);
            Assert.AreEqual(new[] { 1, 7 }, _data.Stats.SkillRankStars.Get(SkillKind.Normal).ToArray());
            Assert.AreEqual(15000000.0, _data.Difficulty.E1, 1e-3);
            Assert.AreEqual(50, _data.Difficulty.EnemyScale.Count);
            Assert.AreEqual(Element.Valor, _data.System.ElementCycle[0]);
        }

        [Test]
        public void RealData_RankedValuesAreExpandedToThree()
        {
            SkillDef normal = _data.Skill("skl_chr_001_n");
            Ranked<double> multiplier = normal.Effects[0].MultiplierPct;
            Assert.AreEqual(120.0, multiplier.R0);
            Assert.AreEqual(140.0, multiplier.R1);
            Assert.AreEqual(170.0, multiplier.R2);
            Assert.AreEqual(170.0, multiplier.Pick(2));

            Ranked<double> duration = normal.Effects[1].DurationSec;
            Assert.AreEqual(2.0, duration.R0, "数値1つは3つに複製される");
            Assert.AreEqual(2.0, duration.R1);
            Assert.AreEqual(2.0, duration.R2);
            Assert.Throws<ArgumentOutOfRangeException>(() => duration.Pick(3));
        }

        [Test]
        public void RealData_TierArraysAndTargetElementsAreRanked()
        {
            bool sawTierArray = false;
            bool sawTargetElements = false;
            foreach (SkillDef s in _data.Skills)
            {
                foreach (EffectDef e in s.Effects)
                {
                    if (e.Tier != null && e.Tier.R0 != e.Tier.R2)
                    {
                        sawTierArray = true;
                    }
                    if (e.TargetElements != null)
                    {
                        sawTargetElements = true;
                        Assert.GreaterOrEqual(e.TargetElements.R0.Length, 1);
                        Assert.GreaterOrEqual(e.TargetElements.R2.Length, 1);
                    }
                }
            }
            Assert.IsTrue(sawTierArray, "ランクで変わる tier がデータに1つ以上ある");
            Assert.IsTrue(sawTargetElements, "targetElements がデータに1つ以上ある");
        }

        [Test]
        public void RealData_BuffTiers()
        {
            BuffDef atkUp = _data.Buff("atk_up");
            Assert.IsFalse(atkUp.IsTierless);
            BuffTierDef supreme = atkUp.FindTier(TierLevel.Supreme);
            Assert.AreEqual(StatKey.Atk, supreme.StatMods[0].Stat);
            Assert.AreEqual(StatOp.Pct, supreme.StatMods[0].Op);
            Assert.AreEqual(50.0, supreme.StatMods[0].Value);
            Assert.IsNull(atkUp.FindTier(null), "段階があるバフに none は無い");

            BuffDef bind = _data.Buff("bind");
            Assert.IsTrue(bind.IsTierless);
            Assert.IsTrue(bind.FindTier(null).CannotAct);
            Assert.AreEqual(0, bind.FindTier(null).StatMods.Count, "statMods が無いときは空");
        }

        [Test]
        public void TextTable_ReturnsKeyWhenMissing()
        {
            Assert.AreNotEqual("chr_001.name", _data.Text.Get("chr_001.name"));
            Assert.IsTrue(_data.Text.Contains("chr_001.name"));
            Assert.AreEqual("no.such.key", _data.Text.Get("no.such.key"));
            Assert.IsFalse(_data.Text.Contains("no.such.key"));
        }

        // ---- 壊したデータ ----

        [Test]
        public void MissingFile_IsFileMissing()
        {
            DataLoadResult result = DataLoader.LoadWithIssues(new MemoryDataSource(new Dictionary<string, string>()));
            Assert.IsTrue(result.HasErrors);
            Assert.IsNull(result.Data);
            Assert.AreEqual(DataLoader.FileNames.Count, result.Issues.Count(i => i.Code == "FILE_MISSING"));
        }

        [Test]
        public void Load_ThrowsDataExceptionWithIssues()
        {
            MemoryDataSource broken = Mutate(DataLoader.SkillsFile, root => ((JObject)root["items"][0]).Add("bogus", 1));
            DataException ex = Assert.Throws<DataException>(() => DataLoader.Load(broken));
            Assert.IsTrue(ex.HasCode("JSON_PARSE"));
            StringAssert.Contains("bogus", ex.Message);
        }

        [Test]
        public void UnknownMember_IsParseError()
        {
            MemoryDataSource broken = Mutate(DataLoader.CharactersFile, root => ((JObject)root["items"][0]).Add("needsReview", true));
            AssertIssue(broken, "JSON_PARSE", DataLoader.CharactersFile);
        }

        [Test]
        public void UnknownEnumValue_IsParseError()
        {
            MemoryDataSource broken = Mutate(DataLoader.SkillsFile, root => root["items"][0]["trigger"]["type"] = "nope");
            DataIssue issue = AssertIssue(broken, "JSON_PARSE", DataLoader.SkillsFile);
            StringAssert.Contains("nope", issue.Message);
        }

        [Test]
        public void MissingRequiredMember_IsParseError()
        {
            MemoryDataSource broken = Mutate(DataLoader.SkillsFile, root => ((JObject)root["items"][0]).Remove("id"));
            AssertIssue(broken, "JSON_PARSE", DataLoader.SkillsFile);
        }

        [Test]
        public void RankedArrayOfWrongLength_IsParseError()
        {
            MemoryDataSource broken = Mutate(DataLoader.SkillsFile, root => root["items"][0]["effects"][0]["multiplierPct"] = new JArray(1, 2));
            DataIssue issue = AssertIssue(broken, "JSON_PARSE", DataLoader.SkillsFile);
            StringAssert.Contains("長さ3", issue.Message);
        }

        [Test]
        public void ParseErrorsInSeveralFiles_AreAllReported()
        {
            MemoryDataSource broken = Mutate(DataLoader.SkillsFile, root => ((JObject)root["items"][0]).Add("bogus", 1));
            broken = broken.With(DataLoader.CrystalsFile, "{ \"schemaVersion\": 1, \"items\": 5 }");
            DataLoadResult result = DataLoader.LoadWithIssues(broken);
            Assert.AreEqual(2, result.Issues.Count(i => i.Code == "JSON_PARSE"), "1つ目で止めない");
        }

        [Test]
        public void BuffIdTypo_IsRefMissing()
        {
            MemoryDataSource broken = Mutate(DataLoader.SkillsFile, root =>
            {
                JObject effect = Effects(root).First(e => (string)e["buffId"] != null);
                effect["buffId"] = "silense";
            });
            AssertIssue(broken, "REF_MISSING", DataLoader.SkillsFile);
        }

        [Test]
        public void TierMissingOnTieredBuff_IsReported()
        {
            MemoryDataSource broken = Mutate(DataLoader.SkillsFile, root =>
            {
                JObject effect = Effects(root).First(e => e["tier"] != null && e["tier"].Type == JTokenType.String);
                effect.Remove("tier");
            });
            AssertIssue(broken, "TIER_MISSING", DataLoader.SkillsFile);
        }

        [Test]
        public void TierOnTierlessBuff_IsReported()
        {
            var tierless = new HashSet<string>(_data.Buffs.Items.Where(b => b.IsTierless).Select(b => b.Id));
            MemoryDataSource broken = Mutate(DataLoader.SkillsFile, root =>
            {
                JObject effect = Effects(root).First(e => e["buffId"] != null && tierless.Contains((string)e["buffId"]));
                effect["tier"] = "high";
            });
            AssertIssue(broken, "TIER_UNEXPECTED", DataLoader.SkillsFile);
        }

        [Test]
        public void TierNotDefinedForBuff_IsReported()
        {
            // atk_up から "low" の段階を消し、atk_up を使う効果の tier を "low" にする。
            MemoryDataSource broken = Mutate(DataLoader.BuffsFile, root =>
            {
                JToken atkUp = root["items"].Children().First(b => (string)b["id"] == "atk_up");
                ((JObject)atkUp["tiers"]).Remove("low");
            });
            broken = MutateOn(broken, DataLoader.SkillsFile, root =>
            {
                JObject effect = Effects(root).First(e => (string)e["buffId"] == "atk_up");
                effect["tier"] = "low";
            });
            DataIssue issue = AssertIssue(broken, "TIER_UNKNOWN", DataLoader.SkillsFile);
            StringAssert.Contains("atk_up", issue.Message);
        }

        [Test]
        public void CrystalOwnerMismatch_IsReported()
        {
            MemoryDataSource broken = Mutate(DataLoader.CrystalsFile, root => root["items"][0]["ownerId"] = "chr_002");
            AssertIssue(broken, "OWNER_MISMATCH", DataLoader.CrystalsFile);
        }

        [Test]
        public void DuplicateCharacter_IsReported()
        {
            MemoryDataSource broken = Mutate(DataLoader.CharactersFile, root =>
            {
                var items = (JArray)root["items"];
                items.Add(items[0].DeepClone());
            });
            DataLoadResult result = DataLoader.LoadWithIssues(broken);
            Assert.IsTrue(result.Issues.Any(i => i.Code == "ID_DUPLICATE"));
            Assert.IsTrue(result.Issues.Any(i => i.Code == "COUNT_TOTAL"));
        }

        [Test]
        public void MissingDisplayName_IsReported()
        {
            MemoryDataSource broken = Mutate(DataLoader.TextFile, root => ((JObject)root).Remove("chr_001.name"));
            AssertIssue(broken, "TEXT_MISSING", DataLoader.CharactersFile);
        }

        [Test]
        public void WrongSchemaVersion_IsReported()
        {
            MemoryDataSource broken = Mutate(DataLoader.SystemFile, root => root["schemaVersion"] = 2);
            AssertIssue(broken, "SCHEMA_VERSION", DataLoader.SystemFile);
        }

        [Test]
        public void UltimateWithoutCooldown_IsReported()
        {
            string ultimateId = _data.Character("chr_001").Skills.Ultimate;
            MemoryDataSource broken = Mutate(DataLoader.SkillsFile, root =>
            {
                JObject skill = ((JArray)root["items"]).Cast<JObject>().First(s => (string)s["id"] == ultimateId);
                ((JObject)skill["trigger"]).Remove("cooldownSec");
            });
            AssertIssue(broken, "ULTIMATE_COOLDOWN", DataLoader.SkillsFile);
        }

        // ---- 道具 ----

        private MemoryDataSource Mutate(string file, Action<JToken> edit)
        {
            return MutateOn(MemoryDataSource.CopyOf(_real), file, edit);
        }

        private static MemoryDataSource MutateOn(MemoryDataSource baseSource, string file, Action<JToken> edit)
        {
            JToken root = JToken.Parse(baseSource.ReadText(file));
            edit(root);
            return baseSource.With(file, root.ToString());
        }

        private static IEnumerable<JObject> Effects(JToken root)
        {
            foreach (JToken item in root["items"])
            {
                foreach (JToken effect in item["effects"])
                {
                    yield return (JObject)effect;
                }
            }
        }

        private static DataIssue AssertIssue(IDataSource source, string code, string pathContains)
        {
            DataLoadResult result = DataLoader.LoadWithIssues(source);
            DataIssue found = result.Issues.FirstOrDefault(i => i.Code == code && i.Path.Contains(pathContains));
            Assert.IsNotNull(found, "期待する Code が出ない: " + code + "\n" + string.Join("\n", result.Issues.Select(i => i.ToString())));
            return found;
        }
    }
}
