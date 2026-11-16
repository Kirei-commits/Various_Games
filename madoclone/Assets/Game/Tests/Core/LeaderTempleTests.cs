using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>リーダー神殿：リーダーの選択、リーダーLv（費用・報酬・効果）、属性変更、セーブ。</summary>
    public class LeaderTempleTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 1UL);
            public Wallet.Wallet Wallet;
            public LeaderTempleService Temple;
            public bool Dev;

            public Env(double exp = 0, double shards = 0)
            {
                var state = new WalletState();
                state.Balances["exp"] = exp;
                state.Balances["mana_shard"] = shards;
                Wallet = new Wallet.Wallet(Data.Currencies, state, () => Dev);
                Temple = new LeaderTempleService(Data, Save, Wallet);
                Save.Characters["chr_001"] = new CharacterState { Star = 5, Lv = 1 };
                Save.Characters["chr_002"] = new CharacterState { Star = 4, Lv = 1 };
            }
        }

        // ---------------- 実測との一致 ----------------

        [Test]
        public void LvPct_MatchesTheMeasuredPoints_AndTheBudget()
        {
            var e = new Env();
            Assert.AreEqual(1572.0, e.Temple.Pct(17), 1e-9);
            Assert.AreEqual(1732.0, e.Temple.Pct(18), 1e-9);
            Assert.AreEqual(160.0, e.Temple.Pct(18) - e.Temple.Pct(17), 1e-9);   // 1Lv あたり +160％
            Assert.AreEqual(8000.0, e.Temple.Pct(50), 1e-9);                       // 6.4節の上限（リーダーLv Lv50）
            Assert.AreEqual(0.0, e.Temple.Pct(1));
            for (int lv = 2; lv <= 150; lv++) { Assert.GreaterOrEqual(e.Temple.Pct(lv), e.Temple.Pct(lv - 1)); }
            Assert.Throws<ArgumentException>(() => e.Temple.Pct(0));
            Assert.AreEqual(18000.0, e.Temple.Pct(150), 1e-9);                     // 終盤の延長：Lv50 以降は1Lv あたり +100％
            Assert.Throws<ArgumentException>(() => e.Temple.Pct(151));
        }

        [Test]
        public void ExpCost_AtLv17_IsTheMeasured4419M()
        {
            var e = new Env();
            Assert.AreEqual(4.419e9, e.Temple.ExpCost(17), 1.0);
            Assert.Greater(e.Temple.ExpCost(18), e.Temple.ExpCost(17));
            Assert.Less(e.Temple.ExpCost(1), e.Temple.ExpCost(17));
            Assert.Throws<ArgumentException>(() => e.Temple.ExpCost(150));
            Assert.Throws<ArgumentException>(() => e.Temple.ShardCost(0));
        }

        [Test]
        public void Rewards_FollowTheLevelRewardRule()
        {
            var e = new Env();
            Assert.AreEqual(100, e.Temple.RewardAt(10));    // Lv10 で 100
            Assert.AreEqual(150, e.Temple.RewardAt(15));
            Assert.AreEqual(300, e.Temple.RewardAt(30));
            Assert.AreEqual(0, e.Temple.RewardAt(5));        // 10 未満はなし
            Assert.AreEqual(0, e.Temple.RewardAt(11));
        }

        // ---------------- リーダーの選択 ----------------

        [Test]
        public void SetLeader_RequiresAnOwnedFiveStarOrMore()
        {
            var e = new Env();
            Assert.AreEqual(TempleFailure.None, e.Temple.SetLeader("chr_001"));
            Assert.AreEqual("chr_001", e.Save.Leader);
            Assert.AreEqual(TempleFailure.StarTooLow, e.Temple.SetLeader("chr_002"));
            Assert.AreEqual(TempleFailure.NotOwned, e.Temple.SetLeader("chr_003"));
            Assert.AreEqual(TempleFailure.UnknownCharacter, e.Temple.SetLeader("nobody"));
            Assert.AreEqual("chr_001", e.Save.Leader);       // 失敗しても変わらない
            Assert.AreEqual(TempleFailure.None, e.Temple.SetLeader(null));
            Assert.IsNull(e.Save.Leader);
        }

        // ---------------- リーダーLv ----------------

        [Test]
        public void LevelUp_PaysExpAndShards_AndRaisesTheLevel()
        {
            var e = new Env(exp: 1e12, shards: 1000);
            double exp = e.Temple.ExpCost(1), shards = e.Temple.ShardCost(1);
            TempleLevelResult r = e.Temple.LevelUp();
            Assert.IsTrue(r.Success);
            Assert.AreEqual(2, r.NewLv);
            Assert.AreEqual(2, e.Temple.Lv);
            Assert.AreEqual(exp, r.ExpSpent);
            Assert.AreEqual(shards, r.ShardsSpent);
            Assert.AreEqual(1e12 - exp, e.Wallet.Balance("exp"), 1e-3);
            Assert.AreEqual(1000 - shards, e.Wallet.Balance("mana_shard"));
        }

        [Test]
        public void LevelUp_WithEitherCurrencyShort_ChangesNothing()
        {
            var noShards = new Env(exp: 1e12, shards: 0);
            TempleLevelResult a = noShards.Temple.LevelUp();
            Assert.IsFalse(a.Success);
            Assert.AreEqual(TempleFailure.NotEnough, a.Failure);
            Assert.AreEqual("mana_shard", a.ShortCurrencyId);
            Assert.AreEqual(1, noShards.Temple.Lv);
            Assert.AreEqual(1e12, noShards.Wallet.Balance("exp"));      // 片方だけ払うことはない

            var noExp = new Env(exp: 1, shards: 1000);
            Assert.AreEqual("exp", noExp.Temple.LevelUp().ShortCurrencyId);
            Assert.AreEqual(1000, noExp.Wallet.Balance("mana_shard"));
        }

        [Test]
        public void ExpCost_AfterTheLateLv_GrowsByTheLateRate()
        {
            var e = new Env();
            double at49 = e.Temple.ExpCost(49), at50 = e.Temple.ExpCost(50), at51 = e.Temple.ExpCost(51);
            Assert.AreEqual(Data.LeaderTemple.ExpCostGrowth, at50 / at49, 1e-9);          // Lv50 の1つ手前までは元の伸び
            Assert.AreEqual(Data.LeaderTemple.LateExpGrowth, at51 / at50, 1e-9);          // Lv50 から後は緩やかな伸び
            Assert.Greater(e.Temple.ExpCost(149), 1e13);                                    // 終盤の経験値の使い道として十分に重い
        }

        [Test]
        public void LevelUp_GrantsTheCrystalRewardOnArrival_AndStopsAtTheMax()
        {
            var e = new Env { Dev = true };
            e.Save.Temple.LeaderLv = 9;
            TempleLevelResult r = e.Temple.LevelUp();         // Lv9 → 10：結晶 100
            Assert.IsTrue(r.Success);
            Assert.AreEqual(100, r.CrystalReward);
            Assert.AreEqual(100, e.Wallet.Balance("mana_crystal"));
            Assert.AreEqual(0, e.Temple.LevelUp().CrystalReward);   // Lv11 はなし

            e.Save.Temple.LeaderLv = 150;
            TempleLevelResult max = e.Temple.LevelUp();
            Assert.AreEqual(TempleFailure.AtMaxLv, max.Failure);
            Assert.AreEqual(150, e.Temple.Lv);
        }

        [Test]
        public void LevelUp_InDevMode_KeepsBalancesButStillGrantsRewards()
        {
            var e = new Env(exp: 0, shards: 0) { Dev = true };
            Assert.IsTrue(e.Temple.LevelUp().Success);
            Assert.AreEqual(0, e.Wallet.Balance("exp"));
            Assert.AreEqual(2, e.Temple.Lv);
        }

        // ---------------- 効果の反映 ----------------

        [Test]
        public void LeaderLvSource_AffectsOnlyTheLeader_AndOnlyAtkHpDef()
        {
            var e = new Env();
            e.Save.Temple.LeaderLv = 17;
            var src = new LeaderLvSource(Data, e.Save);
            var leader = new List<Modifier>();
            src.Collect(leader, new StatQuery("chr_001", 5, 1, Element.Valor, true));
            Assert.AreEqual(3, leader.Count);
            Assert.IsTrue(leader.All(m => m.Pool == ModifierPool.LeaderLv && m.Value == 1572.0));
            CollectionAssert.AreEquivalent(new[] { StatId.Atk, StatId.Hp, StatId.Def }, leader.Select(m => m.Stat));

            var other = new List<Modifier>();
            src.Collect(other, new StatQuery("chr_002", 4, 1, Element.Valor, false));
            Assert.IsEmpty(other);

            e.Save.Temple.LeaderLv = 1;                       // Lv1 は +0％ なので何も足さない
            var none = new List<Modifier>();
            src.Collect(none, new StatQuery("chr_001", 5, 1, Element.Valor, true));
            Assert.IsEmpty(none);
        }

        [Test]
        public void Resolver_MultipliesTheLeaderRing_OnlyForTheLeader()
        {
            var e = new Env();
            e.Save.Temple.LeaderLv = 18;
            var stats = new StatResolver(Data, new IModifierSource[] { new LeaderLvSource(Data, e.Save) });
            CharacterDef c = Data.Characters[0];
            BattleStats plain = new StatResolver(Data).Resolve(c, 5, 10, false);
            Assert.AreEqual(plain.Atk, stats.Resolve(c, 5, 10, false).Atk);
            Assert.AreEqual(plain.Atk * (1 + 1732.0 / 100.0), stats.Resolve(c, 5, 10, true).Atk, 1e-6);
            Assert.AreEqual(plain.Hp * (1 + 1732.0 / 100.0), stats.Resolve(c, 5, 10, true).Hp, 1e-6);
        }

        [Test]
        public void LeaderElement_ChangesOnlyTheLeaderUnitInTheBuiltParty_AndRestoresWhenCleared()
        {
            var e = new Env();
            e.Save.Characters["chr_001"].Lv = 1;
            e.Save.Parties["default"] = new PartyState { Slots = new[] { "chr_001", null, null, null, null, null } };
            e.Temple.SetLeader("chr_001");
            CharacterDef def = Data.Character("chr_001");
            Element changed = def.Element == Element.Heart ? Element.Wisdom : Element.Heart;

            var builder = new BattleSetupBuilder(Data, new StatResolver(Data, new IModifierSource[] { new LeaderLvSource(Data, e.Save) }));
            e.Temple.SetLeaderElement(changed);
            List<UnitSetup> party = builder.BuildParty(e.Save, "default");
            Assert.AreEqual(def.Element, party[0].Element);       // 編成の6体のほうは元の属性
            Assert.IsTrue(party[1].IsLeader);
            Assert.AreEqual(changed, party[1].Element);           // リーダー枠だけ変わる

            e.Temple.SetLeaderElement(null);
            Assert.AreEqual(def.Element, builder.BuildParty(e.Save, "default")[1].Element);
        }

        // ---------------- セーブ ----------------

        [Test]
        public void Temple_SurvivesARoundTrip_AndOldSavesGetDefaults()
        {
            var e = new Env();
            e.Save.Temple.LeaderLv = 23;
            e.Save.Temple.LeaderElement = Element.Skill;
            byte[] bytes = SaveCodec.Serialize(e.Save);
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(23, r.Save.Temple.LeaderLv);
            Assert.AreEqual(Element.Skill, r.Save.Temple.LeaderElement);
            CollectionAssert.AreEqual(bytes, SaveCodec.Serialize(r.Save));

            var o = Newtonsoft.Json.Linq.JObject.Parse(System.Text.Encoding.UTF8.GetString(bytes));
            o.Remove("temple");
            LoadResult old = SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(o.ToString()), Data);
            Assert.IsTrue(old.Success);
            Assert.AreEqual(1, old.Save.Temple.LeaderLv);
            Assert.IsNull(old.Save.Temple.LeaderElement);

            string badElement = System.Text.Encoding.UTF8.GetString(bytes).Replace("\"leaderElement\":\"skill\"", "\"leaderElement\":\"zzz\"");
            Assert.IsFalse(SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(badElement), Data).Success);
        }

        [Test]
        public void Validator_FlagsALeaderLvOutOfRange()
        {
            var e = new Env();
            Assert.IsEmpty(SaveValidator.Validate(e.Save, Data));
            foreach (int bad in new[] { 0, 151 })
            {
                e.Save.Temple.LeaderLv = bad;
                Assert.IsTrue(SaveValidator.Validate(e.Save, Data).Any(i => i.Code == "TEMPLE_LV" && i.Severity == SaveSeverity.Error));
            }
        }
    }
}
