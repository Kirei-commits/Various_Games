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
    }
}
