using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>guild.json：NPCギルド（docs/01 7.4節。オンラインは作らない）。メンバーの名前と、戦力の幅（自分の戦力に対する割合）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class GuildConfig
    {
        public int SchemaVersion { get; init; }
        public int MemberCount { get; init; }
        public IReadOnlyList<string> Names { get; init; }

        /// <summary>メンバーの戦力は、自分の戦力の powerMin 〜 powerMax 倍の見せかけの値。</summary>
        public double PowerMin { get; init; }
        public double PowerMax { get; init; }

        public ArenaConfig Arena { get; init; }
    }

    /// <summary>順位ごとのシーズン報酬。順位が maxRank 以内の最初の行が当たる（maxRank は昇順）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class ArenaRewardTier
    {
        public int MaxRank { get; init; }
        public IReadOnlyList<MoneyDef> Reward { get; init; }
    }

    /// <summary>
    /// 大魔闘演武のシーズン（戦った回数で決まる）。1シーズン＝ seasonBattles 戦。勝つと winPoints 増え、負けると losePoints 減る（0 未満にならない）。
    /// 順位は、NPCのライバル（rivals）と自分のポイントを比べて決まる。ライバルの最終ポイントは 0〜rivalMaxPoints で、シーズンの進みに比例して増える。
    /// </summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class ArenaConfig
    {
        public int SeasonBattles { get; init; }
        public int WinPoints { get; init; }
        public int LosePoints { get; init; }
        public double RivalMaxPoints { get; init; }
        public IReadOnlyList<string> Rivals { get; init; }
        public IReadOnlyList<ArenaRewardTier> RewardTiers { get; init; }
    }
}
