using System.Collections.Generic;
using System.Text;
using Mado.Core.Growth;
using Mado.Core.Session;
using Mado.Data;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>キャラガチャ：1回・10連・300連（既定は300連。docs/01 7.7節）。結果は格ごとの件数と、新しく入手したキャラにまとめて出す。</summary>
    public sealed class GachaScreen : GameScreen
    {
        private string _result;

        public GachaScreen(MadoApp app, Transform parent) : base(app, parent, "Gacha") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.gacha.title"), 56, 0.04f, 0.92f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            UiKit.Label(Root, "Tickets", T("ui.gacha.tickets", Num(State.Balance("gacha_ticket")), State.GachaTotalPulls), 34, 0.04f, 0.86f, 0.96f, 0.92f, TextAnchor.MiddleCenter);
            UiKit.Rect(Root, "ResultBox", 0.04f, 0.38f, 0.96f, 0.85f, UiKit.Panel);
            UiKit.Label(Root, "Result", _result ?? T("ui.gacha.no_result"), 32, 0.06f, 0.38f, 0.94f, 0.85f);
            UiKit.Button(Root, "P300", T("ui.gacha.pull300"), 0.04f, 0.26f, 0.96f, 0.36f, UiKit.Accent, () => Pull(300));
            UiKit.Button(Root, "P10", T("ui.gacha.pull10"), 0.04f, 0.14f, 0.48f, 0.24f, UiKit.PanelLight, () => Pull(10));
            UiKit.Button(Root, "P1", T("ui.gacha.pull1"), 0.52f, 0.14f, 0.96f, 0.24f, UiKit.PanelLight, () => Pull(1));
            UiKit.Button(Root, "Buy", T("ui.gacha.buy"), 0.04f, 0.02f, 0.96f, 0.12f, UiKit.Good, () => App.Commit(Session.BuyGachaTickets(1)));
        }

        private void Pull(int count)
        {
            if (State.Balance("gacha_ticket") < count && !State.DevMode)
            {
                _result = T("ui.gacha.not_enough");
                Refresh();
                return;
            }
            CommandResult r = Session.PullCharacterGacha(GachaBanner.Normal, count, out GachaResult result);
            if (!App.Commit(r)) { return; }
            _result = Summarize(result);
            Refresh();
        }

        private string Summarize(GachaResult result)
        {
            var tiers = new SortedDictionary<int, int>();
            var names = new List<string>();
            foreach (GachaDrop d in result.Drops)
            {
                int key = (int)d.Tier;
                tiers[key] = (tiers.TryGetValue(key, out int n) ? n : 0) + 1;
                if (d.IsNew && names.Count < 12) { names.Add(NameOf(d.CharacterId)); }
            }
            var sb = new StringBuilder();
            var parts = new List<string>();
            foreach (KeyValuePair<int, int> kv in tiers)
            {
                parts.Add(T("tier." + Mado.Data.EnumStringConverter.Text((CharTier)kv.Key)) + " " + kv.Value);
            }
            sb.Append(T("ui.gacha.result", string.Join("　", parts)));
            if (names.Count > 0) { sb.Append("\n").Append(T("ui.gacha.new", string.Join("、", names))); }
            return sb.ToString();
        }
    }
}
