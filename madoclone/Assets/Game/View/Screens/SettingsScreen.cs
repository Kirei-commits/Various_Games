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
            int growth = (int)State.GrowthSpeed;
            UiKit.Label(Root, "Growth", T("ui.settings.growth", growth), 36, 0.04f, 0.3f, 0.96f, 0.38f);
            UiKit.Button(Root, "GrowthDown", "-", 0.04f, 0.2f, 0.3f, 0.29f, UiKit.Panel, () => SetGrowth(growth - 1));
            UiKit.Button(Root, "GrowthUp", "+", 0.7f, 0.2f, 0.96f, 0.29f, UiKit.Panel, () => SetGrowth(growth + 1));
            bool muted = Mado.View.Platform.AudioPlayer.Muted;
            UiKit.Button(Root, "Sound", T(muted ? "ui.settings.sound_off" : "ui.settings.sound_on"), 0.04f, 0.08f, 0.96f, 0.17f, UiKit.Accent, () => { Mado.View.Platform.AudioPlayer.Muted = !muted; Refresh(); });
            UiKit.Button(Root, "Skip", T(skip ? "ui.settings.skip_on" : "ui.settings.skip_off"), 0.04f, 0.4f, 0.96f, 0.51f, UiKit.Accent, () => Apply(speed, auto, !skip));
        }

        private void SetGrowth(int v)
        {
            if (v < 1 || v > 5) { return; }
            if (App.Commit(Session.SetGrowthSpeed(v))) { Refresh(); }
        }

        private void Apply(double speed, bool auto, bool skip)
        {
            double s = System.Math.Max(GameSession.MinBattleSpeed, System.Math.Min(GameSession.MaxBattleSpeed, speed));
            if (App.Commit(Session.SetSettings(s, auto, skip))) { Refresh(); }
        }
    }
}
