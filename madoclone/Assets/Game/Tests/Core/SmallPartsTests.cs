using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>小さな部品の、誤った使い方と境目（カバレッジで空いていた所）。</summary>
    public class SmallPartsTests
    {
        private static GameData Data { get { return TestData.Data; } }

        // ---------------- ProfilePartyFactory・BattleSetupBuilder ----------------

        private static SimProfileDef Profile(int star, double multiplier, params string[] ids)
        {
            return new SimProfileDef
            {
                Rank = 5, Star = star, Lv = 1, PartyCharacterIds = ids,
                GlobalMultiplier = new GlobalMultiplier { Atk = multiplier, Hp = multiplier, Def = multiplier },
            };
        }

        [Test]
        public void ProfileParty_LastUnitIsLeader_OnlyWhenThePartyExceedsTheSlots()
        {
            var f = new ProfilePartyFactory(Data, null);
            List<UnitSetup> small = f.Build(Profile(0, 1, "chr_101", "chr_102", "chr_103"));
            Assert.IsFalse(small.Exists(u => u.IsLeader));
            List<UnitSetup> full = f.Build(Profile(0, 1, "chr_101", "chr_102", "chr_103", "chr_104", "chr_105", "chr_001", "chr_002"));
            Assert.AreEqual(Data.System.PartySlots + 1, full.Count);
            Assert.IsTrue(full[full.Count - 1].IsLeader);
            Assert.AreEqual(1, full.FindAll(u => u.IsLeader).Count);
        }

        [Test]
        public void ProfileParty_PowerScalesWithTheMultiplierAndTheRatio()
        {
            var f = new ProfilePartyFactory(Data, null);
            double p1 = f.Power(Profile(0, 1, "chr_101", "chr_102"));
            Assert.AreEqual(p1 * 10, f.Power(Profile(0, 10, "chr_101", "chr_102")), p1 * 1e-9);
            Assert.AreEqual(p1 * 7, f.Power(Profile(0, 10, "chr_101", "chr_102"), 0.7), p1 * 1e-9);
            Assert.Throws<ArgumentNullException>(() => f.Build(null));
        }

        [Test]
        public void ProfileParty_AddsCrystals_FromStarSix()
        {
            var f = new ProfilePartyFactory(Data, null);
            Assert.AreEqual(0, f.Build(Profile(5, 1, "chr_101"))[0].Crystals.Count);
            Assert.AreEqual(1, f.Build(Profile(6, 1, "chr_101"))[0].Crystals.Count);
        }

        [Test]
        public void OwnCrystalLoadout_IsNullBelowTheUnlockStar_AndPutsTheOwnCrystalInItsSlot()
        {
            var b = new BattleSetupBuilder(Data, new StatResolver(Data));
            int star = Data.System.CrystalSlotStars[CharacterState.OwnCrystalSlot];
            Assert.IsNull(b.OwnCrystalLoadout("chr_001", star - 1));
            IReadOnlyList<string> loadout = b.OwnCrystalLoadout("chr_001", star);
            Assert.AreEqual(CharacterState.CrystalSlots, loadout.Count);
            for (int i = 0; i < loadout.Count; i++)
            {
                Assert.AreEqual(i == CharacterState.OwnCrystalSlot ? "cry_chr_001" : null, loadout[i]);
            }
        }

        [Test]
        public void BuildParty_FallsBackToDefault_AndRejectsAMissingParty()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            save.Characters["chr_101"] = new CharacterState();
            var b = new BattleSetupBuilder(Data, new StatResolver(Data));
            Assert.Throws<ArgumentException>(() => b.BuildParty(save, "pvp"));
            save.Parties["default"] = new PartyState { Slots = new[] { "chr_101", null, null, null, null, null } };
            Assert.AreEqual(1, b.BuildParty(save, "pvp").Count);   // 無いキーは default を使う
        }

        [Test]
        public void Constructors_RejectNulls()
        {
            Assert.Throws<ArgumentNullException>(() => new BattleSetupBuilder(null, new StatResolver(Data)));
            Assert.Throws<ArgumentNullException>(() => new BattleSetupBuilder(Data, null));
            Assert.Throws<ArgumentNullException>(() => new StageFactory(null));
            Assert.Throws<ArgumentNullException>(() => new StatResolver(null));
            Assert.Throws<ArgumentNullException>(() => new SkillResolver(null, new BuffBook(Data)));
            Assert.Throws<ArgumentNullException>(() => new SkillResolver(Data, null));
            Assert.Throws<ArgumentNullException>(() => new ProfilePartyFactory(null, null));
            Assert.Throws<ArgumentNullException>(() => new CrystalService(null, SaveData.CreateNew(1, "", 1)));
            Assert.Throws<ArgumentNullException>(() => new CrystalService(Data, null));
            Assert.Throws<ArgumentNullException>(() => new SaveMigrator(1, null));
            Assert.Throws<ArgumentNullException>(() => new Wallet.Wallet(null, null, null));
        }

        // ---------------- 敵の生成 ----------------

        [Test]
        public void StageFactory_Growth_InterpolatesLinearly_AndRejectsOutOfRange()
        {
            var f = new StageFactory(Data);
            Assert.AreEqual(3.0, f.Growth(1), 1e-12);
            Assert.AreEqual(1.68, f.Growth(15), 1e-12);
            Assert.AreEqual(1.30, f.Growth(32), 1e-12);
            Assert.AreEqual(1.68 + (1.30 - 1.68) * (20 - 15) / 17.0, f.Growth(20), 1e-12);   // 15〜32 を直線でつなぐ
            Assert.Greater(f.Growth(20), f.Growth(21));
            Assert.Throws<ArgumentException>(() => f.Growth(0));
            Assert.Throws<ArgumentException>(() => f.Growth(33));
        }

        [Test]
        public void StageFactory_EnemyScale_MultipliesHpAndAttackOnly()
        {
            var f = new StageFactory(Data);
            List<UnitSetup> plain = f.BuildWithPower(3, 1e6, StageKind.Boss, 1, 1);
            List<UnitSetup> scaled = f.BuildWithPower(3, 1e6, StageKind.Boss, 4, 0.5);
            for (int i = 0; i < plain.Count; i++)
            {
                Assert.AreEqual(plain[i].Stats.Hp * 4, scaled[i].Stats.Hp, 1e-6);
                Assert.AreEqual(plain[i].Stats.Atk * 0.5, scaled[i].Stats.Atk, 1e-6);
                Assert.AreEqual(plain[i].Stats.Def, scaled[i].Stats.Def, 1e-9);
            }
        }

        [Test]
        public void StageFactory_Build_UsesTheSavedEnemyScale_AndTimeLimitsFollowTheKind()
        {
            var f = new StageFactory(Data);
            EnemyScaleRow row = Data.Difficulty.EnemyScale[4];
            double total = f.RecommendedPower(5, 1, 1) * Data.Difficulty.WavePowerRatio;
            List<UnitSetup> viaBuild = f.Build(5, 1, 1, StageKind.Wave);
            List<UnitSetup> direct = f.BuildWithPower(5, total, StageKind.Wave, row.Hp, row.Atk);
            Assert.AreEqual(direct[0].Stats.Hp, viaBuild[0].Stats.Hp, direct[0].Stats.Hp * 1e-12);
            Assert.AreEqual(Data.System.TimeLimitSec.Boss, f.TimeLimitSec(StageKind.Boss));
            Assert.AreEqual(Data.System.TimeLimitSec.Stage, f.TimeLimitSec(StageKind.Wave));
        }

        // ---------------- 魔晶・所持キャラ ----------------

        [Test]
        public void OnStarChanged_ThrowsOnBrokenState_InsteadOfSilentlyContinuing()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            var crystals = new CrystalService(Data, save);
            Assert.Throws<InvalidOperationException>(() => crystals.OnStarChanged("chr_001", 5, 6));   // 未所持

            save.Characters["chr_001"] = new CharacterState { Star = 5 };
            save.Characters["chr_001"].Crystals[CharacterState.OwnCrystalSlot] = "cry_chr_002";      // 開く前の枠に何かある
            Assert.Throws<InvalidOperationException>(() => crystals.OnStarChanged("chr_001", 5, 6));

            save.Characters["chr_001"].Crystals[CharacterState.OwnCrystalSlot] = null;
            save.Characters["chr_002"] = new CharacterState { Star = 8 };
            save.Characters["chr_002"].Crystals[0] = "cry_chr_001";                                   // 固有魔晶が既にどこかにある
            Assert.Throws<InvalidOperationException>(() => crystals.OnStarChanged("chr_001", 5, 6));

            crystals.OnStarChanged("chr_001", 6, 7);   // 6 を跨がないなら何もしない
            Assert.IsNull(save.Characters["chr_001"].Crystals[CharacterState.OwnCrystalSlot]);
        }

        [Test]
        public void CrystalService_Queries_HandleUnknownIds()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            var crystals = new CrystalService(Data, save);
            Assert.IsFalse(crystals.TryFind(null, out _));
            Assert.IsFalse(crystals.IsSlotUnlocked("chr_999", 0));
            Assert.IsFalse(crystals.IsSlotUnlocked(null, 0));
            Assert.IsFalse(crystals.IsSlotUnlocked("chr_001", -1));
            Assert.AreEqual(CharacterState.CrystalSlots, crystals.Equipped("chr_999").Count);
            Assert.AreEqual(MoveFailure.UnknownCrystal, crystals.Move(null, "chr_001", 0).Failure);
            Assert.AreEqual(MoveFailure.CrystalNotObtained, crystals.Move("cry_chr_001", null, 0).Failure);
        }

        [Test]
        public void Roster_NullIds_AreRejected()
        {
            var save = SaveData.CreateNew(1, "", 1UL);
            var roster = new RosterService(Data, save, new CrystalService(Data, save));
            Assert.IsFalse(roster.TryGrant(null));
            Assert.IsFalse(roster.TrySetStar(null, 1));
            Assert.IsFalse(roster.TrySetLevel(null, 1));
            Assert.IsFalse(roster.TrySetLevel("chr_001", 1));   // 未所持
            Assert.Throws<ArgumentNullException>(() => new RosterService(Data, save, null));
        }

        // ---------------- Wallet ----------------

        [Test]
        public void Wallet_RejectsBrokenSavedState_AndUnknownCurrencies()
        {
            IReadOnlyList<CurrencyDef> cur = Data.Currencies;
            var negative = new WalletState(); negative.Balances["gem"] = -1;
            Assert.Throws<ArgumentException>(() => new Wallet.Wallet(cur, negative, null));
            var nan = new WalletState(); nan.Carry["gacha_ticket"] = double.NaN;
            Assert.Throws<ArgumentException>(() => new Wallet.Wallet(cur, nan, null));
            var unknown = new WalletState(); unknown.Balances["nope"] = 1;
            Assert.Throws<ArgumentException>(() => new Wallet.Wallet(cur, unknown, null));
        }

        [Test]
        public void Wallet_NullStateAndNullDevMode_MeanEmptyAndOff()
        {
            var w = new Wallet.Wallet(Data.Currencies, null, null);
            Assert.AreEqual(0, w.Balance("gem"));
            Assert.IsFalse(w.Pay(new Cost("gem", 1), new PayReason("t")).Success);
            Assert.Throws<ArgumentNullException>(() => w.Pay(null, new PayReason("t")));
            Assert.Throws<ArgumentNullException>(() => w.Grant(null, new GrantReason("t")));
            Assert.Throws<ArgumentNullException>(() => new PayReason(null));
            Assert.Throws<ArgumentNullException>(() => new GrantReason(null));
            Assert.Throws<ArgumentNullException>(() => new Money(null, 1));
            Assert.Throws<ArgumentNullException>(() => new Cost(null));
        }

        [Test]
        public void Wallet_CarryIsRestoredFromState_AndFractionOnlyGrantEmitsNoEvent()
        {
            var state = new WalletState();
            state.Carry["gacha_ticket"] = 0.9;
            var w = new Wallet.Wallet(Data.Currencies, state, null);
            w.Grant(new Reward("gacha_ticket", 0.05), new GrantReason("t"));   // 0.95：まだ1枚にならない
            Assert.AreEqual(0, w.Balance("gacha_ticket"));
            Assert.AreEqual(0, w.DrainEvents().Count);
            w.Grant(new Reward("gacha_ticket", 0.05), new GrantReason("t"));   // 1.00：1枚になる（誤差で 0.9999… にならない）
            Assert.AreEqual(1, w.Balance("gacha_ticket"));
            Assert.AreEqual(0, w.ExportState().Carry["gacha_ticket"], 1e-12);
            Assert.AreEqual(1, w.DrainEvents().Count);
        }

        [Test]
        public void Wallet_IntegerCurrency_ManySmallGrants_LoseNothing()
        {
            var w = new Wallet.Wallet(Data.Currencies, null, null);
            for (int i = 0; i < 1000; i++) { w.Grant(new Reward("gacha_ticket", 0.1), new GrantReason("t")); }
            Assert.AreEqual(100, w.Balance("gacha_ticket"));
            Assert.AreEqual(0, w.ExportState().Carry["gacha_ticket"], 1e-6);
        }

        // ---------------- 乱数・セーブ ----------------

        [Test]
        public void Rng_ArgumentChecks_AndRanges()
        {
            Rng r = Rng.Create(1, RngStream.Misc);
            Assert.Throws<ArgumentOutOfRangeException>(() => r.NextInt(0));
            Assert.Throws<ArgumentOutOfRangeException>(() => r.NextInt(5, 5));
            Assert.Throws<ArgumentOutOfRangeException>(() => r.NextInt(int.MinValue, int.MaxValue));
            for (int i = 0; i < 1000; i++)
            {
                Assert.That(r.NextInt(-3, 4), Is.InRange(-3, 3));
                Assert.That(r.NextDouble(), Is.InRange(0.0, 1.0).And.LessThan(1.0));
            }
            Assert.IsFalse(r.Chance(0));
            Assert.IsTrue(r.Chance(100));
            Assert.Throws<ArgumentException>(() => Rng.FromState(null));
        }

        [Test]
        public void Rng_Streams_AreIndependent()
        {
            Assert.AreNotEqual(Rng.Create(1, RngStream.Battle).NextUInt(), Rng.Create(1, RngStream.Gacha).NextUInt());
            Assert.AreEqual(Rng.Create(1, RngStream.Battle).NextUInt(), Rng.Create(1, RngStream.Battle).NextUInt());
        }

        [Test]
        public void SaveMigrator_RejectsVersionBelowOne_AndAStepReturningNull()
        {
            var m = new SaveMigrator(2, new Dictionary<int, Func<JObject, JObject>> { [1] = o => null });
            Assert.IsNull(m.Migrate(new JObject(), 0, out string e0));
            StringAssert.Contains("1 未満", e0);
            Assert.IsNull(m.Migrate(new JObject(), 1, out string e1));
            StringAssert.Contains("null", e1);
            Assert.AreEqual(2, m.CurrentVersion);
            Assert.AreEqual(SaveMigrator.LatestVersion, new SaveMigrator().CurrentVersion);
        }

        [Test]
        public void SaveMigrator_DoesNotModifyItsInput()
        {
            var m = new SaveMigrator(2, new Dictionary<int, Func<JObject, JObject>> { [1] = o => { o["added"] = 1; return o; } });
            var input = new JObject { ["saveVersion"] = 1 };
            JObject output = m.Migrate(input, 1, out _);
            Assert.IsNull(input["added"]);
            Assert.AreEqual(1, (int)input["saveVersion"]);
            Assert.AreEqual(2, (int)output["saveVersion"]);
        }

        [Test]
        public void SaveLoad_TypeErrorsInOptionalSections_FailCleanly()
        {
            SaveData s = SaveData.CreateNew(1, "", 1UL);
            string good = System.Text.Encoding.UTF8.GetString(SaveCodec.Serialize(s));
            Func<Action<JObject>, LoadResult> with = edit =>
            {
                JObject o = JObject.Parse(good);
                edit(o);
                return SaveCodec.LoadJson(o.ToString(), Data, new SaveMigrator());
            };
            Assert.IsTrue(with(o => { }).Success);
            Assert.IsFalse(with(o => o["wallet"] = 5).Success);                                   // オブジェクトのはずが数値
            Assert.IsFalse(with(o => o["wallet"]["gem"] = "many").Success);                       // 数値のはずが文字列
            Assert.IsFalse(with(o => o["wallet"]["gem"] = -5).Success);                           // 負の残高
            Assert.IsFalse(with(o => o["rng"]["gacha"] = new JArray(1, 2, 3)).Success);           // 長さ4でない
            Assert.IsFalse(with(o => o["rng"]["gacha"] = new JArray(1, 2, 3, -4)).Success);       // uint に入らない
            Assert.IsFalse(with(o => o["rng"]["misc"] = "x").Success);
            Assert.IsFalse(with(o => o["leader"] = 5).Success);
            Assert.IsFalse(with(o => o["devMode"] = "yes").Success);
            Assert.IsFalse(with(o => o["parties"] = new JObject { ["default"] = 1 }).Success);
            Assert.IsFalse(with(o => o["parties"] = new JObject { ["default"] = new JObject() }).Success);   // slots が無い
            Assert.IsFalse(with(o => o["parties"] = new JObject { ["default"] = new JObject { ["slots"] = new JArray(1) } }).Success);
            Assert.IsFalse(with(o => o["characters"] = new JObject { ["chr_001"] = 1 }).Success);
            Assert.IsFalse(with(o => o["characters"] = new JObject { ["chr_001"] = new JObject { ["lv"] = 1 } }).Success);   // star が無い
            Assert.IsFalse(with(o => o["metrics"] = new JObject { ["pull_done"] = "x" }).Success);
            Assert.IsFalse(with(o => o["saveVersion"] = "1").Success);
            // 省略できる節は、無くても読める（既定値になる）。
            LoadResult minimal = with(o => { o.Remove("rng"); o.Remove("progress"); o.Remove("settings"); o.Remove("metrics"); o.Remove("parties"); o.Remove("savedAtUtc"); });
            Assert.IsTrue(minimal.Success, minimal.FailureReason);
            Assert.AreEqual(1, minimal.Save.Progress.Rank);
            Assert.IsTrue(minimal.Save.Settings.SkipGachaAnim);
        }

        [Test]
        public void Import_AcceptsSurroundingWhitespace()
        {
            SaveData s = SaveData.CreateNew(1, "", 1UL);
            Assert.IsTrue(SaveCodec.Import("  \n" + SaveCodec.Export(s) + "\n ", Data).Success);
        }
    }
}
