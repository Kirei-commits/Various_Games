using System;
using System.Collections.Generic;
using Mado.Core.Session;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>編成：持っているキャラの一覧（1ページ8体）。レベル上げ・覚醒・編成に入れる／外す。</summary>
    public sealed class PartyScreen : GameScreen
    {
        private const int PageSize = 8;
        private int _page;

        public PartyScreen(MadoApp app, Transform parent) : base(app, parent, "Party") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            IReadOnlyList<string> owned = State.OwnedCharacterIds;
            int pages = Math.Max(1, (owned.Count + PageSize - 1) / PageSize);
            _page = Math.Max(0, Math.Min(_page, pages - 1));
            int inParty = 0;
            foreach (string id in State.Party) { if (id != null) { inParty++; } }

            UiKit.Label(Root, "Title", T("ui.party.title"), 56, 0.04f, 0.92f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            UiKit.Label(Root, "Header", T("ui.party.header", inParty, Num(State.Balance("exp")), Num(State.Balance("awaken_shard"))), 30, 0.04f, 0.87f, 0.96f, 0.92f, TextAnchor.MiddleCenter);
            if (owned.Count == 0) { UiKit.Label(Root, "Empty", T("ui.party.empty"), 38, 0.08f, 0.4f, 0.92f, 0.7f, TextAnchor.MiddleCenter); return; }

            for (int i = 0; i < PageSize; i++)
            {
                int index = _page * PageSize + i;
                if (index >= owned.Count) { break; }
                string id = owned[index];
                State.TryCharacter(id, out CharacterView v);
                bool member = Array.IndexOf(ToArray(State.Party), id) >= 0;
                float y1 = 0.86f - i * 0.098f, y0 = y1 - 0.09f;
                UiKit.Rect(Root, "Row" + i, 0.03f, y0, 0.97f, y1, member ? UiKit.PanelLight : UiKit.Panel);
                UiKit.Label(Root, "Name" + i, T("ui.party.row", NameOf(id), v.Star, v.Lv), 30, 0.05f, y0, 0.45f, y1);
                string captured = id;
                UiKit.Button(Root, "Lv" + i, T("ui.party.levelup"), 0.46f, y0 + 0.01f, 0.64f, y1 - 0.01f, UiKit.Accent, () => App.Commit(Session.LevelUpMax(captured)));
                UiKit.Button(Root, "Aw" + i, T("ui.party.awaken"), 0.65f, y0 + 0.01f, 0.81f, y1 - 0.01f, UiKit.Good, () => App.Commit(Session.Awaken(captured)));
                UiKit.Button(Root, "Join" + i, member ? T("ui.party.leave") : T("ui.party.join"), 0.82f, y0 + 0.01f, 0.97f, y1 - 0.01f, member ? UiKit.Danger : UiKit.PanelLight, () => Toggle(captured));
            }
            if (pages > 1)
            {
                UiKit.Button(Root, "Prev", "◀", 0.04f, 0.0f, 0.3f, 0.07f, UiKit.Panel, () => { _page = Math.Max(0, _page - 1); Refresh(); });
                UiKit.Label(Root, "Page", T("ui.party.page", _page + 1, pages), 30, 0.3f, 0.0f, 0.7f, 0.07f, TextAnchor.MiddleCenter);
                UiKit.Button(Root, "Next", "▶", 0.7f, 0.0f, 0.96f, 0.07f, UiKit.Panel, () => { _page = Math.Min(pages - 1, _page + 1); Refresh(); });
            }
        }

        private static string[] ToArray(IReadOnlyList<string> list)
        {
            var a = new string[list.Count];
            for (int i = 0; i < a.Length; i++) { a[i] = list[i]; }
            return a;
        }

        private void Toggle(string id)
        {
            string[] party = ToArray(State.Party);
            int at = Array.IndexOf(party, id);
            if (at >= 0) { party[at] = null; }
            else
            {
                int free = Array.IndexOf(party, null);
                if (free < 0) { App.Toast(T("ui.party.party_full")); return; }
                party[free] = id;
            }
            App.Commit(Session.SetParty(party));
        }
    }
}
