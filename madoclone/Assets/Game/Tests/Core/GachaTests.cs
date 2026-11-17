using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>キャラガチャ：確率・解放ランク・ピックアップと天井・ステップ報酬・セーブ。</summary>
    public class GachaTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save;
            public Wallet.Wallet Wallet;
            public GachaService Gacha;
            public bool Dev;

            public Env(double tickets = 100000, double gem = 0, ulong seed = 11UL)
            {
                Save = SaveData.CreateNew(1, "", seed);
                var state = new WalletState();
                state.Balances["gacha_ticket"] = tickets;
                state.Balances["gem"] = gem;
                Wallet = new Wallet.Wallet(Data.Currencies, state, () => Dev);
                var crystals = new CrystalService(Data, Save);
                Gacha = new GachaService(Data, Save, Wallet, new RosterService(Data, Save, crystals));
            }
        }

        private static string TierOf(string id) { return EnumStringConverter.Text(Data.Character(id).Tier); }

        [Test]
        public void TierRates_FollowTheUserSpec_AtTheTopRank()
        {
            var e = new Env(tickets: 1e7);
            GachaResult r;
            Assert.AreEqual(GachaFailure.None, e.Gacha.Pull(GachaBanner.Normal, 20000, 32, out r));
            var counts = r.Drops.GroupBy(d => EnumStringConverter.Text(d.Tier)).ToDictionary(g => g.Key, g => 100.0 * g.Count() / r.Drops.Count);
            Assert.AreEqual(20.0, counts["so"], 1.5);
            Assert.AreEqual(25.0, counts["tou"], 1.5);
            Assert.AreEqual(25.0, counts["sai"], 1.5);
            Assert.AreEqual(20.0, counts["kou"], 1.5);
            Assert.AreEqual(5.0, counts["ten"], 1.0);
            Assert.AreEqual(5.0, counts["kyoku"], 1.0);
            Assert.IsFalse(counts.ContainsKey("lr"), "LRはガチャに出ない");
        }

        [Test]
        public void TiersNotYetUnlocked_NeverAppear_AndTheRestAreRenormalised()
        {
            var e = new Env(tickets: 1e6);
            GachaResult r;
            e.Gacha.Pull(GachaBanner.Normal, 5000, 1, out r);                       // ランク1：素と灯だけ（unlockRank 1）
            Assert.IsTrue(r.Drops.All(d => d.Tier == CharTier.So || d.Tier == CharTier.Tou));
            Assert.AreEqual(100.0 * 20 / 45, 100.0 * r.Drops.Count(d => d.Tier == CharTier.So) / r.Drops.Count, 2.5);
            var e2 = new Env(tickets: 1e6);
            e2.Gacha.Pull(GachaBanner.Normal, 5000, 9, out r);                      // ランク9：煌（ランク6）・彩（ランク3）まで。天（ランク10）・極は出ない
            Assert.IsTrue(r.Drops.All(d => d.Tier != CharTier.Ten && d.Tier != CharTier.Kyoku));
            Assert.IsTrue(r.Drops.Any(d => d.Tier == CharTier.Kou));
        }

        [Test]
        public void Pull_PaysTicketsAllOrNothing_AndFailuresChangeNothing()
        {
            var e = new Env(tickets: 5);
            uint[] rng = (uint[])e.Save.Rng.Gacha.Clone();
            GachaResult r;
            Assert.AreEqual(GachaFailure.NotEnough, e.Gacha.Pull(GachaBanner.Normal, 10, 32, out r));
            Assert.AreEqual(5, e.Wallet.Balance("gacha_ticket"));
            CollectionAssert.AreEqual(rng, e.Save.Rng.Gacha);
            Assert.IsEmpty(e.Save.Characters);
            Assert.AreEqual(0, e.Gacha.TotalPulls);
            Assert.AreEqual(GachaFailure.InvalidCount, e.Gacha.Pull(GachaBanner.Normal, 0, 32, out r));
            Assert.AreEqual(GachaFailure.None, e.Gacha.Pull(GachaBanner.Normal, 5, 32, out r));
            Assert.AreEqual(0, e.Wallet.Balance("gacha_ticket"));
            Assert.AreEqual(5, r.Drops.Count);
            Assert.AreEqual(5, e.Gacha.TotalPulls);
        }

        [Test]
        public void Duplicates_BecomeCopies_AndNewCharactersAreFlagged()
        {
            var e = new Env(tickets: 5000);
            GachaResult r;
            e.Gacha.Pull(GachaBanner.Normal, 3000, 1, out r);
            int fresh = r.Drops.Count(d => d.IsNew);
            Assert.AreEqual(e.Save.Characters.Count, fresh);                          // 新規の数＝持っているキャラの数
            Assert.LessOrEqual(fresh, Data.Characters.Count(c => c.Tier == CharTier.So || c.Tier == CharTier.Tou));
            Assert.AreEqual(3000 - fresh, e.Save.Characters.Values.Sum(c => c.Copies));   // 2枚目以降は Copies に数える
        }

        [Test]
        public void Pickup_HalfOfTheKyokuGoesToTheChosenCharacter()
        {
            var e = new Env(tickets: 1e7);
            string want = Data.Characters.First(c => c.Tier == CharTier.Kyoku).Id;
            Assert.AreEqual(GachaFailure.None, e.Gacha.SetPickup(want, 32));
            GachaResult r;
            e.Gacha.Pull(GachaBanner.Pickup, 40000, 32, out r);
            double chosen = 100.0 * r.Drops.Count(d => d.CharacterId == want && !d.FromPity) / r.Drops.Count;
            // 極の5％のうち半分（2.5％）＋残り半分を17体で分けた分（約0.15％）
            Assert.AreEqual(2.5 + 2.5 / 17, chosen, 0.35);
        }

        [Test]
        public void Pickup_IsGuaranteedAtThe100thPull_AndThePityResets()
        {
            var e = new Env(tickets: 1000);
            string want = Data.Characters.Last(c => c.Tier == CharTier.Kyoku).Id;
            e.Gacha.SetPickup(want, 32);
            Assert.AreEqual(100, e.Gacha.PityLeft);
            GachaResult r;
            int got = 0;
            for (int i = 0; i < 100 && got == 0; i++)
            {
                e.Gacha.Pull(GachaBanner.Pickup, 1, 32, out r);
                if (r.Drops[0].CharacterId == want) { got++; }
            }
            Assert.AreEqual(1, got, "100回以内に必ず当たる");
            Assert.AreEqual(100, e.Gacha.PityLeft, "当たったら天井は最初から");
            // 100回すべて外れる状況でなくても、天井の回で FromPity が立つこと：天井だけを確かめる別の席
            var f = new Env(tickets: 1000);
            f.Gacha.SetPickup(want, 32);
            f.Save.Gacha.PickupPity = 99;
            f.Gacha.Pull(GachaBanner.Pickup, 1, 32, out r);
            Assert.AreEqual(want, r.Drops[0].CharacterId);
            Assert.IsTrue(r.Drops[0].FromPity);
            Assert.AreEqual(0, f.Save.Gacha.PickupPity);
        }

        [Test]
        public void Pickup_RejectsBadChoices_AndNeedsAChoiceToPull()
        {
            var e = new Env();
            string lr = Data.Characters.First(c => c.Tier == CharTier.Lr).Id;
            string so = Data.Characters.First(c => c.Tier == CharTier.So).Id;
            string kyoku = Data.Characters.First(c => c.Tier == CharTier.Kyoku).Id;
            Assert.AreEqual(GachaFailure.InvalidPickup, e.Gacha.SetPickup(lr, 32));
            Assert.AreEqual(GachaFailure.InvalidPickup, e.Gacha.SetPickup(so, 32));          // 極でない
            Assert.AreEqual(GachaFailure.InvalidPickup, e.Gacha.SetPickup(kyoku, 5));        // まだ解放されていない（ランク16）
            Assert.AreEqual(GachaFailure.InvalidPickup, e.Gacha.SetPickup("nope", 32));
            GachaResult r;
            Assert.AreEqual(GachaFailure.InvalidPickup, e.Gacha.Pull(GachaBanner.Pickup, 1, 32, out r));
            e.Gacha.SetPickup(kyoku, 32);
            e.Save.Gacha.PickupPity = 30;
            e.Gacha.SetPickup(kyoku, 32);                                                    // 同じキャラを選び直しても天井は進んだまま
            Assert.AreEqual(30, e.Save.Gacha.PickupPity);
            e.Gacha.SetPickup(Data.Characters.Last(c => c.Tier == CharTier.Kyoku).Id, 32);   // 別のキャラなら天井は0に戻る
            Assert.AreEqual(0, e.Save.Gacha.PickupPity);
            Assert.AreEqual(GachaFailure.None, e.Gacha.SetPickup(null, 32));
            Assert.IsNull(e.Gacha.PickupId);
        }

        [Test]
        public void Steps_PayOnceEach_AtTheCumulativePulls()
        {
            var e = new Env(tickets: 5000);
            GachaResult r;
            e.Gacha.Pull(GachaBanner.Normal, 99, 1, out r);
            Assert.AreEqual(0, r.StepsClaimed);
            double before = e.Wallet.Balance("gacha_ticket");
            e.Gacha.Pull(GachaBanner.Normal, 1, 1, out r);                                   // 累計100回
            Assert.AreEqual(1, r.StepsClaimed);
            Assert.AreEqual(before - 1 + 10, e.Wallet.Balance("gacha_ticket"));
            e.Gacha.Pull(GachaBanner.Normal, 400, 1, out r);                                 // 累計500回：200・300・500 の3つ
            Assert.AreEqual(3, r.StepsClaimed);
            Assert.AreEqual(0, e.Gacha.ClaimSteps());                                        // 二重取りしない
            Assert.AreEqual(4, e.Save.Gacha.StepsClaimed);
        }

        [Test]
        public void BuyTickets_ConvertsGemAtThePrice()
        {
            var e = new Env(tickets: 0, gem: 1000);
            Assert.AreEqual(GachaFailure.None, e.Gacha.BuyTickets(3));
            Assert.AreEqual(3, e.Wallet.Balance("gacha_ticket"));
            Assert.AreEqual(100, e.Wallet.Balance("gem"));
            Assert.AreEqual(GachaFailure.NotEnough, e.Gacha.BuyTickets(1));
            Assert.AreEqual(GachaFailure.InvalidCount, e.Gacha.BuyTickets(0));
            Assert.AreEqual(3, e.Wallet.Balance("gacha_ticket"));
        }

        [Test]
        public void SameSeed_GivesTheSameDrops()
        {
            var a = new Env(seed: 5UL); var b = new Env(seed: 5UL);
            GachaResult x, y;
            a.Gacha.Pull(GachaBanner.Normal, 300, 32, out x); b.Gacha.Pull(GachaBanner.Normal, 300, 32, out y);
            CollectionAssert.AreEqual(x.Drops.Select(d => d.CharacterId), y.Drops.Select(d => d.CharacterId));
            Assert.AreEqual(300, x.Drops.Count);
        }

        [Test]
        public void Save_RoundTrips_IsValidated_AndRepaired()
        {
            SaveData s = SaveData.CreateNew(SaveMigrator.LatestVersion, "t", 1UL);
            s.Gacha = new GachaState { TotalPulls = 321, PickupPity = 12, PickupId = Data.Characters[0].Id, StepsClaimed = 3 };
            byte[] bytes = SaveCodec.Serialize(s);
            LoadResult r = SaveCodec.Load(bytes, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(321, r.Save.Gacha.TotalPulls);
            Assert.AreEqual(Data.Characters[0].Id, r.Save.Gacha.PickupId);
            CollectionAssert.AreEqual(bytes, SaveCodec.Serialize(r.Save));
            s.Gacha.PickupPity = 500; s.Gacha.StepsClaimed = 99; s.Gacha.TotalPulls = -1; s.Gacha.PickupId = "ghost";
            var issues = SaveValidator.Validate(s, Data);
            Assert.IsTrue(issues.Any(i => i.Code == "GACHA_STATE" && i.Severity == SaveSeverity.Error));
            Assert.IsTrue(issues.Any(i => i.Code == "GACHA_PICKUP" && i.Severity == SaveSeverity.Warning));
            SaveRepair.Repair(s, Data);
            Assert.AreEqual(0, s.Gacha.TotalPulls);
            Assert.AreEqual(100, s.Gacha.PickupPity);
            Assert.AreEqual(Data.Gacha.Steps.Count, s.Gacha.StepsClaimed);
            Assert.IsEmpty(SaveValidator.Validate(s, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());
            string bad = System.Text.Encoding.UTF8.GetString(bytes).Replace("\"totalPulls\":321", "\"totalPulls\":\"x\"");
            Assert.IsFalse(SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(bad), Data).Success);
        }

        [Test]
        public void Session_PullsCharacters_EmitsEvents_AndCountsThem()
        {
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc)), 8UL);
            Assert.AreEqual("NotEnough", s.PullCharacterGacha(GachaBanner.Normal, 10, out _).Failure);
            s.Debug.GrantCurrency("gem", 600);
            Assert.IsTrue(s.BuyGachaTickets(2).Success);
            Assert.AreEqual("NotEnough", s.BuyGachaTickets(5).Failure);
            s.Debug.GrantCurrency("gacha_ticket", 300);
            s.DrainEvents();
            Assert.IsTrue(s.PullCharacterGacha(GachaBanner.Normal, 100, out GachaResult r).Success);
            Assert.AreEqual(100, r.Drops.Count);
            Assert.AreEqual(100, s.State.GachaTotalPulls);
            Assert.AreEqual(100, s.State.Metric("gacha.pulls"));
            IReadOnlyList<GameEvent> evs = s.DrainEvents();
            Assert.AreEqual(r.Drops.Count(d => d.IsNew), evs.Count(x => x.Kind == GameEventKind.CharacterObtained));
            Assert.IsTrue(evs.Any(x => x.Kind == GameEventKind.GachaPulled && x.Amount == 100 && x.Detail == "1"));
            Assert.AreEqual("InvalidPickup", s.PullCharacterGacha(GachaBanner.Pickup, 1, out _).Failure);
            Assert.AreEqual("InvalidPickup", s.SetGachaPickup("nope").Failure);
            s.Debug.SetProgress(20, 1, 1);
            string kyoku = Data.Characters.First(c => c.Tier == CharTier.Kyoku).Id;
            Assert.IsTrue(s.SetGachaPickup(kyoku).Success);
            Assert.AreEqual(kyoku, s.State.GachaPickup);
            Assert.AreEqual(100, s.State.GachaPityLeft);
            Assert.IsTrue(s.PullCharacterGacha(GachaBanner.Pickup, 1, out _).Success);
            Assert.That(s.State.GachaPityLeft, Is.EqualTo(99).Or.EqualTo(100));      // 1回引いたら1つ進む（たまたま当たったら最初から）
        }
    }
}
