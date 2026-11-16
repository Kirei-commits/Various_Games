using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Stats;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    public class RankProfileSourceTests
    {
        private static GameData Data { get { return TestData.Data; } }

        [Test]
        public void FollowsTheRankProvider_AndMatchesTheProfileModifierSource()
        {
            var file = SimProfiles.LoadFile(new FileDataSource(TestData.FindDataDir()));
            IReadOnlyList<SimProfileDef> profiles = file.Items;
            int rank = 5;
            var src = new RankProfileSource(profiles, () => rank, file.AllySubstats, Data.System.BaseSubstats);
            var sink = new List<Modifier>();
            src.Collect(sink, default(StatQuery));
            var expected = new List<Modifier>();
            new ProfileModifierSource(profiles.First(p => p.Rank == 5), file.AllySubstats, Data.System.BaseSubstats).Collect(expected, default(StatQuery));
            Assert.AreEqual(expected.Count, sink.Count);
            for (int i = 0; i < sink.Count; i++) { Assert.AreEqual(expected[i].Value, sink[i].Value); Assert.AreEqual(expected[i].Stat, sink[i].Stat); }
            Assert.Greater(sink.Count, 0);

            rank = 20;                                                          // ランクが変われば倍率も変わる
            var later = new List<Modifier>();
            src.Collect(later, default(StatQuery));
            Assert.Greater(later.First(m => m.Stat == StatId.Atk).Value, sink.First(m => m.Stat == StatId.Atk).Value);

            rank = 999;                                                         // 表に無いランクは何も足さない
            var none = new List<Modifier>();
            src.Collect(none, default(StatQuery));
            Assert.IsEmpty(none);
        }

        [Test]
        public void Constructor_RejectsNulls()
        {
            Assert.Throws<ArgumentNullException>(() => new RankProfileSource(null, () => 1, null, Data.System.BaseSubstats));
            Assert.Throws<ArgumentNullException>(() => new RankProfileSource(new List<SimProfileDef>(), null, null, Data.System.BaseSubstats));
        }
    }
}
