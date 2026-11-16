using System.Collections.Generic;
using Mado.Core.Session;
using Mado.Data;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>
    /// 箱庭：広場・竜の巣・研究所・リーダー特殊ツリー・タロット・コレクション・霊石版・図鑑を育てる。
    /// 細かい選択は後の画面に任せて、いまは「おまかせ強化」（次に強化できるものを1つ強化）で進める。
    /// </summary>
    public sealed class GardenScreen : GameScreen
    {
        private static readonly Element[] Elements = { Element.Valor, Element.Skill, Element.Heart, Element.Wisdom };
        private static readonly string[] TarotEffects = { "hp", "atk", "def", "critDamagePct", "critDefensePct" };
        private float _y;
        private int _row;
        private string _message = "";

        public GardenScreen(MadoApp app, Transform parent) : base(app, parent, "Garden") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.garden.title"), 56, 0.04f, 0.93f, 0.96f, 0.995f, TextAnchor.MiddleCenter);
            _y = 0.925f; _row = 0;
            foreach (PlazaDef p in Data.Plazas.Plazas)
            {
                string id = p.Id;
                Row(T("ui.garden.row_plaza", T("plaza." + id), State.PlazaLv(id)), T("ui.garden.upgrade"), () => App.Commit(Session.LevelUpPlazaMax(id)));
            }
            foreach (Element el in Elements)
            {
                Element captured = el;
                string next = State.NextDragonNode(el);
                Row(T("ui.garden.dragon", T("element." + EnumStringConverter.Text(el))), T("ui.garden.auto"), () => Do(next == null ? CommandResult.Fail("None") : Session.LevelUpDragonNode(next)));
            }
            string lab = State.NextTreeNode("lab"), leader = State.NextTreeNode("leader");
            Row(T("ui.garden.lab"), T("ui.garden.auto"), () => Do(lab == null ? CommandResult.Fail("None") : Session.LevelUpTreeNode("lab", lab)));
            Row(T("ui.garden.leader_tree"), T("ui.garden.auto"), () => Do(leader == null ? CommandResult.Fail("None") : Session.LevelUpTreeNode("leader", leader)));
            int filled = 0;
            for (int s = 0; s < Data.Research.Tarot.Slots; s++) { if (State.TarotAt(s).Effect != null) { filled++; } }
            Row(T("ui.garden.tarot", filled, Data.Research.Tarot.Slots), T("ui.garden.tarot_fill"), FillTarot);
            int stars = 0;
            foreach (CollectionSetDef set in Data.Research.Collection.Sets) { stars += State.CollectionStar(set.Id); }
            Row(T("ui.garden.collection", stars), T("ui.garden.upgrade"), RaiseCollection);
            Row(T("ui.garden.stones", State.StoneCount), T("ui.garden.stones_dismantle"), () => Do(Session.DismantleStonesUpTo(2, out int n)));
            Row(T("ui.garden.zukan"), T("ui.garden.zukan_claim"), () =>
            {
                CommandResult r = Session.SyncZukan(out int n);
                if (App.Commit(r)) { _message = T("ui.garden.zukan_result", n); Refresh(); }
            });
            UiKit.Label(Root, "Message", _message, 30, 0.04f, 0.0f, 0.96f, 0.05f, TextAnchor.MiddleCenter);
        }

        private void Row(string label, string buttonText, System.Action onClick)
        {
            float y1 = _y - _row * 0.072f, y0 = y1 - 0.065f;
            UiKit.Rect(Root, "Row" + _row, 0.03f, y0, 0.97f, y1, UiKit.Panel);
            UiKit.Label(Root, "Label" + _row, label, 28, 0.05f, y0, 0.62f, y1);
            UiKit.Button(Root, "Btn" + _row, buttonText, 0.64f, y0 + 0.006f, 0.96f, y1 - 0.006f, UiKit.Accent, onClick);
            _row++;
        }

        private void Do(CommandResult r)
        {
            if (!r.Success && r.Failure == "None") { App.Toast(T("ui.garden.done")); return; }
            App.Commit(r);
        }

        /// <summary>空いているタロットの枠に、払えるいちばん高いレアで効果を順に入れる。</summary>
        private void FillTarot()
        {
            int fill = 0;
            for (int slot = 0; slot < Data.Research.Tarot.Slots; slot++)
            {
                if (State.TarotAt(slot).Effect != null) { continue; }
                string effect = TarotEffects[slot % TarotEffects.Length];
                for (int r = Data.Research.Tarot.Rarities.Count - 1; r >= 0; r--)
                {
                    if (!State.DevMode && State.Balance("wine") < Data.Research.Tarot.Rarities[r].WineCost) { continue; }
                    if (Session.SetTarot(slot, effect, Data.Research.Tarot.Rarities[r].Id).Success) { fill++; }
                    break;
                }
            }
            Session.DrainEvents();
            if (fill == 0) { App.Toast(T("ui.not_enough")); return; }
            App.Changed();
        }

        private void RaiseCollection()
        {
            foreach (CollectionSetDef set in Data.Research.Collection.Sets)
            {
                if (State.CollectionStar(set.Id) >= set.Values.Count) { continue; }
                if (App.Commit(Session.RaiseCollectionSet(set.Id))) { return; }
            }
        }
    }
}
