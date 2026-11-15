using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    public class CrystalTests
    {
        private static GameData _data;
        private static GameData Data
        {
            get
            {
                if (_data == null)
                {
                    string dir = null;
                    foreach (string start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
                    {
                        for (DirectoryInfo d = new DirectoryInfo(start); d != null && dir == null; d = d.Parent)
                        {
                            string c = Path.Combine(d.FullName, "Assets", "Game", "Data", "Json");
                            if (Directory.Exists(c)) { dir = c; }
                        }
                    }
                    _data = DataLoader.Load(new FileDataSource(dir));
                }
                return _data;
            }
        }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(SaveMigrator.LatestVersion, "", 1UL);
            public CrystalService Crystals;
            public RosterService Roster;

            public Env(params string[] owned)
            {
                Crystals = new CrystalService(Data, Save);
                Roster = new RosterService(Data, Save, Crystals);
                foreach (string id in owned) { Assert.IsTrue(Roster.TryGrant(id)); }
            }

            public void SetStar(string id, int star) { Assert.IsTrue(Roster.TrySetStar(id, star), id + " ★" + star); }
            public string Snapshot() { return Encoding.UTF8.GetString(SaveCodec.Serialize(Save)); }
        }

        private static string Cry(string chr) { return "cry_" + chr; }

        [Test]
        public void StarSix_PutsOwnCrystalInSlot2_StarFiveDoesNot()
        {
            var e = new Env("chr_001");
            e.SetStar("chr_001", 5);
            Assert.IsNull(e.Crystals.Equipped("chr_001")[2]);
            Assert.IsFalse(e.Crystals.TryFind(Cry("chr_001"), out _));
            e.SetStar("chr_001", 6);
            Assert.AreEqual(Cry("chr_001"), e.Crystals.Equipped("chr_001")[2]);
        }

        [Test]
        public void StarJumpAcrossSix_AlsoPlacesCrystal()
        {
            var e = new Env("chr_001");
            e.SetStar("chr_001", 8);
            Assert.AreEqual(Cry("chr_001"), e.Crystals.Equipped("chr_001")[2]);
        }

        [Test]
        public void Move_ToOtherCharacterEmptySlot()
        {
            var e = new Env("chr_001", "chr_002");
            e.SetStar("chr_001", 6);
            e.SetStar("chr_002", 6);
            e.Crystals.Move(Cry("chr_002"), "chr_002", 2); // 既に枠2にあるので SamePlace
            // chr_002 の枠0（★2 で解放）はまだ空。chr_001 の固有魔晶を chr_002 の枠0へ。
            MoveResult r = e.Crystals.Move(Cry("chr_001"), "chr_002", 0);
            Assert.IsTrue(r.Success);
            Assert.IsNull(r.SwappedCrystalId);
            Assert.IsNull(e.Crystals.Equipped("chr_001")[2]);
            Assert.AreEqual(Cry("chr_001"), e.Crystals.Equipped("chr_002")[0]);
            IReadOnlyList<CrystalMoved> ev = e.Crystals.DrainEvents();
            Assert.AreEqual(1, ev.Count);
            Assert.AreEqual("chr_001", ev[0].From.CharacterId);
            Assert.AreEqual(2, ev[0].From.Slot);
            Assert.AreEqual(0, ev[0].To.Slot);
            Assert.AreEqual(0, e.Crystals.DrainEvents().Count);
        }

        [Test]
        public void Move_SwapsWithOccupiedSlot_AcrossAndWithinCharacters()
        {
            var e = new Env("chr_001", "chr_002");
            e.SetStar("chr_001", 6);
            e.SetStar("chr_002", 6);
            MoveResult r = e.Crystals.Move(Cry("chr_001"), "chr_002", 2);
            Assert.IsTrue(r.Success);
            Assert.AreEqual(Cry("chr_002"), r.SwappedCrystalId);
            Assert.AreEqual(Cry("chr_002"), e.Crystals.Equipped("chr_001")[2]);
            Assert.AreEqual(Cry("chr_001"), e.Crystals.Equipped("chr_002")[2]);
            Assert.AreEqual(Cry("chr_002"), e.Crystals.DrainEvents()[0].SwappedCrystalId);

            // 同じキャラの中の並べ替え（枠2 → 枠0）、続けて入れ替え。
            Assert.IsTrue(e.Crystals.Move(Cry("chr_001"), "chr_002", 0).Success);
            Assert.IsNull(e.Crystals.Equipped("chr_002")[2]);
            Assert.IsTrue(e.Crystals.Move(Cry("chr_001"), "chr_001", 2).Success); // chr_001 の枠2にある chr_002 の魔晶と入れ替え
            Assert.AreEqual(Cry("chr_001"), e.Crystals.Equipped("chr_001")[2]);
            Assert.AreEqual(Cry("chr_002"), e.Crystals.Equipped("chr_002")[0]);
        }

        [Test]
        public void Move_Failures_ReportReasonAndChangeNothing()
        {
            var e = new Env("chr_001", "chr_002", "chr_003");
            e.SetStar("chr_001", 6);
            e.SetStar("chr_003", 3);
            string before = e.Snapshot();

            void Expect(MoveFailure f, string crystal, string to, int slot)
            {
                MoveResult r = e.Crystals.Move(crystal, to, slot);
                Assert.IsFalse(r.Success);
                Assert.AreEqual(f, r.Failure);
                Assert.AreEqual(before, e.Snapshot(), f.ToString());
                Assert.AreEqual(0, e.Crystals.DrainEvents().Count);
            }
            Expect(MoveFailure.UnknownCrystal, "cry_nope", "chr_001", 0);
            Expect(MoveFailure.CrystalNotObtained, Cry("chr_002"), "chr_001", 0);   // 6凸前の魔晶
            Expect(MoveFailure.UnknownCharacter, Cry("chr_001"), "chr_nope", 0);
            Expect(MoveFailure.CharacterNotOwned, Cry("chr_001"), "chr_004", 0);
            Expect(MoveFailure.SlotOutOfRange, Cry("chr_001"), "chr_002", 5);
            Expect(MoveFailure.SlotOutOfRange, Cry("chr_001"), "chr_002", -1);
            Expect(MoveFailure.SlotLocked, Cry("chr_001"), "chr_003", 3);           // ★3 の枠3
            Expect(MoveFailure.SamePlace, Cry("chr_001"), "chr_001", 2);
        }

        [Test]
        public void SlotUnlock_FollowsStar_AndLockedSlotOpensAtStarEight()
        {
            var e = new Env("chr_001", "chr_002");
            e.SetStar("chr_001", 6);
            e.SetStar("chr_002", 3);
            Assert.AreEqual(MoveFailure.SlotLocked, e.Crystals.Move(Cry("chr_001"), "chr_002", 3).Failure);
            Assert.IsFalse(e.Crystals.IsSlotUnlocked("chr_002", 3));
            e.SetStar("chr_002", 8);
            Assert.IsTrue(e.Crystals.IsSlotUnlocked("chr_002", 3));
            Assert.IsTrue(e.Crystals.Move(Cry("chr_001"), "chr_002", 3).Success);
        }

        [Test]
        public void AfterGivingAwayOwnCrystal_OwnerSlot2IsFree_ForAnother()
        {
            var e = new Env("chr_001", "chr_002");
            e.SetStar("chr_001", 6);
            e.SetStar("chr_002", 6); // chr_002 の枠2は chr_002 の魔晶
            Assert.IsTrue(e.Crystals.Move(Cry("chr_001"), "chr_002", 0).Success);
            Assert.IsNull(e.Crystals.Equipped("chr_001")[2]);
            Assert.IsTrue(e.Crystals.Move(Cry("chr_002"), "chr_001", 2).Success);
            Assert.AreEqual(Cry("chr_002"), e.Crystals.Equipped("chr_001")[2]);
        }

        [Test]
        public void Roster_RejectsInvalidChanges_WithoutSideEffects()
        {
            var e = new Env("chr_001");
            string before = e.Snapshot();
            Assert.IsFalse(e.Roster.TryGrant("chr_nope"));
            Assert.IsFalse(e.Roster.TrySetStar("chr_001", 0));   // 上がらない
            Assert.IsFalse(e.Roster.TrySetStar("chr_001", 12));  // 範囲外
            Assert.IsFalse(e.Roster.TrySetStar("chr_009", 3));   // 未所持
            Assert.IsFalse(e.Roster.TrySetLevel("chr_001", 51)); // ★0 の最大は50
            Assert.AreEqual(before, e.Snapshot());
            Assert.IsTrue(e.Roster.TrySetLevel("chr_001", 50));
            Assert.IsTrue(e.Roster.TryGrant("chr_001"));         // 重複は Copies
            Assert.AreEqual(1, e.Save.Characters["chr_001"].Copies);
        }

        [Test]
        public void Property_RandomMovesAndStarUps_KeepInvariants()
        {
            var ids = new List<string>();
            for (int i = 1; i <= 8; i++) { ids.Add("chr_00" + i); }
            var e = new Env(ids.ToArray());
            Rng rng = Rng.Create(2024UL, RngStream.Misc);
            for (int step = 0; step < 10000; step++)
            {
                string before = e.Snapshot();
                if (rng.NextInt(4) == 0)
                {
                    string id = ids[rng.NextInt(ids.Count)];
                    e.Roster.TrySetStar(id, rng.NextInt(0, 12));
                }
                else
                {
                    string crystal = Cry(ids[rng.NextInt(ids.Count)]);
                    if (rng.NextInt(20) == 0) { crystal = "cry_nope"; }
                    MoveResult r = e.Crystals.Move(crystal, ids[rng.NextInt(ids.Count)], rng.NextInt(-1, 6));
                    IReadOnlyList<CrystalMoved> ev = e.Crystals.DrainEvents();
                    if (!r.Success)
                    {
                        Assert.AreEqual(before, e.Snapshot(), "失敗した Move が状態を変えた step " + step);   // (d)
                        Assert.AreEqual(0, ev.Count);
                    }
                    else { Assert.AreEqual(1, ev.Count); }
                }
                List<SaveIssue> issues = SaveValidator.Validate(e.Save, Data);
                Assert.IsEmpty(issues, "step " + step + ": " + string.Join("\n", issues));                    // (a)(b)(c)
            }
        }
    }
}
