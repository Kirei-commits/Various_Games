using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>竜の巣のツリー：実測の値、解放条件、費用、振り直し、属性ごとの効果。</summary>
    public class DragonNestTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 1UL);
            public Wallet.Wallet Wallet;
            public DragonNestService Nest;
            public bool Dev;

            public Env(double flame = 0)
            {
                var state = new WalletState();
                state.Balances["dragon_flame"] = flame;
                Wallet = new Wallet.Wallet(Data.Currencies, state, () => Dev);
                Nest = new DragonNestService(Data, Save, Wallet);
            }

            public NestNode N(string id) { Nest.TryNode(id, out NestNode n); return n; }
        }

        [Test]
        public void TheTree_HasFourSeparateElementsOfTheSameShape()
        {
            var e = new Env();
            int perElement = Data.DragonNest.Blocks * Data.DragonNest.Tiers.Sum(t => t.Stats.Count);
            Assert.AreEqual(4 * perElement, e.Nest.Nodes.Count);
            Assert.AreEqual(4 * perElement, e.Nest.Nodes.Select(n => n.Id).Distinct().Count());
            foreach (Element el in new[] { Element.Valor, Element.Skill, Element.Heart, Element.Wisdom })
            {
                Assert.AreEqual(perElement, e.Nest.Nodes.Count(n => n.Element == el));
            }
        }

        [Test]
        public void Values_MatchTheMeasuredAndPlannedNodes()
        {
            var e = new Env();
            Assert.AreEqual(100.0, e.Nest.Value(e.N("valor.1.t1.atk"), 1));            // 根元：1Lv あたり +100％
            Assert.AreEqual(2000.0, e.Nest.Value(e.N("valor.1.t1.hp"), 20));           // 最大Lv20
            Assert.AreEqual(0.5, e.Nest.Value(e.N("valor.1.t2.critRatePct"), 1));      // サブ：+0.5
            Assert.AreEqual(50.0, e.Nest.Value(e.N("valor.1.t2.critDamagePct"), 1));   // +50
            Assert.AreEqual(200.0, e.Nest.Value(e.N("valor.1.t3.def"), 1));            // 段3：+200％
            Assert.AreEqual(1.0, e.Nest.Value(e.N("valor.1.t4.evasionPct"), 1));       // 段4：+1.0
            Assert.AreEqual(100.0, e.Nest.Value(e.N("valor.1.t4.critDefensePct"), 1)); // +100
            Assert.AreEqual(1000.0, e.Nest.Value(e.N("valor.1.big.atk"), 1));          // 大ノード：Lv1 で +1,000
            Assert.AreEqual(3000.0, e.Nest.Value(e.N("valor.1.big.atk"), 5));          // 以降 +500ずつ：1000＋500×4
            Assert.AreEqual(200.0, e.Nest.Value(e.N("valor.2.t1.atk"), 1));            // ブロックが進むと×2
            Assert.AreEqual(400.0, e.Nest.Value(e.N("valor.3.t1.atk"), 1));
            Assert.AreEqual(0.0, e.Nest.Value(e.N("valor.1.t1.atk"), 0));
        }

        [Test]
        public void AllBlocksAtMax_ReachTheBudget63000PerElement()
        {
            var e = new Env();
            // 6.4節：竜の巣 +63,000％（属性ごと、攻撃・HP・防御それぞれ）。1ブロック＝2000＋4000＋3000＝9000、×(1＋2＋4)
            double sum = 0;
            foreach (NestNode n in e.Nest.Nodes.Where(n => n.Element == Element.Valor && n.Stat == "atk" && n.Tier.Kind == "pct"))
            {
                sum += e.Nest.Value(n, n.Tier.MaxLv);
            }
            Assert.AreEqual(63000.0, sum, 1e-6);
        }

        [Test]
        public void Costs_FollowTheDesign()
        {
            var e = new Env();
            Assert.AreEqual(1.0, e.Nest.CostToNext(e.N("valor.1.t1.atk"), 0));        // 根元は 1（Lvごとに+1）
            Assert.AreEqual(5.0, e.Nest.CostToNext(e.N("valor.1.t1.atk"), 4));
            Assert.AreEqual(20.0, e.Nest.CostToNext(e.N("valor.1.t2.critRatePct"), 3));
            Assert.AreEqual(40.0, e.Nest.CostToNext(e.N("valor.1.t3.atk"), 7));
            Assert.AreEqual(200.0, e.Nest.CostToNext(e.N("valor.1.t4.evasionPct"), 0));
            Assert.AreEqual(500.0, e.Nest.CostToNext(e.N("valor.1.big.hp"), 0));
            Assert.AreEqual(1000.0, e.Nest.CostToNext(e.N("valor.2.big.hp"), 0));     // ブロックごとに×2
            Assert.Throws<ArgumentException>(() => e.Nest.CostToNext(e.N("valor.1.t1.atk"), 20));
            Assert.Throws<ArgumentException>(() => e.Nest.CostToNext(e.N("valor.1.t1.atk"), -1));
        }

        [Test]
        public void Unlocking_NeedsTheWholePreviousTierAtLv10()
        {
            var e = new Env { Dev = true };
            Assert.IsTrue(e.Nest.IsUnlocked(e.N("valor.1.t1.atk")));
            Assert.IsFalse(e.Nest.IsUnlocked(e.N("valor.1.t2.critRatePct")));
            Assert.AreEqual(NestFailure.Locked, e.Nest.LevelUp("valor.1.t2.critRatePct"));
            foreach (string stat in new[] { "atk", "hp", "def" })
            {
                for (int i = 0; i < 10; i++) { Assert.AreEqual(NestFailure.None, e.Nest.LevelUp("valor.1.t1." + stat)); }
                if (stat != "def") { Assert.IsFalse(e.Nest.IsUnlocked(e.N("valor.1.t2.critRatePct")), "全部が Lv10 になるまで開かない"); }
            }
            Assert.IsTrue(e.Nest.IsUnlocked(e.N("valor.1.t2.critRatePct")));
            Assert.AreEqual(NestFailure.None, e.Nest.LevelUp("valor.1.t2.critRatePct"));
            Assert.IsFalse(e.Nest.IsUnlocked(e.N("heart.1.t2.critRatePct")), "別の属性のツリーは別");
            Assert.IsFalse(e.Nest.IsUnlocked(e.N("valor.2.t1.atk")), "次のブロックは、前のブロックの最後の段が Lv10 から");
        }

        [Test]
        public void TheNextBlockOpens_WhenTheLastTierIsAtItsOwnMax()
        {
            var e = new Env { Dev = true };
            Assert.IsFalse(e.Nest.IsUnlocked(e.N("valor.2.t1.atk")));
            // 大ノードの最大Lv（5）は unlockLv（10）より小さい：その段の最大Lv で開く
            e.Save.DragonNest.Levels["valor.1.big.atk"] = 5;
            e.Save.DragonNest.Levels["valor.1.big.hp"] = 5;
            Assert.IsFalse(e.Nest.IsUnlocked(e.N("valor.2.t1.atk")), "def がまだ");
            e.Save.DragonNest.Levels["valor.1.big.def"] = 5;
            Assert.IsTrue(e.Nest.IsUnlocked(e.N("valor.2.t1.atk")));
            Assert.IsFalse(e.Nest.IsUnlocked(e.N("skill.2.t1.atk")), "別の属性は別");
        }

        [Test]
        public void LevelUp_PaysDragonFlame_AndStopsAtTheMax_AndRejectsUnknownNodes()
        {
            var e = new Env(flame: 100);
            Assert.AreEqual(NestFailure.None, e.Nest.LevelUp("valor.1.t1.atk"));
            Assert.AreEqual(1, e.Nest.Lv("valor.1.t1.atk"));
            Assert.AreEqual(99, e.Wallet.Balance("dragon_flame"));
            Assert.AreEqual(NestFailure.None, e.Nest.LevelUp("valor.1.t1.atk"));
            Assert.AreEqual(97, e.Wallet.Balance("dragon_flame"));                    // 1＋2
            Assert.AreEqual(NestFailure.UnknownNode, e.Nest.LevelUp("zzz"));
            Assert.AreEqual(NestFailure.UnknownNode, e.Nest.LevelUp(null));

            var poor = new Env(flame: 0);
            Assert.AreEqual(NestFailure.NotEnough, poor.Nest.LevelUp("valor.1.t1.atk"));
            Assert.AreEqual(0, poor.Nest.Lv("valor.1.t1.atk"));

            var dev = new Env { Dev = true };
            for (int i = 0; i < 20; i++) { Assert.AreEqual(NestFailure.None, dev.Nest.LevelUp("valor.1.t1.atk")); }
            Assert.AreEqual(NestFailure.AtMaxLv, dev.Nest.LevelUp("valor.1.t1.atk"));
        }

        [Test]
        public void Reset_RefundsEverythingSpent_ForThatElementOnly()
        {
            var e = new Env(flame: 1000);
            for (int i = 0; i < 4; i++) { e.Nest.LevelUp("valor.1.t1.atk"); }     // 1＋2＋3＋4 = 10
            e.Nest.LevelUp("skill.1.t1.atk");                                      // 1
            double after = e.Wallet.Balance("dragon_flame");
            Assert.AreEqual(989, after);
            Assert.AreEqual(10, e.Nest.Spent(Element.Valor));
            e.Nest.Reset(Element.Valor, out double refunded);
            Assert.AreEqual(10, refunded);
            Assert.AreEqual(999, e.Wallet.Balance("dragon_flame"));
            Assert.AreEqual(0, e.Nest.Lv("valor.1.t1.atk"));
            Assert.AreEqual(1, e.Nest.Lv("skill.1.t1.atk"));                       // 他の属性は残る
            Assert.AreEqual(0, e.Nest.Spent(Element.Valor));

            var dev = new Env { Dev = true };
            dev.Nest.LevelUp("valor.1.t1.atk");
            dev.Nest.Reset(Element.Valor, out double devRefund);
            Assert.AreEqual(0, devRefund);                                         // 開発者モードは減らしていないので、戻さない
            Assert.AreEqual(0, dev.Wallet.Balance("dragon_flame"));
        }

        [Test]
        public void Source_AffectsOnlyCharactersOfThatElement_WithThePercentInItsOwnRing()
        {
            var e = new Env { Dev = true };
            e.Save.DragonNest.Levels["valor.1.t1.atk"] = 5;
            e.Save.DragonNest.Levels["valor.1.t2.critRatePct"] = 4;
            e.Save.DragonNest.Levels["heart.1.t1.atk"] = 20;
            var src = new DragonNestSource(e.Nest, e.Save);
            var valor = new List<Modifier>();
            src.Collect(valor, new StatQuery("c", 1, 1, Element.Valor, false));
            Assert.AreEqual(500.0, valor.Single(m => m.Stat == StatId.Atk).Value);
            Assert.AreEqual(ModifierPool.DragonNest, valor.Single(m => m.Stat == StatId.Atk).Pool);
            Assert.AreEqual(2.0, valor.Single(m => m.Stat == StatId.CritRate).Value, 1e-9);     // 0.5 × 4
            Assert.AreEqual(ModifierPool.Flat, valor.Single(m => m.Stat == StatId.CritRate).Pool);
            var wisdom = new List<Modifier>();
            src.Collect(wisdom, new StatQuery("c", 1, 1, Element.Wisdom, false));
            Assert.IsEmpty(wisdom);

            // 竜の巣の輪は、全体強化の輪と掛け算
            var c = Data.Characters.First(x => x.Element == Element.Valor);
            BattleStats plain = new StatResolver(Data).Resolve(c, 1, 1, false);
            BattleStats with = new StatResolver(Data, new IModifierSource[] { src }).Resolve(c, 1, 1, false);
            Assert.AreEqual(plain.Atk * 6.0, with.Atk, 1e-6);
            Assert.AreEqual(plain.CritRatePct + 2.0, with.CritRatePct, 1e-9);
        }

        [Test]
        public void Source_IgnoresLevelsAboveTheMax_AndUnknownNodes()
        {
            var e = new Env();
            e.Save.DragonNest.Levels["valor.1.t1.atk"] = 999;
            e.Save.DragonNest.Levels["ghost"] = 3;
            var sink = new List<Modifier>();
            new DragonNestSource(e.Nest, e.Save).Collect(sink, new StatQuery("c", 1, 1, Element.Valor, false));
            Assert.AreEqual(2000.0, sink.Single().Value);
        }

        [Test]
        public void Save_RoundTrips_IsValidated_AndRepaired()
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            s.DragonNest.Levels["valor.1.t1.atk"] = 7;
            s.DragonNest.Levels["ghost.node"] = 2;
            byte[] bytes = SaveCodec.Serialize(s);
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(7, r.Save.DragonNest.Levels["valor.1.t1.atk"]);
            Assert.IsTrue(r.Issues.Any(i => i.Code == "NEST_UNKNOWN"));
            CollectionAssert.AreEqual(bytes, SaveCodec.Serialize(r.Save));

            s.DragonNest.Levels["valor.1.t1.atk"] = 99;
            s.DragonNest.Levels["valor.1.t1.hp"] = -3;
            Assert.AreEqual(2, SaveValidator.Validate(s, Data).Count(i => i.Code == "NEST_LV"));
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(20, s.DragonNest.Levels["valor.1.t1.atk"]);
            Assert.IsFalse(s.DragonNest.Levels.ContainsKey("valor.1.t1.hp"));
            Assert.AreEqual(2, s.DragonNest.Levels["ghost.node"]);
            Assert.IsEmpty(SaveValidator.Validate(s, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());

            string bad = System.Text.Encoding.UTF8.GetString(bytes).Replace("\"valor.1.t1.atk\":7", "\"valor.1.t1.atk\":\"x\"");
            Assert.IsFalse(SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(bad), Data).Success);
        }

        [Test]
        public void Session_LevelsNodes_ResetsTheTree_AndTheStatsFollow()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 4UL);
            Assert.AreEqual("NotEnough", s.LevelUpDragonNode("valor.1.t1.atk").Failure);
            Assert.AreEqual("UnknownNode", s.LevelUpDragonNode("nope").Failure);
            Assert.AreEqual("Locked", s.LevelUpDragonNode("valor.1.t2.critRatePct").Failure);
            s.Debug.GrantCurrency("dragon_flame", 50);
            s.DrainEvents();
            Assert.IsTrue(s.LevelUpDragonNode("valor.1.t1.atk").Success);
            Assert.AreEqual(1, s.State.DragonNodeLv("valor.1.t1.atk"));
            Assert.IsTrue(s.State.IsDragonNodeUnlocked("valor.1.t1.atk"));
            Assert.IsFalse(s.State.IsDragonNodeUnlocked("valor.1.t2.critRatePct"));
            Assert.IsFalse(s.State.IsDragonNodeUnlocked("nope"));
            Assert.IsTrue(s.DrainEvents().Any(x => x.Kind == GameEventKind.DragonNodeLevelUp && x.Value == 1));
            Assert.IsTrue(s.ResetDragonNest(Element.Valor).Success);
            Assert.AreEqual(0, s.State.DragonNodeLv("valor.1.t1.atk"));
            Assert.AreEqual(50, s.State.Balance("dragon_flame"));
            Assert.IsTrue(s.DrainEvents().Any(x => x.Kind == GameEventKind.DragonNestReset && x.Amount == 1));
        }
    }
}
