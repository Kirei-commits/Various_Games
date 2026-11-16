using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>通貨と量の組（費用・報酬）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class MoneyDef
    {
        public string CurrencyId { get; init; }
        public double Amount { get; init; }
    }

    /// <summary>ショップ・交換所の商品。tab は item（ジェムなどで買う）か exchange（ポイント・コインで交換）。購入回数の制限は無い（docs/01 7.8節）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class ShopItemDef
    {
        public string Id { get; init; }
        public string Tab { get; init; }
        public IReadOnlyList<MoneyDef> Cost { get; init; }
        public IReadOnlyList<MoneyDef> Reward { get; init; }
    }

    [JsonObject(ItemRequired = Required.Always)]
    public sealed class RouletteEntry
    {
        public double Weight { get; init; }
        public IReadOnlyList<MoneyDef> Reward { get; init; }
    }

    /// <summary>ルーレット：ルーレットコインを払って回し、重みに従って報酬が当たる。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class RouletteDef
    {
        public string CurrencyId { get; init; }
        public double CostPerSpin { get; init; }
        public IReadOnlyList<RouletteEntry> Entries { get; init; }
    }

    [JsonObject(ItemRequired = Required.Always)]
    public sealed class AchievementTier
    {
        public double Target { get; init; }
        public IReadOnlyList<MoneyDef> Reward { get; init; }
    }

    /// <summary>実績：MetricCounter の値（metric）が各段の target に達したら、報酬を1回だけ受け取れる。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class AchievementDef
    {
        public string Id { get; init; }
        public string Metric { get; init; }
        public IReadOnlyList<AchievementTier> Tiers { get; init; }
    }

    /// <summary>economy.json：ショップ・交換所、ルーレット、実績。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class EconomyConfig
    {
        public int SchemaVersion { get; init; }
        public IReadOnlyList<ShopItemDef> Shop { get; init; }
        public RouletteDef Roulette { get; init; }
        public IReadOnlyList<AchievementDef> Achievements { get; init; }

        public bool TryShopItem(string id, out ShopItemDef item)
        {
            foreach (ShopItemDef s in Shop) { if (s.Id == id) { item = s; return true; } }
            item = null;
            return false;
        }

        public bool TryAchievement(string id, out AchievementDef ach)
        {
            foreach (AchievementDef a in Achievements) { if (a.Id == id) { ach = a; return true; } }
            ach = null;
            return false;
        }
    }
}
