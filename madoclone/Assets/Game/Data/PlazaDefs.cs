using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>広場1つ（使い魔の里・霊界）。広場Lvで、全キャラの攻撃力・HP・防御力が同じ％だけ上がる（docs/01 5.1・5.2節）。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class PlazaDef
    {
        public string Id { get; init; }

        /// <summary>レベル上げに使う素材（currencies.json の id）。</summary>
        public string CurrencyId { get; init; }
        public int MaxLv { get; init; }

        /// <summary>knotLv より上の1Lv あたりの増加％（実測：使い魔 130、霊界 200）。</summary>
        public double PctPerLv { get; init; }

        /// <summary>実測の1点：広場Lv knotLv で増加％が knotPct（使い魔 Lv51 で 5,538、霊界 Lv40 で 6,574）。knotLv 以下は Lv1 の 0％ からこの点までの直線 [仮]、より上は PctPerLv ずつ。</summary>
        public int KnotLv { get; init; }
        public double KnotPct { get; init; }

        /// <summary>広場Lv が lv のときの、全キャラの攻撃力・HP・防御力の増加％。</summary>
        public double Pct(int lv)
        {
            if (lv <= KnotLv) { return KnotPct * (lv - 1) / (KnotLv - 1); }
            return KnotPct + PctPerLv * (lv - KnotLv);
        }

        /// <summary>Lv costLv → +1 に要る素材が costAtLv（実測）。Lv L → L+1 は costAtLv × costGrowth^(L − costLv)。[仮：成長率]</summary>
        public double CostAtLv { get; init; }
        public int CostLv { get; init; }
        public double CostGrowth { get; init; }
    }

    /// <summary>plazas.json。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class PlazasConfig
    {
        public int SchemaVersion { get; init; }
        public IReadOnlyList<PlazaDef> Plazas { get; init; }

        public bool TryGet(string id, out PlazaDef plaza)
        {
            foreach (PlazaDef p in Plazas) { if (p.Id == id) { plaza = p; return true; } }
            plaza = null;
            return false;
        }
    }
}
