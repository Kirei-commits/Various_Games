using System;
using Mado.Core.Util;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>
    /// Rng の期待値は tools/bootstrap/rng_reference.py（Python の参照実装）が作った RngVectors.g.cs。
    /// ここが落ちたら、Rng.cs か参照実装のどちらかが間違っている。
    /// </summary>
    public class RngTests
    {
        [Test]
        public void SplitMix64_MatchesReference()
        {
            for (int i = 0; i < RngVectors.SplitMixSeeds.Length; i++)
            {
                var sm = new SplitMix64(RngVectors.SplitMixSeeds[i]);
                foreach (ulong expected in RngVectors.SplitMixOutputs[i])
                {
                    Assert.AreEqual(expected, sm.Next(), "seed index " + i);
                }
            }
        }

        [Test]
        public void NextUInt_MatchesReference()
        {
            for (int i = 0; i < RngVectors.NextUIntSeeds.Length; i++)
            {
                var rng = new Rng(RngVectors.NextUIntSeeds[i]);
                foreach (uint expected in RngVectors.NextUIntOutputs[i])
                {
                    Assert.AreEqual(expected, rng.NextUInt(), "seed index " + i);
                }
            }
        }

        [Test]
        public void NextInt_MatchesReference()
        {
            var r6 = new Rng(RngVectors.NextInt6Seed);
            foreach (int expected in RngVectors.NextInt6)
            {
                Assert.AreEqual(expected, r6.NextInt(6));
            }
            var r1000 = new Rng(RngVectors.NextInt1000Seed);
            foreach (int expected in RngVectors.NextInt1000)
            {
                Assert.AreEqual(expected, r1000.NextInt(1000));
            }
        }

        [Test]
        public void NextIntRange_MatchesReference()
        {
            var rng = new Rng(RngVectors.NextIntRangeSeed);
            foreach (int expected in RngVectors.NextIntRange)
            {
                Assert.AreEqual(expected, rng.NextInt(-3, 4));
            }
        }

        [Test]
        public void NextDouble_MatchesReferenceAndStaysBelowOne()
        {
            var rng = new Rng(RngVectors.NextDoubleSeed);
            foreach (int numerator in RngVectors.NextDoubleNumerators)
            {
                double d = rng.NextDouble();
                Assert.AreEqual(numerator / 16777216.0, d);
                Assert.That(d, Is.GreaterThanOrEqualTo(0.0).And.LessThan(1.0));
            }
        }

        [Test]
        public void Chance_MatchesReference()
        {
            var rng = Rng.Create(RngVectors.ChanceSeed, RngStream.Battle);
            foreach (bool expected in RngVectors.Chance30)
            {
                Assert.AreEqual(expected, rng.Chance(30));
            }
        }

        [Test]
        public void Chance_ZeroNeverAndHundredAlways_ButAlwaysConsumesOneDraw()
        {
            var a = new Rng(2026);
            var b = new Rng(2026);
            for (int i = 0; i < 1000; i++)
            {
                Assert.IsFalse(a.Chance(0));
                Assert.IsTrue(a.Chance(100));
                Assert.IsFalse(a.Chance(-5));
                b.NextUInt();
                b.NextUInt();
                b.NextUInt();
            }
            // 確率の値にかかわらず1回ずつ引いているので、同じ回数だけ進んでいる
            Assert.AreEqual(b.NextUInt(), a.NextUInt());
        }

        [Test]
        public void Create_MatchesReferenceForEachStream()
        {
            for (int i = 0; i < RngVectors.StreamSeeds.Length; i++)
            {
                var rng = Rng.Create(RngVectors.StreamSeeds[i], (RngStream)RngVectors.StreamIds[i]);
                foreach (uint expected in RngVectors.StreamOutputs[i])
                {
                    Assert.AreEqual(expected, rng.NextUInt(), "stream index " + i);
                }
            }
        }

        [Test]
        public void Create_StreamsAreIndependent()
        {
            uint battle = Rng.Create(1, RngStream.Battle).NextUInt();
            uint gacha = Rng.Create(1, RngStream.Gacha).NextUInt();
            uint misc = Rng.Create(1, RngStream.Misc).NextUInt();
            Assert.AreNotEqual(battle, gacha);
            Assert.AreNotEqual(gacha, misc);
            Assert.AreNotEqual(battle, misc);
        }

        [Test]
        public void SameSeed_GivesSameSequence()
        {
            var a = new Rng(987654321UL);
            var b = new Rng(987654321UL);
            for (int i = 0; i < 1000; i++)
            {
                Assert.AreEqual(a.NextUInt(), b.NextUInt());
            }
        }

        [Test]
        public void NextInt_DistributionMatchesReferenceCounts()
        {
            var rng = new Rng(RngVectors.CountsSeed);
            var counts = new int[6];
            for (int i = 0; i < RngVectors.CountsDraws; i++)
            {
                counts[rng.NextInt(6)]++;
            }
            CollectionAssert.AreEqual(RngVectors.Counts6, counts);
        }

        [Test]
        public void NextInt_RejectsEmptyRange()
        {
            var rng = new Rng(1);
            Assert.Throws<ArgumentOutOfRangeException>(() => rng.NextInt(0));
            Assert.Throws<ArgumentOutOfRangeException>(() => rng.NextInt(-1));
            Assert.Throws<ArgumentOutOfRangeException>(() => rng.NextInt(5, 5));
            Assert.Throws<ArgumentOutOfRangeException>(() => rng.NextInt(int.MinValue, int.MaxValue));
        }
    }
}
