using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>機能 1つ：ランク rank に着くと使える（docs/01 6.1節の「新しく解放」。試練の解放ランクは [仮]）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class UnlockDef
    {
        public string Id { get; init; }
        public int Rank { get; init; }
    }

    /// <summary>unlocks.json：機能の解放（ランクで開く）。表に無い機能は最初から使える。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class UnlocksConfig
    {
        public int SchemaVersion { get; init; }
        public IReadOnlyList<UnlockDef> Features { get; init; }

        /// <summary>機能が開くランク。表に無ければ 1（最初から）。</summary>
        public int RankOf(string featureId)
        {
            foreach (UnlockDef f in Features) { if (f.Id == featureId) { return f.Rank; } }
            return 1;
        }
    }
}
