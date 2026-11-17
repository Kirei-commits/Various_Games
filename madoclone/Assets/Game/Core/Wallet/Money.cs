using System;

namespace Mado.Core.Wallet
{
    /// <summary>通貨 ID と金額の組。</summary>
    public readonly struct Money
    {
        public readonly string CurrencyId;
        public readonly double Amount;

        public Money(string currencyId, double amount)
        {
            CurrencyId = currencyId ?? throw new ArgumentNullException(nameof(currencyId));
            Amount = amount;
        }
    }
}
