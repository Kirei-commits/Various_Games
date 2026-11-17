using System;
using System.Collections.Generic;
using Mado.Data;
using Newtonsoft.Json;
using NUnit.Framework;

namespace Mado.Data.Tests
{
    /// <summary>Data の基本の部品（Ranked、列挙の綴り、文字表、問題の表し方、データの置き場）。</summary>
    public class DataPrimitivesTests
    {
        private sealed class Holder
        {
            public Ranked<double> Value { get; set; }
            public Ranked<Element[]> Elements { get; set; }
            public Element? Maybe { get; set; }
            public Element Must { get; set; }
        }

        private static Holder Read(string json)
        {
            return JsonConvert.DeserializeObject<Holder>(json);
        }

        // ---------------- Ranked ----------------

        [Test]
        public void Ranked_OfAndPick()
        {
            Ranked<int> same = Ranked<int>.Of(7);
            Assert.AreEqual(7, same.Pick(0));
            Assert.AreEqual(7, same.Pick(2));
            var r = new Ranked<int>(1, 2, 3);
            Assert.AreEqual(2, r.Pick(1));
            Assert.Throws<ArgumentOutOfRangeException>(() => r.Pick(3));
            Assert.Throws<ArgumentOutOfRangeException>(() => r.Pick(-1));
        }

        [Test]
        public void Ranked_ReadsScalarAsThreeCopies_AndArrayOfThreeAsIs()
        {
            Assert.AreEqual(5, Read("{\"value\": 5}").Value.R2);
            Ranked<double> v = Read("{\"value\": [1, 2, 3]}").Value;
            Assert.AreEqual(1, v.R0);
            Assert.AreEqual(3, v.R2);
            Assert.IsNull(Read("{\"value\": null}").Value);
        }

        [Test]
        public void Ranked_WrongLength_OrWrongType_IsAnErrorNamingThePath()
        {
            var tooShort = Assert.Throws<JsonSerializationException>(() => Read("{\"value\": [1, 2]}"));
            StringAssert.Contains("value", tooShort.Message);
            StringAssert.Contains("長さ3", tooShort.Message);
            var wrongType = Assert.Throws<JsonSerializationException>(() => Read("{\"value\": \"abc\"}"));
            StringAssert.Contains("value", wrongType.Message);
        }

        [Test]
        public void Ranked_OfArrays_DistinguishesOneArrayFromArrayOfArrays()
        {
            Ranked<Element[]> one = Read("{\"elements\": [\"valor\", \"heart\"]}").Elements;        // 1つの値（配列）を3つに複製
            Assert.AreEqual(2, one.R0.Length);
            Assert.AreEqual(2, one.R2.Length);
            Ranked<Element[]> three = Read("{\"elements\": [[\"valor\"], [\"valor\", \"heart\"], []]}").Elements;
            Assert.AreEqual(1, three.R0.Length);
            Assert.AreEqual(2, three.R1.Length);
            Assert.AreEqual(0, three.R2.Length);
            Assert.AreEqual(0, Read("{\"elements\": []}").Elements.R0.Length);                       // 空の配列は「空という1つの値」
        }

        [Test]
        public void Ranked_IsMeantForReadingOnly_WritingDoesNotUseTheConverter()
        {
            // コンバーターは書き出しをしない（CanWrite = false）。書くと R0・R1・R2 の素の形になり、読み戻せる形（数値か配列）ではない。
            // マスタは読むだけで、戦闘用のデータ（BattleSetup）には Ranked を入れない、という前提を固定しておく。
            string json = JsonConvert.SerializeObject(Ranked<double>.Of(1));
            StringAssert.Contains("R0", json);
            Assert.IsFalse(new RankedConverter().CanWrite);
        }

        // ---------------- 列挙の綴り ----------------

        [Test]
        public void EnumText_UsesEnumMemberValue_AndParsesBack()
        {
            Assert.AreEqual("enemy_single", EnumStringConverter.Text(TargetType.EnemySingle));
            Assert.AreEqual("crit_dmg", EnumStringConverter.Text(StatKey.CritDmg));
            Assert.AreEqual(TargetType.AllyLowestHp, EnumStringConverter.Parse<TargetType>("ally_lowest_hp"));
            Assert.Throws<DataException>(() => EnumStringConverter.Parse<TargetType>("nobody"));
            Assert.Throws<DataException>(() => EnumStringConverter.Parse<TargetType>(null));
            Assert.Throws<ArgumentNullException>(() => EnumStringConverter.Text(null));
        }

        [Test]
        public void EnumText_RoundTripsEveryValueOfEveryEnum()
        {
            foreach (TriggerType v in Enum.GetValues(typeof(TriggerType))) { Assert.AreEqual(v, EnumStringConverter.Parse<TriggerType>(EnumStringConverter.Text(v))); }
            foreach (EffectType v in Enum.GetValues(typeof(EffectType))) { Assert.AreEqual(v, EnumStringConverter.Parse<EffectType>(EnumStringConverter.Text(v))); }
            foreach (TierLevel v in Enum.GetValues(typeof(TierLevel))) { Assert.AreEqual(v, EnumStringConverter.Parse<TierLevel>(EnumStringConverter.Text(v))); }
        }

        [Test]
        public void EnumJson_NullOnlyForNullable_NumbersAndUnknownAreErrors_AndWritesTheText()
        {
            Assert.IsNull(Read("{\"maybe\": null}").Maybe);
            Assert.AreEqual(Element.Heart, Read("{\"maybe\": \"heart\"}").Maybe);
            StringAssert.Contains("null", Assert.Throws<JsonSerializationException>(() => Read("{\"must\": null}")).Message);
            StringAssert.Contains("文字列", Assert.Throws<JsonSerializationException>(() => Read("{\"must\": 1}")).Message);
            StringAssert.Contains("未知", Assert.Throws<JsonSerializationException>(() => Read("{\"must\": \"fire\"}")).Message);
            Assert.AreEqual("\"wisdom\"", JsonConvert.SerializeObject(Element.Wisdom));
            Assert.AreEqual("null", JsonConvert.SerializeObject((Element?)null, new EnumStringConverter()));
        }

        // ---------------- 文字表・問題・置き場 ----------------

        [Test]
        public void TextTable_NullSafe()
        {
            var empty = new TextTable(null);
            Assert.AreEqual(0, empty.Count);
            Assert.IsFalse(empty.Contains(null));
            Assert.IsNull(empty.Get(null));
            var t = new TextTable(new Dictionary<string, string> { { "a", "あ" } });
            Assert.IsTrue(t.Contains("a"));
            Assert.AreEqual("あ", t.Get("a"));
            Assert.AreEqual("b", t.Get("b"));   // 無いキーは、キーをそのまま返す（画面で気づける）
        }

        [Test]
        public void DataIssue_AndDataException_CarryCodesAndReadableText()
        {
            var warn = new DataIssue(DataSeverity.Warning, "W", null, null);
            Assert.AreEqual("", warn.Message);
            Assert.AreEqual("", warn.Path);
            StringAssert.StartsWith("警告 [W]", warn.ToString());
            StringAssert.StartsWith("エラー [E]", new DataIssue(DataSeverity.Error, "E", "m", "p").ToString());
            Assert.Throws<ArgumentNullException>(() => new DataIssue(DataSeverity.Error, null, "m", "p"));

            var single = new DataException("こわれた");
            Assert.IsTrue(single.HasCode("DATA"));
            Assert.IsFalse(single.HasCode("OTHER"));
            var many = new DataException(new List<DataIssue> { new DataIssue(DataSeverity.Error, "A", "1", "x"), new DataIssue(DataSeverity.Error, "B", "2", "y") });
            Assert.IsTrue(many.HasCode("B"));
            StringAssert.Contains("[A]", many.Message);
        }

        [Test]
        public void DataSources_MissingFile_IsFileMissing_AndEmptyRootIsRejected()
        {
            Assert.Throws<ArgumentException>(() => new FileDataSource(""));
            Assert.Throws<ArgumentException>(() => new FileDataSource(null));
            var ex = Assert.Throws<DataException>(() => new FileDataSource(TestPaths.DataDir()).ReadText("nope.json"));
            Assert.IsTrue(ex.HasCode("FILE_MISSING"));
            var mem = new MemoryDataSource(new Dictionary<string, string> { { "a.json", "1" } });
            Assert.AreEqual("1", mem.ReadText("a.json"));
            Assert.AreEqual("2", mem.With("a.json", "2").ReadText("a.json"));
            Assert.AreEqual("1", mem.ReadText("a.json"));   // With は元を変えない
            Assert.IsTrue(Assert.Throws<DataException>(() => mem.ReadText("b.json")).HasCode("FILE_MISSING"));
            Assert.Throws<ArgumentNullException>(() => DataLoader.LoadWithIssues(null));
        }

        [Test]
        public void GameData_Lookups_ThrowForUnknownIds_AndTryVersionsReturnFalse()
        {
            GameData d = DataLoader.Load(TestPaths.RealSource());
            Assert.Throws<DataException>(() => d.Character("chr_nope"));
            Assert.Throws<DataException>(() => d.Skill(null));
            Assert.Throws<DataException>(() => d.Crystal("x"));
            Assert.Throws<DataException>(() => d.Buff("x"));
            Assert.Throws<DataException>(() => d.Currency("x"));
            Assert.IsFalse(d.TryCharacter(null, out _));
            Assert.IsFalse(d.TrySkill("x", out _));
            Assert.IsFalse(d.TryCrystal("x", out _));
            Assert.IsFalse(d.TryBuff("x", out _));
            Assert.IsFalse(d.TryCurrency(null, out _));
            Assert.AreEqual("gem", d.Currency("gem").Id);
            Assert.AreEqual(d.Stats.SkillRankStars.Special, d.Stats.SkillRankStars.Get(SkillKind.Special));
            Assert.AreEqual(d.System.BaseSubstats.CritDefensePct, d.System.BaseSubstats.Get(SubstatKey.CritDefensePct));
            Assert.AreEqual(d.System.BaseSubstats.EvasionPct, d.System.BaseSubstats.Get(SubstatKey.EvasionPct));
            Assert.AreEqual(d.System.BaseSubstats.AccuracyPct, d.System.BaseSubstats.Get(SubstatKey.AccuracyPct));
            Assert.AreEqual(d.System.BaseSubstats.CritRatePct, d.System.BaseSubstats.Get(SubstatKey.CritRatePct));
            Assert.AreEqual(d.System.BaseSubstats.CritResistPct, d.System.BaseSubstats.Get(SubstatKey.CritResistPct));
            Assert.AreEqual(d.System.BaseSubstats.CritDamagePct, d.System.BaseSubstats.Get(SubstatKey.CritDamagePct));
            CharacterDef c = d.Character("chr_001");
            Assert.AreEqual(c.Skills.Normal, c.Skills.Get(SkillKind.Normal));
            Assert.AreEqual(c.Skills.Special, c.Skills.Get(SkillKind.Special));
            Assert.AreEqual(c.Skills.Ultimate, c.Skills.Get(SkillKind.Ultimate));
        }
    }
}
