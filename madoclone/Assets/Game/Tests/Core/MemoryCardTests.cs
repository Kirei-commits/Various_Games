using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>記憶カード：実測の再現、絆ガチャ、費用、装備、効果の反映、セーブ。</summary>
    public class MemoryCardTests
    {
        private static GameData Data { get { return TestData.Data; } }

        private sealed class Env
        {
            public SaveData Save;
            public Wallet.Wallet Wallet;
            public MemoryCardService Service;
            public bool Dev;

            public Env(double hearts = 100, double coin = 0, ulong seed = 7UL)
            {
                Save = SaveData.CreateNew(1, "", seed);
                var state = new WalletState();
                state.Balances["bond_heart"] = hearts;
                state.Balances["coin"] = coin;
                Wallet = new Wallet.Wallet(Data.Currencies, state, () => Dev);
                Service = new MemoryCardService(Data, Save, Wallet);
            }
        }

        private static MemoryCardState Card(string rarity, MemoryKind kind, int lv, double main, params double[] extra)
        {
            return new MemoryCardState
            {
                Id = "t_" + rarity + kind + lv, Rarity = rarity, Kind = kind, Lv = lv, Main = main, Extra = extra,
                Subs = new List<MemorySubState>
                {
                    new MemorySubState { Stat = SubstatKey.EvasionPct, Value = 2.5 },
                    new MemorySubState { Stat = SubstatKey.CritDamagePct, Value = 240 },
                },
            };
        }

        private static List<Modifier> Collect(MemoryCardState c)
        {
            var sink = new List<Modifier>();
            MemoryCardEffects.Collect(Data, c, sink);
            return sink;
        }

        private static double Sum(List<Modifier> l, StatId stat, ModifierPool pool)
        {
            return l.Where(m => m.Stat == stat && m.Pool == pool).Sum(m => m.Value);
        }

        // ---------------- 実測の再現（docs/01 7.2節の8枚） ----------------

        [Test]
        public void MainPercent_ReproducesTheMeasuredCards()
        {
            // UR・HP・Lv108：+416.25％ ／ UR+・防御・Lv108：+555％（係数 5.0）／ UR+・攻撃・Lv106：+599.5％（係数 5.5）
            Assert.AreEqual(416.25, Sum(Collect(Card("UR", MemoryKind.Hp, 108, 3.75)), StatId.Hp, ModifierPool.Global), 1e-9);
            Assert.AreEqual(555.0, Sum(Collect(Card("UR+", MemoryKind.Def, 108, 5.0)), StatId.Def, ModifierPool.Global), 1e-9);
            Assert.AreEqual(599.5, Sum(Collect(Card("UR+", MemoryKind.Atk, 106, 5.5)), StatId.Atk, ModifierPool.Global), 1e-9);
        }

        [Test]
        public void SpeedCard_ReproducesTheMeasuredSpeedAndStats()
        {
            // UR・Lv108：速度 +83.25％、HP・攻撃・防御 各 +138.75％
            List<Modifier> ur = Collect(Card("UR", MemoryKind.Speed, 108, 0, 1.25, 1.25, 1.25));
            Assert.AreEqual(83.25, Sum(ur, StatId.AttackSpeed, ModifierPool.Flat), 1e-9);
            Assert.AreEqual(138.75, Sum(ur, StatId.Hp, ModifierPool.Global), 1e-9);
            // UR+・Lv102：速度 +105％、HP・攻撃 +157.5％、防御 +183.75％
            List<Modifier> urp = Collect(Card("UR+", MemoryKind.Speed, 102, 0, 1.5, 1.5, 1.75));
            Assert.AreEqual(105.0, Sum(urp, StatId.AttackSpeed, ModifierPool.Flat), 1e-9);
            Assert.AreEqual(157.5, Sum(urp, StatId.Atk, ModifierPool.Global), 1e-9);
            Assert.AreEqual(183.75, Sum(urp, StatId.Def, ModifierPool.Global), 1e-9);
        }

        [Test]
        public void FixedValue_IsConvertedToBaseUnits_AndStaysSmall()
        {
            // UR・HP・Lv108 の実測 +2,726,882 は全体強化込みの単位。基礎の単位では +1,479（Lv1 の基礎 HP の約17％）。
            double fixedHp = Sum(Collect(Card("UR", MemoryKind.Hp, 108, 3.75)), StatId.Hp, ModifierPool.Flat);
            Assert.AreEqual(2726882 * Data.MemoryCards.FixedUnitScale.Hp, fixedHp, 3.0);
            double baseHp = Data.Stats.LevelTable[0].Hp;
            Assert.Less(fixedHp / baseHp, 0.5);
        }

        [Test]
        public void SubEffects_ScaleWithRarityAndLevel()
        {
            // UR・Lv108（x=111）：基準値そのまま。UR+（倍率 1.3）・Lv95（x=98）：× 1.3 × 98/111。
            List<Modifier> ur = Collect(Card("UR", MemoryKind.Hp, 108, 3.75));
            Assert.AreEqual(240.0, Sum(ur, StatId.CritDamage, ModifierPool.Flat), 1e-9);
            List<Modifier> urp = Collect(Card("UR+", MemoryKind.Def, 95, 5.0));
            Assert.AreEqual(240.0 * 1.3 * 98 / 111, Sum(urp, StatId.CritDamage, ModifierPool.Flat), 1e-9);
        }

        [Test]
        public void ExPair_StaysBelowTheDesignBudget()
        {
            // Lv140（上限）の EX の2枚（HP＋攻撃のメイン％とは別の、同じ種類2枚という見積もり）：2 × 7.25 × 143 ≈ 2,074％ ≤ 2,400％
            double one = Sum(Collect(Card("EX", MemoryKind.Hp, Data.MemoryCards.MaxCardLv, 7.25)), StatId.Hp, ModifierPool.Global);
            Assert.AreEqual(1036.75, one, 1e-9);
            Assert.LessOrEqual(one * 2, 2400.0);
        }

        [Test]
        public void ConfigNumbers_AreMonotonicAndConsistent()
        {
            MemoryCardsConfig c = Data.MemoryCards;
            for (int i = 1; i < c.Rarities.Count; i++)
            {
                Assert.GreaterOrEqual(c.Rarities[i].MainCoefMin, c.Rarities[i - 1].MainCoefMin);
                Assert.Greater(c.Rarities[i].SubScale, c.Rarities[i - 1].SubScale);
                Assert.Greater(c.Rarities[i].FixedHp, c.Rarities[i - 1].FixedHp);
            }
            // 最大の絆ガチャLv の排出率は実測（R+ 42.38、SR 42.5、SR+ 12、SSR 2.2、SSR+ 0.6、UR 0.17、UR+ 0.09、EX 0.06）
            GachaBand top = c.GachaBands[c.GachaBands.Count - 1];
            Assert.AreEqual(0.06, top.Weights[c.Rarities.Count - 1], 1e-9);
            Assert.AreEqual(42.38, top.Weights[MemoryCardEffects.RarityIndex(Data, "R+")], 1e-9);
            Assert.AreEqual(140, c.MaxCardLv);
        }

        // ---------------- 絆ガチャ ----------------

        [Test]
        public void Pull_PaysBondHeart_AndGivesAWellFormedCardAtTheGachaLv()
        {
            var e = new Env(hearts: 5);
            e.Save.Memory.GachaLv = 50;
            PullResult r = e.Service.Pull();
            Assert.IsTrue(r.Success);
            Assert.AreEqual(4, e.Wallet.Balance("bond_heart"));
            Assert.IsTrue(r.Pending);                                                           // 空き枠だらけなので、条件（いまより強い）に合う
            Assert.AreSame(r.Card, e.Save.Memory.Pending);
            Assert.IsEmpty(e.Save.Memory.Cards);                                                // 返事をするまで持ち物に入れない
            MemoryCardState c = r.Card;
            Assert.AreEqual("mc_00001", c.Id);
            Assert.AreEqual(50, c.Lv);
            Assert.AreEqual(2, c.Subs.Count);
            Assert.AreNotEqual(c.Subs[0].Stat, c.Subs[1].Stat);
            Assert.AreEqual(c.Kind == MemoryKind.Speed ? 3 : 0, c.Extra.Length);
            Assert.GreaterOrEqual(MemoryCardEffects.RarityIndex(Data, c.Rarity), 0);
            Assert.IsEmpty(SaveValidator.Validate(e.Save, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());
            Assert.AreEqual(2, e.Save.Memory.NextCardNumber);
            Assert.AreEqual(MemoryFailure.None, e.Service.Resolve(true, -1, out _, out _));
            Assert.AreEqual(1, e.Save.Memory.Cards.Count);
            Assert.AreEqual(c.Id, e.Save.Memory.Equipped[(int)c.Kind * 2]);
        }

        /// <summary>1回引いて、確認が出たら装備する（テスト用）。引いたカードを返す。</summary>
        private static MemoryCardState PullAndAccept(Env e)
        {
            PullResult r = e.Service.Pull();
            Assert.IsTrue(r.Success);
            if (r.Pending) { Assert.AreEqual(MemoryFailure.None, e.Service.Resolve(true, -1, out _, out _)); }
            return r.Card;
        }

        [Test]
        public void Pull_IsDeterministicForTheSameSeed_AndAdvancesTheRngState()
        {
            var a = new Env(seed: 99UL);
            var b = new Env(seed: 99UL);
            uint[] before = (uint[])a.Save.Rng.Gacha.Clone();
            var seqA = new List<string>();
            var seqB = new List<string>();
            for (int i = 0; i < 20; i++) { MemoryCardState x = PullAndAccept(a), y = PullAndAccept(b); seqA.Add(x.Rarity + x.Kind + x.Main); seqB.Add(y.Rarity + y.Kind + y.Main); }
            CollectionAssert.AreEqual(b.Save.Rng.Gacha, a.Save.Rng.Gacha);
            CollectionAssert.AreNotEqual(before, a.Save.Rng.Gacha);
            CollectionAssert.AreEqual(seqB, seqA);
            CollectionAssert.AreEqual(b.Save.Memory.Equipped, a.Save.Memory.Equipped);
            Assert.AreEqual(b.Wallet.Balance("coin"), a.Wallet.Balance("coin"));
            var other = new Env(seed: 100UL);
            var seqO = new List<string>();
            for (int i = 0; i < 20; i++) { MemoryCardState x = PullAndAccept(other); seqO.Add(x.Rarity + x.Kind + x.Main); }
            Assert.IsFalse(seqA.SequenceEqual(seqO));
        }

        [Test]
        public void Pull_WithoutHearts_ChangesNothing()
        {
            var e = new Env(hearts: 0);
            uint[] rng = (uint[])e.Save.Rng.Gacha.Clone();
            PullResult r = e.Service.Pull();
            Assert.IsFalse(r.Success);
            Assert.AreEqual(MemoryFailure.NotEnough, r.Failure);
            Assert.AreEqual(1, r.ShortBy);
            Assert.IsEmpty(e.Save.Memory.Cards);
            CollectionAssert.AreEqual(rng, e.Save.Rng.Gacha);
            Assert.AreEqual(1, e.Save.Memory.NextCardNumber);
        }

        [Test]
        public void Pull_InDevMode_IsFreeButStillWorks()
        {
            var e = new Env(hearts: 0) { Dev = true };
            Assert.IsTrue(e.Service.Pull().Success);
            Assert.AreEqual(0, e.Wallet.Balance("bond_heart"));
        }

        [Test]
        public void Pull_AtMaxGachaLv_FollowsTheMeasuredRates()
        {
            var e = new Env(hearts: 0) { Dev = true };
            e.Save.Memory.GachaLv = 140;
            const int n = 20000;
            var counts = new Dictionary<string, int>();
            for (int i = 0; i < n; i++)
            {
                string r = PullAndAccept(e).Rarity;
                counts[r] = counts.TryGetValue(r, out int v) ? v + 1 : 1;
            }
            // 実測：N〜R は 0％。R+ 42.38％ ± 3、SR 42.5％ ± 3、SR+ 12％ ± 2
            foreach (string never in new[] { "N", "N+", "R" }) { Assert.IsFalse(counts.ContainsKey(never), never); }
            Assert.AreEqual(42.38, 100.0 * counts["R+"] / n, 3.0);
            Assert.AreEqual(42.5, 100.0 * counts["SR"] / n, 3.0);
            Assert.AreEqual(12.0, 100.0 * counts["SR+"] / n, 2.0);
            Assert.IsTrue(e.Save.Memory.Cards.All(c => c.Lv == 140));
        }

        [Test]
        public void Pull_KindsAreSpreadAcrossAllFour_AndSpeedCardsGetThreeExtras()
        {
            var e = new Env(hearts: 0) { Dev = true };
            var drawn = new List<MemoryCardState>();
            for (int i = 0; i < 400; i++) { drawn.Add(PullAndAccept(e)); }
            foreach (MemoryKind k in Enum.GetValues(typeof(MemoryKind)))
            {
                Assert.Greater(drawn.Count(c => c.Kind == k), 50, k.ToString());
            }
            Assert.IsTrue(drawn.Where(c => c.Kind == MemoryKind.Speed).All(c => c.Extra.Length == 3));
            Assert.LessOrEqual(e.Save.Memory.Cards.Count, MemoryState.SlotCount);                // 持ち物は装備の分だけ（溜まらない）
            Assert.IsEmpty(SaveValidator.Validate(e.Save, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());
        }

        [Test]
        public void Pull_AsksAboutMatchingCards_AndConvertsTheRestIntoCoinAndExp()
        {
            var e = new Env(hearts: 0) { Dev = true };
            e.Save.Memory.GachaLv = 100;
            double coin = 0, exp = 0;
            int asked = 0;
            for (int i = 0; i < 300; i++)
            {
                PullResult r = e.Service.Pull();
                coin += r.Coin; exp += r.Exp;
                if (r.Pending)
                {
                    asked++;
                    Assert.AreSame(r.Card, e.Save.Memory.Pending);
                    Assert.IsEmpty(e.Save.Memory.Cards.Where(c => c.Id == r.Card.Id));        // まだ持ち物に入れない
                    Assert.AreEqual(MemoryFailure.None, e.Service.Resolve(true, -1, out double c2, out double x2));   // 答えると装備（外れたカードは還元）
                    coin += c2; exp += x2;
                }
            }
            Assert.Greater(asked, 8);                                                          // 付け替えの確認が何度も出る
            Assert.LessOrEqual(e.Save.Memory.Cards.Count, MemoryState.SlotCount);              // 溜まらない
            Assert.AreEqual(e.Save.Memory.Cards.Count, e.Save.Memory.Equipped.Count(x => x != null));
            Assert.AreEqual(coin, e.Wallet.Balance("coin"), 1e-3);
            Assert.AreEqual(exp, e.Wallet.Balance("exp"), 1e-3);
            foreach (MemoryKind k in new[] { MemoryKind.Hp, MemoryKind.Atk, MemoryKind.Def, MemoryKind.Speed })
            {
                Assert.IsNotNull(e.Save.Memory.Equipped[(int)k * 2]);                          // 300回引けば両方の枠が埋まる
                Assert.IsNotNull(e.Save.Memory.Equipped[(int)k * 2 + 1]);
            }
        }

        [Test]
        public void BandFor_PicksTheHighestBandNotAboveTheLevel()
        {
            MemoryCardsConfig c = Data.MemoryCards;
            Assert.AreEqual(1, MemoryCardService.BandFor(c, 1).MinLv);
            Assert.AreEqual(1, MemoryCardService.BandFor(c, 19).MinLv);
            Assert.AreEqual(20, MemoryCardService.BandFor(c, 20).MinLv);
            Assert.AreEqual(140, MemoryCardService.BandFor(c, 140).MinLv);
        }

        // ---------------- 絆ガチャLv ----------------

        [Test]
        public void GachaLvCost_FollowsTheMeasuredFormula()
        {
            var e = new Env();
            Assert.AreEqual(10760, e.Service.GachaLvCost(1), 1e-6);
            Assert.AreEqual(2.89e8, e.Service.GachaLvCost(108), 2e6);   // 実測：Lv108→109 が 289M
            Assert.AreEqual(5.5e9, e.Service.GachaLvCost(139), 1e8);    // Lv139→140
            Assert.Throws<ArgumentException>(() => e.Service.GachaLvCost(140));
            Assert.Throws<ArgumentException>(() => e.Service.GachaLvCost(0));
        }

        [Test]
        public void RaiseGachaLv_PaysCoin_AndStopsAtTheMax()
        {
            var e = new Env(coin: 10760 + 11837);
            Assert.AreEqual(MemoryFailure.None, e.Service.RaiseGachaLv());
            Assert.AreEqual(2, e.Service.GachaLv);
            Assert.AreEqual(MemoryFailure.None, e.Service.RaiseGachaLv());
            Assert.AreEqual(3, e.Service.GachaLv);
            Assert.AreEqual(MemoryFailure.NotEnough, e.Service.RaiseGachaLv());
            Assert.AreEqual(3, e.Service.GachaLv);

            var dev = new Env(coin: 0) { Dev = true };
            dev.Save.Memory.GachaLv = 139;
            Assert.AreEqual(MemoryFailure.None, dev.Service.RaiseGachaLv());
            Assert.AreEqual(MemoryFailure.AtMaxGachaLv, dev.Service.RaiseGachaLv());
            Assert.AreEqual(140, dev.Service.GachaLv);
        }

        // ---------------- 装備 ----------------

        private static Env WithCards()
        {
            var e = new Env();
            e.Save.Memory.Cards.Add(Card("UR", MemoryKind.Hp, 100, 3.75));
            e.Save.Memory.Cards.Add(Card("UR+", MemoryKind.Hp, 100, 5.0));
            e.Save.Memory.Cards.Add(Card("UR", MemoryKind.Speed, 100, 0, 1.25, 1.25, 1.25));
            return e;
        }

        [Test]
        public void Equip_PutsTheCardInTheRightSlot_AndMovesItBetweenSlots()
        {
            Env e = WithCards();
            string hp1 = e.Save.Memory.Cards[0].Id;
            Assert.AreEqual(MemoryFailure.None, e.Service.Equip(hp1, MemoryCardService.Slot(MemoryKind.Hp, 0)));
            Assert.AreEqual(hp1, e.Save.Memory.Equipped[0]);
            Assert.AreEqual(MemoryFailure.None, e.Service.Equip(hp1, MemoryCardService.Slot(MemoryKind.Hp, 1)));
            Assert.IsNull(e.Save.Memory.Equipped[0]);
            Assert.AreEqual(hp1, e.Save.Memory.Equipped[1]);
            e.Service.Unequip(1);
            Assert.IsNull(e.Save.Memory.Equipped[1]);
        }

        [Test]
        public void Equip_RejectsUnknownCards_WrongKindsAndBadSlots()
        {
            Env e = WithCards();
            string hp = e.Save.Memory.Cards[0].Id;
            Assert.AreEqual(MemoryFailure.UnknownCard, e.Service.Equip("nope", 0));
            Assert.AreEqual(MemoryFailure.WrongSlot, e.Service.Equip(hp, MemoryCardService.Slot(MemoryKind.Atk, 0)));
            Assert.AreEqual(MemoryFailure.WrongSlot, e.Service.Equip(hp, -1));
            Assert.AreEqual(MemoryFailure.WrongSlot, e.Service.Equip(hp, 8));
            Assert.Throws<ArgumentException>(() => e.Service.Unequip(8));
            Assert.IsTrue(e.Save.Memory.Equipped.All(s => s == null));
        }

        [Test]
        public void Source_CollectsOnlyEquippedCards_FromEverySlotInOrder()
        {
            Env e = WithCards();
            var src = new MemoryCardSource(Data, e.Save);
            var sink = new List<Modifier>();
            src.Collect(sink, default(StatQuery));
            Assert.IsEmpty(sink);

            e.Service.Equip(e.Save.Memory.Cards[0].Id, 0);
            e.Service.Equip(e.Save.Memory.Cards[1].Id, 1);
            e.Service.Equip(e.Save.Memory.Cards[2].Id, MemoryCardService.Slot(MemoryKind.Speed, 0));
            src.Collect(sink, default(StatQuery));
            // HP の％は2枚ぶん足し算：3.75×103 ＋ 5.0×103 ＋ スピードカードの HP 1.25×103
            Assert.AreEqual((3.75 + 5.0 + 1.25) * 103, Sum(sink, StatId.Hp, ModifierPool.Global), 1e-9);
            Assert.AreEqual(0.75 * 103, Sum(sink, StatId.AttackSpeed, ModifierPool.Flat), 1e-9);
        }

        [Test]
        public void Source_IgnoresAnEquippedIdThatNoLongerExists_AndUnknownRarity()
        {
            Env e = WithCards();
            e.Save.Memory.Equipped[0] = "gone";
            e.Save.Memory.Cards[1].Rarity = "ZZ";
            e.Save.Memory.Equipped[1] = e.Save.Memory.Cards[1].Id;
            var sink = new List<Modifier>();
            Assert.DoesNotThrow(() => new MemoryCardSource(Data, e.Save).Collect(sink, default(StatQuery)));
            Assert.IsEmpty(sink);
        }

        // ---------------- ステータスへの反映 ----------------

        [Test]
        public void StatResolver_AppliesFixedValueBeforeTheRings_AndPercentAsARing()
        {
            Env e = WithCards();
            e.Service.Equip(e.Save.Memory.Cards[0].Id, 0);
            CharacterDef c = Data.Characters[0];
            var plain = new StatResolver(Data).Resolve(c, 1, 1, false);
            var withCard = new StatResolver(Data, new IModifierSource[] { new MemoryCardSource(Data, e.Save) }).Resolve(c, 1, 1, false);

            var fx = Collect(e.Save.Memory.Cards[0]);
            double flat = Sum(fx, StatId.Hp, ModifierPool.Flat);
            double pct = Sum(fx, StatId.Hp, ModifierPool.Global);
            Assert.AreEqual((plain.Hp + flat) * (1 + pct / 100.0), withCard.Hp, 1e-6);
            Assert.AreEqual(plain.Atk, withCard.Atk);                       // HP カードは攻撃に効かない
            Assert.Greater(withCard.CritDamagePct, plain.CritDamagePct);    // サブ効果は副ステータスに足される
            Assert.Greater(withCard.EvasionPct, plain.EvasionPct);
        }

        [Test]
        public void StatResolver_AttackSpeedFromSpeedCards_IsCappedBySystemMax()
        {
            var e = new Env();
            // EX・Lv140 のスピードカード2枚：1 ＋ 2×1.3×143 ％ ＝ 4.72 倍（上限 5.0 以内）
            for (int i = 0; i < 2; i++) { e.Save.Memory.Cards.Add(Card("EX", MemoryKind.Speed, 140, 0, 2, 2, 2)); e.Save.Memory.Cards[i].Id = "s" + i; }
            e.Service.Equip("s0", MemoryCardService.Slot(MemoryKind.Speed, 0));
            e.Service.Equip("s1", MemoryCardService.Slot(MemoryKind.Speed, 1));
            var sources = new IModifierSource[] { new MemoryCardSource(Data, e.Save) };
            BattleStats s = new StatResolver(Data, sources).Resolve(Data.Characters[0], 1, 1, false);
            Assert.AreEqual(1 + 2 * 1.3 * 143 / 100.0, s.AttackSpeed, 1e-9);
            Assert.LessOrEqual(s.AttackSpeed, Data.System.AttackSpeedMax);

            for (int i = 0; i < 2; i++) { e.Save.Memory.Cards[i].Lv = 140; }
            e.Save.Memory.Cards.Add(Card("EX", MemoryKind.Hp, 140, 7.0));
            // 上限を下げた別マスタではなく、足し算の結果が上限を超える場合の動作を、素の Modifier で確かめる
            var big = new List<Modifier> { new Modifier(StatId.AttackSpeed, ModifierPool.Flat, 10000) };
            BattleStats capped = new StatResolver(Data, new IModifierSource[] { new FixedSource(big) }).Resolve(Data.Characters[0], 1, 1, false);
            Assert.AreEqual(Data.System.AttackSpeedMax, capped.AttackSpeed);
        }

        private sealed class FixedSource : IModifierSource
        {
            private readonly List<Modifier> _mods;
            public FixedSource(List<Modifier> mods) { _mods = mods; }
            public void Collect(List<Modifier> sink, StatQuery query) { sink.AddRange(_mods); }
        }

        // ---------------- セーブ ----------------

        private static SaveData SavedWithCards()
        {
            Env e = WithCards();
            e.Service.Equip(e.Save.Memory.Cards[0].Id, 0);
            e.Service.Equip(e.Save.Memory.Cards[2].Id, MemoryCardService.Slot(MemoryKind.Speed, 1));
            e.Save.Memory.GachaLv = 33;
            e.Save.Memory.NextCardNumber = 9;
            return e.Save;
        }

        [Test]
        public void Memory_SurvivesASaveRoundTrip_ByteForByte()
        {
            SaveData s = SavedWithCards();
            byte[] first = SaveCodec.Serialize(s);
            LoadResult r = SaveCodec.Load(first, Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.IsEmpty(r.Issues.Select(i => i.ToString()).ToList());
            CollectionAssert.AreEqual(first, SaveCodec.Serialize(r.Save));
            Assert.AreEqual(33, r.Save.Memory.GachaLv);
            Assert.AreEqual(3, r.Save.Memory.Cards.Count);
            Assert.AreEqual(3, r.Save.Memory.Cards[2].Extra.Length);
            Assert.AreEqual(SubstatKey.CritDamagePct, r.Save.Memory.Cards[0].Subs[1].Stat);
        }

        [Test]
        public void OldSaveWithoutMemory_LoadsWithDefaults()
        {
            SaveData s = SaveData.CreateNew(1, "", 1UL);
            var o = Newtonsoft.Json.Linq.JObject.Parse(System.Text.Encoding.UTF8.GetString(SaveCodec.Serialize(s)));
            o.Remove("memory");
            LoadResult r = SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(o.ToString()), Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(1, r.Save.Memory.GachaLv);
            Assert.IsEmpty(r.Save.Memory.Cards);
            Assert.AreEqual(MemoryState.SlotCount, r.Save.Memory.Equipped.Length);
        }

        private static List<SaveIssue> Validate(SaveData s) { return SaveValidator.Validate(s, Data); }
        private static bool Has(List<SaveIssue> l, string code) { return l.Exists(i => i.Code == code && i.Severity == SaveSeverity.Error); }

        [Test]
        public void Validator_AcceptsTheSample_AndFlagsEachBrokenPlace()
        {
            Assert.IsEmpty(Validate(SavedWithCards()));

            SaveData s = SavedWithCards(); s.Memory.GachaLv = 0;
            Assert.IsTrue(Has(Validate(s), "MEMORY_GACHA_LV"));
            s = SavedWithCards(); s.Memory.GachaLv = 141;
            Assert.IsTrue(Has(Validate(s), "MEMORY_GACHA_LV"));
            s = SavedWithCards(); s.Memory.Cards[1].Id = s.Memory.Cards[0].Id;
            Assert.IsTrue(Has(Validate(s), "MEMORY_CARD_ID"));
            s = SavedWithCards(); s.Memory.Cards[1].Id = "";
            Assert.IsTrue(Has(Validate(s), "MEMORY_CARD_ID"));
            s = SavedWithCards(); s.Memory.Cards[0].Rarity = "ZZ";
            Assert.IsTrue(Has(Validate(s), "MEMORY_RARITY"));
            s = SavedWithCards(); s.Memory.Cards[0].Lv = 141;
            Assert.IsTrue(Has(Validate(s), "MEMORY_CARD_LV"));
            s = SavedWithCards(); s.Memory.Cards[0].Lv = 0;
            Assert.IsTrue(Has(Validate(s), "MEMORY_CARD_LV"));
            s = SavedWithCards(); s.Memory.Cards[2].Extra = new double[1];
            Assert.IsTrue(Has(Validate(s), "MEMORY_CARD_SHAPE"));
            s = SavedWithCards(); s.Memory.Cards[0].Subs.RemoveAt(1);
            Assert.IsTrue(Has(Validate(s), "MEMORY_CARD_SHAPE"));
            s = SavedWithCards(); s.Memory.Cards[0].Subs[1].Stat = s.Memory.Cards[0].Subs[0].Stat;
            Assert.IsTrue(Has(Validate(s), "MEMORY_CARD_SHAPE"));
            s = SavedWithCards(); s.Memory.NextCardNumber = 0;
            Assert.IsTrue(Has(Validate(s), "MEMORY_NEXT_ID"));
            s = SavedWithCards(); s.Memory.Equipped[4] = "gone";
            Assert.IsTrue(Has(Validate(s), "MEMORY_EQUIP_UNKNOWN"));
            s = SavedWithCards(); s.Memory.Equipped[2] = s.Memory.Cards[0].Id;   // HP カードを攻撃枠に
            Assert.IsTrue(Has(Validate(s), "MEMORY_EQUIP_KIND"));
            s = SavedWithCards(); s.Memory.Equipped[1] = s.Memory.Cards[0].Id;   // 同じカードを2枠に
            Assert.IsTrue(Has(Validate(s), "MEMORY_EQUIP_DUP"));
        }

        [Test]
        public void SaveFormat_RejectsMalformedMemory()
        {
            string good = System.Text.Encoding.UTF8.GetString(SaveCodec.Serialize(SavedWithCards()));
            foreach (string bad in new[]
            {
                good.Replace("\"kind\":\"hp\"", "\"kind\":\"zzz\""),
                good.Replace("\"stat\":\"evasionPct\"", "\"stat\":\"zzz\""),
                good.Replace("\"cards\":[", "\"cards\":{\"a\":1},\"x\":["),
            })
            {
                LoadResult r = SaveCodec.Load(System.Text.Encoding.UTF8.GetBytes(bad), Data);
                Assert.IsFalse(r.Success, bad.Substring(0, 0));
            }
        }
    }
}
