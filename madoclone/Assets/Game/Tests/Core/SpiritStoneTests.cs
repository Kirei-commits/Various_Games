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
    /// <summary>霊石版：メイン効果・隠し能力・セット効果・ドロップ・分解・レベル上げ・セーブ。</summary>
    public class SpiritStoneTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 3UL);
            public Wallet.Wallet Wallet;
            public SpiritStoneService Stones;
            public bool Dev;

            public Env(double sand = 0)
            {
                var state = new WalletState();
                state.Balances["star_sand"] = sand;
                Wallet = new Wallet.Wallet(Data.Currencies, state, () => Dev);
                Stones = new SpiritStoneService(Data, Save, Wallet);
            }

            public List<Modifier> Mods()
            {
                var sink = new List<Modifier>();
                new SpiritStoneSource(Data, Save, Stones).Collect(sink, default(StatQuery));
                return sink;
            }
        }

        private static double Sum(List<Modifier> l, StatId st, ModifierPool p) { return l.Where(m => m.Stat == st && m.Pool == p).Sum(m => m.Value); }

        [Test]
        public void MainEffect_FollowsTheRarityAndTheSlot()
        {
            var e = new Env();
            StoneState pink = e.Stones.Add("pink", "leo", 20);
            StoneState red = e.Stones.Add("red", "leo", 10);
            Assert.AreEqual(2000.0, e.Stones.MainPct(pink));                 // 実測：ピンク Lv20 で +2,000％
            Assert.AreEqual(100.0, e.Stones.MainPct(e.Stones.Add("pink", "leo", 1)));   // ピンク Lv1 で +100％
            Assert.AreEqual(500.0, e.Stones.MainPct(red));                   // 実測：赤 Lv10 で +500％
            e.Stones.Equip(0, 0, pink.Id);                                   // 1番＝攻撃
            e.Stones.Equip(0, 1, red.Id);                                    // 2番＝HP
            List<Modifier> mods = e.Mods();
            Assert.AreEqual(2000.0, Sum(mods, StatId.Atk, ModifierPool.Global));
            Assert.AreEqual(500.0, Sum(mods, StatId.Hp, ModifierPool.Global));
            Assert.AreEqual(0.0, Sum(mods, StatId.Def, ModifierPool.Global));
        }

        [Test]
        public void SlotsDecideTheMainStat_OneAndSixAtk_TwoAndFiveHp_ThreeAndFourDef()
        {
            var e = new Env();
            for (int slot = 0; slot < 6; slot++) { e.Stones.Equip(0, slot, e.Stones.Add("blue", "leo", 1).Id); }
            List<Modifier> mods = e.Mods();
            Assert.AreEqual(16.0, Sum(mods, StatId.Atk, ModifierPool.Global));   // 8 × 2枚
            Assert.AreEqual(16.0, Sum(mods, StatId.Hp, ModifierPool.Global));
            Assert.AreEqual(16.0, Sum(mods, StatId.Def, ModifierPool.Global));
        }

        [Test]
        public void AllPinkLv20_ReachTheBudgetOf24000PerStat()
        {
            var e = new Env();
            for (int page = 0; page < e.Stones.PageCount; page++)
            {
                for (int slot = 0; slot < e.Stones.SlotsPerPage; slot++) { e.Stones.Equip(page, slot, e.Stones.Add("pink", "leo", 20).Id); }
            }
            List<Modifier> mods = e.Mods();
            Assert.AreEqual(24000.0, Sum(mods, StatId.Atk, ModifierPool.Global), 1e-6);   // 6.4節：霊石版 +24,000％
            Assert.AreEqual(24000.0, Sum(mods, StatId.Hp, ModifierPool.Global), 1e-6);
            Assert.AreEqual(24000.0, Sum(mods, StatId.Def, ModifierPool.Global), 1e-6);
        }

        [Test]
        public void HiddenAbilities_AppearAtLv5_10_15_20_AndGrowAfterwards()
        {
            var e = new Env();
            StoneState st = e.Stones.Add("red", "leo", 4);
            e.Stones.Equip(0, 0, st.Id);
            Assert.AreEqual(0.0, Sum(e.Mods(), StatId.Evasion, ModifierPool.Flat));
            st.Lv = 5;
            Assert.AreEqual(0.5, Sum(e.Mods(), StatId.Evasion, ModifierPool.Flat), 1e-9);      // Lv5 で回避が現れる（赤の1段 0.5）
            st.Lv = 9;
            Assert.AreEqual(2.5, Sum(e.Mods(), StatId.Evasion, ModifierPool.Flat), 1e-9);      // その後 1Lv ごとに伸びる
            Assert.AreEqual(0.0, Sum(e.Mods(), StatId.CritRate, ModifierPool.Flat));
            st.Lv = 10;
            Assert.AreEqual(0.5, Sum(e.Mods(), StatId.CritRate, ModifierPool.Flat), 1e-9);     // Lv10 でクリティカル率
            st.Lv = 15;
            Assert.AreEqual(0.5, Sum(e.Mods(), StatId.Accuracy, ModifierPool.Flat), 1e-9);     // Lv15 で命中
            st.Lv = 20;
            Assert.AreEqual(0.5, Sum(e.Mods(), StatId.CritResist, ModifierPool.Flat), 1e-9);   // Lv20 でクリティカル耐性
            Assert.AreEqual(0.5 * 16, Sum(e.Mods(), StatId.Evasion, ModifierPool.Flat), 1e-9);
        }

        [Test]
        public void SetEffects_NeedTwoOrFourOfTheSameConstellationOnAPage()
        {
            var e = new Env();
            double Leo() { return Sum(e.Mods(), StatId.CritRate, ModifierPool.Flat); }
            e.Stones.Equip(0, 0, e.Stones.Add("blue", "leo").Id);
            Assert.AreEqual(0.0, Leo());
            e.Stones.Equip(0, 1, e.Stones.Add("blue", "leo").Id);
            Assert.AreEqual(2.0, Leo());                                           // 2セット：クリティカル率 +2
            e.Stones.Equip(0, 2, e.Stones.Add("blue", "leo").Id);
            Assert.AreEqual(2.0, Leo());
            e.Stones.Equip(0, 3, e.Stones.Add("blue", "leo").Id);
            Assert.AreEqual(5.0, Leo());                                           // 4セット：+5（2セットとの重ね掛けではない）
            e.Stones.Equip(1, 0, e.Stones.Add("blue", "leo").Id);                  // 別のページは別に数える
            Assert.AreEqual(5.0, Leo());
            e.Stones.Equip(0, 4, e.Stones.Add("blue", "virgo").Id);
            e.Stones.Equip(0, 5, e.Stones.Add("blue", "virgo").Id);
            Assert.AreEqual(2.0, Sum(e.Mods(), StatId.Evasion, ModifierPool.Flat));  // 処女宮の2セット：回避 +2
        }

        [Test]
        public void Equip_MovesAStoneBetweenSlots_AndRejectsBadInput()
        {
            var e = new Env();
            StoneState s = e.Stones.Add("blue", "leo");
            Assert.AreEqual(StoneFailure.None, e.Stones.Equip(0, 0, s.Id));
            Assert.AreEqual(StoneFailure.None, e.Stones.Equip(2, 3, s.Id));
            Assert.IsNull(e.Save.SpiritStones.Equipped[e.Stones.Slot(0, 0)]);
            Assert.AreEqual(s.Id, e.Save.SpiritStones.Equipped[e.Stones.Slot(2, 3)]);
            Assert.IsTrue(e.Stones.IsEquipped(s.Id));
            Assert.AreEqual(StoneFailure.UnknownStone, e.Stones.Equip(0, 0, "nope"));
            Assert.AreEqual(StoneFailure.WrongSlot, e.Stones.Equip(6, 0, s.Id));
            Assert.AreEqual(StoneFailure.WrongSlot, e.Stones.Equip(0, 6, s.Id));
            Assert.AreEqual(StoneFailure.WrongSlot, e.Stones.Equip(-1, 0, s.Id));
            Assert.AreEqual(StoneFailure.None, e.Stones.Unequip(2, 3));
            Assert.AreEqual(StoneFailure.WrongSlot, e.Stones.Unequip(9, 0));
            Assert.IsFalse(e.Stones.IsEquipped(s.Id));
        }

        [Test]
        public void LevelUp_PaysStarSand_AndStopsAtTheMax()
        {
            var e = new Env(sand: 10000);
            StoneState s = e.Stones.Add("purple", "leo", 1);
            double cost = e.Stones.LevelCost(s);
            Assert.AreEqual(50.0 * 2 * 1, cost);                                   // levelCostBase × (レアの順番＋1) × Lv
            Assert.AreEqual(StoneFailure.None, e.Stones.LevelUp(s.Id));
            Assert.AreEqual(2, s.Lv);
            Assert.AreEqual(10000 - cost, e.Wallet.Balance("star_sand"));
            Assert.AreEqual(StoneFailure.UnknownStone, e.Stones.LevelUp("nope"));
            var poor = new Env(sand: 1);
            Assert.AreEqual(StoneFailure.NotEnough, poor.Stones.LevelUp(poor.Stones.Add("blue", "leo").Id));
            StoneState max = e.Stones.Add("blue", "leo", 20);
            Assert.AreEqual(StoneFailure.AtMaxLv, e.Stones.LevelUp(max.Id));
            Assert.Throws<ArgumentException>(() => e.Stones.LevelCost(max));
        }

        [Test]
        public void Dismantle_GivesStarSand_ButNotForEquippedStones()
        {
            var e = new Env();
            StoneState a = e.Stones.Add("orange", "leo", 5), b = e.Stones.Add("blue", "leo", 1);
            e.Stones.Equip(0, 0, b.Id);
            Assert.AreEqual(StoneFailure.Equipped, e.Stones.Dismantle(b.Id, out _));
            Assert.AreEqual(StoneFailure.None, e.Stones.Dismantle(a.Id, out double sand));
            Assert.AreEqual(80.0 * 6, sand);                                       // sandBase × (Lv＋1)
            Assert.AreEqual(sand, e.Wallet.Balance("star_sand"));
            Assert.AreEqual(1, e.Stones.Count);
            Assert.AreEqual(StoneFailure.UnknownStone, e.Stones.Dismantle("nope", out _));
        }

        [Test]
        public void DismantleUpTo_TakesEverythingAtOrBelowTheRarity_ExceptEquipped()
        {
            var e = new Env();
            e.Stones.Add("blue", "leo"); e.Stones.Add("purple", "leo"); e.Stones.Add("yellow", "leo"); e.Stones.Add("red", "leo");
            StoneState keep = e.Stones.Add("blue", "virgo");
            e.Stones.Equip(0, 0, keep.Id);
            int n = e.Stones.DismantleUpTo(e.Stones.RarityIndex("yellow"), out double sand);
            Assert.AreEqual(3, n);                                                  // 青・紫・黄（はめた青は除く）
            Assert.AreEqual(2, e.Stones.Count);
            Assert.AreEqual(10.0 * 2 + 20.0 * 2 + 40.0 * 2, sand);
        }

        [Test]
        public void Drop_FollowsTheMeasuredRates_AndStaysWithinTheCapacity()
        {
            var e = new Env();
            var counts = new Dictionary<string, int>();
            const int n = 2000;                                                     // 持てる枚数（500）を超えないよう、20枚ずつ引いては空にする
            int total = 0;
            for (int round = 0; round < n / 20; round++)
            {
                foreach (StoneState s in e.Stones.Drop(20, out _)) { counts[s.Rarity] = counts.TryGetValue(s.Rarity, out int c) ? c + 1 : 1; total++; }
                e.Stones.DismantleUpTo(5, out _);                                   // 持ち物を空にして続ける
            }
            Assert.AreEqual(n, total);
            Assert.AreEqual(32.52, 100.0 * counts["blue"] / total, 3.0);
            Assert.AreEqual(35.0, 100.0 * counts["purple"] / total, 3.0);
            Assert.AreEqual(18.0, 100.0 * counts["yellow"] / total, 3.0);
            Assert.Less(100.0 * counts.GetValueOrDefault("pink") / total, 2.0);
        }

        [Test]
        public void Drop_PastTheCapacity_TurnsTheRestIntoStarSand()
        {
            var e = new Env();
            for (int i = 0; i < 499; i++) { e.Stones.Add("blue", "leo"); }
            List<StoneState> got = e.Stones.Drop(10, out double auto);
            Assert.AreEqual(1, got.Count);
            Assert.AreEqual(500, e.Stones.Count);
            Assert.Greater(auto, 0);
            Assert.AreEqual(auto, e.Wallet.Balance("star_sand"), 1e-9);
            Assert.IsNull(e.Stones.Add("blue", "leo"));                              // いっぱい
        }

        [Test]
        public void Drop_IsDeterministicForTheSameSeed()
        {
            var a = new Env(); var b = new Env();
            var x = a.Stones.Drop(24, out _); var y = b.Stones.Drop(24, out _);
            CollectionAssert.AreEqual(x.Select(s => s.Rarity + s.Constellation), y.Select(s => s.Rarity + s.Constellation));
            CollectionAssert.AreEqual(a.Save.Rng.Gacha, b.Save.Rng.Gacha);
        }

        [Test]
        public void Save_RoundTrips_IsValidated_AndRepaired()
        {
            var e = new Env();
            StoneState s = e.Stones.Add("pink", "aries", 7);
            e.Stones.Equip(1, 2, s.Id);
            byte[] bytes = SaveCodec.Serialize(e.Save);
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(7, r.Save.SpiritStones.Stones[0].Lv);
            Assert.AreEqual(s.Id, r.Save.SpiritStones.Equipped[1 * 6 + 2]);
            CollectionAssert.AreEqual(bytes, SaveCodec.Serialize(r.Save));
            Assert.IsEmpty(SaveValidator.Validate(r.Save, Data));

            SaveData bad = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            var ok = new StoneState { Id = "st_00001", Rarity = "blue", Constellation = "leo", Lv = 1 };
            bad.SpiritStones.Stones.Add(ok);
            bad.SpiritStones.Stones.Add(new StoneState { Id = "st_00001", Rarity = "zz", Constellation = "leo", Lv = 1 });
            bad.SpiritStones.Stones.Add(new StoneState { Id = "st_00005", Rarity = "blue", Constellation = "zz", Lv = 99 });
            bad.SpiritStones.NextNumber = 1;
            bad.SpiritStones.Equipped = new string[36];
            bad.SpiritStones.Equipped[0] = "ghost";
            bad.SpiritStones.Equipped[1] = "st_00001"; bad.SpiritStones.Equipped[2] = "st_00001";
            var codes = SaveValidator.Validate(bad, Data).Select(i => i.Code).ToList();
            foreach (string code in new[] { "STONE_ID", "STONE_RARITY", "STONE_CONSTELLATION", "STONE_LV", "STONE_EQUIP_UNKNOWN", "STONE_EQUIP_DUP" }) { CollectionAssert.Contains(codes, code); }
            SaveRepair.Repair(bad, Data);
            Assert.IsEmpty(SaveValidator.Validate(bad, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());
            Assert.AreEqual(1, bad.SpiritStones.Stones.Count);
            Assert.AreEqual("st_00001", bad.SpiritStones.Equipped[1]);
            Assert.IsNull(bad.SpiritStones.Equipped[2]);
            Assert.IsEmpty(SaveRepair.Repair(bad, Data));
            bad.SpiritStones.Equipped = new string[3];
            bad.SpiritStones.NextNumber = 0;
            SaveRepair.Repair(bad, Data);
            Assert.AreEqual(36, bad.SpiritStones.Equipped.Length);

            string broken = System.Text.Encoding.UTF8.GetString(bytes).Replace("\"lv\":7", "\"lv\":\"x\"");
            Assert.IsFalse(SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(broken), Data).Success);
        }

        [Test]
        public void Session_TheSpiritKingTrial_DropsStones_AndTheStatsFollow()
        {
            var boost = new BoostAll();
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 9UL, new IModifierSource[] { boost });
            s.Debug.GrantCharacter("chr_001");
            s.Debug.SetParty(new[] { "chr_001" });
            TrialResult r = s.ChallengeTrial("spirit_king");
            Assert.IsTrue(r.Cleared);
            Assert.AreEqual(Data.SpiritStones.DropsPerClear, s.State.StoneCount);
            Assert.IsTrue(s.DrainEvents().Any(x => x.Kind == GameEventKind.StonesDropped && x.Value == 24));
            StoneView first = s.State.Stones[0];
            Assert.IsFalse(first.Equipped);
            Assert.IsTrue(s.EquipStone(0, 0, first.Id).Success);
            Assert.AreEqual(first.Id, s.State.StoneAt(0, 0));
            Assert.IsTrue(s.State.Stones.First(v => v.Id == first.Id).Equipped);
            Assert.AreEqual("Equipped", s.DismantleStone(first.Id).Failure);
            Assert.IsTrue(s.UnequipStone(0, 0).Success);
            Assert.IsTrue(s.DismantleStone(first.Id).Success);
            Assert.AreEqual("NotEnough", s.LevelUpStone(s.State.Stones[0].Id).Failure);
            Assert.AreEqual("UnknownStone", s.LevelUpStone("nope").Failure);
            Assert.IsTrue(s.DismantleStonesUpTo(Data.SpiritStones.Rarities.Count - 1, out int n).Success);
            Assert.AreEqual(Data.SpiritStones.DropsPerClear - 1, n);
            Assert.AreEqual("InvalidRarity", s.DismantleStonesUpTo(99, out _).Failure);
            Assert.AreEqual("InvalidStone", s.Debug.GrantStone("zz", "leo", 1).Failure);
            Assert.IsTrue(s.Debug.GrantStone("pink", "leo", 20).Success);
            Assert.IsTrue(s.EquipStone(0, 0, s.State.Stones.Last().Id).Success);
            Assert.AreEqual("UnknownStone", s.EquipStone(0, 0, "nope").Failure);
            Assert.AreEqual("WrongSlot", s.UnequipStone(9, 9).Failure);
        }

        private sealed class BoostAll : IModifierSource
        {
            public void Collect(List<Modifier> sink, StatQuery q)
            {
                foreach (StatId st in new[] { StatId.Atk, StatId.Hp, StatId.Def }) { sink.Add(new Modifier(st, ModifierPool.Global, 1e12)); }
            }
        }
    }
}
