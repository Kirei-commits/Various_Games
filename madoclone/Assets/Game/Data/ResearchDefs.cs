using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>ツリーのノード1つ。Lv × perLv が効果（atk・hp・def は％、副ステータスはポイント）。Lv L → L+1 の費用 ＝ costBase ＋ costStep × L。requires の全ノードが最大Lv で解放。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TreeNodeDef
    {
        public string Id { get; init; }
        public string Stat { get; init; }
        public double PerLv { get; init; }
        public int MaxLv { get; init; }
        public double CostBase { get; init; }
        public double CostStep { get; init; }
        public IReadOnlyList<string> Requires { get; init; }
    }

    /// <summary>育成ツリー（研究所・リーダー特殊ツリー）。効果はチーム全体。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TreeDef
    {
        public string Id { get; init; }
        public string CurrencyId { get; init; }
        public IReadOnlyList<TreeNodeDef> Nodes { get; init; }
    }

    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TarotRarityDef
    {
        public string Id { get; init; }

        /// <summary>そのレアのカードの効果の値（出来は100％固定）。</summary>
        public double MaxPct { get; init; }

        /// <summary>1枠をこのレアにするワイン（枠を変えるたびに払う。返金なし）。</summary>
        public double WineCost { get; init; }
    }

    /// <summary>タロット：枠ごとに「効果とレア」を選び、ワインを払う（docs/01 7.5節）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class TarotConfig
    {
        public int Slots { get; init; }
        public IReadOnlyList<string> Effects { get; init; }
        public IReadOnlyList<TarotRarityDef> Rarities { get; init; }
    }

    /// <summary>コレクションのセット1つ。★1〜★5 の効果の値（values）と、その★に上げる費用（starCost、コレクションメダル）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class CollectionSetDef
    {
        public string Id { get; init; }
        public string Stat { get; init; }
        public IReadOnlyList<double> Values { get; init; }
        public IReadOnlyList<double> StarCost { get; init; }
    }

    [JsonObject(ItemRequired = Required.Always)]
    public sealed class CollectionConfig
    {
        public string CurrencyId { get; init; }
        public IReadOnlyList<CollectionSetDef> Sets { get; init; }
    }

    /// <summary>図鑑：キャラごとの目標（Lv の節目と、★1〜最大★）。達成するたびにチーム全体の攻撃・HP・防御のどれかが perGoalPct 上がり、ジェムがもらえる。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class ZukanConfig
    {
        public IReadOnlyList<int> LevelGoals { get; init; }
        public double PerGoalPct { get; init; }
        public double GemReward { get; init; }
    }

    /// <summary>research.json：研究ツリー（研究所・タロット）、リーダー特殊ツリー、コレクション、図鑑（docs/01 7.3〜7.5節）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class ResearchConfig
    {
        public int SchemaVersion { get; init; }
        public IReadOnlyList<TreeDef> Trees { get; init; }
        public TarotConfig Tarot { get; init; }
        public CollectionConfig Collection { get; init; }
        public ZukanConfig Zukan { get; init; }

        public bool TryTree(string id, out TreeDef tree)
        {
            foreach (TreeDef t in Trees) { if (t.Id == id) { tree = t; return true; } }
            tree = null;
            return false;
        }
    }
}
