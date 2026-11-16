using System;
using System.Collections.Generic;
using System.Reflection;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    public class WalletTests
    {
        private const string Gem = "gem";
        private const string Ticket = "ticket";
        private const string Coin = "coin";
        private const string DevHash = "559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd"; // "A"

        private static readonly PayReason PR = new PayReason("test.pay");
        private static readonly GrantReason GR = new GrantReason("test.grant");

        private static IReadOnlyList<CurrencyDef> Currencies()
        {
            return new List<CurrencyDef>
            {
                new CurrencyDef { Id = Gem, Integer = false, AssetId = "a" },
                new CurrencyDef { Id = Ticket, Integer = true, AssetId = "b" },
                new CurrencyDef { Id = Coin, Integer = false, AssetId = "c" },
            };
        }

        private static Wallet.Wallet Make(bool dev = false, double gem = 0, double ticket = 0, double coin = 0)
        {
            var state = new WalletState();
            state.Balances[Gem] = gem;
            state.Balances[Ticket] = ticket;
            state.Balances[Coin] = coin;
            return new Wallet.Wallet(Currencies(), state, () => dev);
        }

        [Test]
        public void Pay_Insufficient_FailsAndChangesNothing()
        {
            var w = Make(gem: 10);
            PayResult r = w.Pay(new Cost(Gem, 11), PR);
            Assert.IsFalse(r.Success);
            Assert.AreEqual(Gem, r.ShortCurrencyId);
            Assert.AreEqual(1, r.ShortBy, 1e-9);
            Assert.AreEqual(10, w.Balance(Gem));
            Assert.AreEqual(0, w.DrainEvents().Count);
        }

        [Test]
        public void Pay_Sufficient_DeductsAll()
        {
            var w = Make(gem: 10, coin: 5);
            Assert.IsTrue(w.Pay(new Cost(new[] { new Money(Gem, 4), new Money(Coin, 5) }), PR).Success);
            Assert.AreEqual(6, w.Balance(Gem));
            Assert.AreEqual(0, w.Balance(Coin));
            Assert.AreEqual(2, w.DrainEvents().Count);
        }

        [Test]
        public void Pay_OneShortOfMany_ChangesNothing()
        {
            var w = Make(gem: 10, coin: 4);
            PayResult r = w.Pay(new Cost(new[] { new Money(Gem, 4), new Money(Coin, 5) }), PR);
            Assert.IsFalse(r.Success);
            Assert.AreEqual(Coin, r.ShortCurrencyId);
            Assert.AreEqual(10, w.Balance(Gem));
            Assert.AreEqual(4, w.Balance(Coin));
            Assert.AreEqual(0, w.DrainEvents().Count);
        }

        [Test]
        public void Pay_SameCurrencyItemsAreMerged()
        {
            var w = Make(gem: 5);
            Assert.IsFalse(w.Pay(new Cost(new[] { new Money(Gem, 3), new Money(Gem, 3) }), PR).Success);
            Assert.IsTrue(w.Pay(new Cost(new[] { new Money(Gem, 2), new Money(Gem, 3) }), PR).Success);
            Assert.AreEqual(0, w.Balance(Gem));
        }

        [Test]
        public void InvalidAmounts_Throw_AndZeroIsIgnored()
        {
            Assert.Throws<ArgumentException>(() => new Cost(Gem, -1));
            Assert.Throws<ArgumentException>(() => new Cost(Gem, double.NaN));
            Assert.Throws<ArgumentException>(() => new Reward(Gem, double.PositiveInfinity));
            Assert.AreEqual(0, new Cost(Gem, 0).Items.Count);
            var w = Make();
            Assert.Throws<ArgumentException>(() => w.Pay(new Cost("nope", 1), PR));
            Assert.Throws<ArgumentException>(() => w.Balance("nope"));
        }

        [Test]
        public void IntegerCurrency_Rounding_PayUpGrantDownWithCarry()
        {
            var w = Make(ticket: 10);
            Assert.IsTrue(w.Pay(new Cost(Ticket, 2.1), PR).Success);
            Assert.AreEqual(7, w.Balance(Ticket));

            w.Grant(new Reward(Ticket, 2.7), GR);
            Assert.AreEqual(9, w.Balance(Ticket));
            Assert.AreEqual(0.7, w.ExportState().Carry[Ticket], 1e-9);

            w.Grant(new Reward(Ticket, 0.4), GR);
            Assert.AreEqual(10, w.Balance(Ticket));
            Assert.AreEqual(0.1, w.ExportState().Carry[Ticket], 1e-9);
        }

        [Test]
        public void NonIntegerCurrency_KeepsFraction()
        {
            var w = Make();
            w.Grant(new Reward(Gem, 1.25), GR);
            Assert.AreEqual(1.25, w.Balance(Gem), 1e-12);
        }

        [Test]
        public void Events_AreRecordedAndDrained()
        {
            var w = Make(gem: 10);
            w.Pay(new Cost(Gem, 3), PR);
            w.Grant(new Reward(Coin, 2), GR);
            IReadOnlyList<WalletEvent> ev = w.DrainEvents();
            Assert.AreEqual(2, ev.Count);
            Assert.AreEqual(WalletEventKind.Spent, ev[0].Kind);
            Assert.AreEqual("test.pay", ev[0].ReasonKey);
            Assert.AreEqual(7, ev[0].BalanceAfter);
            Assert.AreEqual(WalletEventKind.Granted, ev[1].Kind);
            Assert.AreEqual(0, w.DrainEvents().Count);
        }

        [Test]
        public void State_IsCopiedNotShared()
        {
            var state = new WalletState();
            state.Balances[Gem] = 5;
            var w = new Wallet.Wallet(Currencies(), state, () => false);
            state.Balances[Gem] = 999;
            Assert.AreEqual(5, w.Balance(Gem));
            WalletState exported = w.ExportState();
            exported.Balances[Gem] = 1;
            Assert.AreEqual(5, w.Balance(Gem));
        }

        // ---- 開発者モード ----

        [Test]
        public void DevMode_TryEnable_CodeMatching()
        {
            Assert.IsTrue(DevMode.TryEnable("A", DevHash));
            Assert.IsFalse(DevMode.TryEnable("a", DevHash));
            Assert.IsTrue(DevMode.TryEnable(" A ", DevHash));
            Assert.IsFalse(DevMode.TryEnable(null, DevHash));
        }

        [Test]
        public void DevMode_PayKeepsBalance_ButEmitsSpent_AndGrantStillWorks()
        {
            bool dev = true;
            var state = new WalletState();
            state.Balances[Gem] = 10;
            var w = new Wallet.Wallet(Currencies(), state, () => dev);
            for (int i = 0; i < 10000; i++)
            {
                Assert.IsTrue(w.Pay(new Cost(Gem, 300), PR).Success);
            }
            Assert.AreEqual(10, w.Balance(Gem));
            IReadOnlyList<WalletEvent> ev = w.DrainEvents();
            Assert.AreEqual(10000, ev.Count);
            Assert.AreEqual(WalletEventKind.Spent, ev[0].Kind);
            Assert.AreEqual(10, ev[0].BalanceAfter);

            w.Grant(new Reward(Gem, 5), GR);
            Assert.AreEqual(15, w.Balance(Gem));

            dev = false; // 途中で切り替えても反映される
            Assert.IsFalse(w.Pay(new Cost(Gem, 300), PR).Success);
            Assert.AreEqual(15, w.Balance(Gem));
        }

        // ---- プロパティテスト ----

        private static string RunRandomOps(ulong seed, out List<string> violations)
        {
            violations = new List<string>();
            Rng rng = Rng.Create(seed, RngStream.Misc);
            var w = Make(gem: 100, ticket: 50, coin: 100);
            string[] ids = { Gem, Ticket, Coin };
            for (int step = 0; step < 10000; step++)
            {
                double[] before = { w.Balance(Gem), w.Balance(Ticket), w.Balance(Coin) };
                WalletState stateBefore = w.ExportState();
                bool isPay = rng.NextInt(2) == 0;
                var items = new List<Money>();
                int n = rng.NextInt(1, 4);
                for (int k = 0; k < n; k++)
                {
                    items.Add(new Money(ids[rng.NextInt(3)], Math.Round(rng.NextDouble() * 60, 2)));
                }
                bool success = true;
                if (isPay) { success = w.Pay(new Cost(items), PR).Success; }
                else { w.Grant(new Reward(items), GR); }

                IReadOnlyList<WalletEvent> ev = w.DrainEvents();
                double[] delta = new double[3];
                foreach (WalletEvent e in ev)
                {
                    int idx = Array.IndexOf(ids, e.CurrencyId);
                    delta[idx] += e.Kind == WalletEventKind.Granted ? e.Amount : -e.Amount;
                }
                for (int i = 0; i < 3; i++)
                {
                    double now = w.Balance(ids[i]);
                    if (now < 0) { violations.Add("負の残高 step " + step); }
                    if (Math.Abs(now - before[i] - delta[i]) > 1e-6) { violations.Add("イベントと残高が合わない step " + step); }
                }
                if (isPay && !success)
                {
                    if (ev.Count != 0) { violations.Add("失敗なのにイベント step " + step); }
                    WalletState after = w.ExportState();
                    foreach (string id in ids)
                    {
                        if (after.Balances[id] != stateBefore.Balances[id] || after.Carry[id] != stateBefore.Carry[id])
                        {
                            violations.Add("失敗したのに状態が変わった step " + step);
                        }
                    }
                }
            }
            WalletState fin = w.ExportState();
            return string.Join(",", fin.Balances[Gem], fin.Balances[Ticket], fin.Balances[Coin], fin.Carry[Ticket]);
        }

        [Test]
        public void Property_RandomOps_HoldInvariants_AndAreDeterministic()
        {
            string a = RunRandomOps(12345UL, out List<string> va);
            string b = RunRandomOps(12345UL, out List<string> vb);
            Assert.IsEmpty(va, string.Join("\n", va));
            Assert.IsEmpty(vb);
            Assert.AreEqual(a, b);
            string c = RunRandomOps(999UL, out List<string> vc);
            Assert.IsEmpty(vc, string.Join("\n", vc));
            Assert.AreNotEqual(a, c);
        }

        // ---- アーキテクチャ ----

        [Test]
        public void Wallet_PublicMembers_DoNotExposeBalanceCollections()
        {
            foreach (MethodInfo m in typeof(Wallet.Wallet).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                Type t = m.ReturnType;
                bool bad = t.IsArray
                    || (typeof(System.Collections.IDictionary).IsAssignableFrom(t))
                    || (t.IsGenericType && t.GetGenericTypeDefinition().Name.StartsWith("IReadOnlyDictionary"));
                Assert.IsFalse(bad, m.Name + " が残高のコレクションを返している");
            }
            foreach (PropertyInfo p in typeof(Wallet.Wallet).GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                Assert.AreEqual(typeof(bool), p.PropertyType, p.Name + " は bool だけ許す（残高のコレクションを返さない）");
            }
            Assert.AreEqual(0, typeof(Wallet.Wallet).GetFields(BindingFlags.Public | BindingFlags.Instance).Length);
        }
    }
}
