using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Progress;
using Mado.Core.Session;
using Mado.Data;
using Mado.View.Ui;
using UnityEngine;
using UnityEngine.UI;

namespace Mado.View.Screens
{
    /// <summary>
    /// ホーム：ランクとステージ、所持品、編成、記憶カードの8枠（種類×2。docs/06 6節の参照画面と同じ並び）、雑魚戦・ボス戦・放置報酬。
    /// </summary>
    public sealed class HomeScreen : GameScreen
    {
        private static readonly MemoryKind[] Kinds = { MemoryKind.Hp, MemoryKind.Atk, MemoryKind.Def, MemoryKind.Speed };
        private string _message = "";

        public HomeScreen(MadoApp app, Transform parent) : base(app, parent, "Home") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            ProgressView p = State.Progress;
            UiKit.Label(Root, "Stage", T("ui.stage", p.Rank, p.Area, p.Stage), 56, 0.04f, 0.92f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            UiKit.Label(Root, "Wallet", T("ui.gem") + " " + NumberText("gem") + "　" + T("ui.coin") + " " + NumberText("coin") + "　" + T("ui.ticket") + " " + NumberText("gacha_ticket"),
                32, 0.04f, 0.87f, 0.96f, 0.92f, TextAnchor.MiddleCenter);

            BuildParty();
            BuildMemoryGrid();
            UiKit.Button(Root, "Wave", T("ui.home.fight_wave"), 0.04f, 0.2f, 0.48f, 0.3f, UiKit.Accent, () => Fight(StageKind.Wave));
            UiKit.Button(Root, "Boss", T("ui.home.fight_boss"), 0.52f, 0.2f, 0.96f, 0.3f, UiKit.Danger, () => Fight(StageKind.Boss));
            UiKit.Button(Root, "Idle", T("ui.home.idle"), 0.04f, 0.08f, 0.96f, 0.17f, UiKit.Good, ClaimIdle);
            UiKit.Label(Root, "Message", _message, 34, 0.04f, 0.0f, 0.96f, 0.08f, TextAnchor.MiddleCenter);
        }

        private string NumberText(string currency) { return Num(State.Balance(currency)); }

        private void BuildParty()
        {
            IReadOnlyList<string> party = State.Party;
            var lines = new List<string>();
            foreach (string id in party)
            {
                if (id == null) { continue; }
                State.TryCharacter(id, out CharacterView v);
                lines.Add(NameOf(id) + "  ★" + v.Star + " Lv" + v.Lv);
            }
            string text = lines.Count == 0 ? T("ui.home.no_party") : string.Join("\n", lines);
            if (State.Leader != null) { text = T("ui.home.leader", NameOf(State.Leader)) + "\n" + text; }
            UiKit.Rect(Root, "PartyBox", 0.04f, 0.6f, 0.96f, 0.86f, UiKit.Panel);
            UiKit.Label(Root, "PartyText", text, 30, 0.06f, 0.6f, 0.94f, 0.86f);
        }

        /// <summary>記憶カードの装備枠：2行×4列（左から HP・攻撃・防御・スピード。上段が1枚目、下段が2枚目）。</summary>
        private void BuildMemoryGrid()
        {
            IReadOnlyList<string> equipped = State.EquippedMemoryCards;
            var byId = new Dictionary<string, MemoryCardView>();
            foreach (MemoryCardView c in State.MemoryCards) { byId[c.Id] = c; }
            UiKit.Label(Root, "MemoryTitle", T("ui.home.memory"), 30, 0.04f, 0.54f, 0.5f, 0.6f);
            for (int row = 0; row < 2; row++)
            {
                for (int col = 0; col < 4; col++)
                {
                    MemoryKind kind = Kinds[col];
                    string id = equipped[(int)kind * 2 + row];
                    string label = T("ui.memory." + EnumKey(kind));
                    string body = id != null && byId.TryGetValue(id, out MemoryCardView card) ? card.Rarity + "\nLv" + card.Lv : T("ui.home.empty_slot");
                    float x0 = 0.04f + col * 0.235f, x1 = x0 + 0.215f;
                    float y1 = 0.52f - row * 0.15f, y0 = y1 - 0.14f;
                    UiKit.Rect(Root, "Slot" + col + row, x0, y0, x1, y1, UiKit.PanelLight);
                    UiKit.Label(Root, "SlotKind" + col + row, label, 26, x0, y1 - 0.04f, x1, y1, TextAnchor.MiddleCenter);
                    UiKit.Label(Root, "SlotBody" + col + row, body, 30, x0, y0, x1, y1 - 0.04f, TextAnchor.MiddleCenter);
                }
            }
        }

        private static string EnumKey(MemoryKind kind)
        {
            switch (kind)
            {
                case MemoryKind.Hp: return "hp";
                case MemoryKind.Atk: return "atk";
                case MemoryKind.Def: return "def";
                default: return "speed";
            }
        }

        private void Fight(StageKind kind)
        {
            FightResult r = Session.Fight(kind);
            if (!r.Command.Success)
            {
                _message = r.Command.Failure == "NoParty" ? T("ui.home.no_party") : T("ui.failed", r.Command.Failure);
                Refresh();
                return;
            }
            App.Changed();
            App.ShowBattle(r);
        }

        private void ClaimIdle()
        {
            if (!App.Commit(Session.ClaimIdle(out IdleReport report))) { return; }
            _message = T("ui.home.idle_result", Num(report.Exp));
            Refresh();
        }
    }
}
