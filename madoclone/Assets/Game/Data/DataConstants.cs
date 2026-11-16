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
        public const int MaxLevel = 200;

        /// <summary>★0〜16 の17段階（★0〜11 は元の仕様。★12〜16 は限界突破。自作の終盤の育成）。</summary>
        public const int StarSteps = 17;

        /// <summary>覚醒のかけらの必要枚数の合計（★0→★11 で46、限界突破の★12〜16 で50）。</summary>
        public const int AwakenCostTotal = 2546;

        /// <summary>魔晶の枠の数。</summary>
        public const int CrystalSlotCount = 5;

        /// <summary>魔晶の kind の値。</summary>
        public const string CrystalKind = "crystal";
    }
}
