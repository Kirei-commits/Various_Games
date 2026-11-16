using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TierRate
    {
        public string Tier { get; init; }
        public double Pct { get; init; }
    }

    /// <summary>累計の引き数に応じたステップ報酬。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class GachaStep
    {
        public int Count { get; init; }
        public string CurrencyId { get; init; }
        public double Amount { get; init; }
    }

    /// <summary>
    /// gacha.json：キャラガチャ（docs/01 7.7節 自作版）。1回＝チケット1枚。格の確率はユーザー指定（素20・灯25・彩25・煌20・天5・極5）。
    /// ピックアップは、極のうち pickupShare が選んだ1体に当たり、pickupPity 回で選んだ1体が確定。
    /// 解放ランクに着いていない格は出ない（残りの確率で割り直す）。
    /// </summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class GachaConfig
    {
        public int SchemaVersion { get; init; }
        public string TicketCurrency { get; init; }

        /// <summary>チケット1枚を買うジェム（docs/01：300）。</summary>
        public double TicketGemPrice { get; init; }
        public IReadOnlyList<TierRate> TierRates { get; init; }
        public string PickupTier { get; init; }
        public double PickupShare { get; init; }
        public int PickupPity { get; init; }
        public IReadOnlyList<GachaStep> Steps { get; init; }
    }
}
