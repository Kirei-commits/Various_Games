using System;
using System.Collections.Generic;

namespace Mado.Core.Wallet
{
    /// <summary>
    /// Cost と Reward の共通部分。作るときに、負・NaN・無限大を ArgumentException にし、
    /// 同じ通貨の項目を合算し、金額 0 の項目を捨てる（docs/04 5.2節）。
    /// </summary>
    public abstract class MoneyList
    {
        public IReadOnlyList<Money> Items { get; }

        protected MoneyList(IEnumerable<Money> items)
        {
            if (items == null) { throw new ArgumentNullException(nameof(items)); }
            var order = new List<string>();
            var sums = new Dictionary<string, double>();
            foreach (Money m in items)
            {
                if (double.IsNaN(m.Amount) || double.IsInfinity(m.Amount) || m.Amount < 0)
                {
                    throw new ArgumentException("金額が不正: " + m.CurrencyId + " = " + m.Amount);
                }
                if (m.Amount == 0) { continue; }
                if (sums.TryGetValue(m.CurrencyId, out double s)) { sums[m.CurrencyId] = s + m.Amount; }
                else { sums[m.CurrencyId] = m.Amount; order.Add(m.CurrencyId); }
            }
            var list = new List<Money>(order.Count);
            foreach (string id in order) { list.Add(new Money(id, sums[id])); }
            Items = list;
        }
    }

    /// <summary>支払う素材の組。</summary>
    public sealed class Cost : MoneyList
    {
        public Cost(IEnumerable<Money> items) : base(items) { }
        public Cost(string currencyId, double amount) : base(new[] { new Money(currencyId, amount) }) { }
    }

    /// <summary>受け取る素材の組。</summary>
    public sealed class Reward : MoneyList
    {
        public Reward(IEnumerable<Money> items) : base(items) { }
        public Reward(string currencyId, double amount) : base(new[] { new Money(currencyId, amount) }) { }
    }
}
