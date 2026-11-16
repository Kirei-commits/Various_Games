using System.Collections.Generic;
using Mado.Core.Progress;
using Mado.Core.Wallet;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>
    /// 闘技の順位：いまのシーズン（何戦目か・ポイント・順位）、シーズン報酬の受け取り、順位表。
    /// 順位表は「自分の前後5人」と「全順位（スクロール）」を切り替えて見る。
    /// </summary>
    public sealed class ArenaRankScreen : GameScreen
    {
        private const int Around = 5;
        private bool _all;

        public ArenaRankScreen(MadoApp app, Transform parent) : base(app, parent, "ArenaRank") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.arena.title"), 56, 0.04f, 0.92f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            UiKit.Label(Root, "Season", T("ui.arena.season", State.ArenaSeason, State.ArenaBattles, State.ArenaSeasonBattles, State.ArenaPoints, State.ArenaRank), 30, 0.04f, 0.85f, 0.96f, 0.92f, TextAnchor.MiddleCenter);
            float listTop = 0.78f;
            if (State.ArenaPendingRank > 0)
            {
                UiKit.Button(Root, "Claim", T("ui.arena.claim", State.ArenaPendingRank, RewardText(State.ArenaPendingRank)), 0.04f, 0.78f, 0.96f, 0.85f, UiKit.Good, Claim);
                listTop = 0.76f;
            }
            UiKit.Button(Root, "Toggle", T(_all ? "ui.arena.show_near" : "ui.arena.show_all"), 0.04f, listTop - 0.07f, 0.96f, listTop, UiKit.Panel, () => { _all = !_all; Refresh(); });
            IReadOnlyList<ArenaStanding> standings = State.ArenaStandings;
            float bottom = 0.02f, top = listTop - 0.08f;
            if (_all) { AllList(standings, bottom, top); } else { NearList(standings, bottom, top); }
        }

        private void NearList(IReadOnlyList<ArenaStanding> standings, float bottom, float top)
        {
            int me = 0;
            for (int i = 0; i < standings.Count; i++) { if (standings[i].IsPlayer) { me = i; break; } }
            int from = System.Math.Max(0, me - Around), to = System.Math.Min(standings.Count - 1, me + Around);
            float rowH = System.Math.Min(0.06f, (top - bottom) / (2 * Around + 1));
            for (int i = from; i <= to; i++)
            {
                float y1 = top - (i - from) * rowH, y0 = y1 - rowH + 0.004f;
                Row(Root, "Row" + i, standings[i], 0f, 1f, y0, y1);
            }
        }

        private void AllList(IReadOnlyList<ArenaStanding> standings, float bottom, float top)
        {
            const float rowPx = 70f;
            RectTransform content = UiKit.ScrollList(Root, "Scroll", 0.03f, bottom, 0.97f, top, rowPx * standings.Count);
            int n = standings.Count;
            for (int i = 0; i < n; i++) { Row(content, "Row" + i, standings[i], 0f, 1f, 1f - (i + 1f) / n, 1f - (float)i / n); }
        }

        private void Row(Transform parent, string name, ArenaStanding s, float x0, float x1, float y0, float y1)
        {
            UiKit.Rect(parent, name, x0 == 0f && parent == Root ? 0.03f : x0, y0, x1 == 1f && parent == Root ? 0.97f : x1, y1, s.IsPlayer ? UiKit.PanelLight : UiKit.Panel);
            string who = s.IsPlayer ? T("ui.arena.you") : s.Name;
            float left = parent == Root ? 0.05f : 0.02f, right = parent == Root ? 0.95f : 0.98f;
            UiKit.Label(parent, name + "Text", T("ui.arena.row", s.Rank, who, s.Points), 28, left, y0, right, y1);
        }

        private string RewardText(int rank)
        {
            var parts = new List<string>();
            foreach (Money m in State.ArenaRewardForRank(rank)) { parts.Add(T("currency." + m.CurrencyId) + " " + Num(m.Amount)); }
            return string.Join("、", parts);
        }

        private void Claim()
        {
            if (App.Commit(Session.ClaimArenaSeason())) { Refresh(); }
        }
    }
}
