using System.Collections.Generic;
using System.Globalization;
using Mado.Core.Growth;
using Mado.Data;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>試練：一覧（名前・クリア済みLv・報酬を受け取れる残り回数）と、挑戦・掃討。解放前の試練は解放ランクを出す。</summary>
    public sealed class TrialScreen : GameScreen
    {
        private string _message = "";
        private readonly HashSet<string> _only;
        private readonly string _titleKey;

        /// <summary>only が null なら全部の試練。指定すれば、その ID の試練だけを並べる（ギルドの討伐・闘技・書庫に使う）。</summary>
        public TrialScreen(MadoApp app, Transform parent, string name = "Trial", string[] only = null, string titleKey = "ui.trial.title") : base(app, parent, name)
        {
            _only = only == null ? null : new HashSet<string>(only);
            _titleKey = titleKey;
        }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T(_titleKey), 56, 0.04f, 0.92f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            int i = 0;
            foreach (TrialDef def in Data.Trials.Trials)
            {
                if (_only != null && !_only.Contains(def.Id)) { continue; }
                float y1 = 0.89f - i * 0.11f, y0 = y1 - 0.1f;
                string feature = "trial_" + def.Id;
                bool open = State.IsUnlocked(feature);
                UiKit.Rect(Root, "Row" + i, 0.03f, y0, 0.97f, y1, open ? UiKit.Panel : UiKit.Background);
                string name = T("trial." + def.Id + ".name");
                if (!open)
                {
                    UiKit.Label(Root, "Name" + i, name + "　" + T("ui.trial.locked", Data.Unlocks.RankOf(feature)), 30, 0.05f, y0, 0.95f, y1);
                }
                else
                {
                    double charges = State.TrialCharges(def.Id);
                    string left = double.IsInfinity(charges) ? T("ui.trial.infinite") : ((int)System.Math.Floor(charges + 1e-9)).ToString(CultureInfo.InvariantCulture);
                    UiKit.Label(Root, "Name" + i, T("ui.trial.row", name, State.TrialClearedLv(def.Id), left), 30, 0.05f, y0, 0.58f, y1);
                    string id = def.Id;
                    UiKit.Button(Root, "Go" + i, T("ui.trial.challenge"), 0.6f, y0 + 0.01f, 0.78f, y1 - 0.01f, UiKit.Accent, () => Challenge(id));
                    UiKit.Button(Root, "Sw" + i, T("ui.trial.sweep"), 0.79f, y0 + 0.01f, 0.96f, y1 - 0.01f, UiKit.Good, () => Sweep(id));
                }
                i++;
            }
            UiKit.Label(Root, "Message", _message, 32, 0.04f, 0.0f, 0.96f, 0.06f, TextAnchor.MiddleCenter);
        }

        private void Challenge(string id)
        {
            TrialResult r = Session.ChallengeTrial(id);
            Report(r);
        }

        private void Sweep(string id)
        {
            Report(Session.SweepTrial(id));
        }

        private void Report(TrialResult r)
        {
            Session.DrainEvents();
            if (!r.Success) { _message = r.Failure == TrialFailure.NoParty ? T("ui.home.no_party") : r.Failure == TrialFailure.Locked ? T("ui.locked") : T("ui.failed", r.Failure); }
            else if (r.RewardGranted) { _message = T("ui.trial.won"); }
            else if (r.Cleared) { _message = T("ui.trial.cleared_no_reward"); }
            else { _message = T("ui.trial.lost"); }
            App.Changed();
        }
    }
}
