namespace Mado.Data
{
    /// <summary>JSON マスタ全体で共通の定数。</summary>
    public static class DataConstants
    {
        /// <summary>各マスタ JSON の schemaVersion。スキーマを非互換に変えたら上げる。</summary>
        public const int SchemaVersion = 1;

        /// <summary>キャラの総数（SSR 103 体＋LR 2 体）。</summary>
        public const int CharacterCount = 105;

        /// <summary>レベル表の最大レベル。</summary>
        public const int MaxLevel = 120;

        /// <summary>★0〜11 の12段階。</summary>
        public const int StarSteps = 12;

        /// <summary>覚醒のかけらの必要枚数の合計（★0→★11）。</summary>
        public const int AwakenCostTotal = 46;

        /// <summary>魔晶の枠の数。</summary>
        public const int CrystalSlotCount = 5;

        /// <summary>魔晶の kind の値。</summary>
        public const string CrystalKind = "crystal";
    }
}
