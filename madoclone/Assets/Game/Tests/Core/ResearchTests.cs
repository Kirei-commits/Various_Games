using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Growth;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>研究所・リーダー特殊ツリー・タロット・コレクション・図鑑・放置のワイン。</summary>
    public class ResearchTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static readonly DateTime T0 = new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc);

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 1UL);
            public Wallet.Wallet Wallet;
            public bool Dev;
            public TreeService Trees; public TarotService Tarot; public CollectionService Collection; public ZukanService Zukan;

            public Env()
            {
                Wallet = new Wallet.Wallet(Data.Currencies, new WalletState(), () => Dev);
                Trees = new TreeService(Data, Save, Wallet); Tarot = new TarotService(Data, Save, Wallet);
                Collection = new CollectionService(Data, Save, Wallet); Zukan = new ZukanService(Data, Save, Wallet);
            }

            public void Give(string cur, double v) { Wallet.Grant(new Reward(cur, v), new GrantReason("t")); }

            public List<Modifier> Mods()
            {
                var sink = new List<Modifier>();
                new ResearchSource(Data, Save).Collect(sink, default(StatQuery));
                return sink;
            }
        }

        private static double Sum(List<Modifier> l, StatId st, ModifierPool p) { return l.Where(m => m.Stat == st && m.Pool == p).Sum(m => m.Value); }

        // ---------------- ツリー ----------------

        [Test]
        public void LeaderTree_RootsGive12000PerStatAtMax_AndTheCostsMatchTheMeasuredPoints()
        {
            var e = new Env { Dev = true };
            TreeDef leader = Data.Research.Trees.First(t => t.Id == "leader");
            for (int i = 0; i < 20; i++) { foreach (string n in new[] { "leader_atk", "leader_hp", "leader_def" }) { Assert.AreEqual(ResearchFailure.None, e.Trees.LevelUp("leader", n)); } }
            List<Modifier> mods = e.Mods();
            Assert.AreEqual(12000.0, Sum(mods, StatId.Atk, ModifierPool.Global), 1e-6);        // 6.4節：リーダー特殊ツリー +12,000％
            Assert.AreEqual(12000.0, Sum(mods, StatId.Hp, ModifierPool.Global), 1e-6);
            TreeNodeDef atk = leader.Nodes.First(n => n.Id == "leader_atk"), hp = leader.Nodes.First(n => n.Id == "leader_hp");
            Assert.AreEqual(518.0, e.Trees.CostToNext(atk, 18));                                // 実測：攻撃力 Lv18→19 で 518 個
            Assert.AreEqual(36.0, e.Trees.CostToNext(hp, 4));                                   // 実測：HP Lv4→5 で 36 個
        }

        [Test]
        public void Unlocking_NeedsAllRequiredNodesAtTheirMax()
        {
            var e = new Env { Dev = true };
            Assert.IsTrue(e.Trees.IsUnlocked("leader", "leader_atk"));
            Assert.IsFalse(e.Trees.IsUnlocked("leader", "leader_critDefensePct"));
            Assert.AreEqual(ResearchFailure.Locked, e.Trees.LevelUp("leader", "leader_critDefensePct"));
            for (int i = 0; i < 20; i++) { e.Trees.LevelUp("leader", "leader_atk"); e.Trees.LevelUp("leader", "leader_hp"); }
            Assert.IsFalse(e.Trees.IsUnlocked("leader", "leader_critDefensePct"), "def がまだ");
            for (int i = 0; i < 20; i++) { e.Trees.LevelUp("leader", "leader_def"); }
            Assert.IsTrue(e.Trees.IsUnlocked("leader", "leader_critDefensePct"));
            for (int i = 0; i < 10; i++) { Assert.AreEqual(ResearchFailure.None, e.Trees.LevelUp("leader", "leader_critDefensePct")); }
            Assert.AreEqual(ResearchFailure.AtMax, e.Trees.LevelUp("leader", "leader_critDefensePct"));
            Assert.AreEqual(1000.0, Sum(e.Mods(), StatId.CritDefense, ModifierPool.Flat), 1e-9);   // 100 × 10
            Assert.AreEqual(ResearchFailure.Unknown, e.Trees.LevelUp("nope", "x"));
            Assert.AreEqual(ResearchFailure.Unknown, e.Trees.LevelUp("leader", "nope"));
            Assert.IsFalse(e.Trees.IsUnlocked("nope", "x"));
        }

        [Test]
        public void LevelUp_PaysTheTreeCurrency_AndFailsWithoutIt()
        {
            var e = new Env();
            Assert.AreEqual(ResearchFailure.NotEnough, e.Trees.LevelUp("leader", "leader_atk"));
            e.Give("mana_crystal", 100);
            Assert.AreEqual(ResearchFailure.None, e.Trees.LevelUp("leader", "leader_atk"));
            Assert.AreEqual(100 - 14, e.Wallet.Balance("mana_crystal"));
            Assert.AreEqual(1, e.Trees.Lv("leader", "leader_atk"));
            e.Give("research_memo", 1000);
            Assert.AreEqual(ResearchFailure.None, e.Trees.LevelUp("lab", "lab_atk_01"));
            Assert.AreEqual(1000 - 10, e.Wallet.Balance("research_memo"));
            Assert.AreEqual(ResearchFailure.Locked, e.Trees.LevelUp("lab", "lab_atk_02"));       // 前のノードが最大Lv になるまで
            Assert.Throws<ArgumentException>(() => e.Trees.CostToNext(Data.Research.Trees[0].Nodes[0], 5));
        }

        [Test]
        public void TheLab_StaysUnderTheResearchBudget()
        {
            var e = new Env { Dev = true };
            foreach (TreeNodeDef n in Data.Research.Trees.First(t => t.Id == "lab").Nodes) { for (int i = 0; i < n.MaxLv; i++) { e.Trees.LevelUp("lab", n.Id); } }
            double atk = Sum(e.Mods(), StatId.Atk, ModifierPool.Global);
            Assert.AreEqual(800.0, atk, 1e-6);                                                    // 20ノード × 5Lv × 8％
            Assert.AreEqual(30.0, Sum(e.Mods(), StatId.AttackSpeed, ModifierPool.Flat), 1e-6);   // 攻撃スピードのノード6本 × 5Lv × 1％（上限 +30％）
            Assert.LessOrEqual(atk + 3600.0, 5000.0, "研究所＋タロット（全枠EX）が 6.4節の +5,000％ に収まる");
        }

        // ---------------- タロット ----------------

        [Test]
        public void Tarot_PaysWineBySlotRarity_AndUsesTheMaxValue()
        {
            var e = new Env();
            e.Give("wine", 100000);
            Assert.AreEqual(ResearchFailure.None, e.Tarot.Set(0, "atk", "UR"));
            Assert.AreEqual(100000 - 28800, e.Wallet.Balance("wine"));
            Assert.AreEqual(ResearchFailure.None, e.Tarot.Set(0, "atk", "UR"));                    // 同じなら払わない
            Assert.AreEqual(100000 - 28800, e.Wallet.Balance("wine"));
            Assert.AreEqual(ResearchFailure.None, e.Tarot.Set(1, "critDamagePct", "SR"));
            Assert.AreEqual(100000 - 28800 - 1000, e.Wallet.Balance("wine"));   // 2回目の入れ替え：基準 × (1 ＋ 1 × 0.25)
            List<Modifier> mods = e.Mods();
            Assert.AreEqual(350.0, Sum(mods, StatId.Atk, ModifierPool.Global));
            Assert.AreEqual(100.0, Sum(mods, StatId.CritDamage, ModifierPool.Flat));
            Assert.AreEqual(ResearchFailure.None, e.Tarot.Set(0, "hp", "N"));                      // 枠を変える：新しいレアの費用を払う（返金なし）
            Assert.AreEqual(100000 - 28800 - 1000 - 75, e.Wallet.Balance("wine"));   // 3回目：× 1.5
            Assert.AreEqual(3, e.Save.Research.TarotChanges);
            Assert.AreEqual(0.0, Sum(e.Mods(), StatId.Atk, ModifierPool.Global));
            Assert.AreEqual(ResearchFailure.None, e.Tarot.Clear(0));
            Assert.AreEqual(0.0, Sum(e.Mods(), StatId.Hp, ModifierPool.Global));
        }

        [Test]
        public void Tarot_AllSixSlotsOfURGive2100_AndOfEXGive3600()
        {
            var e = new Env { Dev = true };
            for (int i = 0; i < 6; i++) { e.Tarot.Set(i, "hp", "UR"); }
            Assert.AreEqual(2100.0, Sum(e.Mods(), StatId.Hp, ModifierPool.Global));
            for (int i = 0; i < 6; i++) { e.Tarot.Set(i, "hp", "EX"); }
            Assert.AreEqual(3600.0, Sum(e.Mods(), StatId.Hp, ModifierPool.Global));
        }

        [Test]
        public void Tarot_CostRisesWithEveryChange_AndTheSessionShowsIt()
        {
            var e = new Env();
            TarotRarityDef ex = e.Tarot.Rarity("EX");
            double step = Data.Research.Tarot.ChangeCostStep;
            Assert.AreEqual(ex.WineCost, e.Tarot.Cost(ex));
            e.Give("wine", 1e9);
            for (int i = 0; i < 4; i++) { Assert.AreEqual(ResearchFailure.None, e.Tarot.Set(i, "atk", "N")); }
            Assert.AreEqual(4, e.Save.Research.TarotChanges);
            Assert.AreEqual(ex.WineCost * (1 + 4 * step), e.Tarot.Cost(ex), 1e-6);
            Assert.AreEqual(ex.WineCost * (1 + 7 * step), TarotService.CostOf(Data, 7, ex), 1e-6);
            Assert.AreEqual(ResearchFailure.None, e.Tarot.Set(0, "atk", "N"));            // 同じなら数えない
            Assert.AreEqual(4, e.Save.Research.TarotChanges);
            Assert.AreEqual(ResearchFailure.None, e.Tarot.Clear(0));                       // 外すのは数えない
            Assert.AreEqual(4, e.Save.Research.TarotChanges);
        }

        [Test]
        public void TarotChanges_SurviveTheSaveRoundTrip()
        {
            var save = Mado.Core.Save.SaveData.CreateNew(1, "", 1UL);
            save.Research.TarotChanges = 12;
            Mado.Core.Save.LoadResult back = Mado.Core.Save.SaveCodec.Load(Mado.Core.Save.SaveCodec.Serialize(save), Data);
            Assert.AreEqual(12, back.Save.Research.TarotChanges);
        }

        [Test]
        public void Tarot_RejectsBadChoices_AndShortWine()
        {
            var e = new Env();
            Assert.AreEqual(ResearchFailure.InvalidChoice, e.Tarot.Set(9, "hp", "N"));
            Assert.AreEqual(ResearchFailure.InvalidChoice, e.Tarot.Set(-1, "hp", "N"));
            Assert.AreEqual(ResearchFailure.InvalidChoice, e.Tarot.Set(0, "evasionPct", "N"));
            Assert.AreEqual(ResearchFailure.InvalidChoice, e.Tarot.Set(0, "hp", "ZZ"));
            Assert.AreEqual(ResearchFailure.InvalidChoice, e.Tarot.Clear(9));
            Assert.AreEqual(ResearchFailure.NotEnough, e.Tarot.Set(0, "hp", "N"));
            Assert.IsNull(e.Save.Research.Tarot[0].Effect);
            Assert.IsNull(e.Tarot.Rarity("ZZ"));
        }

        [Test]
        public void TheMeasuredTarotCards_FitUnderTheMaxValues()
        {
            var e = new Env();
            Assert.GreaterOrEqual(e.Tarot.Rarity("UR").MaxPct, 345.09);       // 実測：UR・クリティカルダメージ
            Assert.GreaterOrEqual(e.Tarot.Rarity("SR").MaxPct, 98.35);        // SR・防御力
            Assert.GreaterOrEqual(e.Tarot.Rarity("SSR").MaxPct, 120.31);      // SSR・防御力
        }

        // ---------------- コレクション ----------------

        [Test]
        public void Collection_RaisesStarsWithMedals_AndTheValuesMatchTheTable()
        {
            var e = new Env();
            Assert.AreEqual(ResearchFailure.NotEnough, e.Collection.Raise("diamond"));
            e.Give("collection_medal", 100000);
            for (int star = 1; star <= 5; star++) { Assert.AreEqual(ResearchFailure.None, e.Collection.Raise("diamond")); }
            Assert.AreEqual(5, e.Collection.Star("diamond"));
            Assert.AreEqual(ResearchFailure.AtMax, e.Collection.Raise("diamond"));
            Assert.AreEqual(ResearchFailure.Unknown, e.Collection.Raise("nope"));
            Assert.AreEqual(3000.0, Sum(e.Mods(), StatId.Atk, ModifierPool.Global));          // ダイヤの祈り ★5：攻撃力 +3,000％
            e.Collection.Raise("kingdom");
            Assert.AreEqual(10.0, Sum(e.Mods(), StatId.Evasion, ModifierPool.Flat));          // 王国の遺物 ★1：回避率 +10
            Assert.AreEqual(100000 - (100 + 200 + 400 + 800 + 1600) - 100, e.Wallet.Balance("collection_medal"));   // 費用が引かれている
        }

        [Test]
        public void Collection_AllEightSetsAtMax_StayWithinTheBudget()
        {
            var e = new Env { Dev = true };
            foreach (CollectionSetDef s in Data.Research.Collection.Sets) { for (int i = 0; i < s.Values.Count; i++) { e.Collection.Raise(s.Id); } }
            List<Modifier> mods = e.Mods();
            Assert.AreEqual(1500.0, Sum(mods, StatId.Def, ModifierPool.Global));
            Assert.AreEqual(3000.0, Sum(mods, StatId.Hp, ModifierPool.Global));
            Assert.LessOrEqual(Sum(mods, StatId.Atk, ModifierPool.Global), 12000.0);          // 6.4節の上限
            Assert.AreEqual(1000.0, Sum(mods, StatId.CritDefense, ModifierPool.Flat));
            Assert.AreEqual(25.0, Sum(mods, StatId.Accuracy, ModifierPool.Flat));
            Assert.AreEqual(30.0, Sum(mods, StatId.CritRate, ModifierPool.Flat));
            Assert.AreEqual(20.0, Sum(mods, StatId.Evasion, ModifierPool.Flat));
        }

        // ---------------- 図鑑 ----------------

        [Test]
        public void Zukan_PicksUpGoals_PaysGems_AndRewardsOnlyOnce()
        {
            var e = new Env();
            e.Save.Characters["chr_001"] = new CharacterState { Star = 2, Lv = 45 };
            int gained = e.Zukan.Sync();
            Assert.AreEqual(2 + 2, gained);                                                    // Lv20・40 と ★1・★2
            Assert.AreEqual(4 * 70.0, e.Wallet.Balance("gem"));
            Assert.IsTrue(e.Zukan.IsAchieved("chr_001.lv40"));
            Assert.IsTrue(e.Zukan.IsAchieved("chr_001.star2"));
            Assert.IsFalse(e.Zukan.IsAchieved("chr_001.lv60"));
            Assert.AreEqual(0, e.Zukan.Sync());                                                // 二重取りしない
            Assert.AreEqual(4 * 70.0, e.Wallet.Balance("gem"));
            e.Save.Characters["chr_001"].Lv = 60;
            Assert.AreEqual(1, e.Zukan.Sync());
            CollectionAssert.AreEqual(e.Save.Research.Zukan.OrderBy(x => x, StringComparer.Ordinal).ToList(), e.Save.Research.Zukan);
        }

        [Test]
        public void Zukan_EffectIsEightPercentPerGoal_SplitAcrossAtkHpDef_AndAllGoalsStayWithinTheBudget()
        {
            var e = new Env();
            e.Save.Characters["chr_001"] = new CharacterState { Star = 3, Lv = 20 };
            e.Zukan.Sync();                                                                    // lv20（目標0＝攻撃）、★1（目標0＝HP）、★2（防御）、★3（攻撃）
            List<Modifier> mods = e.Mods();
            Assert.AreEqual(16.0, Sum(mods, StatId.Atk, ModifierPool.Global));
            Assert.AreEqual(8.0, Sum(mods, StatId.Hp, ModifierPool.Global));
            Assert.AreEqual(8.0, Sum(mods, StatId.Def, ModifierPool.Global));
            // 105体すべての目標を達成すると、1つのステータスあたり約 4,800％（6.4節 +5,000％ の範囲）
            double perChar = e.Zukan.GoalsPerCharacter;
            double total = perChar * 105 * Data.Research.Zukan.PerGoalPct / 3.0;
            Assert.LessOrEqual(total, 6200.0);      // 元は5,000％。限界突破（★12〜16）の目標ぶんが加わる（docs/decisions/2026-11-16_ランク50までの拡張.md）
            Assert.GreaterOrEqual(total, 4000.0);
        }

        [Test]
        public void Zukan_IgnoresUnknownGoalNames()
        {
            var e = new Env();
            e.Save.Research.Zukan.AddRange(new[] { "weird", "chr_001.lv7", "chr_001.starX", "chr_001.star99" });
            Assert.DoesNotThrow(() => e.Mods());
            Assert.AreEqual(0.0, Sum(e.Mods(), StatId.Atk, ModifierPool.Global));
        }

        // ---------------- 放置のワイン ----------------

        [Test]
        public void Idle_AlsoAccruesWine()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            var wallet = new Wallet.Wallet(Data.Currencies, new WalletState(), () => false);
            var clock = new FixedClock(T0);
            var idle = new IdleService(Data, save, wallet, clock);
            idle.EnsureStarted();
            clock.Advance(TimeSpan.FromHours(1));
            IdleReport r = idle.Claim();
            Assert.AreEqual(43.0 * 60, r.Wine, 1e-9);                                           // 毎分43本
            Assert.AreEqual(43.0 * 60, wallet.Balance("wine"), 1e-9);
        }

        // ---------------- セーブ・GameSession ----------------

        [Test]
        public void Save_RoundTrips_IsValidated_AndRepaired()
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            s.Research.Nodes["leader/leader_atk"] = 5;
            s.Research.Nodes["ghost/x"] = 1;
            s.Research.Collection["gold"] = 2;
            s.Research.Tarot.Add(new TarotSlotState { Effect = "hp", Rarity = "UR" });
            s.Research.Tarot.Add(new TarotSlotState());
            s.Research.Zukan.AddRange(new[] { "chr_001.lv20", "chr_001.star1" });
            byte[] bytes = SaveCodec.Serialize(s);
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(5, r.Save.Research.Nodes["leader/leader_atk"]);
            Assert.AreEqual("UR", r.Save.Research.Tarot[0].Rarity);
            Assert.IsTrue(r.Issues.Any(i => i.Code == "RESEARCH_UNKNOWN"));
            CollectionAssert.AreEqual(bytes, SaveCodec.Serialize(r.Save));

            s.Research.Nodes["leader/leader_atk"] = 99;
            s.Research.Nodes["leader/leader_hp"] = -1;
            s.Research.Collection["gold"] = 9;
            s.Research.Collection["ghost"] = 1;
            s.Research.Tarot[1] = new TarotSlotState { Effect = "zzz", Rarity = "UR" };
            s.Research.Tarot.Add(new TarotSlotState()); s.Research.Tarot.Add(new TarotSlotState()); s.Research.Tarot.Add(new TarotSlotState());
            s.Research.Tarot.Add(new TarotSlotState()); s.Research.Tarot.Add(new TarotSlotState());
            s.Research.Zukan.Add("chr_001.lv20");
            var codes = SaveValidator.Validate(s, Data).Select(i => i.Code).ToList();
            foreach (string c in new[] { "RESEARCH_LV", "COLLECTION_STAR", "COLLECTION_UNKNOWN", "TAROT_SLOT", "ZUKAN_DUP" }) { CollectionAssert.Contains(codes, c); }
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(20, s.Research.Nodes["leader/leader_atk"]);
            Assert.IsFalse(s.Research.Nodes.ContainsKey("leader/leader_hp"));
            Assert.AreEqual(5, s.Research.Collection["gold"]);
            Assert.AreEqual(1, s.Research.Collection["ghost"]);
            Assert.IsNull(s.Research.Tarot[1].Effect);
            Assert.AreEqual(6, s.Research.Tarot.Count);
            Assert.AreEqual(2, s.Research.Zukan.Count);
            Assert.IsEmpty(SaveValidator.Validate(s, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());
            Assert.IsEmpty(SaveRepair.Repair(s, Data));

            string bad = System.Text.Encoding.UTF8.GetString(bytes).Replace("\"gold\":2", "\"gold\":\"x\"");
            Assert.IsFalse(SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(bad), Data).Success);
        }

        [Test]
        public void Session_DrivesTheTreesTarotCollectionAndZukan()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(T0), 2UL);
            s.Debug.GrantCurrency("mana_crystal", 100); s.Debug.GrantCurrency("wine", 1000); s.Debug.GrantCurrency("collection_medal", 500);
            s.DrainEvents();
            Assert.IsTrue(s.LevelUpTreeNode("leader", "leader_atk").Success);
            Assert.AreEqual(1, s.State.TreeNodeLv("leader", "leader_atk"));
            Assert.IsTrue(s.State.IsTreeNodeUnlocked("leader", "leader_atk"));
            Assert.AreEqual("Locked", s.LevelUpTreeNode("leader", "leader_critDefensePct").Failure);
            Assert.IsTrue(s.SetTarot(0, "hp", "SR").Success);
            Assert.AreEqual(("hp", "SR"), s.State.TarotAt(0));
            Assert.IsNull(s.State.TarotAt(5).Effect);
            Assert.IsNull(s.State.TarotAt(99).Effect);
            Assert.AreEqual("InvalidChoice", s.SetTarot(0, "nope", "SR").Failure);
            Assert.IsTrue(s.ClearTarot(0).Success);
            Assert.AreEqual("InvalidChoice", s.ClearTarot(99).Failure);
            Assert.IsTrue(s.RaiseCollectionSet("silver").Success);
            Assert.AreEqual(1, s.State.CollectionStar("silver"));
            Assert.AreEqual("Unknown", s.RaiseCollectionSet("nope").Failure);
            s.Debug.GrantCharacter("chr_001"); s.Debug.SetLevel("chr_001", 3);
            Assert.IsTrue(s.SyncZukan(out int none).Success);
            Assert.AreEqual(0, none);
            s.Debug.SetStar("chr_001", 1);
            Assert.IsTrue(s.SyncZukan(out int one).Success);
            Assert.AreEqual(1, one);
            Assert.IsTrue(s.State.ZukanAchieved("chr_001.star1"));
            Assert.AreEqual(70, s.State.Balance("gem"));
            IReadOnlyList<GameEvent> evs = s.DrainEvents();
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.TreeNodeLevelUp));
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.TarotChanged && x.Detail == "SR"));
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.CollectionStarUp));
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.ZukanAchieved));
        }

        [Test]
        public void State_NextNodeHelpers_FollowTheUnlockOrder()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(T0), 2UL);
            Assert.AreEqual("leader_atk", s.State.NextTreeNode("leader"));
            Assert.AreEqual("lab_atk_01", s.State.NextTreeNode("lab"));
            Assert.IsNull(s.State.NextTreeNode("nope"));
            Assert.AreEqual("valor.1.t1.atk", s.State.NextDragonNode(Element.Valor));
            s.Debug.SetDevMode(true);
            for (int i = 0; i < 20; i++) { Assert.IsTrue(s.LevelUpDragonNode("valor.1.t1.atk").Success); }
            Assert.AreEqual("valor.1.t1.hp", s.State.NextDragonNode(Element.Valor));       // 満タンの次のノードへ
            Assert.AreEqual("skill.1.t1.atk", s.State.NextDragonNode(Element.Skill));      // 別の属性は別
            for (int i = 0; i < 20; i++) { s.LevelUpTreeNode("leader", "leader_atk"); }
            Assert.AreEqual("leader_hp", s.State.NextTreeNode("leader"));
        }
    }
}
