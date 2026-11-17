using System.Collections.Generic;
using Mado.Core.Session;
using Mado.Data;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>
    /// 装備：記憶カードと霊石版を個別につけ外しする。
    /// 記憶カードは種類ごとに2枠（枠 ＝ 種類 × 2 ＋ 0/1）、霊石版は1ページ目の空き枠へ入れる。
    /// 一覧は Lv の高い順に、つけていないものを上から並べる。
    /// </summary>
    public sealed class EquipScreen : GameScreen
    {
        private const int MaxFreeRows = 5;
        private float _y;
        private int _row;

        public EquipScreen(MadoApp app, Transform parent) : base(app, parent, "Equip") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.equip.title"), 56, 0.04f, 0.93f, 0.96f, 0.995f, TextAnchor.MiddleCenter);
            _y = 0.925f; _row = 0;
            LeaderSection();
            MemorySection();
            StoneSection();
        }

        private static readonly Element?[] ElementCycle = { null, Element.Valor, Element.Skill, Element.Heart, Element.Wisdom };

        /// <summary>リーダーの属性：押すたびに 未設定 → 勇 → 技 → 心 → 知 → 未設定 と切り替える。</summary>
        private void LeaderSection()
        {
            Element? now = State.LeaderElement;
            string name = now == null ? T("ui.equip.leader_none") : T("element." + EnumStringConverter.Text(now.Value));
            int i = System.Array.IndexOf(ElementCycle, now);
            Element? next = ElementCycle[(i + 1) % ElementCycle.Length];
            Row(T("ui.equip.leader_element", name), T("ui.equip.change"), () => { App.Commit(Session.SetLeaderElement(next)); Refresh(); });
        }

        private void MemorySection()
        {
            IReadOnlyList<string> equipped = State.EquippedMemoryCards;
            IReadOnlyList<MemoryCardView> cards = State.MemoryCards;
            for (int slot = 0; slot < equipped.Count; slot++)
            {
                int s = slot;
                string id = equipped[slot];
                MemoryCardView? c = Find(cards, id);
                string text = c == null ? T("ui.equip.empty_slot", slot + 1) : T("ui.equip.mem_row", slot + 1, c.Value.Rarity, c.Value.Lv);
                Row(text, T("ui.equip.remove"), c == null ? (System.Action)null : () => { App.Commit(Session.UnequipMemoryCard(s)); Refresh(); });
            }
            var free = new List<MemoryCardView>();
            foreach (MemoryCardView c in cards) { if (System.Array.IndexOf((string[])ToArray(equipped), c.Id) < 0) { free.Add(c); } }
            free.Sort((a, b) => b.Lv.CompareTo(a.Lv));
            for (int i = 0; i < free.Count && i < MaxFreeRows; i++)
            {
                MemoryCardView c = free[i];
                int slot = FreeSlot(equipped, (int)c.Kind);
                Row(T("ui.equip.mem_free", c.Rarity, c.Lv), T("ui.equip.put"), () => { App.Commit(Session.EquipMemoryCard(c.Id, slot)); Refresh(); });
            }
        }

        private void StoneSection()
        {
            int perPage = Data.SpiritStones.SlotMainStat.Count;
            for (int slot = 0; slot < perPage; slot++)
            {
                int s = slot;
                string id = State.StoneAt(0, slot);
                Row(id == null ? T("ui.equip.empty_slot", slot + 1) : T("ui.equip.stone_row", slot + 1, StoneText(id)),
                    T("ui.equip.remove"), id == null ? (System.Action)null : () => { App.Commit(Session.UnequipStone(0, s)); Refresh(); });
            }
            int emptySlot = -1;
            for (int slot = 0; slot < perPage; slot++) { if (State.StoneAt(0, slot) == null) { emptySlot = slot; break; } }
            var free = new List<StoneView>();
            foreach (StoneView st in State.Stones) { if (!st.Equipped) { free.Add(st); } }
            free.Sort((a, b) => b.Lv.CompareTo(a.Lv));
            for (int i = 0; i < free.Count && i < MaxFreeRows; i++)
            {
                StoneView st = free[i];
                int slot = emptySlot;
                Row(T("ui.equip.stone_free", st.Rarity, st.Constellation, st.Lv), T("ui.equip.put"), () =>
                {
                    if (slot < 0) { App.Toast(T("ui.equip.full")); return; }
                    App.Commit(Session.EquipStone(0, slot, st.Id)); Refresh();
                });
            }
        }

        private string StoneText(string id)
        {
            foreach (StoneView st in State.Stones) { if (st.Id == id) { return st.Rarity + " " + st.Constellation + " Lv" + st.Lv; } }
            return id;
        }

        private static MemoryCardView? Find(IReadOnlyList<MemoryCardView> cards, string id)
        {
            if (id == null) { return null; }
            foreach (MemoryCardView c in cards) { if (c.Id == id) { return c; } }
            return null;
        }

        private static string[] ToArray(IReadOnlyList<string> list)
        {
            var a = new string[list.Count];
            for (int i = 0; i < a.Length; i++) { a[i] = list[i]; }
            return a;
        }

        /// <summary>その種類の2枠のうち、空いている方（両方埋まっていれば1枠目）。</summary>
        private static int FreeSlot(IReadOnlyList<string> equipped, int kind)
        {
            return equipped[kind * 2] != null && equipped[kind * 2 + 1] == null ? kind * 2 + 1 : kind * 2;
        }

        private void Row(string label, string buttonText, System.Action onClick)
        {
            float y1 = _y - _row * 0.04f, y0 = y1 - 0.036f;
            UiKit.Rect(Root, "Row" + _row, 0.03f, y0, 0.97f, y1, UiKit.Panel);
            UiKit.Label(Root, "Label" + _row, label, 22, 0.05f, y0, 0.66f, y1);
            if (onClick != null) { UiKit.Button(Root, "Btn" + _row, buttonText, 0.68f, y0 + 0.004f, 0.96f, y1 - 0.004f, UiKit.Accent, onClick); }
            _row++;
        }
    }
}
