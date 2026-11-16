using Mado.Core.Session;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>設定：戦闘の速さ（1〜5倍）・自動ボス・ガチャ演出のスキップ。</summary>
    public sealed class SettingsScreen : GameScreen
    {
        public SettingsScreen(MadoApp app, Transform parent) : base(app, parent, "Settings") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.settings.title"), 56, 0.04f, 0.9f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            double speed = State.BattleSpeed;
            bool auto = State.AutoBoss, skip = State.SkipGachaAnim;
            UiKit.Label(Root, "Speed", T("ui.settings.speed", Num(speed)), 36, 0.04f, 0.78f, 0.96f, 0.86f);
            UiKit.Button(Root, "SpeedDown", "-", 0.04f, 0.68f, 0.3f, 0.77f, UiKit.Panel, () => Apply(speed - 1, auto, skip));
            UiKit.Button(Root, "SpeedUp", "+", 0.7f, 0.68f, 0.96f, 0.77f, UiKit.Panel, () => Apply(speed + 1, auto, skip));
            UiKit.Button(Root, "Auto", T(auto ? "ui.settings.auto_on" : "ui.settings.auto_off"), 0.04f, 0.54f, 0.96f, 0.65f, UiKit.Accent, () => Apply(speed, !auto, skip));
            UiKit.Button(Root, "Skip", T(skip ? "ui.settings.skip_on" : "ui.settings.skip_off"), 0.04f, 0.4f, 0.96f, 0.51f, UiKit.Accent, () => Apply(speed, auto, !skip));
        }

        private void Apply(double speed, bool auto, bool skip)
        {
            double s = System.Math.Max(GameSession.MinBattleSpeed, System.Math.Min(GameSession.MaxBattleSpeed, speed));
            if (App.Commit(Session.SetSettings(s, auto, skip))) { Refresh(); }
        }
    }
}
