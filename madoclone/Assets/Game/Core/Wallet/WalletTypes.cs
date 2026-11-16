using System;
using System.Collections.Generic;

namespace Mado.Core.Wallet
{
    /// <summary>支払いの理由（"gacha.pull" など）。</summary>
    public readonly struct PayReason
    {
        public readonly string Key;
        public PayReason(string key) { Key = key ?? throw new ArgumentNullException(nameof(key)); }
    }

    /// <summary>付与の理由。</summary>
    public readonly struct GrantReason
    {
        public readonly string Key;
        public GrantReason(string key) { Key = key ?? throw new ArgumentNullException(nameof(key)); }
    }

    /// <summary>理由キーの定数。使う側が増えたらここに足す。</summary>
    public static class WalletReasons
    {
        public const string GachaPull = "gacha.pull";
        public const string GrowthLevelUp = "growth.levelup";
        public const string GrowthAwaken = "growth.awaken";
        public const string BattleDrop = "battle.drop";
        public const string MemoryGachaLevel = "memory.gachalevel";
        public const string IdleClaim = "idle.claim";
        public const string LeaderLevelUp = "leader.levelup";
        public const string LeaderReward = "leader.reward";
    }

    /// <summary>通貨 ID（currencies.json の id）。コードから使うものだけ。</summary>
    public static class CurrencyIds
    {
        public const string Gem = "gem";
        public const string Coin = "coin";
        public const string Exp = "exp";
        public const string AwakenShard = "awaken_shard";
        public const string BondHeart = "bond_heart";
        public const string ManaShard = "mana_shard";
        public const string ManaCrystal = "mana_crystal";
    }

    /// <summary>Pay の結果。失敗のとき、足りない通貨（通貨マスタの並びで最初の1つ）を持つ。</summary>
    public readonly struct PayResult
    {
        public readonly bool Success;
        public readonly string ShortCurrencyId;
        public readonly double ShortBy;

        public PayResult(bool success, string shortCurrencyId, double shortBy)
        {
            Success = success;
            ShortCurrencyId = shortCurrencyId;
            ShortBy = shortBy;
        }

        public static PayResult Ok() { return new PayResult(true, null, 0); }
    }

    public enum WalletEventKind { Spent, Granted }

    public readonly struct WalletEvent
    {
        public readonly WalletEventKind Kind;
        public readonly string CurrencyId;
        public readonly double Amount;
        public readonly string ReasonKey;
        public readonly double BalanceAfter;

        public WalletEvent(WalletEventKind kind, string currencyId, double amount, string reasonKey, double balanceAfter)
        {
            Kind = kind;
            CurrencyId = currencyId;
            Amount = amount;
            ReasonKey = reasonKey;
            BalanceAfter = balanceAfter;
        }
    }

    /// <summary>セーブとの受け渡し用。Wallet は生成時にコピーして取り込み、以後は共有しない。</summary>
    public sealed class WalletState
    {
        public Dictionary<string, double> Balances { get; set; } = new Dictionary<string, double>();
        public Dictionary<string, double> Carry { get; set; } = new Dictionary<string, double>();
    }
}
