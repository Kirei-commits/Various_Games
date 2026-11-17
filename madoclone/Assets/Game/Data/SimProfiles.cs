using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>共通倍率（攻撃・HP・防御）。0 は「出どころ無し」で、基礎値のまま。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class GlobalMultiplier
    {
        public double Atk { get; init; }
        public double Hp { get; init; }
        public double Def { get; init; }
    }

    /// <summary>ランクごとの「標準的な育ち具合」（sim_profiles.json の1件。docs/04 10節）。globalMultiplier は Mado.Sim が書き込む。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class SimProfileDef
    {
        public int Rank { get; init; }
        public int Star { get; init; }
        public int Lv { get; init; }
        public IReadOnlyList<string> PartyCharacterIds { get; init; }
        public GlobalMultiplier GlobalMultiplier { get; init; }
    }

    [JsonObject(ItemRequired = Required.Always)]
    public sealed class SimProfilesFile
    {
        public int SchemaVersion { get; init; }

        /// <summary>
        /// 味方が各ランクで標準的に持つ副ステータス（全体強化の共通値の代わり。docs/01 6.2節の表）：値 = A + B×ランク。
        /// 基本値（system.json の baseSubstats）より大きい分だけを Flat として足す。
        /// </summary>
        public EnemySubstatFormulas AllySubstats { get; init; }

        public IReadOnlyList<SimProfileDef> Items { get; init; }
    }

    /// <summary>sim_profiles.json の読み込み。ゲーム本体は使わない（戦闘シミュレーション専用）。</summary>
    public static class SimProfiles
    {
        public const string FileName = "sim_profiles.json";

        public static IReadOnlyList<SimProfileDef> Load(IDataSource source)
        {
            return LoadFile(source).Items;
        }

        public static SimProfilesFile LoadFile(IDataSource source)
        {
            string text = source.ReadText(FileName);
            try
            {
                var settings = new JsonSerializerSettings { MissingMemberHandling = MissingMemberHandling.Error };
                return JsonConvert.DeserializeObject<SimProfilesFile>(text, settings);
            }
            catch (JsonException e)
            {
                throw new DataException(FileName + ": " + e.Message);
            }
        }
    }
}
