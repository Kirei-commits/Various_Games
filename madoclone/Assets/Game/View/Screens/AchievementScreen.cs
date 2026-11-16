using Mado.Data;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>実績：進み具合と報酬の受け取り（段ごとに1回）。</summary>
    public sealed class AchievementScreen : GameScreen
    {
        public AchievementScreen(MadoApp app, Transform parent) : base(app, parent, "Achievements") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.ach.title"), 56, 0.04f, 0.9f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            int i = 0;
            foreach (AchievementDef a in Data.Economy.Achievements)
            {
                var (value, reached, claimed) = State.AchievementOf(a.Id);
                float y1 = 0.88f - i * 0.078f, y0 = y1 - 0.07f;
                UiKit.Rect(Root, "Row" + i, 0.03f, y0, 0.97f, y1, reached > claimed ? UiKit.PanelLight : UiKit.Panel);
                UiKit.Label(Root, "Name" + i, T("ui.ach.row", T("ach." + a.Id), Num(value), reached, claimed), 26, 0.05f, y0, 0.7f, y1);
                string id = a.Id;
                if (reached > claimed)
                {
                    UiKit.Button(Root, "Claim" + i, T("ui.ach.claim"), 0.72f, y0 + 0.01f, 0.96f, y1 - 0.01f, UiKit.Good, () => App.Commit(Session.ClaimAchievement(id, out int tiers)));
                }
                i++;
            }
            UiKit.Button(Root, "ClaimAll", T("ui.ach.claim_all"), 0.04f, 0.02f, 0.96f, 0.1f, UiKit.Accent, () => App.Commit(Session.ClaimAllAchievements(out int tiers)));
        }
    }
}
