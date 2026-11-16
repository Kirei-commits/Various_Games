using System.Collections.Generic;
using Mado.Core.Tests;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Sim.Tests
{
    /// <summary>calibrate が使う「標準編成の選び方」。Unity には入れないので、dotnet test だけで走る。</summary>
    public class SimPolicyTests
    {
        private static GameData Data { get { return TestData.Data; } }

        [Test]
        public void PartyCount_GrowsWithRank_ThenStaysAtSixPlusLeader()
        {
            Assert.AreEqual(3, SimPolicy.PartyCount(1));
            Assert.AreEqual(4, SimPolicy.PartyCount(2));
            Assert.AreEqual(5, SimPolicy.PartyCount(3));
            Assert.AreEqual(Data.System.PartySlots + 1, SimPolicy.PartyCount(4));
            Assert.AreEqual(Data.System.PartySlots + 1, SimPolicy.PartyCount(32));
        }

        [Test]
        public void StarFor_MatchesTheDesignTable()
        {
            // docs/01 6.1節の「想定★」
            var expected = new Dictionary<int, int> { { 1, 0 }, { 2, 0 }, { 3, 1 }, { 4, 1 }, { 5, 2 }, { 7, 2 }, { 8, 3 }, { 10, 3 }, { 11, 4 }, { 13, 5 }, { 15, 5 }, { 16, 6 }, { 19, 7 }, { 21, 8 }, { 24, 9 }, { 27, 10 }, { 28, 10 }, { 29, 11 }, { 32, 11 } };
            foreach (KeyValuePair<int, int> kv in expected) { Assert.AreEqual(kv.Value, SimPolicy.StarFor(kv.Key), "ランク" + kv.Key); }
            for (int r = 2; r <= 32; r++) { Assert.GreaterOrEqual(SimPolicy.StarFor(r), SimPolicy.StarFor(r - 1), "★が下がった：ランク" + r); }
        }

        [Test]
        public void Party_UsesOnlyUnlockedCharacters_WithoutDuplicates_ForEveryRank()
        {
            for (int rank = 1; rank <= Data.Difficulty.Ranks; rank++)
            {
                List<string> party = SimPolicy.Party(Data, rank);
                Assert.AreEqual(SimPolicy.PartyCount(rank), party.Count, "ランク" + rank);
                CollectionAssert.AllItemsAreUnique(party, "ランク" + rank);
                foreach (string id in party)
                {
                    Assert.LessOrEqual(Data.Tier(Data.Character(id).Tier).UnlockRank, rank, id + " はランク" + rank + " ではまだ解放されていない");
                }
            }
        }

        [Test]
        public void Party_HasAFrontLiner_AndIsDeterministic()
        {
            for (int rank = 1; rank <= Data.Difficulty.Ranks; rank++)
            {
                List<string> party = SimPolicy.Party(Data, rank);
                Assert.IsTrue(party.Exists(id => Data.Character(id).Role == Role.Defense || Data.Character(id).Role == Role.Melee), "前列がいない：ランク" + rank);
                CollectionAssert.AreEqual(party, SimPolicy.Party(Data, rank));
            }
        }

        [Test]
        public void SavedProfiles_MatchThePolicy()
        {
            // sim_profiles.json は calibrate が書く。編成の選び方を変えたら、calibrate --write で合わせ直す。
            IReadOnlyList<SimProfileDef> profiles = SimProfiles.Load(new FileDataSource(TestData.FindDataDir()));
            foreach (SimProfileDef p in profiles)
            {
                CollectionAssert.AreEqual(SimPolicy.Party(Data, p.Rank), p.PartyCharacterIds, "ランク" + p.Rank);
                Assert.AreEqual(SimPolicy.StarFor(p.Rank), p.Star, "ランク" + p.Rank);
            }
        }
    }
}
