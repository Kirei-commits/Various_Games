using System.Collections.Generic;
using Mado.Core.Progress;
using Mado.Data;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>ルーレット：ルーレットコインを払って回す。結果は当たった報酬の合計を出す。</summary>
    public sealed class RouletteScreen : GameScreen
    {
        private string _result;

        public RouletteScreen(MadoApp app, Transform parent) : base(app, parent, "Roulette") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.roulette.title"), 56, 0.04f, 0.9f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            UiKit.Label(Root, "Coins", T("ui.roulette.coins", Num(State.Balance("roulette_coin"))), 34, 0.04f, 0.83f, 0.96f, 0.9f, TextAnchor.MiddleCenter);
            UiKit.Rect(Root, "Box", 0.04f, 0.4f, 0.96f, 0.82f, UiKit.Panel);
            UiKit.Label(Root, "Result", _result ?? T("ui.roulette.none"), 34, 0.06f, 0.4f, 0.94f, 0.82f);
            UiKit.Button(Root, "S1", T("ui.roulette.spin1"), 0.04f, 0.25f, 0.48f, 0.37f, UiKit.Accent, () => Spin(1));
            UiKit.Button(Root, "S10", T("ui.roulette.spin10"), 0.52f, 0.25f, 0.96f, 0.37f, UiKit.Accent, () => Spin(10));
        }

        private void Spin(int count)
        {
            if (!App.Commit(Session.SpinRoulette(count, out RouletteResult r))) { return; }
            var totals = new SortedDictionary<string, double>();
            foreach (int hit in r.Hits)
            {
                foreach (MoneyDef m in Data.Economy.Roulette.Entries[hit].Reward) { totals[m.CurrencyId] = (totals.TryGetValue(m.CurrencyId, out double v) ? v : 0) + m.Amount; }
            }
            var parts = new List<string>();
            foreach (KeyValuePair<string, double> kv in totals) { parts.Add(T("currency." + kv.Key) + " +" + Num(kv.Value)); }
            _result = T("ui.roulette.result", string.Join("、", parts));
            Refresh();
        }
    }
}
