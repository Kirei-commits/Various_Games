using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>SaveRepair：壊れたセーブを、エラー 0 の形に直す。</summary>
    public class SaveRepairTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private static SaveData Healthy()
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 5UL);
            s.Characters["chr_001"] = new CharacterState { Star = 6, Lv = 60, Crystals = new[] { null, null, "cry_chr_001", null, null } };
            s.Characters["chr_002"] = new CharacterState { Star = 5, Lv = 10 };
            s.Leader = "chr_001";
            s.Parties["default"] = new PartyState { Slots = new[] { "chr_001", "chr_002", null, null, null, null } };
            s.Memory.GachaLv = 20;
            s.Memory.NextCardNumber = 3;
            for (int i = 1; i <= 2; i++)
            {
                s.Memory.Cards.Add(new MemoryCardState
                {
                    Id = "mc_0000" + i, Rarity = "SR", Kind = i == 1 ? MemoryKind.Hp : MemoryKind.Speed, Lv = 20, Main = 1.75,
                    Extra = i == 1 ? new double[0] : new[] { 0.5, 0.5, 0.5 },
                    Subs = new List<MemorySubState> { new MemorySubState { Stat = SubstatKey.EvasionPct, Value = 2.5 }, new MemorySubState { Stat = SubstatKey.CritRatePct, Value = 2.5 } },
                });
            }
            s.Memory.Equipped[0] = "mc_00001";
            s.Memory.Equipped[6] = "mc_00002";
            return s;
        }

        private static List<SaveIssue> Errors(SaveData s)
        {
            return SaveValidator.Validate(s, Data).Where(i => i.Severity == SaveSeverity.Error).ToList();
        }

        [Test]
        public void HealthySave_NeedsNoRepair()
        {
            SaveData s = Healthy();
            Assert.IsEmpty(Errors(s));
            Assert.IsEmpty(SaveRepair.Repair(s, Data));
        }

        /// <param name="visible">Validator が問題（警告を含む）として見つける壊し方か。配列の長さなど、Validator が見ないものは false。</param>
        private static void RepairsToZeroErrors(Action<SaveData> damage, string expectedPathPart, bool visible = true)
        {
            SaveData s = Healthy();
            damage(s);
            if (visible) { Assert.IsNotEmpty(SaveValidator.Validate(s, Data), "壊し方が効いていない（" + expectedPathPart + "）"); }
            List<SaveIssue> done = SaveRepair.Repair(s, Data);
            Assert.IsEmpty(Errors(s), string.Join("\n", Errors(s).Select(i => i.ToString())));
            Assert.IsTrue(done.Any(i => i.Code == "REPAIRED" && i.Path.Contains(expectedPathPart)), expectedPathPart + "\n" + string.Join("\n", done.Select(i => i.ToString())));
            Assert.IsEmpty(SaveRepair.Repair(s, Data), "2回目は何もしない（冪等）");
        }

        [Test] public void StarAndLevelOutOfRange_AreClamped() { RepairsToZeroErrors(s => { s.Characters["chr_002"].Star = 99; s.Characters["chr_002"].Lv = 9999; }, "characters.chr_002"); }
        [Test] public void LevelAboveTheStarCap_IsClamped() { RepairsToZeroErrors(s => s.Characters["chr_002"].Lv = 9999, "characters.chr_002.lv"); }
        [Test] public void UnknownCrystal_IsRemoved() { RepairsToZeroErrors(s => s.Characters["chr_002"].Crystals[0] = "cry_nope", "crystals[0]"); }
        [Test] public void CrystalInALockedSlot_IsRemoved() { RepairsToZeroErrors(s => s.Characters["chr_002"].Crystals[3] = "cry_chr_002", "chr_002"); }
        [Test] public void DuplicateCrystal_KeepsTheFirst() { RepairsToZeroErrors(s => s.Characters["chr_002"].Crystals[0] = "cry_chr_001", "chr_002.crystals[0]"); }
        [Test] public void MissingOwnCrystal_IsPutBack() { RepairsToZeroErrors(s => s.Characters["chr_001"].Crystals[2] = null, "characters.chr_001.crystals"); }
        [Test] public void OwnCrystalOfALowStarOwner_IsRemoved() { RepairsToZeroErrors(s => s.Characters["chr_002"].Crystals[0] = "cry_chr_002", "chr_002.crystals"); }
        [Test] public void CrystalArrayOfTheWrongLength_IsFixed() { RepairsToZeroErrors(s => s.Characters["chr_002"].Crystals = new string[2], "chr_002.crystals", visible: false); }
        [Test] public void PartyWithAnUnownedCharacter_IsCleared() { RepairsToZeroErrors(s => s.Parties["default"].Slots[3] = "chr_050", "parties.default"); }
        [Test] public void UnownedOrLowStarLeader_IsReleased() { RepairsToZeroErrors(s => s.Leader = "chr_050", "leader"); RepairsToZeroErrors(s => s.Characters["chr_001"].Star = 4, "leader"); }
        [Test] public void GachaLvOutOfRange_IsClamped() { RepairsToZeroErrors(s => s.Memory.GachaLv = 999, "memory.gachaLv"); }
        [Test] public void CardWithABadRarity_IsDropped() { RepairsToZeroErrors(s => s.Memory.Cards[0].Rarity = "ZZ", "memory.cards"); }
        [Test] public void CardWithABrokenShape_IsDropped() { RepairsToZeroErrors(s => s.Memory.Cards[1].Extra = new double[1], "memory.cards"); }
        [Test] public void CardLvOutOfRange_IsClamped() { RepairsToZeroErrors(s => s.Memory.Cards[0].Lv = 500, "memory.cards[0].lv"); }
        [Test] public void DuplicateCardId_DropsTheSecond() { RepairsToZeroErrors(s => s.Memory.Cards[1].Id = s.Memory.Cards[0].Id, "memory.cards"); }
        [Test] public void NextCardNumberBehind_IsAdvanced() { RepairsToZeroErrors(s => s.Memory.NextCardNumber = 1, "memory.nextCardNumber", visible: false); }
        [Test] public void EquipmentOfAGoneOrMismatchedCard_IsUnequipped() { RepairsToZeroErrors(s => s.Memory.Equipped[2] = "mc_00001", "memory.equipped"); RepairsToZeroErrors(s => s.Memory.Equipped[4] = "gone", "memory.equipped"); }
        [Test] public void EquipmentArrayOfTheWrongLength_IsFixed() { RepairsToZeroErrors(s => s.Memory.Equipped = new string[3], "memory.equipped", visible: false); }
        [Test] public void TempleLvOutOfRange_IsClamped() { RepairsToZeroErrors(s => s.Temple.LeaderLv = 0, "temple.leaderLv"); }

        [Test]
        public void DroppingACard_AlsoUnequipsIt()
        {
            SaveData s = Healthy();
            s.Memory.Cards[0].Rarity = "ZZ";                 // 装備中のカードが壊れている
            SaveRepair.Repair(s, Data);
            Assert.IsNull(s.Memory.Equipped[0]);
            Assert.AreEqual(1, s.Memory.Cards.Count);
            Assert.IsEmpty(Errors(s));
        }

        [Test]
        public void OwnCrystalGoesToAnyFreeUnlockedSlot_WhenTheUsualSlotIsTaken()
        {
            SaveData s = Healthy();
            s.Characters["chr_001"].Crystals[2] = null;
            s.Characters["chr_001"].Crystals[0] = "cry_chr_002";    // 別の魔晶が枠0にある（持ち主は★5なので本来は無い）
            SaveRepair.Repair(s, Data);
            Assert.IsEmpty(Errors(s));
            Assert.AreEqual("cry_chr_001", s.Characters["chr_001"].Crystals[2]);
        }

        [Test]
        public void RandomDamage_IsAlwaysRepairedToZeroErrors()
        {
            var rng = new Rng(12345UL);
            for (int round = 0; round < 300; round++)
            {
                SaveData s = Healthy();
                int hits = 1 + rng.NextInt(5);
                for (int h = 0; h < hits; h++) { Damage(s, rng.NextInt(14)); }
                SaveRepair.Repair(s, Data);
                Assert.IsEmpty(Errors(s), "round " + round + "\n" + string.Join("\n", Errors(s).Select(i => i.ToString())));
                Assert.IsEmpty(SaveRepair.Repair(s, Data), "冪等 round " + round);
            }
        }

        private static void Damage(SaveData s, int kind)
        {
            switch (kind)
            {
                case 0: s.Characters["chr_001"].Star = -3; break;
                case 1: s.Characters["chr_002"].Lv = 0; break;
                case 2: s.Characters["chr_001"].Crystals[2] = null; break;
                case 3: s.Characters["chr_002"].Crystals[4] = "cry_chr_001"; break;
                case 4: s.Characters["chr_002"].Crystals[1] = "cry_x"; break;
                case 5: s.Leader = "chr_099"; break;
                case 6: s.Parties["default"].Slots[5] = "chr_099"; break;
                case 7: s.Memory.GachaLv = -1; break;
                case 8: s.Memory.Cards[0].Subs.Clear(); break;
                case 9: s.Memory.Cards[1].Lv = 1000; break;
                case 10: s.Memory.Equipped[1] = "mc_00002"; break;
                case 11: s.Memory.NextCardNumber = 0; break;
                case 12: s.Temple.LeaderLv = 70; break;
                default: s.Memory.Cards[0].Id = s.Memory.Cards[1].Id; break;
            }
        }

        [Test]
        public void Loader_RepairsAVersionOfTheSaveThatLoadsButBreaksInvariants_AndSaysSo()
        {
            SaveData s = Healthy();
            s.Characters["chr_001"].Crystals[2] = null;
            var store = new MemorySaveStore();
            SaveLoader.Save(store, s, "now");
            LoadedSave l = SaveLoader.LoadOrCreate(store, Data, 1UL, "now");
            Assert.AreEqual(SaveSource.Current, l.Source);
            Assert.IsTrue(l.Issues.Any(i => i.Code == "REPAIRED"));
            Assert.IsEmpty(SaveValidator.Validate(l.Save, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());
        }

        [Test]
        public void Repair_RejectsNulls()
        {
            Assert.Throws<ArgumentNullException>(() => SaveRepair.Repair(null, Data));
            Assert.Throws<ArgumentNullException>(() => SaveRepair.Repair(Healthy(), null));
        }
    }
}
