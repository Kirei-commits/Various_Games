using System.Collections.Generic;
using Mado.Core.Growth;
using Mado.Core.Session;
using Mado.Data;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>
    /// 記憶カード：絆ガチャのまとめ引き、確認の条件、交換の確認。
    /// まとめ引きは自動で回り、条件に合うカードが出たら止まって「交換しますか？」と聞く。
    /// 答えると残りの回数ぶん続きを引く（「やめる」で止める。返事待ちのカードはそのまま残る）。条件に合わないカードは、その場でコインと経験値になる。
    /// </summary>
    public sealed class MemoryScreen : GameScreen
    {
        private static readonly SubstatKey[] SubKeys =
        {
            SubstatKey.EvasionPct, SubstatKey.AccuracyPct, SubstatKey.CritRatePct, SubstatKey.CritResistPct, SubstatKey.CritDamagePct, SubstatKey.CritDefensePct,
        };

        private int _remaining;          // まとめ引きの残り回数（0 なら止まっている）
        private string _message = "";
        private float _y;
        private int _row;

        public MemoryScreen(MadoApp app, Transform parent) : base(app, parent, "Memory") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.memory.title"), 56, 0.04f, 0.93f, 0.96f, 0.995f, TextAnchor.MiddleCenter);
            UiKit.Label(Root, "Status", T("ui.memory.status", State.MemoryGachaLv, Num(State.Balance("bond_heart")), _remaining), 26, 0.04f, 0.89f, 0.96f, 0.93f, TextAnchor.MiddleCenter);
            _y = 0.885f; _row = 0;
            MemoryCardView? pending = State.MemoryPending;
            if (pending != null) { PendingSection(pending.Value); }
            else { PullSection(); }
            RuleSection();
            UiKit.Label(Root, "Message", _message, 28, 0.04f, 0.0f, 0.96f, 0.05f, TextAnchor.MiddleCenter);
        }

        // ---------------- 確認 ----------------

        private void PendingSection(MemoryCardView card)
        {
            UiKit.Rect(Root, "PendingBox", 0.03f, 0.55f, 0.97f, 0.88f, UiKit.PanelLight);
            UiKit.Label(Root, "PendingTitle", T("ui.memory.pending", card.Rarity, T("memory.kind." + EnumStringConverter.Text(card.Kind)), card.Lv), 34, 0.05f, 0.80f, 0.95f, 0.87f, TextAnchor.MiddleCenter);
            UiKit.Label(Root, "PendingPower", T("ui.memory.power", card.Power.ToString("N1")), 26, 0.05f, 0.75f, 0.95f, 0.80f, TextAnchor.MiddleLeft);
            float y = 0.745f;
            foreach ((SubstatKey Stat, double Value) sub in card.Subs)
            {
                UiKit.Label(Root, "Sub" + sub.Stat, T("ui.memory.sub", SubName(sub.Stat), sub.Value.ToString("N2")), 26, 0.05f, y - 0.045f, 0.95f, y, TextAnchor.MiddleLeft);
                y -= 0.045f;
            }
            IReadOnlyList<MemoryCardView> cards = State.MemoryCards;
            IReadOnlyList<string> equipped = State.EquippedMemoryCards;
            for (int i = 0; i < 2; i++)
            {
                int slot = (int)card.Kind * 2 + i;
                MemoryCardView? now = Find(cards, equipped[slot]);
                string text = now == null ? T("ui.memory.now_empty", i + 1) : T("ui.memory.now", i + 1, now.Value.Rarity, now.Value.Lv, now.Value.Power.ToString("N1"), SubsText(now.Value));
                UiKit.Label(Root, "Now" + i, text, 22, 0.05f, y - 0.04f, 0.95f, y, TextAnchor.MiddleLeft);
                y -= 0.04f;
            }
            UiKit.Button(Root, "Yes", T("ui.memory.swap"), 0.05f, 0.56f, 0.34f, 0.62f, UiKit.Good, () => Answer(true));
            UiKit.Button(Root, "No", T("ui.memory.keep"), 0.36f, 0.56f, 0.64f, 0.62f, UiKit.Danger, () => Answer(false));
            UiKit.Button(Root, "Stop", T("ui.memory.stop"), 0.66f, 0.56f, 0.95f, 0.62f, UiKit.Panel, () => { _remaining = 0; _message = T("ui.memory.stopped"); Refresh(); });
        }

        private void Answer(bool equip)
        {
            if (App.Commit(Session.ResolveMemoryCard(equip)))
            {
                _message = T(equip ? "ui.memory.swapped" : "ui.memory.kept");
                if (_remaining > 0) { Run(_remaining); } else { Refresh(); }
            }
        }

        // ---------------- 引く ----------------

        private void PullSection()
        {
            foreach (int count in State.MemoryPullCounts)
            {
                int n = count;
                Row(T("ui.memory.pull_row", n), T("ui.memory.pull"), () => Run(n));
            }
        }

        /// <summary>count 回を上限に自動で引く。条件に合うカードが出たら止まって確認を出す。</summary>
        private void Run(int count)
        {
            CommandResult r = Session.PullMemoryCards(count, out AutoGachaResult result);
            if (!r.Success) { _remaining = 0; App.Toast(T("ui.not_enough")); Refresh(); return; }
            Mado.View.Platform.AudioPlayer.ForEvents(Session.DrainEvents());
            _remaining = result.Stop == AutoStop.Found ? count - result.Pulls : 0;
            _message = T("ui.memory.result", result.Pulls, result.Sold, Num(result.CoinGained));
            App.Changed();
        }

        // ---------------- 確認の条件 ----------------

        private void RuleSection()
        {
            AutoGachaSettings rule = State.MemoryRule;
            string rarity = Data.MemoryCards.Rarities[rule.MinRarityIndex].Id;
            Row(T("ui.memory.rule_rarity", rarity), T("ui.memory.change"), () =>
            {
                rule.MinRarityIndex = (rule.MinRarityIndex + 1) % Data.MemoryCards.Rarities.Count;
                SetRule(rule);
            });
            Row(T("ui.memory.rule_sub1", KeysText(rule.Filter1)), T("ui.memory.change"), () => { rule.Filter1 = Next(rule.Filter1); SetRule(rule); });
            Row(T("ui.memory.rule_sub2", KeysText(rule.Filter2)), T("ui.memory.change"), () => { rule.Filter2 = Next(rule.Filter2); SetRule(rule); });
            Row(T(rule.RequirePowerUp ? "ui.memory.rule_power_on" : "ui.memory.rule_power_off"), T("ui.memory.change"), () => { rule.RequirePowerUp = !rule.RequirePowerUp; SetRule(rule); });
        }

        private void SetRule(AutoGachaSettings rule)
        {
            App.Commit(Session.SetMemoryRule(rule));
            Refresh();
        }

        /// <summary>絞り込み1組のキーを順に切り替える：なし → 1つ目 → 2つ目 → … → なし（1つだけを選ぶ）。</summary>
        private static List<Mado.Data.SubstatKey> Next(IReadOnlyList<SubstatKey> now)
        {
            var list = new List<SubstatKey>();
            int i = now.Count == 0 ? -1 : System.Array.IndexOf(SubKeys, now[0]);
            if (i + 1 < SubKeys.Length) { list.Add(SubKeys[i + 1]); }
            return list;
        }

        private string KeysText(IReadOnlyList<SubstatKey> keys)
        {
            if (keys.Count == 0) { return T("ui.memory.none"); }
            var names = new List<string>();
            foreach (SubstatKey k in keys) { names.Add(SubName(k)); }
            return string.Join("・", names);
        }

        private string SubsText(MemoryCardView c)
        {
            var names = new List<string>();
            foreach ((SubstatKey Stat, double Value) s in c.Subs) { names.Add(SubName(s.Stat)); }
            return string.Join("・", names);
        }

        private string SubName(SubstatKey k) { return T("memory.sub." + EnumStringConverter.Text(k)); }

        private static MemoryCardView? Find(IReadOnlyList<MemoryCardView> cards, string id)
        {
            if (id == null) { return null; }
            foreach (MemoryCardView c in cards) { if (c.Id == id) { return c; } }
            return null;
        }

        private void Row(string label, string buttonText, System.Action onClick)
        {
            float y1 = _y - _row * 0.05f, y0 = y1 - 0.046f;
            if (y0 < 0.06f) { return; }
            UiKit.Rect(Root, "Row" + _row, 0.03f, y0, 0.97f, y1, UiKit.Panel);
            UiKit.Label(Root, "Label" + _row, label, 24, 0.05f, y0, 0.66f, y1);
            UiKit.Button(Root, "Btn" + _row, buttonText, 0.68f, y0 + 0.004f, 0.96f, y1 - 0.004f, UiKit.Accent, onClick);
            _row++;
        }
    }
}
