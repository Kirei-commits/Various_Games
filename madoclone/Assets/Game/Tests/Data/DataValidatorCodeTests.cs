using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Data;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Mado.Data.Tests
{
    /// <summary>
    /// DataValidator の検査を1つずつ：実データを1か所だけ壊すと、期待する Code が出ること。
    /// 表の1行が検査1つ。検査を足したら、ここにも1行足す。
    /// </summary>
    public class DataValidatorCodeTests
    {
        private static MemoryDataSource _real;

        private static MemoryDataSource Real
        {
            get { return _real ?? (_real = MemoryDataSource.CopyOf(TestPaths.RealSource())); }
        }

        public sealed class Case
        {
            public string Code, File;
            public Action<JToken> Edit;
            public override string ToString() { return Code + " (" + File + ")"; }
        }

        private static Case C(string code, string file, Action<JToken> edit)
        {
            return new Case { Code = code, File = file, Edit = edit };
        }

        private static JObject Item(JToken root, int i) { return (JObject)root["items"][i]; }

        private static JObject FirstEffect(JToken root, Func<JObject, bool> pred)
        {
            foreach (JToken item in root["items"])
            {
                foreach (JToken e in item["effects"]) { if (pred((JObject)e)) { return (JObject)e; } }
            }
            throw new InvalidOperationException("条件に合う効果が実データに無い");
        }

        private static JObject FirstSkill(JToken root, Func<JObject, bool> pred)
        {
            foreach (JToken item in root["items"]) { if (pred((JObject)item)) { return (JObject)item; } }
            throw new InvalidOperationException("条件に合うスキルが実データに無い");
        }

        private static bool Is(JObject e, string type) { return (string)e["type"] == type; }

        public static IEnumerable<Case> Cases()
        {
            string ch = DataLoader.CharactersFile, sk = DataLoader.SkillsFile, cr = DataLoader.CrystalsFile;
            string sys = DataLoader.SystemFile, st = DataLoader.StatTablesFile, df = DataLoader.DifficultyFile, ti = DataLoader.TiersFile;

            // ---- 参照 ----
            yield return C("REF_MISSING", ch, r => Item(r, 0)["skills"]["normal"] = "skl_nope");
            yield return C("SKILL_KIND_MISMATCH", ch, r => Item(r, 0)["skills"]["normal"] = Item(r, 0)["skills"]["ultimate"]);
            yield return C("REF_MISSING", ch, r => Item(r, 0)["crystalId"] = "cry_nope");
            yield return C("OWNER_MISMATCH", ch, r => Item(r, 0)["crystalId"] = Item(r, 1)["crystalId"]);
            yield return C("SUBSTAT_STARS", ch, r => Item(r, 0)["substatBonuses"][0]["star"] = 3);
            yield return C("OBTAIN_MISMATCH", ch, r => Item(r, 0)["obtain"] = (string)Item(r, 0)["obtain"] == "gacha" ? "boss_first_clear" : "gacha");
            yield return C("REF_MISSING", sys, r => ((JArray)r["starterCharacters"])[0] = "chr_nope");
            yield return C("CRYSTAL_KIND", cr, r => Item(r, 0)["kind"] = "special");
            yield return C("REF_MISSING", cr, r => Item(r, 0)["ownerId"] = "chr_nope");

            // ---- スキルの中身 ----
            yield return C("NO_DAMAGE_OR_HEAL", sk, r =>
            {
                JObject normal = FirstSkill(r, s => (string)s["kind"] == "normal");
                foreach (JToken e in normal["effects"]) { if (Is((JObject)e, "damage")) { e["type"] = "cleanse"; e["target"] = "ally_all"; } }
            });
            yield return C("EFFECT_FIELD_MISSING", sk, r => FirstEffect(r, e => Is(e, "applyBuff")).Remove("buffId"));
            yield return C("EFFECT_FIELD_MISSING", sk, r => FirstEffect(r, e => Is(e, "gaugeShift")).Remove("sec"));
            yield return C("EFFECT_FIELD_MISSING", sk, r => FirstEffect(r, e => Is(e, "heal")).Remove("multiplierPct"));
            yield return C("EFFECT_FIELD_MISSING", sk, r => FirstEffect(r, e => (string)e["target"] == "ally_element").Remove("element"));
            yield return C("ALWAYS_WITH_DURATION", sk, r =>
            {
                JObject always = FirstSkill(r, s => (string)s["trigger"]["type"] == "always");
                always["effects"][0]["durationSec"] = 3;
            });
            yield return C("MINRANK_RANGE", sk, r => FirstEffect(r, e => true)["minRank"] = 3);
            yield return C("REF_MISSING", sk, r => FirstEffect(r, e => e["if"] != null)["if"]["targetHasAnyStatus"] = new JArray("no_such_status"));
            yield return C("RANK_NOT_INCREASING", sk, r => FirstEffect(r, e => Is(e, "damage") && e["multiplierPct"].Type == JTokenType.Array)["multiplierPct"] = new JArray(300, 200, 100));

            // ---- 人数 ----
            yield return C("COUNT_TIER", ti, r => Item(r, 0)["count"] = (int)Item(r, 0)["count"] + 1);

            // ---- system.json ----
            yield return C("CRYSTAL_SLOTS", sys, r => ((JArray)r["crystalSlotStars"]).RemoveAt(0));
            yield return C("CRYSTAL_SLOTS", sys, r => r["crystalSlotStars"] = new JArray(2, 4, 4, 8, 10));
            yield return C("ELEMENT_CYCLE", sys, r => r["elementCycle"] = new JArray("valor", "valor", "heart", "wisdom"));
            yield return C("DEVMODE_HASH", sys, r => r["devModeCodeSha256"] = "ABCDEF");
            yield return C("DEVMODE_HASH", sys, r => r["devModeCodeSha256"] = new string('G', 64));
            yield return C("SYSTEM_VALUE", sys, r => r["tickSec"] = 0);

            // ---- stat_tables.json ----
            yield return C("LEVEL_TABLE", st, r => ((JArray)r["levelTable"]).RemoveAt(119));
            yield return C("LEVEL_TABLE", st, r => r["levelTable"][5]["lv"] = 99);
            yield return C("LEVEL_TABLE", st, r => r["levelTable"][5]["atk"] = 1);
            yield return C("STAR_TABLE", st, r => ((JArray)r["starMultipliers"]).RemoveAt(0));
            yield return C("AWAKEN_SUM", st, r => r["awakenCost"][1] = (int)r["awakenCost"][1] + 1);
            yield return C("ROLE_MULTIPLIER_MISSING", st, r => ((JObject)r["roleMultipliers"]).Remove("heal"));
            yield return C("SKILL_RANK_STARS", st, r => r["skillRankStars"]["normal"] = new JArray(7, 1));

            // ---- difficulty.json ----
            yield return C("ENEMY_SCALE", df, r => ((JArray)r["enemyScale"]).RemoveAt(31));
            yield return C("ENEMY_SCALE", df, r => r["enemyScale"][3]["rank"] = 9);
            yield return C("GROWTH_COVERAGE", df, r => r["growth"][0]["toRank"] = 6);   // ランク7 がどの区間にも入らない
            yield return C("GROWTH_COVERAGE", df, r => r["growth"][0]["toRank"] = 8);   // ランク8 が2つの区間に入る

            // ---- rewards.json ----
            string rw = DataLoader.RewardsFile;
            yield return C("REWARDS", rw, r => ((JArray)r["expPerEnemy"]).RemoveAt(0));
            yield return C("REWARDS", rw, r => r["expPerEnemy"][3] = 0);
            yield return C("REWARDS", rw, r => r["paceSlack"] = 0);
            yield return C("REWARDS", rw, r => r["enemiesPerWave"] = 0);
            yield return C("REWARDS", rw, r => r["idleCapHours"] = 0);
            yield return C("REWARDS", rw, r => r["idleCoinPerExp"] = -1);

            // ---- enemy_kits.json ----
            string ek = DataLoader.EnemyKitsFile;
            yield return C("ENEMY_KITS", ek, r => r["roleSkills"]["tank"][0] = "nope");
            yield return C("ENEMY_KITS", ek, r => r["traits"][0]["skills"][0] = "nope");
            yield return C("ENEMY_KITS", ek, r => ((JObject)r["traits"][1]).Remove("resistMultiplier"));
            yield return C("ENEMY_KITS", ek, r => r["traits"][1]["resistMultiplier"] = 0);
            yield return C("ENEMY_KITS", ek, r => r["traits"][5]["atkMultiplier"] = -1);
            yield return C("ENEMY_KITS", ek, r => r["finalBossTraits"][0] = "nope");
            yield return C("ENEMY_KITS", ek, r => r["bossPlan"][0]["traits"][0] = "nope");
            yield return C("ENEMY_KITS", ek, r => r["bossPlan"][0]["toRank"] = 99);
            yield return C("ENEMY_KITS", ek, r => r["bossPlan"][1]["fromRank"] = 5);              // 前の行と重なる
            yield return C("ID_DUPLICATE", ek, r => r["skills"][1]["id"] = "enemy_attacker_blast");
            yield return C("ID_DUPLICATE", ek, r => r["traits"][1]["id"] = "heal_silence");
            yield return C("EFFECT_FIELD_MISSING", ek, r => ((JObject)r["skills"][2]["effects"][0]).Remove("target"));

            // ---- leader_temple.json ----
            string lt = DataLoader.LeaderTempleFile;
            yield return C("LEADER_TEMPLE", lt, r => ((JArray)r["lvPct"]).RemoveAt(0));
            yield return C("LEADER_TEMPLE", lt, r => r["lvPct"][5] = -1);
            yield return C("LEADER_TEMPLE", lt, r => r["lvPct"][5] = 99999);                // 次のLvより大きい
            yield return C("LEADER_TEMPLE", lt, r => r["expCostGrowth"] = 0.5);
            yield return C("LEADER_TEMPLE", lt, r => r["shardCostPerLv"] = 0);

            // ---- memory_cards.json ----
            string mc = DataLoader.MemoryCardsFile;
            yield return C("MEMORY_CARDS", mc, r => r["maxCardLv"] = 0);
            yield return C("MEMORY_CARDS", mc, r => r["fixedUnitScale"]["hp"] = 0);
            yield return C("MEMORY_CARDS", mc, r => ((JArray)r["rarities"]).Clear());
            yield return C("MEMORY_CARDS", mc, r => r["rarities"][2]["id"] = "N");               // 重複
            yield return C("MEMORY_CARDS", mc, r => r["rarities"][2]["mainCoefMax"] = 0.1);       // Min > Max
            yield return C("MEMORY_CARDS", mc, r => r["rarities"][3]["mainCoefMin"] = 0.2);       // 並びが逆
            yield return C("MEMORY_CARDS", mc, r => { var a = (JArray)r["subEffects"]; while (a.Count > 1) { a.RemoveAt(1); } });   // 1種類だけ
            yield return C("MEMORY_CARDS", mc, r => r["subEffects"][1]["stat"] = "critRatePct");  // 種類の重複
            yield return C("MEMORY_CARDS", mc, r => r["gachaBands"][0]["minLv"] = 2);
            yield return C("MEMORY_CARDS", mc, r => r["gachaBands"][2]["minLv"] = 1);            // 昇順でない
            yield return C("MEMORY_CARDS", mc, r => r["gachaBands"][5]["minLv"] = 999);          // 上限より大きい
            yield return C("MEMORY_CARDS", mc, r => r["gachaBands"][1]["weights"][0] = 99);      // 合計が100でない
        }

        [TestCaseSource(nameof(Cases))]
        public void OneBrokenPlace_IsReportedWithTheExpectedCode(Case c)
        {
            JToken root = JToken.Parse(Real.ReadText(c.File));
            c.Edit(root);
            DataLoadResult result = DataLoader.LoadWithIssues(Real.With(c.File, root.ToString()));
            Assert.IsTrue(result.Issues.Any(i => i.Code == c.Code && i.Severity == DataSeverity.Error),
                "期待する Code が出ない: " + c.Code + "\n" + string.Join("\n", result.Issues.Select(i => i.ToString())));
        }

        /// <summary>実データが緑であること（表の壊し方が、もともと出ている問題に頼っていない）。</summary>
        [Test]
        public void RealData_HasNoIssuesAtAll()
        {
            DataLoadResult result = DataLoader.LoadWithIssues(Real);
            Assert.IsEmpty(result.Issues.Select(i => i.ToString()).ToList());
        }

        /// <summary>表が、DataValidator.cs に書かれた Code をすべて覆っていること（検査を足して、表を忘れたら落ちる）。</summary>
        [Test]
        public void TheTable_CoversEveryCodeInTheValidatorSource()
        {
            string path = System.IO.Path.Combine(TestPaths.DataDir(), "..", "DataValidator.cs");
            string source = System.IO.File.ReadAllText(path);
            var inSource = new HashSet<string>();
            foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(source, "Error\\(issues, \"([A-Z_]+)\""))
            {
                inSource.Add(m.Groups[1].Value);
            }
            Assert.Greater(inSource.Count, 20);
            // 他のテスト（DataLoaderTests）が覆っているもの
            var elsewhere = new HashSet<string> { "ID_DUPLICATE", "TEXT_MISSING", "ULTIMATE_COOLDOWN", "TIER_UNEXPECTED", "TIER_MISSING", "TIER_UNKNOWN", "COUNT_TOTAL" };
            var covered = new HashSet<string>(Cases().Select(c => c.Code));
            covered.UnionWith(elsewhere);
            inSource.ExceptWith(covered);
            Assert.IsEmpty(inSource, "表に無い Code: " + string.Join(", ", inSource));
        }
    }
}
