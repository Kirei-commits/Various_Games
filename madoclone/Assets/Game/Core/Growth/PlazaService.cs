using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum PlazaFailure { None, UnknownPlaza, AtMaxLv, NotEnough }

    public readonly struct PlazaResult
    {
        public readonly bool Success;
        public readonly PlazaFailure Failure;
        public readonly int NewLv, LevelsGained;
        public readonly double Spent, ShortBy;

        public PlazaResult(bool success, PlazaFailure failure, int newLv, int gained, double spent, double shortBy)
        {
            Success = success; Failure = failure; NewLv = newLv; LevelsGained = gained; Spent = spent; ShortBy = shortBy;
        }

        public static PlazaResult Fail(PlazaFailure f, double shortBy = 0) { return new PlazaResult(false, f, 0, 0, 0, shortBy); }
    }

    /// <summary>
    /// 広場（使い魔の里・霊界）のレベル上げ（docs/01 5.1・5.2節）。素材は広場ごとの通貨。
    /// 払える所まで上げる（LevelUpMax）か、1つずつ上げる（LevelUp）。開発者モードでは上限まで上がる。
    /// </summary>
    public sealed class PlazaService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public PlazaService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        /// <summary>広場Lv（まだ上げていない広場は 1）。</summary>
        public int Lv(string plazaId)
        {
            return _save.Plazas.Levels.TryGetValue(plazaId ?? "", out int lv) ? lv : 1;
        }

        /// <summary>広場Lv が lv のときの、全キャラの攻撃力・HP・防御力の増加％。</summary>
        public double Pct(string plazaId, int lv)
        {
            PlazaDef def = Def(plazaId);
            if (lv < 1 || lv > def.MaxLv) { throw new ArgumentException("広場Lv が範囲外: " + lv); }
            return def.Pct(lv);
        }

        /// <summary>Lv lv → lv+1 に要る素材。</summary>
        public double CostToNext(string plazaId, int lv)
        {
            PlazaDef def = Def(plazaId);
            if (lv < 1 || lv >= def.MaxLv) { throw new ArgumentException("Lv が範囲外（最大Lv では次の費用が無い）: " + lv); }
            return def.CostAtLv * Math.Pow(def.CostGrowth, lv - def.CostLv);
        }

        public PlazaResult LevelUp(string plazaId)
        {
            if (!_data.Plazas.TryGet(plazaId, out PlazaDef def)) { return PlazaResult.Fail(PlazaFailure.UnknownPlaza); }
            int lv = Lv(plazaId);
            if (lv >= def.MaxLv) { return PlazaResult.Fail(PlazaFailure.AtMaxLv); }
            return Apply(def, lv, lv + 1);
        }

        /// <summary>払える所まで上げる。1つも上がらなければ NotEnough。開発者モードなら上限まで。</summary>
        public PlazaResult LevelUpMax(string plazaId)
        {
            if (!_data.Plazas.TryGet(plazaId, out PlazaDef def)) { return PlazaResult.Fail(PlazaFailure.UnknownPlaza); }
            int lv = Lv(plazaId);
            if (lv >= def.MaxLv) { return PlazaResult.Fail(PlazaFailure.AtMaxLv); }
            int target = lv;
            double balance = _wallet.Balance(def.CurrencyId);
            if (_wallet.Unlimited) { target = def.MaxLv; }
            else
            {
                double spent = 0;
                while (target < def.MaxLv && spent + CostToNext(plazaId, target) <= balance) { spent += CostToNext(plazaId, target); target++; }
            }
            if (target == lv) { return PlazaResult.Fail(PlazaFailure.NotEnough, CostToNext(plazaId, lv) - balance); }
            return Apply(def, lv, target);
        }

        private PlazaResult Apply(PlazaDef def, int from, int to)
        {
            double cost = 0;
            for (int l = from; l < to; l++) { cost += CostToNext(def.Id, l); }
            PayResult pay = _wallet.Pay(new Cost(def.CurrencyId, cost), new PayReason(WalletReasons.PlazaLevelUp));
            if (!pay.Success) { return PlazaResult.Fail(PlazaFailure.NotEnough, pay.ShortBy); }
            _save.Plazas.Levels[def.Id] = to;
            return new PlazaResult(true, PlazaFailure.None, to, to - from, cost, 0);
        }

        private PlazaDef Def(string id)
        {
            if (!_data.Plazas.TryGet(id, out PlazaDef def)) { throw new ArgumentException("広場が無い: " + id); }
            return def;
        }
    }

    /// <summary>広場の効果：全キャラの攻撃力・HP・防御力に、Global の輪で同じ％を足す。</summary>
    public sealed class PlazaSource : IModifierSource
    {
        private readonly GameData _data;
        private readonly SaveData _save;

        public PlazaSource(GameData data, SaveData save)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
        }

        public void Collect(List<Modifier> sink, StatQuery query)
        {
            foreach (PlazaDef p in _data.Plazas.Plazas)
            {
                int lv = _save.Plazas.Levels.TryGetValue(p.Id, out int v) ? Math.Max(1, Math.Min(v, p.MaxLv)) : 1;
                double pct = p.Pct(lv);
                sink.Add(new Modifier(StatId.Atk, ModifierPool.Global, pct));
                sink.Add(new Modifier(StatId.Hp, ModifierPool.Global, pct));
                sink.Add(new Modifier(StatId.Def, ModifierPool.Global, pct));
            }
        }
    }
}
