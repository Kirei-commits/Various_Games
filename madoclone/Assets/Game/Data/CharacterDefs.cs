using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>★に応じて増える副ステータスの凸ボーナス。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class SubstatBonus
    {
        public int Star { get; init; }
        public SubstatKey Stat { get; init; }
        public double Value { get; init; }
    }

    /// <summary>キャラの3種のスキルの ID。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class CharacterSkillIds
    {
        public string Normal { get; init; }
        public string Special { get; init; }
        public string Ultimate { get; init; }

        public string Get(SkillKind kind)
        {
            switch (kind)
            {
                case SkillKind.Normal: return Normal;
                case SkillKind.Special: return Special;
                default: return Ultimate;
            }
        }
    }

    /// <summary>キャラの画像の ID（アセットの名前）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class CharacterAssetIds
    {
        public string Portrait { get; init; }
        public string Icon { get; init; }
        public string Battle { get; init; }
    }

    /// <summary>キャラ1体（characters.json の1件）。名前などの文字は text/ja.json の「ID.name」。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class CharacterDef
    {
        public string Id { get; init; }
        public CharTier Tier { get; init; }
        public Element Element { get; init; }
        public Role Role { get; init; }
        public CharType Type { get; init; }
        public CharacterSkillIds Skills { get; init; }
        public IReadOnlyList<SubstatBonus> SubstatBonuses { get; init; }

        /// <summary>このキャラ専用の魔晶（crystals.json の id）。6凸で★6の枠に付く（docs/01 4.4節）。</summary>
        public string CrystalId { get; init; }

        public ObtainKind Obtain { get; init; }
        public CharacterAssetIds AssetIds { get; init; }

        /// <summary>フェーズ1で10体に絞るときなどに false にする。省略は true。</summary>
        [JsonProperty(Required = Required.Default)]
        public bool Enabled { get; init; } = true;
    }

    /// <summary>キャラの格ごとの設定（tiers.json の1件）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TierDef
    {
        public CharTier Id { get; init; }
        public int Count { get; init; }
        public int UnlockRank { get; init; }
        public double ExchangeMultiplier { get; init; }
        public double StatMultiplier { get; init; }
        public bool Gacha { get; init; }
    }

    /// <summary>通貨1種類（currencies.json の1件）。integer が true なら個数は整数。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class CurrencyDef
    {
        public string Id { get; init; }
        public bool Integer { get; init; }
        public string AssetId { get; init; }
    }
}
